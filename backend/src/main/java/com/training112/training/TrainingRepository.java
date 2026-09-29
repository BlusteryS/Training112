package com.training112.training;

import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository.Account;
import com.training112.auth.PlatformSettings;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.util.Set;
import java.util.UUID;

import static com.training112.training.TrainingDb.audit;
import static com.training112.training.TrainingDb.list;
import static com.training112.training.TrainingDb.one;

/** Entry point for training data and attempt transactions. */
public final class TrainingRepository {
  private final Pool pool;
  private final TrainingGroups trainingGroups;
  private final TrainingModules trainingModules;
  private final TrainingScenarios trainingScenarios;
  private final TrainingLessons trainingLessons;
  private final CardLinks cardLinks;
  private final TrainingReports reports;
  private final TrainingMaterials materials;

  public TrainingRepository(Pool pool) {
    this.pool = pool;
    this.trainingGroups = new TrainingGroups(pool);
    this.trainingModules = new TrainingModules(pool);
    this.trainingScenarios = new TrainingScenarios(pool);
    this.trainingLessons = new TrainingLessons(pool);
    this.cardLinks = new CardLinks(pool);
    this.reports = new TrainingReports(pool);
    this.materials = new TrainingMaterials(pool);
  }

  public CardLinks cardLinks() {
    return cardLinks;
  }

  public static void instructor(Account actor) {
    if (!"instructor".equals(actor.role())) throw forbidden();
  }

  public static ApiException forbidden() {
    return new ApiException(403, "forbidden", "Недостаточно прав.");
  }

  static ApiException conflict(String text) {
    return new ApiException(409, "conflict", text);
  }

  public Future<JsonObject> createGroup(Account actor, String name, String service) {
    return trainingGroups.createGroup(actor, name, service);
  }

  public Future<JsonArray> lessons(Account actor) {
    return trainingLessons.lessons(actor);
  }

  public Future<JsonArray> learners(Account actor) {
    return trainingGroups.learners(actor);
  }

  public Future<JsonArray> groups(Account actor) {
    return trainingGroups.groups(actor);
  }

  public Future<JsonArray> modules(Account actor) {
    return trainingModules.modules(actor);
  }

  public Future<JsonObject> createModule(Account actor, UUID group, String title, String difficulty) {
    return trainingModules.create(actor, group, title, difficulty);
  }

  public Future<JsonArray> members(Account actor, UUID group) {
    return trainingGroups.members(actor, group);
  }

  public Future<Void> removeMember(Account actor, UUID group, UUID learner) {
    return trainingGroups.removeMember(actor, group, learner);
  }

  public Future<Void> addMember(Account actor, UUID group, UUID learner) {
    return trainingGroups.addMember(actor, group, learner);
  }

  public Future<JsonArray> scenarios(Account actor) {
    return trainingScenarios.scenarios(actor);
  }

  public Future<JsonObject> createScenario(Account actor, JsonObject document) {
    return trainingScenarios.createScenario(actor, document);
  }

  public Future<JsonObject> updateScenario(Account actor, UUID scenario, JsonObject document) {
    return trainingScenarios.updateScenario(actor, scenario, document);
  }

  public Future<Void> archiveScenario(Account actor, UUID scenario) {
    return trainingScenarios.archiveScenario(actor, scenario);
  }

  public Future<JsonObject> scenario(Account actor, UUID scenario) {
    return trainingScenarios.scenario(actor, scenario);
  }

  public Future<Void> approve(Account actor, UUID scenario) {
    return trainingScenarios.approve(actor, scenario);
  }

  public Future<JsonArray> jobs(Account actor) {
    return trainingScenarios.jobs(actor);
  }

  public Future<JsonObject> createLesson(Account actor, UUID group, UUID module, UUID scenario, String mode) {
    return trainingLessons.createLesson(actor, group, module, scenario, mode);
  }

  public Future<JsonArray> operatorCards(Account actor) {
    return trainingLessons.operatorCards(actor);
  }

  public Future<JsonObject> createCardLesson(Account actor, UUID group, UUID module, JsonObject body) {
    return trainingLessons.createCardLesson(actor, group, module, body);
  }

  public Future<Void> startLesson(Account actor, UUID id) {
    return trainingLessons.startLesson(actor, id);
  }

  public Future<JsonArray> assignments(Account actor) {
    return trainingLessons.assignments(actor);
  }

  public Future<JsonArray> completedAttempts(Account actor) {
    return trainingLessons.completedAttempts(actor);
  }

  public Future<JsonObject> createAttempt(Account actor, UUID assignment, UUID attempt) {
    if (!"user".equals(actor.role())) throw forbidden();
    return pool.withTransaction(
            db ->
                one(
                        db,
                        """
                        SELECT la.id,l.mode,l.status,s.document,l.card_template,
                          s.document->>'origin' AS origin,g.service_code
                        FROM lesson_assignment la JOIN lesson l ON l.id=la.lesson_id
                        LEFT JOIN scenario s ON s.id=l.scenario_id
                        JOIN training_group g ON g.id=l.group_id
                        WHERE la.id=$1 AND la.learner_id=$2 FOR UPDATE OF l,la
                        """,
                        Tuple.of(assignment, actor.id()))
                    .compose(
                        row -> {
                          if (!"active".equals(row.getString("status")))
                            return Future.failedFuture(conflict("Занятие не активно."));
                          String workstation = actor.workstation();
                          if (workstation == null || !workstation.matches("[0-9]{1,4}"))
                            return Future.failedFuture(
                                new ApiException(
                                    400,
                                    "invalid_workstation",
                                    "Сессия не содержит номер АРМ."));
                          if ("card".equals(row.getString("mode")))
                            return Future.failedFuture(conflict("Карточку выдаёт занятие. Обновите список происшествий."));
                          String origin = row.getString("origin");
                          if (!IncidentOrigin.SOURCES.contains(origin))
                            return Future.failedFuture(
                                new ApiException(
                                    400, "invalid_scenario", "У сценария не задан источник происшествия."));
                          JsonObject snapshot = new JsonObject();
                          return db.preparedQuery(
                                  """
                                  INSERT INTO training_attempt(id,assignment_id,status,started_at,
                                    workstation,incident_source,vis_operator,card,card_status)
                                  VALUES ($1,$2,'created',NULL,$3,$4,$5,$6,'received')
                                  ON CONFLICT (id) DO NOTHING
                                  """)
                              .execute(
                                  Tuple.of(
                                      attempt,
                                      assignment,
                                      workstation,
                                      origin,
                                      IncidentOrigin.visOperator(origin, actor.login()),
                                      snapshot));
                        })
                    .compose(
                        ignored ->
                            one(
                                db,
                                "SELECT to_jsonb(a) AS value FROM training_attempt a WHERE id=$1"
                                    + " AND assignment_id=$2",
                                Tuple.of(attempt, assignment)))
                    .map(row -> row.getJsonObject("value")))
        .recover(
            error -> {
              if (error instanceof io.vertx.pgclient.PgException pg
                  && "23505".equals(pg.getSqlState()))
                return Future.failedFuture(conflict("Для назначения уже есть открытая попытка."));
              return Future.failedFuture(error);
            });
  }

  private Future<Row> accessibleAttempt(SqlClient db, Account actor, UUID id, boolean lock) {
    return one(
        db,
        """
        SELECT a.*,la.learner_id,l.id AS lesson_id,l.scenario_id,
          COALESCE(a.card_template,l.card_template) AS card_template,l.mode,
          l.status AS lesson_status,g.instructor_id
        FROM training_attempt a JOIN lesson_assignment la ON la.id=a.assignment_id
        JOIN lesson l ON l.id=la.lesson_id JOIN training_group g ON g.id=l.group_id
        WHERE a.id=$1 AND (la.learner_id=$2 OR g.instructor_id=$2)
        """
            + (lock ? " FOR UPDATE OF a" : ""),
        Tuple.of(id, actor.id()));
  }

  public Future<JsonObject> attempt(Account actor, UUID id) {
    return accessibleAttempt(pool, actor, id, false)
        .compose(
            row -> {
              boolean ownActiveCard =
                  "user".equals(actor.role())
                      && actor.id().equals(row.getUUID("learner_id"))
                      && "card".equals(row.getString("mode"))
                      && "active".equals(row.getString("status"));
              if (!ownActiveCard) return loadAttempt(pool, id);
              return pool.withTransaction(
                  db ->
                      db.preparedQuery("UPDATE training_attempt SET workstation=$2 WHERE id=$1"
                              + " AND workstation IS NULL AND status='active'")
                          .execute(Tuple.of(id, actor.workstation()))
                          .compose(ignored -> db.preparedQuery(
                                  "UPDATE training_attempt SET card_status='received' WHERE id=$1 AND"
                                      + " card_status='added' AND status='active'")
                              .execute(Tuple.of(id)))
                          .compose(
                              updated ->
                                  updated.rowCount() == 0
                                      ? Future.succeededFuture()
                                      : append(
                                              db,
                                              id,
                                              UUID.randomUUID(),
                                              actor.id(),
                                              "operator",
                                              "card.status",
                                              new JsonObject().put("status", "received").put("comment", ""))
                                          .mapEmpty())
                          .compose(ignored -> loadAttempt(db, id)));
            });
  }

  private Future<JsonObject> loadAttempt(SqlClient db, UUID id) {
    return one(db, "SELECT to_jsonb(a) AS value FROM training_attempt a WHERE id=$1", Tuple.of(id))
        .map(row -> row.getJsonObject("value"));
  }

  public Future<JsonArray> events(Account actor, UUID id, long after) {
    return accessibleAttempt(pool, actor, id, false)
        .compose(
            ignored ->
                list(
                    pool,
                    "SELECT to_jsonb(e) AS value FROM attempt_event e WHERE attempt_id=$1 AND"
                        + " sequence>$2 ORDER BY sequence LIMIT 200",
                    Tuple.of(id, after)));
  }

  public Future<JsonArray> serviceStatuses(Account actor, UUID id) {
    return accessibleAttempt(pool, actor, id, false).compose(row -> {
      if (!"card".equals(row.getString("mode"))) throw forbidden();
      JsonObject template = row.getJsonObject("card_template");
      String caseId = template == null ? null : template.getString("case_id");
      if (caseId == null || caseId.isBlank()) return Future.succeededFuture(new JsonArray());
      return list(pool, """
          SELECT to_jsonb(latest) AS value FROM (
            SELECT DISTINCT ON (lower(g.service_code)) g.service_code AS service,
              a.card_status AS status,a.started_at,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'status',e.payload->>'status',
                  'comment',e.payload->>'comment',
                  'created_at',e.created_at) ORDER BY e.sequence),'[]'::jsonb)
               FROM attempt_event e WHERE e.attempt_id=a.id AND e.type='card.status'
                 AND e.payload->>'status'<>'received') AS history
            FROM training_attempt a
            JOIN lesson_assignment la ON la.id=a.assignment_id
            JOIN lesson l ON l.id=la.lesson_id
            JOIN training_group g ON g.id=l.group_id
            WHERE a.card_template->>'case_id'=$1 AND l.mode='card'
            ORDER BY lower(g.service_code),a.created_at DESC,a.id DESC
          ) latest
          """, Tuple.of(caseId));
    });
  }

  public Future<JsonObject> phonePreview(Account actor, UUID id, JsonObject request) {
    return PlatformSettings.enabled(pool, "dds_phone_enabled")
        .compose(enabled -> enabled ? accessibleAttempt(pool, actor, id, false)
            : Future.failedFuture(new ApiException(503, "phone_disabled", "Учебный телефон временно отключён.")))
        .compose(row -> {
      if (!"user".equals(actor.role()) || !actor.id().equals(row.getUUID("learner_id"))
          || !"card".equals(row.getString("mode"))
          || !"active".equals(row.getString("status"))) throw forbidden();
      JsonObject card = row.getJsonObject("card");
      if ("caller".equals(request.getValue("party")) && card.getString("phone", "").isBlank())
        throw conflict("В карточке нет номера заявителя.");
      JsonObject report = DdsPhone.report(row.getString("card_status"), row.getString("dds_crew"),
          row.getJsonObject("card_template"), request);
      return "service112".equals(request.getValue("party"))
          ? requireDiscrepancy(pool, id).map(report) : Future.succeededFuture(report);
    });
  }

  public Future<Void> phoneAdmission(Account actor, UUID id) {
    return PlatformSettings.enabled(pool, "dds_phone_enabled").compose(enabled -> {
      if (!enabled) return Future.failedFuture(
          new ApiException(503, "phone_disabled", "Учебный телефон временно отключён."));
      return accessibleAttempt(pool, actor, id, false);
    }).compose(row -> {
      if (!"user".equals(actor.role()) || !actor.id().equals(row.getUUID("learner_id"))
          || !"card".equals(row.getString("mode"))
          || !"active".equals(row.getString("status"))
          || !"active".equals(row.getString("lesson_status"))) throw forbidden();
      return Future.succeededFuture();
    });
  }

  public Future<Boolean> ddsPhoneEnabled() {
    return PlatformSettings.enabled(pool, "dds_phone_enabled");
  }

  public Future<JsonObject> command(
      Account actor, UUID id, UUID eventId, long expected, String type, JsonObject payload) {
    return pool.withTransaction(
        db ->
            accessibleAttempt(db, actor, id, true)
                .compose(
                    row -> {
                      if (!actor.id().equals(row.getUUID("learner_id")))
                        return Future.failedFuture(forbidden());
                      return db.preparedQuery(
                              "SELECT to_jsonb(e) AS value FROM attempt_event e WHERE attempt_id=$1"
                                  + " AND event_id=$2")
                          .execute(Tuple.of(id, eventId))
                          .compose(
                              existing -> {
                                if (existing.size() > 0) {
                                  JsonObject saved =
                                      existing.iterator().next().getJsonObject("value");
                                  JsonObject original = "dds.phone.report".equals(type)
                                      ? saved.getJsonObject("payload").getJsonObject("request")
                                      : saved.getJsonObject("payload");
                                  if (!type.equals(saved.getString("type"))
                                      || !payload.equals(original)
                                      || !"operator".equals(saved.getString("source")))
                                    return Future.failedFuture(
                                        conflict("Идентификатор команды уже использован."));
                                  return Future.succeededFuture(saved);
                                }
                                if (!"active".equals(row.getString("status"))
                                    || !"active".equals(row.getString("lesson_status")))
                                  return Future.failedFuture(conflict("Попытка не активна."));
                                if (expected != row.getLong("event_sequence"))
                                  return Future.failedFuture(
                                      conflict("Состояние изменилось. Получите новые события."));
                                if ("card.update".equals(type) && "card".equals(row.getString("mode")))
                                  return Future.failedFuture(
                                      new ApiException(
                                          400, "invalid_card_command", "Диспетчер не изменяет карточку."));
                                if (type.startsWith("dds.")) {
                                  if (!"card".equals(row.getString("mode")))
                                    return Future.failedFuture(forbidden());
                                  return ddsCommand(db, row, actor, id, eventId, type, payload);
                                }
                                CardCommands.Applied applied =
                                    CardCommands.apply(
                                        row.getJsonObject("card"),
                                        row.getString("card_status"),
                                        type,
                                        payload);
                                Future<Void> evidence = "card".equals(row.getString("mode"))
                                    && "card.status".equals(type)
                                    && !Set.of("accepted", "rejected").contains(applied.status())
                                    ? requirePhoneReport(db, id, applied.status())
                                    : Future.succeededFuture();
                                return evidence.compose(checked -> db.preparedQuery(
                                        "UPDATE training_attempt SET card=$2,card_status=$3 WHERE"
                                            + " id=$1")
                                    .execute(Tuple.of(id, applied.card(), applied.status()))
                                    .compose(
                                        ignored ->
                                            append(
                                                db,
                                                id,
                                                eventId,
                                                actor.id(),
                                                "operator",
                                                type,
                                                payload))
                                    .compose(saved -> "card".equals(row.getString("mode"))
                                        && Set.of("completed", "refused").contains(applied.status())
                                            ? finish(db, id, actor.id(), false).map(saved)
                                            : Future.succeededFuture(saved)));
                              });
                    }));
  }

  private Future<Void> requirePhoneReport(SqlClient db, UUID attempt, String status) {
    return one(db, """
        SELECT EXISTS (
          SELECT 1 FROM attempt_event e WHERE e.attempt_id=$1
            AND e.type='dds.phone.report' AND e.payload->>'report_status'=$2
            AND e.sequence > COALESCE((SELECT max(sequence) FROM attempt_event
              WHERE attempt_id=$1 AND type='card.status'),0)
        ) AS reported
        """, Tuple.of(attempt, status)).compose(row -> row.getBoolean("reported")
            ? Future.succeededFuture()
            : Future.failedFuture(conflict("Сначала получите доклад старшего бригады по телефону.")));
  }

  private Future<Void> requireDiscrepancy(SqlClient db, UUID attempt) {
    return one(db, """
        SELECT EXISTS (SELECT 1 FROM attempt_event WHERE attempt_id=$1
          AND type='dds.phone.report' AND payload->>'party'='crew'
          AND payload->>'topic'='card_error') AS reported
        """, Tuple.of(attempt)).compose(row -> row.getBoolean("reported")
            ? Future.succeededFuture()
            : Future.failedFuture(conflict("Сначала получите уточнение от бригады.")));
  }

  private Future<JsonObject> ddsCommand(SqlClient db, Row row, Account actor, UUID attempt,
      UUID eventId, String type, JsonObject payload) {
    String status = row.getString("card_status");
    if ("dds.crew.select".equals(type)) {
      String crew = payload.getString("crew", "");
      if (!"accepted".equals(status) || !payload.fieldNames().equals(Set.of("crew"))
          || !DdsPhone.crewName(crew))
        return Future.failedFuture(conflict("Выберите бригаду после принятия карточки."));
      return one(db, "SELECT count(*) AS reports FROM attempt_event WHERE attempt_id=$1 "
          + "AND type='dds.phone.report' AND payload->>'party'='crew'", Tuple.of(attempt))
          .compose(count -> {
            if (count.getLong("reports") > 0)
              return Future.failedFuture(conflict("Бригада уже начала реагирование."));
            return db.preparedQuery("UPDATE training_attempt SET dds_crew=$2 WHERE id=$1")
                .execute(Tuple.of(attempt, crew))
                .compose(ignored -> append(db, attempt, eventId, actor.id(), "operator", type, payload));
          });
    }
    if ("dds.phone.report".equals(type)) {
      JsonObject card = row.getJsonObject("card");
      if ("caller".equals(payload.getValue("party")) && card.getString("phone", "").isBlank())
        return Future.failedFuture(conflict("В карточке нет номера заявителя."));
      JsonObject report = DdsPhone.report(status, row.getString("dds_crew"),
          row.getJsonObject("card_template"), payload);
      Future<Void> evidence = "service112".equals(payload.getValue("party"))
          ? requireDiscrepancy(db, attempt) : Future.succeededFuture();
      return evidence.compose(ignored -> append(db, attempt, eventId, actor.id(), "operator", type, report));
    }
    return Future.failedFuture(new ApiException(400, "invalid_dds_command", "Неизвестное действие ДДС."));
  }

  private Future<JsonObject> append(
      SqlClient db,
      UUID id,
      UUID event,
      UUID actor,
      String source,
      String type,
      JsonObject payload) {
    return one(
            db,
            """
            UPDATE training_attempt SET event_sequence=event_sequence+1 WHERE id=$1
            RETURNING event_sequence, GREATEST(0,COALESCE(EXTRACT(EPOCH FROM
            (COALESCE(suspended_at,finished_at,now())-started_at))*1000,0)::bigint-paused_ms) AS elapsed_ms
            """,
            Tuple.of(id))
        .compose(
            row ->
                one(
                    db,
                    """
                    INSERT INTO attempt_event(attempt_id,event_id,sequence,actor_id,source,type,payload,elapsed_ms)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING to_jsonb(attempt_event) AS value
                    """,
                    Tuple.of(
                        id,
                        event,
                        row.getLong("event_sequence"),
                        actor,
                        source,
                        type,
                        payload,
                        row.getLong("elapsed_ms"))))
        .map(row -> row.getJsonObject("value"));
  }

  public Future<JsonObject> speechAdmission(Account actor, UUID id) {
    return accessibleAttempt(pool, actor, id, false)
        .compose(
            row -> {
              if (!actor.id().equals(row.getUUID("learner_id"))
                  || !"call".equals(row.getString("mode"))) return Future.failedFuture(forbidden());
              if (!"active".equals(row.getString("lesson_status"))
                  || !Set.of("created", "active", "suspended").contains(row.getString("status")))
                return Future.failedFuture(conflict("Попытка завершена."));
              return one(
                      pool,
                      "SELECT artifact,artifact_sha256 FROM scenario WHERE id=$1 AND"
                          + " status='approved'",
                      Tuple.of(row.getUUID("scenario_id")))
                  .map(
                      scenario ->
                          new JsonObject()
                              .put("attempt_id", id.toString())
                              .put("lesson_id", row.getUUID("lesson_id").toString())
                              .put("status", row.getString("status"))
                              .put("artifact", scenario.getString("artifact"))
                              .put("sha256", scenario.getString("artifact_sha256")));
            });
  }

  public Future<Void> speechEvent(UUID id, String type, JsonObject payload) {
    return pool.withTransaction(
        db ->
            one(db, "SELECT status FROM training_attempt WHERE id=$1 FOR UPDATE", Tuple.of(id))
                .compose(
                    row -> {
                      if (Set.of("completed", "failed").contains(row.getString("status")))
                        return Future.<Void>succeededFuture();
                      String update =
                          switch (type) {
                            case "ready" ->
                                "UPDATE training_attempt SET"
                                    + " status='active',started_at=COALESCE(started_at,now()),speech_node=$2"
                                    + " WHERE id=$1";
                            case "suspended" ->
                                "UPDATE training_attempt SET"
                                    + " status='suspended',suspended_at=COALESCE(suspended_at,now())"
                                    + " WHERE id=$1";
                            case "resumed" ->
                                "UPDATE training_attempt SET"
                                    + " status='active',paused_ms=paused_ms+COALESCE((EXTRACT(EPOCH"
                                    + " FROM"
                                    + " (now()-suspended_at))*1000)::bigint,0),suspended_at=NULL"
                                    + " WHERE id=$1";
                            default -> null;
                          };
                      Future<?> mutation =
                          update == null
                              ? Future.succeededFuture()
                              : db.preparedQuery(update)
                                  .execute(
                                      "ready".equals(type)
                                          ? Tuple.of(id, payload.getString("node", "unknown"))
                                          : Tuple.of(id));
                      return mutation
                          .compose(
                              ignored ->
                                  append(
                                      db,
                                      id,
                                      UUID.randomUUID(),
                                      null,
                                      "speech",
                                      "speech." + type,
                                      payload))
                          .mapEmpty();
                    }));
  }

  public Future<Void> terminate(UUID id, boolean failed) {
    // Ending the voice connection leaves the operator card open for saving.
    if (!failed) return Future.succeededFuture();
    return pool.withTransaction(
        db ->
            one(db, "SELECT status FROM training_attempt WHERE id=$1 FOR UPDATE", Tuple.of(id))
                .compose(
                    row ->
                        Set.of("completed", "failed").contains(row.getString("status"))
                            ? Future.succeededFuture()
                            : finish(db, id, null, true)));
  }

  public Future<Void> finishAttempt(Account actor, UUID id, boolean failed) {
    return pool.withTransaction(
        db ->
            accessibleAttempt(db, actor, id, true)
                .compose(
                    row -> {
                      if (Set.of("completed", "failed").contains(row.getString("status")))
                        return Future.succeededFuture();
                      return finish(db, id, actor.id(), failed);
                    }));
  }

  private Future<Void> finish(SqlClient db, UUID id, UUID actor, boolean failed) {
    return one(
            db,
            """
            SELECT l.mode,l.scenario_id,l.card_template AS lesson_pool,a.card,
              COALESCE(a.card_template,l.card_template) AS selected_template,
              a.assignment_id,la.learner_id,g.service_code,l.status AS lesson_status
            FROM training_attempt a
            JOIN lesson_assignment la ON la.id=a.assignment_id
            JOIN lesson l ON l.id=la.lesson_id
            JOIN training_group g ON g.id=l.group_id WHERE a.id=$1
            """,
            Tuple.of(id))
        .compose(
            mode -> {
              boolean card = "card".equals(mode.getString("mode"));
              if (!card && !failed && actor != null && actor.equals(mode.getUUID("learner_id")))
                CardCommands.validateForSave(mode.getJsonObject("card"));
              return db.preparedQuery("UPDATE training_attempt SET status=$2,finished_at=now() WHERE id=$1")
                  .execute(Tuple.of(id, failed ? "failed" : "completed"))
                  .compose(
                      ignored ->
                          append(
                              db,
                              id,
                              UUID.randomUUID(),
                              actor,
                              "system",
                              failed ? "attempt.failed" : "attempt.completed",
                              new JsonObject()))
                  .compose(
                      ignored ->
                          card
                              ? evaluateDds(db, id, mode.getJsonObject("selected_template"),
                                  failed ? "failed" : "completed")
                              : db.preparedQuery(
                                      "INSERT INTO background_job(id,kind,attempt_id) VALUES"
                                          + " ($1,'evaluate_attempt',$2) ON CONFLICT DO NOTHING")
                                  .execute(Tuple.of(UUID.randomUUID(), id))
                                  .mapEmpty())
                  .compose(ignored -> audit(db, actor,
                      failed ? "attempt.failed" : "attempt.completed", id, new JsonObject()))
                  .compose(ignored -> card && !failed
                      && "active".equals(mode.getString("lesson_status"))
                      && DdsCardPool.hasSequence(mode.getJsonObject("lesson_pool"))
                          ? issueNextCard(db, mode.getUUID("assignment_id"),
                              mode.getJsonObject("lesson_pool"), mode.getString("service_code"))
                          : Future.succeededFuture());
            });
  }

  private Future<Void> issueNextCard(SqlClient db, UUID assignment,
      JsonObject pool, String service) {
    return db.preparedQuery("""
        SELECT card_template->>'case_id' AS case_id FROM training_attempt
        WHERE assignment_id=$1 AND card_template IS NOT NULL ORDER BY created_at,id
        """).execute(Tuple.of(assignment)).compose(rows -> {
          JsonArray previous = new JsonArray();
          for (Row row : rows) previous.add(row.getString("case_id"));
          JsonObject selected = DdsCardPool.choose(pool, previous);
          JsonObject card = CardSnapshot.fromTemplate(selected, service);
          return db.preparedQuery("""
              INSERT INTO training_attempt(id,assignment_id,status,started_at,
                incident_source,vis_operator,card,card_status,card_template)
              SELECT $1,$2,'active',now(),$3,NULL,$4,'added',$5
              FROM lesson_assignment la JOIN lesson l ON l.id=la.lesson_id
              WHERE la.id=$2 AND l.status='active'
              """).execute(Tuple.of(UUID.randomUUID(), assignment,
                  IncidentOrigin.SERVICE_112, card, selected)).mapEmpty();
        });
  }

  private Future<Void> evaluateDds(SqlClient db, UUID id, JsonObject template, String status) {
    return list(db, "SELECT to_jsonb(e) AS value FROM attempt_event e WHERE attempt_id=$1"
        + " ORDER BY sequence", Tuple.of(id))
        .compose(events -> db.preparedQuery(
            "INSERT INTO attempt_evaluation(attempt_id,scenario_id,result,evaluator_version)"
                + " VALUES ($1,NULL,$2,'dds-v1') ON CONFLICT (attempt_id) DO NOTHING")
            .execute(Tuple.of(id, DdsEvaluation.evaluate(template, events, status))))
        .mapEmpty();
  }

  public Future<JsonArray> finishLesson(Account actor, UUID id) {
    instructor(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT l.id FROM lesson l JOIN training_group g ON g.id=l.group_id WHERE"
                        + " l.id=$1 AND g.instructor_id=$2 FOR UPDATE OF l",
                    Tuple.of(id, actor.id()))
                .compose(
                    ignored ->
                        db.preparedQuery(
                                "UPDATE lesson SET"
                                    + " status='completed',finished_at=COALESCE(finished_at,now())"
                                    + " WHERE id=$1")
                            .execute(Tuple.of(id)))
                .compose(
                    ignored ->
                        db.preparedQuery(
                                "SELECT a.id FROM training_attempt a JOIN lesson_assignment la ON"
                                    + " la.id=a.assignment_id WHERE la.lesson_id=$1 AND a.status IN"
                                    + " ('created','active','suspended') ORDER BY a.id FOR UPDATE"
                                    + " OF a")
                            .execute(Tuple.of(id)))
                .compose(
                    rows -> {
                      Future<Void> chain = Future.succeededFuture();
                      JsonArray ids = new JsonArray();
                      for (Row row : rows) {
                        UUID attempt = row.getUUID("id");
                        ids.add(attempt.toString());
                        chain = chain.compose(ignored -> finish(db, attempt, actor.id(), false));
                      }
                      return chain
                          .compose(
                              ignored ->
                                  audit(db, actor.id(), "lesson.completed", id, new JsonObject()))
                          .map(ids);
                    }));
  }

  public Future<JsonObject> result(Account actor, UUID id) {
    return accessibleAttempt(pool, actor, id, false)
        .compose(
            ignored ->
                one(
                    pool,
                    "SELECT to_jsonb(e) AS value FROM attempt_evaluation e WHERE attempt_id=$1",
                    Tuple.of(id)))
        .compose(
            row ->
                list(
                        pool,
                        "SELECT to_jsonb(r) AS value FROM evaluation_review r WHERE attempt_id=$1"
                            + " ORDER BY created_at,id",
                        Tuple.of(id))
                    .map(reviews -> row.getJsonObject("value").put("reviews", reviews)));
  }

  public Future<Void> review(Account actor, UUID id, JsonObject result, String reason) {
    instructor(actor);
    return pool.withTransaction(
        db ->
            accessibleAttempt(db, actor, id, true)
                .compose(
                    row -> {
                      if (!actor.id().equals(row.getUUID("instructor_id")))
                        return Future.failedFuture(forbidden());
                      if (!Set.of("completed", "failed").contains(row.getString("status")))
                        return Future.failedFuture(conflict("Попытка ещё не завершена."));
                      return db.preparedQuery(
                              "INSERT INTO"
                                  + " evaluation_review(id,attempt_id,instructor_id,result,reason)"
                                  + " VALUES ($1,$2,$3,$4,$5)")
                          .execute(Tuple.of(UUID.randomUUID(), id, actor.id(), result, reason));
                    })
                .compose(
                    ignored ->
                        audit(
                            db,
                            actor.id(),
                            "evaluation.reviewed",
                            id,
                            new JsonObject().put("reason", reason))));
  }

  public Future<Void> deleteScenario(Account actor, UUID scenario) {
    return trainingScenarios.deleteScenario(actor, scenario);
  }

  public Future<JsonArray> materials(Account actor) {
    return materials.list(actor);
  }

  public Future<JsonObject> material(Account actor, UUID id) {
    return materials.get(actor, id);
  }

  public Future<JsonObject> addMaterial(Account actor, String title, String filename, String media, byte[] content) {
    return materials.add(actor, title, filename, media, content);
  }

  public Future<Void> deleteMaterial(Account actor, UUID id) {
    return materials.delete(actor, id);
  }

  public Future<JsonArray> lessonReport(Account actor, UUID lesson) {
    return reports.lessonReport(actor, lesson);
  }

  public Future<JsonArray> insights(Account actor) {
    return reports.insights(actor);
  }

  public Future<JsonArray> progress(Account actor) {
    return reports.progress(actor);
  }

  public Future<JsonArray> learnerHistory(Account actor) {
    return reports.learnerHistory(actor);
  }

  public Future<JsonObject> capabilities(Account actor) {
    if (!"user".equals(actor.role())) throw forbidden();
    return PlatformSettings.enabled(pool, "service_speech_enabled")
        .compose(speech -> PlatformSettings.enabled(pool, "dds_phone_enabled")
            .map(phone -> new JsonObject().put("speech", speech).put("dds_phone", phone)));
  }
}
