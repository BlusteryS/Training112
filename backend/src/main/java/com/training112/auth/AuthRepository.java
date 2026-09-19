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
    public record Account(UUID id, String login, String passwordHash, String role) {
        public JsonObject toJson() {
            return new JsonObject().put("id", id.toString()).put("login", login).put("role", role);
        }

        @Override
        public String toString() { return "Account[id=" + id + ", login=" + login + "]"; }
    }

    private final Pool pool;

    public AuthRepository(Pool pool) { this.pool = pool; }

    public Future<Account> findByLogin(String login) {
        return pool.preparedQuery("SELECT id, login, password_hash, role FROM app_user WHERE login = $1")
                .execute(Tuple.of(login)).map(rows -> rows.size() == 0 ? null : account(rows.iterator().next()));
    }

    public Future<Account> register(String login, String passwordHash, String tokenHash, OffsetDateTime expiresAt,
                                    String previousTokenHash) {
        return pool.withTransaction(connection -> connection.query("SELECT pg_advisory_xact_lock(112, 1)").execute()
                .compose(ignored -> connection.preparedQuery("""
                        INSERT INTO app_user (id, login, password_hash, role)
                        VALUES ($1, $2, $3, CASE WHEN EXISTS (SELECT 1 FROM app_user) THEN 'user' ELSE 'admin' END)
                        ON CONFLICT (login) DO NOTHING RETURNING id, login, password_hash, role
                        """).execute(Tuple.of(UUID.randomUUID(), login, passwordHash))).compose(rows -> {
                    if (rows.size() == 0) {
                        return Future.failedFuture(new ApiException(409, "login_taken", "Этот логин уже занят."));
                    }
                    Account account = account(rows.iterator().next());
                    return replaceSession(connection, account.id(), tokenHash, expiresAt, previousTokenHash).map(account);
                }));
    }

    public Future<Void> createSession(UUID userId, String tokenHash, OffsetDateTime expiresAt, String previousTokenHash) {
        return pool.withTransaction(connection -> replaceSession(connection, userId, tokenHash, expiresAt, previousTokenHash));
    }

    private Future<Void> replaceSession(SqlClient client, UUID userId, String tokenHash,
                                         OffsetDateTime expiresAt, String previousTokenHash) {
        return client.preparedQuery("DELETE FROM auth_session WHERE token_hash = $1")
                .execute(Tuple.of(previousTokenHash))
                .compose(ignored -> client.preparedQuery("""
                        INSERT INTO auth_session (token_hash, user_id, expires_at) VALUES ($1, $2, $3)
                        """).execute(Tuple.of(tokenHash, userId, expiresAt))).mapEmpty();
    }

    public Future<Account> findSession(String tokenHash) {
        return pool.preparedQuery("""
                SELECT u.id, u.login, u.password_hash, u.role FROM auth_session s
                JOIN app_user u ON u.id = s.user_id
                WHERE s.token_hash = $1 AND s.expires_at > now()
                """).execute(Tuple.of(tokenHash))
                .map(rows -> rows.size() == 0 ? null : account(rows.iterator().next()));
    }

    public Future<Void> deleteSession(String tokenHash) {
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

    private static Account account(Row row) {
        return new Account(row.getUUID("id"), row.getString("login"), row.getString("password_hash"), row.getString("role"));
    }
}
