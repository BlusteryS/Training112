package com.training112.training;

import com.training112.AppConfig;
import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.AuthRepository.Account;
import com.training112.auth.AuthSession;
import com.training112.auth.RequestGuard;
import com.training112.speech.SpeechConfig;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import java.util.UUID;

import static com.training112.ApiRequest.body;
import static com.training112.ApiRequest.id;
import static com.training112.ApiRequest.text;
import static com.training112.ApiRequest.uuid;

/** Public learning API. Student responses never include scenario facts or rubrics. */
public final class TrainingRoutes {
  private final Vertx vertx;
  private final TrainingRepository repository;
  private final AuthRepository auth;
  private final AppConfig config;
  private final DdsTranscription transcription;

  public TrainingRoutes(
      Vertx vertx, TrainingRepository repository, AuthRepository auth, AppConfig config) {
    this.vertx = vertx;
    this.repository = repository;
    this.auth = auth;
    this.config = config;
    this.transcription = new DdsTranscription(vertx, SpeechConfig.fromEnvironment());
  }

  public void mount(Router router) {
    router.route("/api/training/*").handler(ctx -> RequestGuard.jsonWrites(ctx, config));
    // Subscribe to the body before asynchronous authentication can let the stream end.
    BodyHandler standardBody = BodyHandler.create()
        .setBodyLimit(ScenarioDocuments.MAX_BYTES)
        .setHandleFileUploads(false);
    BodyHandler materialBody = BodyHandler.create()
        .setBodyLimit(12L * 1024 * 1024)
        .setHandleFileUploads(false);
    BodyHandler audioBody = BodyHandler.create()
        .setBodyLimit(450_000)
        .setHandleFileUploads(false);
    router.route("/api/training/*").handler(ctx -> {
      if (ctx.request().method() == HttpMethod.POST
          && "/api/training/materials".equals(ctx.request().path())) materialBody.handle(ctx);
      else if (ctx.request().method() == HttpMethod.POST
          && ctx.request().path().endsWith("/phone/recognize")) audioBody.handle(ctx);
      else standardBody.handle(ctx);
    });
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
    router.get("/api/training/modules").handler(c -> json(c, repository.modules(actor(c))));
    router.post("/api/training/modules").handler(c -> json(c,
        repository.createModule(actor(c), uuid(body(c), "group_id"), text(c, "title", 200),
            text(c, "difficulty", 20))));
    router.get("/api/training/classifier")
        .handler(c -> json(c, Future.succeededFuture(IncidentClassifier.cards())));
    router.get("/api/training/addresses").handler(c -> {
      String query = c.request().getParam("q", "");
      json(c, vertx.executeBlocking(() -> FiasAddresses.search(query)));
    });
    router.get("/api/training/addresses/nearest").handler(c -> {
      double latitude;
      double longitude;
      try {
        latitude = Double.parseDouble(c.request().getParam("latitude"));
        longitude = Double.parseDouble(c.request().getParam("longitude"));
      } catch (NumberFormatException | NullPointerException error) {
        throw invalid();
      }
      if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
          || latitude < 55.1 || latitude > 56.05 || longitude < 36.6 || longitude > 38.1) {
        throw invalid();
      }
      json(c, vertx.executeBlocking(() -> GeoAddresses.nearest(latitude, longitude)));
    });
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
        .handler(c -> empty(c, repository.removeMember(actor(c), id(c), uuid(body(c), "learner_id"))));
    router.post("/api/training/scenarios/:id/archive")
        .handler(c -> empty(c, repository.archiveScenario(actor(c), id(c))));
    router
        .post("/api/training/groups/:id/members")
        .handler(
            c ->
                empty(
                    c,
                    repository.addMember(actor(c), id(c), uuid(body(c), "learner_id"))));
    router.get("/api/training/scenarios").handler(c -> json(c, repository.scenarios(actor(c))));
    router
        .post("/api/training/scenarios")
        .handler(c -> json(c, repository.createScenario(actor(c), body(c))));
    router
        .post("/api/training/scenarios/draft")
        .handler(c -> {
          TrainingRepository.instructor(actor(c));
          JsonObject body = body(c);
          Object seconds = body.getValue("seconds");
          if (!(seconds instanceof Number number) || number.intValue() < 1 || number.intValue() > 86_400
              || number.doubleValue() != number.intValue()) throw invalid();
          JsonObject document = ScenarioDraft.build(text(c, "classifier_code", 32), text(c, "location", 1000),
              text(c, "victims_state", 16),
              text(c, "difficulty", 32), number.intValue(), text(c, "origin", 80));
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
        content = java.util.Base64.getDecoder().decode(text(c, "content_base64",
            ((TrainingMaterials.MAX_BYTES + 2) / 3) * 4));
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
    router.get("/api/training/history").handler(c -> json(c, repository.learnerHistory(actor(c))));
    router.post("/api/training/grammar").handler(c ->
        c.response().end(GrammarNotes.inspect(text(c, "field", 64), text(c, "text", 4000)).encode()));
    router.get("/api/training/jobs").handler(c -> json(c, repository.jobs(actor(c))));
    router
        .post("/api/training/lessons")
        .handler(c -> {
          JsonObject request = body(c);
          String mode = text(c, "mode", 16);
          UUID group = uuid(request, "group_id");
          UUID module = uuid(request, "module_id");
          json(c, "card".equals(mode)
              ? repository.createCardLesson(actor(c), group, module, request)
              : repository.createLesson(actor(c), group, module,
                  uuid(request, "scenario_id"), mode));
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
    router.get("/api/training/capabilities").handler(c -> json(c, repository.capabilities(actor(c))));
    router.get("/api/training/results").handler(c -> json(c, repository.completedAttempts(actor(c))));
    router
        .post("/api/training/attempts")
        .handler(
            c ->
                json(
                    c,
                    repository.createAttempt(
                        actor(c),
                        uuid(body(c), "assignment_id"),
                        uuid(body(c), "id"))));
    router
        .get("/api/training/attempts/:id")
        .handler(c -> json(c, repository.attempt(actor(c), id(c))));
    router.get("/api/training/attempts/:id/links")
        .handler(c -> json(c, repository.cardLinks().chain(actor(c), id(c))));
    router.get("/api/training/attempts/:id/services")
        .handler(c -> json(c, repository.serviceStatuses(actor(c), id(c))));
    router.get("/api/training/attempts/:id/link-candidates")
        .handler(c -> json(c, repository.cardLinks().candidates(actor(c), id(c),
            c.request().getParam("q", ""), c.request().getParam("phone", ""),
            c.request().getParam("address", ""))));
    router.post("/api/training/attempts/:id/links")
        .handler(c -> empty(c, repository.cardLinks().attach(actor(c), id(c),
            uuid(body(c), "parent_id"))));
    router.post("/api/training/attempts/:id/links/detach")
        .handler(c -> empty(c, repository.cardLinks().detach(actor(c), id(c))));
    router.post("/api/training/attempts/:id/links/promote")
        .handler(c -> empty(c, repository.cardLinks().promote(actor(c), id(c))));
    router.post("/api/training/attempts/:id/phone/recognize")
        .handler(c -> json(c, repository.phoneAdmission(actor(c), id(c))
            .compose(ignored -> transcription.recognize(body(c)))));
    router.post("/api/training/attempts/:id/phone")
        .handler(c -> {
          json(c, repository.phonePreview(actor(c), id(c), body(c)));
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
              String type = text(c, "type", 64);
              Future<JsonObject> allowed = "dds.phone.report".equals(type)
                  ? repository.ddsPhoneEnabled().compose(enabled -> enabled
                      ? repository.command(actor(c), id(c), uuid(b, "event_id"), n.longValue(), type, b.getJsonObject("payload"))
                      : Future.failedFuture(new ApiException(503, "phone_disabled", "Учебный телефон временно отключён.")))
                  : repository.command(
                      actor(c),
                      id(c),
                      uuid(b, "event_id"),
                      n.longValue(),
                      type,
                      b.getJsonObject("payload"));
              json(c, allowed);
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
              Object submitted = body(c).getValue("result");
              JsonObject result = submitted instanceof JsonObject object ? object : null;
              String reason = text(c, "reason", 2000);
              Object score = result == null ? null : result.getValue("score");
              Object recommendation = result == null ? null : result.getValue("recommendation");
              if (result == null || !result.fieldNames().equals(java.util.Set.of("score", "recommendation"))
                  || !(score instanceof Number number) || number.intValue() < 0
                  || number.intValue() > 100 || number.doubleValue() != number.intValue()
                  || !(recommendation instanceof String advice) || advice.length() > 1000
                  || reason.isBlank()) throw invalid();
              empty(c, repository.review(actor(c), id(c), result, reason));
            });
  }

  private static Account actor(RoutingContext c) {
    return c.get("actor");
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
