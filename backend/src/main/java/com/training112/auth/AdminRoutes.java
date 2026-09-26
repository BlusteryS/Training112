package com.training112.auth;

import com.training112.AppConfig;
import com.training112.speech.SpeechConfig;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;

public final class AdminRoutes {
  private static final Set<String> ROLES = Set.of("admin", "instructor", "user");

  private AdminRoutes() {}

  public static void mount(
      Router router,
      Pool pool,
      AuthRepository auth,
      PasswordHasher passwords,
      AppConfig config,
      SpeechConfig speech) {
    router.route("/api/admin/*").handler(context -> RequestGuard.jsonWrites(context, config));
    router
        .route("/api/admin/*")
        .handler(BodyHandler.create().setBodyLimit(8192).setHandleFileUploads(false));
    router.route("/api/admin/*").handler(context -> authorize(context, auth));

    router.get("/api/admin/users").handler(context -> listUsers(context, pool));
    router.post("/api/admin/users").handler(context -> createUser(context, pool, passwords));
    router.post("/api/admin/users/:id/role").handler(context -> changeRole(context, pool));
    router.post("/api/admin/users/:id/access").handler(context -> changeAccess(context, pool));
    router.get("/api/admin/status").handler(context -> status(context, pool, speech));
    router.get("/api/admin/audit").handler(context -> auditLog(context, pool));
    router.get("/api/admin/statistics").handler(context -> statistics(context, pool));
    router.get("/api/admin/settings").handler(context -> settings(context, pool));
    router.post("/api/admin/settings").handler(context -> saveSettings(context, pool));
    router.get("/api/admin/operations").handler(context -> operations(context, pool));
    router.post("/api/admin/operations").handler(context -> saveOperations(context, pool));
    router.get("/api/admin/backups").handler(context -> backups(context, pool));
    router.post("/api/admin/backups").handler(context -> exportBackup(context, pool));
  }

  private static void authorize(RoutingContext context, AuthRepository auth) {
    auth.findSession(AuthSession.tokenHash(context))
        .onSuccess(
            actor -> {
              if (actor == null) context.fail(ApiException.unauthorized());
              else if (!"admin".equals(actor.role()))
                context.fail(
                    new ApiException(403, "forbidden", "Нужна роль администратора."));
              else {
                context.put("actor", actor);
                context.next();
              }
            })
        .onFailure(context::fail);
  }

  private static void listUsers(RoutingContext context, Pool pool) {
    pool.query("SELECT id,login,role,blocked FROM app_user ORDER BY login LIMIT 1000")
        .execute()
        .onSuccess(
            rows -> {
              JsonArray result = new JsonArray();
              rows.forEach(
                  row ->
                      result.add(
                          new JsonObject()
                              .put("id", row.getUUID("id").toString())
                              .put("login", row.getString("login"))
                              .put("role", row.getString("role"))
                              .put("blocked", row.getBoolean("blocked"))));
              context.response().end(result.encode());
            })
        .onFailure(context::fail);
  }

  private static void createUser(
      RoutingContext context, Pool pool, PasswordHasher passwords) {
    JsonObject body = body(context);
    String role = role(body);
    if (!(body.getValue("login") instanceof String login) || !(body.getValue("password") instanceof String password)) {
      throw new ApiException(400, "invalid_request", "Укажите логин и пароль.");
    }
    AuthRepository.Account actor = context.get("actor");
    UUID id = UUID.randomUUID();
    PlatformSettings.passwordMinLength(pool)
        .compose(min -> {
          Credentials credentials = Credentials.forCreation(login, password, min);
          return passwords.hash(credentials.password()).map(hash -> new String[] {credentials.login(), hash});
        })
        .compose(loginAndHash -> {
          String normalized = loginAndHash[0];
          String hash = loginAndHash[1];
          return pool.withTransaction(database -> database.preparedQuery(
                  "INSERT INTO app_user(id,login,password_hash,role) VALUES"
                      + " ($1,$2,$3,$4) ON CONFLICT(login) DO NOTHING RETURNING id")
              .execute(Tuple.of(id, normalized, hash, role))
              .compose(rows -> {
                if (rows.size() == 0) {
                  return Future.failedFuture(new ApiException(409, "login_taken", "Логин уже занят."));
                }
                return audit(database, actor.id(), "user.created", id, new JsonObject().put("role", role))
                    .map(normalized);
              }));
        })
        .onSuccess(normalized -> context.response().setStatusCode(201).end(new JsonObject()
            .put("id", id.toString()).put("login", normalized).put("role", role).put("blocked", false).encode()))
        .onFailure(context::fail);
  }

  private static void changeRole(RoutingContext context, Pool pool) {
    AuthRepository.Account actor = context.get("actor");
    UUID user = id(context);
    String role = role(body(context));
    if (actor.id().equals(user)) {
      throw new ApiException(409, "self_role", "Нельзя изменить собственную роль.");
    }
    pool.withTransaction(
            database ->
                findUser(database, user)
                    .compose(
                        current -> {
                          if (role.equals(current.getString("role"))) {
                            return Future.succeededFuture();
                          }
                          return database
                              .preparedQuery(
                                  """
                                  SELECT EXISTS (
                                    SELECT 1 FROM training_group WHERE instructor_id=$1
                                    UNION ALL SELECT 1 FROM scenario WHERE author_id=$1
                                    UNION ALL SELECT 1 FROM training_group_member WHERE user_id=$1
                                    UNION ALL SELECT 1 FROM lesson_assignment WHERE learner_id=$1
                                  ) AS linked
                                  """)
                              .execute(Tuple.of(user))
                              .compose(
                                  rows -> {
                                    if (rows.iterator().next().getBoolean("linked")) {
                                      return Future.failedFuture(
                                          new ApiException(
                                              409,
                                              "role_in_use",
                                              "Роль пользователя с учебной историей изменить нельзя."));
                                    }
                                    return database
                                        .preparedQuery("UPDATE app_user SET role=$2 WHERE id=$1")
                                        .execute(Tuple.of(user, role))
                                        .compose(
                                            ignored ->
                                                database
                                                    .preparedQuery(
                                                        "DELETE FROM auth_session WHERE user_id=$1")
                                                    .execute(Tuple.of(user)))
                                        .compose(
                                            ignored ->
                                                audit(
                                                    database,
                                                    actor.id(),
                                                    "user.role_changed",
                                                    user,
                                                    new JsonObject()
                                                        .put("from", current.getString("role"))
                                                        .put("to", role)));
                                  });
                        }))
        .onSuccess(ignored -> context.response().setStatusCode(204).end())
        .onFailure(context::fail);
  }

  private static void changeAccess(RoutingContext context, Pool pool) {
    AuthRepository.Account actor = context.get("actor");
    UUID user = id(context);
    Object value = body(context).getValue("blocked");
    if (!(value instanceof Boolean blocked)) {
      throw new ApiException(400, "invalid_request", "Некорректный запрос.");
    }
    if (actor.id().equals(user)) {
      throw new ApiException(409, "self_access", "Нельзя заблокировать собственную учётную запись.");
    }
    pool.withTransaction(
            database ->
                findUser(database, user)
                    .compose(
                        ignored ->
                            database
                                .preparedQuery("UPDATE app_user SET blocked=$2 WHERE id=$1")
                                .execute(Tuple.of(user, blocked))
                                .compose(
                                    result ->
                                        blocked
                                            ? database
                                                .preparedQuery(
                                                    "DELETE FROM auth_session WHERE user_id=$1")
                                                .execute(Tuple.of(user))
                                                .mapEmpty()
                                            : Future.succeededFuture())
                                .compose(
                                    result ->
                                        audit(
                                            database,
                                            actor.id(),
                                            blocked ? "user.blocked" : "user.unblocked",
                                            user,
                                            new JsonObject()))))
        .onSuccess(ignored -> context.response().setStatusCode(204).end())
        .onFailure(context::fail);
  }

  private static void status(RoutingContext context, Pool pool, SpeechConfig speech) {
    context.vertx().executeBlocking(() -> speechReachable(speech), false)
        .compose(speechUp -> pool.query("""
            SELECT
              (SELECT count(*) FROM app_user) AS users,
              (SELECT count(*) FROM training_attempt WHERE status IN ('created','active','suspended')) AS open_attempts,
              (SELECT count(*) FROM lesson WHERE status = 'active') AS active_lessons,
              (SELECT count(*) FROM background_job WHERE state IN ('queued','running')) AS worker_queue,
              (SELECT count(*) FROM background_job WHERE state = 'failed') AS failed_jobs,
              (SELECT max(finished_at) FROM background_job) AS worker_seen,
              (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM (
                SELECT id,kind,error,finished_at FROM background_job
                WHERE state='failed' ORDER BY finished_at DESC LIMIT 20
              ) f) AS failures
            """).execute().map(rows -> {
              Row row = rows.iterator().next();
              Runtime runtime = Runtime.getRuntime();
              return new JsonObject()
                  .put("database", "up")
                  .put("speech", speechUp ? "up" : "down")
                  .put("speech_endpoint", speech.endpoint())
                  .put("worker_queue", row.getLong("worker_queue"))
                  .put("worker_seen", row.getOffsetDateTime("worker_seen") == null ? null
                      : row.getOffsetDateTime("worker_seen").toString())
                  .put("failed_jobs", row.getLong("failed_jobs"))
                  .put("failures", row.getJsonArray("failures"))
                  .put("open_attempts", row.getLong("open_attempts"))
                  .put("active_lessons", row.getLong("active_lessons"))
                  .put("users", row.getLong("users"))
                  .put("memory_used", runtime.totalMemory() - runtime.freeMemory())
                  .put("memory_max", runtime.maxMemory());
            }))
        .onSuccess(value -> context.response().end(value.encode()))
        .onFailure(context::fail);
  }

  private static boolean speechReachable(SpeechConfig speech) {
    URI uri = URI.create(speech.endpoint());
    try (Socket socket = new Socket()) {
      socket.connect(new InetSocketAddress(uri.getHost(), uri.getPort()), 500);
      return true;
    } catch (Exception error) {
      return false;
    }
  }

  private static void auditLog(RoutingContext context, Pool pool) {
    pool.query("""
        SELECT jsonb_build_object('id', e.id, 'action', e.action, 'entity_id', e.entity_id,
          'detail', e.detail, 'created_at', e.created_at, 'login', u.login) AS value
        FROM audit_event e LEFT JOIN app_user u ON u.id = e.actor_id
        ORDER BY e.created_at DESC LIMIT 200
        """).execute()
        .onSuccess(rows -> {
          JsonArray result = new JsonArray();
          rows.forEach(row -> result.add(row.getJsonObject("value")));
          context.response().end(result.encode());
        })
        .onFailure(context::fail);
  }

  private static void statistics(RoutingContext context, Pool pool) {
    pool.query("""
        SELECT jsonb_build_object(
          'users', (SELECT count(*) FROM app_user),
          'admins', (SELECT count(*) FROM app_user WHERE role = 'admin'),
          'instructors', (SELECT count(*) FROM app_user WHERE role = 'instructor'),
          'learners', (SELECT count(*) FROM app_user WHERE role = 'user'),
          'blocked', (SELECT count(*) FROM app_user WHERE blocked),
          'scenarios', (SELECT count(*) FROM scenario WHERE NOT archived),
          'lessons', (SELECT count(*) FROM lesson),
          'active_lessons', (SELECT count(*) FROM lesson WHERE status = 'active'),
          'attempts', (SELECT count(*) FROM training_attempt),
          'completed_attempts', (SELECT count(*) FROM training_attempt WHERE status = 'completed'),
          'failed_jobs', (SELECT count(*) FROM background_job WHERE state = 'failed')
        ) AS value
        """).execute()
        .onSuccess(rows -> context.response().end(rows.iterator().next().getJsonObject("value").encode()))
        .onFailure(context::fail);
  }

  private static void settings(RoutingContext context, Pool pool) {
    pool.query("SELECT key, value FROM platform_setting ORDER BY key").execute()
        .onSuccess(rows -> {
          JsonObject result = new JsonObject();
          rows.forEach(row -> result.put(row.getString("key"), Integer.parseInt(row.getString("value"))));
          context.response().end(result.encode());
        })
        .onFailure(context::fail);
  }

  private static void saveSettings(RoutingContext context, Pool pool) {
    AuthRepository.Account actor = context.get("actor");
    JsonObject body = body(context);
    int passwordMin = requiredInt(body, "password_min_length", 8, 64);
    int sessionHours = requiredInt(body, "session_hours", 1, 24 * 30);
    pool.withTransaction(database -> database.preparedQuery(
            "UPDATE platform_setting SET value=$2, updated_at=now(), updated_by=$3 WHERE key=$1")
        .execute(Tuple.of("password_min_length", Integer.toString(passwordMin), actor.id()))
        .compose(ignored -> database.preparedQuery(
            "UPDATE platform_setting SET value=$2, updated_at=now(), updated_by=$3 WHERE key=$1")
            .execute(Tuple.of("session_hours", Integer.toString(sessionHours), actor.id())))
        .compose(ignored -> audit(database, actor.id(), "settings.updated", actor.id(),
            new JsonObject().put("password_min_length", passwordMin).put("session_hours", sessionHours))))
        .onSuccess(ignored -> context.response().setStatusCode(204).end())
        .onFailure(context::fail);
  }

  private static void operations(RoutingContext context, Pool pool) {
    pool.query("SELECT key,value FROM platform_setting WHERE key IN ('service_speech_enabled','service_worker_enabled','dds_phone_enabled','audit_retention_days','backup_interval_hours','backup_retention_count')")
        .execute().onSuccess(rows -> {
          JsonObject result = new JsonObject();
          rows.forEach(row -> result.put(row.getString("key"), Integer.parseInt(row.getString("value"))));
          context.response().end(result.encode());
        }).onFailure(context::fail);
  }

  private static void saveOperations(RoutingContext context, Pool pool) {
    AuthRepository.Account actor = context.get("actor");
    JsonObject body = body(context);
    JsonObject values = new JsonObject()
        .put("service_speech_enabled", requiredInt(body, "service_speech_enabled", 0, 1))
        .put("service_worker_enabled", requiredInt(body, "service_worker_enabled", 0, 1))
        .put("dds_phone_enabled", requiredInt(body, "dds_phone_enabled", 0, 1))
        .put("audit_retention_days", requiredInt(body, "audit_retention_days", 186, 3650))
        .put("backup_interval_hours", requiredInt(body, "backup_interval_hours", 1, 24))
        .put("backup_retention_count", requiredInt(body, "backup_retention_count", 1, 30));
    pool.withTransaction(database -> {
      Future<Void> changes = Future.succeededFuture();
      for (String key : values.fieldNames()) {
        changes = changes.compose(ignored -> database.preparedQuery(
            "UPDATE platform_setting SET value=$2,updated_at=now(),updated_by=$3 WHERE key=$1")
            .execute(Tuple.of(key, Integer.toString(values.getInteger(key)), actor.id())).mapEmpty());
      }
      return changes.compose(ignored -> audit(database, actor.id(), "operations.updated", actor.id(), values));
    }).onSuccess(ignored -> context.response().setStatusCode(204).end()).onFailure(context::fail);
  }

  private static void backups(RoutingContext context, Pool pool) {
    pool.query("""
        SELECT jsonb_build_object('id', b.id, 'created_at', b.created_at, 'sha256', b.sha256,
          'byte_size', b.byte_size, 'login', u.login, 'source', b.source) AS value
        FROM backup_export b LEFT JOIN app_user u ON u.id = b.actor_id
        ORDER BY b.created_at DESC LIMIT 50
        """).execute()
        .onSuccess(rows -> {
          JsonArray result = new JsonArray();
          rows.forEach(row -> result.add(row.getJsonObject("value")));
          context.response().end(result.encode());
        })
        .onFailure(context::fail);
  }

  private static void exportBackup(RoutingContext context, Pool pool) {
    AuthRepository.Account actor = context.get("actor");
    pool.query("""
        SELECT jsonb_build_object(
          'users', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'login', login, 'role', role, 'blocked', blocked) ORDER BY login) FROM app_user), '[]'::jsonb),
          'groups', COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM training_group g), '[]'::jsonb),
          'members', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM training_group_member m), '[]'::jsonb),
          'scenarios', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'artifact' - 'artifact_sha256') FROM scenario s), '[]'::jsonb),
          'lessons', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM lesson l), '[]'::jsonb),
          'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM lesson_assignment a), '[]'::jsonb),
          'attempts', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM training_attempt t), '[]'::jsonb),
          'evaluations', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM attempt_evaluation e), '[]'::jsonb),
          'reviews', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM evaluation_review r), '[]'::jsonb)
        ) AS value
        """).execute()
        .compose(rows -> {
          JsonObject payload = rows.iterator().next().getJsonObject("value");
          byte[] encoded = payload.encode().getBytes(java.nio.charset.StandardCharsets.UTF_8);
          String sha;
          try {
            sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(encoded));
          } catch (java.security.NoSuchAlgorithmException error) {
            return Future.failedFuture(error);
          }
          UUID id = UUID.randomUUID();
          return pool.preparedQuery("INSERT INTO backup_export(id,actor_id,sha256,byte_size) VALUES ($1,$2,$3,$4)")
              .execute(Tuple.of(id, actor.id(), sha, encoded.length))
              .compose(ignored -> audit(pool, actor.id(), "backup.exported", id,
                  new JsonObject().put("sha256", sha).put("byte_size", encoded.length)))
              .map(ignored -> payload.put("backup_id", id.toString()).put("sha256", sha).put("byte_size", encoded.length));
        })
        .onSuccess(value -> context.response().end(value.encode()))
        .onFailure(context::fail);
  }

  private static int requiredInt(JsonObject body, String key, int min, int max) {
    Object value = body.getValue(key);
    if (!(value instanceof Number number) || number.doubleValue() != number.intValue()
        || number.intValue() < min || number.intValue() > max) {
      throw new ApiException(400, "invalid_request", "Некорректное значение «" + key + "».");
    }
    return number.intValue();
  }

  private static Future<Row> findUser(SqlClient database, UUID id) {
    return database
        .preparedQuery("SELECT id,role,blocked FROM app_user WHERE id=$1 FOR UPDATE")
        .execute(Tuple.of(id))
        .compose(
            rows ->
                rows.size() == 0
                    ? Future.failedFuture(
                        new ApiException(404, "not_found", "Пользователь не найден."))
                    : Future.succeededFuture(rows.iterator().next()));
  }

  private static Future<Void> audit(
      SqlClient database, UUID actor, String action, UUID user, JsonObject detail) {
    return database
        .preparedQuery(
            "INSERT INTO audit_event(actor_id,action,entity_id,detail) VALUES ($1,$2,$3,$4)")
        .execute(Tuple.of(actor, action, user, detail))
        .mapEmpty();
  }

  private static JsonObject body(RoutingContext context) {
    try {
      JsonObject body = context.body().asJsonObject();
      if (body == null) throw new IllegalArgumentException();
      return body;
    } catch (RuntimeException error) {
      throw new ApiException(400, "invalid_request", "Некорректный запрос.");
    }
  }

  private static String role(JsonObject body) {
    String role = body.getString("role");
    if (!ROLES.contains(role == null ? "" : role)) {
      throw new ApiException(400, "invalid_role", "Неизвестная роль.");
    }
    return role;
  }

  private static UUID id(RoutingContext context) {
    try {
      String value = context.pathParam("id");
      UUID id = UUID.fromString(value);
      if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
      return id;
    } catch (IllegalArgumentException | NullPointerException error) {
      throw new ApiException(400, "invalid_request", "Некорректный запрос.");
    }
  }
}
