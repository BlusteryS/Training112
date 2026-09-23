package com.training112.auth;

import com.training112.AppConfig;
import io.vertx.core.Future;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.util.Set;
import java.util.UUID;

public final class AdminRoutes {
  private static final Set<String> ROLES = Set.of("admin", "teacher", "user");

  private AdminRoutes() {}

  public static void mount(
      Router router,
      Pool pool,
      AuthRepository auth,
      PasswordHasher passwords,
      AppConfig config) {
    router
        .route("/api/admin/*")
        .handler(BodyHandler.create().setBodyLimit(8192).setHandleFileUploads(false));
    router.route("/api/admin/*").handler(context -> authorize(context, auth, config));

    router.get("/api/admin/users").handler(context -> listUsers(context, pool));
    router.post("/api/admin/users").handler(context -> createUser(context, pool, passwords));
    router.post("/api/admin/users/:id/role").handler(context -> changeRole(context, pool));
    router.post("/api/admin/users/:id/access").handler(context -> changeAccess(context, pool));
  }

  private static void authorize(
      RoutingContext context, AuthRepository auth, AppConfig config) {
    if (context.request().method() != HttpMethod.GET) {
      String origin = context.request().getHeader("Origin");
      String content = context.request().getHeader("Content-Type");
      if (!"training112".equals(context.request().getHeader("X-Requested-With"))
          || (origin != null && !origin.equals(config.appOrigin()))
          || "cross-site".equals(context.request().getHeader("Sec-Fetch-Site"))
          || content == null
          || !content.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) {
        context.fail(new ApiException(403, "forbidden_origin", "Запрос запрещён."));
        return;
      }
    }
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
    Credentials credentials = Credentials.parse(body);
    Credentials.forCreation(credentials.login(), credentials.password());
    String role = role(body);
    AuthRepository.Account actor = context.get("actor");
    UUID id = UUID.randomUUID();
    passwords
        .hash(credentials.password())
        .compose(
            hash ->
                pool.withTransaction(
                    database ->
                        database
                            .preparedQuery(
                                "INSERT INTO app_user(id,login,password_hash,role) VALUES"
                                    + " ($1,$2,$3,$4) ON CONFLICT(login) DO NOTHING RETURNING id")
                            .execute(Tuple.of(id, credentials.login(), hash, role))
                            .compose(
                                rows -> {
                                  if (rows.size() == 0)
                                    return Future.failedFuture(
                                        new ApiException(
                                            409, "login_taken", "Логин уже занят."));
                                  return audit(
                                      database,
                                      actor.id(),
                                      "user.created",
                                      id,
                                      new JsonObject().put("role", role));
                                })))
        .onSuccess(
            ignored ->
                context
                    .response()
                    .setStatusCode(201)
                    .end(
                        new JsonObject()
                            .put("id", id.toString())
                            .put("login", credentials.login())
                            .put("role", role)
                            .put("blocked", false)
                            .encode()))
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
                                    SELECT 1 FROM training_group WHERE teacher_id=$1
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
