package com.training112.training;

import com.training112.AppConfig;
import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.AuthRepository.Account;
import com.training112.auth.AuthSession;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import java.util.UUID;

/** Public learning API. Student responses never include scenario facts or rubrics. */
public final class TrainingRoutes {
  private final Vertx vertx;
  private final TrainingRepository repository;
  private final AuthRepository auth;
  private final AppConfig config;

  public TrainingRoutes(
      Vertx vertx, TrainingRepository repository, AuthRepository auth, AppConfig config) {
    this.vertx = vertx;
    this.repository = repository;
    this.auth = auth;
    this.config = config;
  }

  public void mount(Router router) {
    router
        .route("/api/training/*")
        .handler(
            ctx -> {
              if (ctx.request().method() != HttpMethod.GET) {
                String origin = ctx.request().getHeader("Origin");
                String content = ctx.request().getHeader("Content-Type");
                if (!"training112".equals(ctx.request().getHeader("X-Requested-With"))
                    || (origin != null && !origin.equals(config.appOrigin()))
                    || "cross-site".equals(ctx.request().getHeader("Sec-Fetch-Site"))) {
                  ctx.fail(
                      new ApiException(403, "forbidden_origin", "Запрос с этого сайта запрещён."));
                  return;
                }
                if (content == null
                    || !content.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) {
                  ctx.fail(new ApiException(415, "unsupported_media_type", "Нужен JSON."));
                  return;
                }
              }
              ctx.next();
            });
    // Subscribe to the body before asynchronous authentication can let the stream end.
    router
        .route("/api/training/*")
        .handler(
            BodyHandler.create()
                .setBodyLimit(ScenarioDocuments.MAX_BYTES)
                .setHandleFileUploads(false));
    router.route("/api/training/*").handler(ctx -> {
              auth.findSession(AuthSession.tokenHash(ctx))
                  .onSuccess(
                      actor -> {
                        if (actor == null) ctx.fail(ApiException.unauthorized());
                        else {
                          ctx.put("actor", actor);
                          ctx.next();
                        }
                      })
                  .onFailure(ctx::fail);
            });
    router.get("/api/training/lessons").handler(c -> json(c, repository.lessons(actor(c))));
    router.get("/api/training/operator-cards")
        .handler(c -> json(c, repository.operatorCards(actor(c))));
    router.get("/api/training/learners").handler(c -> json(c, repository.learners(actor(c))));
    router.get("/api/training/groups").handler(c -> json(c, repository.groups(actor(c))));
    router
        .post("/api/training/groups")
        .handler(
            c ->
                json(
                    c,
                    repository.createGroup(
                        actor(c), text(c, "name", 200), text(c, "service_code", 64))));
    router.get("/api/training/groups/:id/members")
        .handler(c -> json(c, repository.members(actor(c), id(c))));
    router.post("/api/training/groups/:id/members/remove")
        .handler(c -> empty(c, repository.removeMember(actor(c), id(c), uuid(body(c).getString("learner_id")))));
    router.post("/api/training/scenarios/:id/archive")
        .handler(c -> empty(c, repository.archiveScenario(actor(c), id(c))));
    router
        .post("/api/training/groups/:id/members")
        .handler(
            c ->
                empty(
                    c,
                    repository.addMember(actor(c), id(c), uuid(body(c).getString("learner_id")))));
    router.get("/api/training/scenarios").handler(c -> json(c, repository.scenarios(actor(c))));
    router
        .post("/api/training/scenarios")
        .handler(c -> json(c, repository.createScenario(actor(c), body(c))));
    router
        .post("/api/training/scenarios/draft")
        .handler(c -> {
          TrainingRepository.teacher(actor(c));
          JsonObject body = body(c);
          Object seconds = body.getValue("seconds");
          if (!(seconds instanceof Number number) || number.intValue() < 1 || number.intValue() > 86_400
              || number.doubleValue() != number.intValue()) throw invalid();
          JsonObject demo;
          try (var input = TrainingRoutes.class.getResourceAsStream("/contracts/demo-scenario.json")) {
            if (input == null) throw new IllegalStateException("Missing demo scenario");
            demo = new JsonObject(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
          } catch (java.io.IOException error) {
            c.fail(error);
            return;
          }
          JsonObject document = ScenarioDraft.build(demo, text(c, "incident", 200), text(c, "location", 1000),
              text(c, "difficulty", 32), number.intValue(), text(c, "origin", 80), text(c, "caller_name", 200));
          json(c, Future.succeededFuture(document));
        });
    router
        .post("/api/training/scenarios/:id")
        .handler(c -> json(c, repository.updateScenario(actor(c), id(c), body(c))));
    router
        .get("/api/training/scenarios/:id")
        .handler(c -> json(c, repository.scenario(actor(c), id(c))));
    router
        .post("/api/training/scenarios/:id/approve")
        .handler(c -> empty(c, repository.approve(actor(c), id(c))));
    router.post("/api/training/scenarios/:id/delete")
        .handler(c -> empty(c, repository.deleteScenario(actor(c), id(c))));
    router.get("/api/training/materials").handler(c -> json(c, repository.materials(actor(c))));
    router.post("/api/training/materials").handler(c -> {
      JsonObject body = body(c);
      byte[] content;
      try {
        content = java.util.Base64.getDecoder().decode(text(c, "content_base64", 140_000));
      } catch (IllegalArgumentException error) {
        throw invalid();
      }
      json(c, repository.addMaterial(actor(c), text(c, "title", 200), text(c, "filename", 200),
          text(c, "media_type", 80), content));
    });
    router.get("/api/training/materials/:id").handler(c -> json(c, repository.material(actor(c), id(c))));
    router.post("/api/training/materials/:id/delete")
        .handler(c -> empty(c, repository.deleteMaterial(actor(c), id(c))));
    router.get("/api/training/lessons/:id/report").handler(c -> json(c, repository.lessonReport(actor(c), id(c))));
    router.get("/api/training/insights").handler(c -> json(c, repository.insights(actor(c))));
    router.get("/api/training/progress").handler(c -> json(c, repository.progress(actor(c))));
    router.post("/api/training/grammar").handler(c ->
        c.response().end(GrammarNotes.inspect(text(c, "field", 64), text(c, "text", 4000)).encode()));
    router.get("/api/training/jobs").handler(c -> json(c, repository.jobs(actor(c))));
    router
        .post("/api/training/lessons")
        .handler(c -> {
          JsonObject request = body(c);
          String mode = text(c, "mode", 16);
          UUID group = uuid(request.getString("group_id"));
          json(c, "card".equals(mode)
              ? repository.createCardLesson(actor(c), group, request)
              : repository.createLesson(actor(c), group,
                  uuid(request.getString("scenario_id")), mode));
        });
    router
        .post("/api/training/lessons/:id/start")
        .handler(c -> empty(c, repository.startLesson(actor(c), id(c))));
    router
        .post("/api/training/lessons/:id/finish")
        .handler(
            c ->
                empty(
                    c,
                    repository
                        .finishLesson(actor(c), id(c))
                        .map(
                            ids -> {
                              for (Object attempt : ids)
                                vertx
                                    .eventBus()
                                    .publish("training.attempt.closed", attempt.toString());
                              return null;
                            })));
    router.get("/api/training/assignments").handler(c -> json(c, repository.assignments(actor(c))));
    router
        .post("/api/training/attempts")
        .handler(
            c ->
                json(
                    c,
                    repository.createAttempt(
                        actor(c),
                        uuid(body(c).getString("assignment_id")),
                        uuid(body(c).getString("id")))));
    router
        .get("/api/training/attempts/:id")
        .handler(c -> json(c, repository.attempt(actor(c), id(c))));
    router.get("/api/training/attempts/:id/services")
        .handler(c -> json(c, repository.ddsServices(actor(c), id(c))));
    router.get("/api/training/attempts/:id/phone")
        .handler(c -> {
          JsonObject request = new JsonObject()
              .put("party", c.request().getParam("party", ""))
              .put("direction", c.request().getParam("direction", ""));
          String topic = c.request().getParam("topic");
          if (topic != null) request.put("topic", topic);
          json(c, repository.phonePreview(actor(c), id(c), request));
        });
    router
        .get("/api/training/attempts/:id/events")
        .handler(
            c -> {
              long after;
              try {
                after = Long.parseLong(c.request().getParam("after", "0"));
                if (after < 0) throw new NumberFormatException();
              } catch (NumberFormatException error) {
                c.fail(invalid());
                return;
              }
              json(c, repository.events(actor(c), id(c), after));
            });
    router
        .post("/api/training/attempts/:id/commands")
        .handler(
            c -> {
              JsonObject b = body(c);
              Object seq = b.getValue("expected_sequence");
              if (!(seq instanceof Number n)
                  || n.longValue() < 0
                  || n.doubleValue() != n.longValue()
                  || !(b.getValue("payload") instanceof JsonObject)) throw invalid();
              json(
                  c,
                  repository.command(
                      actor(c),
                      id(c),
                      uuid(b.getString("event_id")),
                      n.longValue(),
                      text(c, "type", 64),
                      b.getJsonObject("payload")));
            });
    router
        .post("/api/training/attempts/:id/finish")
        .handler(
            c -> {
              UUID id = id(c);
              Object failed = body(c).getValue("failed", false);
              if (!(failed instanceof Boolean)) throw invalid();
              empty(
                  c,
                  repository
                      .finishAttempt(actor(c), id, (Boolean) failed)
                      .map(
                          ignored -> {
                            vertx.eventBus().publish("training.attempt.closed", id.toString());
                            return null;
                          }));
            });
    router
        .get("/api/training/attempts/:id/result")
        .handler(c -> json(c, repository.result(actor(c), id(c))));
    router
        .post("/api/training/attempts/:id/reviews")
        .handler(
            c -> {
              JsonObject result = body(c).getJsonObject("result");
              if (result == null || result.toBuffer().length() > 8192) throw invalid();
              empty(c, repository.review(actor(c), id(c), result, text(c, "reason", 2000)));
            });
  }

  private static Account actor(RoutingContext c) {
    return c.get("actor");
  }

  private static UUID id(RoutingContext c) {
    return uuid(c.pathParam("id"));
  }

  public static UUID uuid(String value) {
    try {
      UUID id = UUID.fromString(value);
      if (!id.toString().equalsIgnoreCase(value)) throw invalid();
      return id;
    } catch (IllegalArgumentException | NullPointerException error) {
      throw invalid();
    }
  }

  private static JsonObject body(RoutingContext c) {
    try {
      JsonObject b = c.body().asJsonObject();
      if (b == null) throw invalid();
      return b;
    } catch (RuntimeException error) {
      throw invalid();
    }
  }

  private static String text(RoutingContext c, String key, int max) {
    Object value = body(c).getValue(key);
    if (!(value instanceof String s) || s.isBlank() || s.length() > max) throw invalid();
    return s;
  }

  private static ApiException invalid() {
    return new ApiException(400, "invalid_request", "Некорректный запрос.");
  }

  private static void empty(RoutingContext c, Future<?> result) {
    result.onSuccess(ignored -> c.response().setStatusCode(204).end()).onFailure(c::fail);
  }

  private static void json(RoutingContext c, Future<?> result) {
    result
        .onSuccess(value -> c.response().end(io.vertx.core.json.Json.encode(value)))
        .onFailure(c::fail);
  }
}
