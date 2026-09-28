package com.training112.auth;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class AuthRepository {
    public record Account(UUID id, String login, String role, String workstation) {
        public JsonObject toJson() {
            JsonObject json = new JsonObject().put("id", id.toString()).put("login", login).put("role", role);
            if (workstation != null) json.put("workstation", workstation);
            return json;
        }

        @Override
        public String toString() { return "Account[id=" + id + ", login=" + login + "]"; }
    }

    public record LoginAccount(Account identity, String passwordHash) {
        @Override
        public String toString() { return "LoginAccount[identity=" + identity + "]"; }
    }

    private final Pool pool;

    public AuthRepository(Pool pool) { this.pool = pool; }

    public Pool pool() { return pool; }

    public Future<LoginAccount> findByLogin(String login) {
        return pool.preparedQuery("SELECT id, login, password_hash, role FROM app_user WHERE login = $1 AND NOT blocked")
                .execute(Tuple.of(login)).map(rows -> {
                    if (rows.size() == 0) return null;
                    Row row = rows.iterator().next();
                    return new LoginAccount(account(row, null), row.getString("password_hash"));
                });
    }

    public Future<Account> createAdmin(String login, String passwordHash) {
        UUID id = UUID.randomUUID();
        return pool.withTransaction(db -> db.preparedQuery("""
                INSERT INTO app_user (id, login, password_hash, role) VALUES ($1, $2, $3, 'admin')
                ON CONFLICT (login) DO NOTHING RETURNING id, login, role
                """).execute(Tuple.of(id, login, passwordHash)).compose(rows -> {
                    if (rows.size() == 0) {
                        return Future.failedFuture(new ApiException(409, "login_taken", "Этот логин уже занят."));
                    }
                    Account created = account(rows.iterator().next(), null);
                    return db.preparedQuery("""
                            INSERT INTO audit_event(action,entity_id,detail)
                            VALUES ('user.created',$1,'{"role":"admin","source":"console"}'::jsonb)
                            """).execute(Tuple.of(id)).map(created);
                }));
    }

    public Future<Void> createSession(UUID userId, String tokenHash, OffsetDateTime expiresAt,
                                      String previousTokenHash, String workstation, String login) {
        return pool.withTransaction(connection -> replaceSession(connection, userId, tokenHash, expiresAt,
                previousTokenHash, workstation, login));
    }

    private Future<Void> replaceSession(SqlClient client, UUID userId, String tokenHash,
                                         OffsetDateTime expiresAt, String previousTokenHash,
                                         String workstation, String login) {
        Future<?> revokePrevious = previousTokenHash == null ? Future.succeededFuture()
                : client.preparedQuery("DELETE FROM auth_session WHERE token_hash = $1")
                    .execute(Tuple.of(previousTokenHash));
        return revokePrevious
                .compose(ignored -> client.preparedQuery("""
                        INSERT INTO auth_session (token_hash, user_id, expires_at, workstation) VALUES ($1, $2, $3, $4)
                        """).execute(Tuple.of(tokenHash, userId, expiresAt, workstation)))
                .compose(ignored -> client.preparedQuery("DELETE FROM auth_rate_limit WHERE key=$1")
                        .execute(Tuple.of(SessionToken.hash(login))))
                .mapEmpty();
    }

    public Future<Account> findSession(String tokenHash) {
        if (tokenHash == null) return Future.succeededFuture(null);
        return pool.preparedQuery("""
                SELECT u.id, u.login, u.role, s.workstation FROM auth_session s
                JOIN app_user u ON u.id = s.user_id
                WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.blocked
                """).execute(Tuple.of(tokenHash))
                .map(rows -> {
                    if (rows.size() == 0) return null;
                    Row row = rows.iterator().next();
                    return account(row, row.getString("workstation"));
                });
    }

    public Future<Void> deleteSession(String tokenHash) {
        if (tokenHash == null) return Future.succeededFuture();
        return pool.preparedQuery("DELETE FROM auth_session WHERE token_hash = $1")
                .execute(Tuple.of(tokenHash)).mapEmpty();
    }

    public Future<Void> checkRateLimit(String login) {
        return pool.preparedQuery("""
                INSERT INTO auth_rate_limit (key, attempts, expires_at)
                VALUES ($1, 1, now() + interval '15 minutes')
                ON CONFLICT (key) DO UPDATE SET
                    attempts = CASE WHEN auth_rate_limit.expires_at <= now() THEN 1 ELSE auth_rate_limit.attempts + 1 END,
                    expires_at = CASE WHEN auth_rate_limit.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_rate_limit.expires_at END
                WHERE auth_rate_limit.expires_at <= now() OR auth_rate_limit.attempts < 10
                RETURNING attempts
                """).execute(Tuple.of(SessionToken.hash(login))).compose(rows -> rows.size() > 0
                        ? Future.succeededFuture()
                        : Future.failedFuture(new ApiException(429, "rate_limited", "Слишком много попыток. Попробуйте через 15 минут.")));
    }

    public Future<Void> cleanup() {
        return pool.query("DELETE FROM auth_session WHERE expires_at <= now()").execute()
                .compose(ignored -> pool.query("DELETE FROM auth_rate_limit WHERE expires_at <= now()").execute()).mapEmpty();
    }

    private static Account account(Row row, String workstation) {
        return new Account(row.getUUID("id"), row.getString("login"), row.getString("role"), workstation);
    }
}
