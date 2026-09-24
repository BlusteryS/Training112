package com.training112.training;

import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository.Account;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.util.Set;
import java.util.UUID;

/** Business transactions own scenarios, attempts and events; Speech never owns a DB connection. */
public final class TrainingRepository {
  private final Pool pool;

  public TrainingRepository(Pool pool) {
    this.pool = pool;
  }

  public static void teacher(Account actor) {
    if (!"teacher".equals(actor.role())) throw forbidden();
  }

  public static ApiException forbidden() {
    return new ApiException(403, "forbidden", "Недостаточно прав.");
  }

  private static ApiException missing() {
    return new ApiException(404, "not_found", "Объект не найден.");
  }

  private static ApiException conflict(String text) {
    return new ApiException(409, "conflict", text);
  }

  private static Future<Row> one(SqlClient client, String sql, Tuple parameters) {
    return client
        .preparedQuery(sql)
        .execute(parameters)
        .compose(
            rows ->
                rows.size() == 0
                    ? Future.failedFuture(missing())
                    : Future.succeededFuture(rows.iterator().next()));
  }

  private static Future<JsonArray> list(SqlClient client, String sql, Tuple parameters) {
    return client
        .preparedQuery(sql)
        .execute(parameters)
        .map(
            rows -> {
              JsonArray values = new JsonArray();
              for (Row row : rows) values.add(row.getJsonObject("value"));
              return values;
            });
  }

  private static Future<Void> audit(
      SqlClient client, UUID actor, String action, UUID entity, JsonObject detail) {
    return client
        .preparedQuery(
            "INSERT INTO audit_event(actor_id,action,entity_id,detail) VALUES ($1,$2,$3,$4)")
        .execute(Tuple.of(actor, action, entity, detail))
        .mapEmpty();
  }

  public Future<JsonObject> createGroup(Account actor, String name, String service) {
    teacher(actor);
    UUID id = UUID.randomUUID();
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "INSERT INTO training_group(id,teacher_id,name,service_code) VALUES"
                        + " ($1,$2,$3,$4) RETURNING to_jsonb(training_group) AS value",
                    Tuple.of(id, actor.id(), name, service))
                .compose(
                    row ->
                        audit(db, actor.id(), "group.created", id, new JsonObject())
                            .map(row.getJsonObject("value"))));
  }

  public Future<JsonArray> lessons(Account actor) {
    teacher(actor);
    return list(pool, """
        SELECT to_jsonb(l) || jsonb_build_object('group_name',g.name,
          'title',s.document->>'title') AS value
        FROM lesson l JOIN training_group g ON g.id=l.group_id
        JOIN scenario s ON s.id=l.scenario_id
        WHERE g.teacher_id=$1 ORDER BY l.created_at DESC LIMIT 100
        """, Tuple.of(actor.id()));
  }

  public Future<JsonArray> learners(Account actor) {
    teacher(actor);
    return list(pool, "SELECT jsonb_build_object('id',id,'login',login) AS value FROM app_user WHERE role='user' AND NOT blocked ORDER BY login LIMIT 1000", Tuple.tuple());
  }

  public Future<JsonArray> groups(Account actor) {
    return list(
        pool,
        "SELECT to_jsonb(g) || jsonb_build_object('member_count', (SELECT count(*) FROM training_group_member WHERE group_id=g.id)) AS value FROM training_group g WHERE teacher_id=$1 OR EXISTS (SELECT 1"
            + " FROM training_group_member m WHERE m.group_id=g.id AND m.user_id=$1) ORDER BY"
            + " created_at DESC LIMIT 100",
        Tuple.of(actor.id()));
  }

  public Future<JsonArray> members(Account actor, UUID group) {
    teacher(actor);
    return one(pool, "SELECT id FROM training_group WHERE id=$1 AND teacher_id=$2",
        Tuple.of(group, actor.id())).compose(ignored -> list(pool, """
        SELECT jsonb_build_object('id',u.id,'login',u.login,'blocked',u.blocked) AS value
        FROM training_group_member m JOIN app_user u ON u.id=m.user_id
        WHERE m.group_id=$1 ORDER BY u.login
        """, Tuple.of(group)));
  }

  public Future<Void> removeMember(Account actor, UUID group, UUID learner) {
    teacher(actor);
    return pool.withTransaction(db ->
        one(db, "SELECT id FROM training_group WHERE id=$1 AND teacher_id=$2 FOR UPDATE",
            Tuple.of(group, actor.id()))
        .compose(ignored -> db.preparedQuery(
            "DELETE FROM training_group_member WHERE group_id=$1 AND user_id=$2")
            .execute(Tuple.of(group, learner)))
        .compose(ignored -> audit(db, actor.id(), "group.member_removed", group,
            new JsonObject().put("learner_id", learner.toString()))));
  }

  public Future<Void> addMember(Account actor, UUID group, UUID learner) {
    teacher(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT id FROM training_group WHERE id=$1 AND teacher_id=$2 FOR UPDATE",
                    Tuple.of(group, actor.id()))
                .compose(
                    ignored ->
                        one(
                            db,
                            "SELECT id FROM app_user WHERE id=$1 AND role='user' AND NOT blocked",
                            Tuple.of(learner)))
                .compose(
                    ignored ->
                        db.preparedQuery(
                                "INSERT INTO training_group_member VALUES ($1,$2) ON CONFLICT DO"
                                    + " NOTHING")
                            .execute(Tuple.of(group, learner)))
                .compose(
                    ignored ->
                        audit(
                            db,
                            actor.id(),
                            "group.member_added",
                            group,
                            new JsonObject().put("learner_id", learner.toString()))));
  }

  public Future<JsonArray> scenarios(Account actor) {
    teacher(actor);
    return list(
        pool,
        "SELECT jsonb_build_object('id',id,'title',title,'status',status) AS value FROM"
            + " scenario WHERE author_id=$1 AND NOT archived ORDER BY created_at DESC LIMIT 100",
        Tuple.of(actor.id()));
  }

  public Future<JsonObject> createScenario(Account actor, JsonObject document) {
    teacher(actor);
    JsonObject validated = ScenarioDocuments.validate(document);
    UUID scenario = UUID.randomUUID();
    return pool.withTransaction(
        db ->
            db.preparedQuery(
                    "INSERT INTO scenario(id,author_id,title,document,status)"
                        + " VALUES ($1,$2,$3,$4,'preparing')")
                .execute(Tuple.of(scenario, actor.id(), validated.getString("title"), validated))
                .compose(ignored -> queueCompilation(db, scenario))
                .compose(
                    ignored ->
                        audit(db, actor.id(), "scenario.created", scenario, new JsonObject()))
                .map(
                    new JsonObject()
                        .put("id", scenario.toString())
                        .put("scenario_id", scenario.toString())
                        .put("status", "preparing")));
  }

  public Future<JsonObject> updateScenario(Account actor, UUID scenario, JsonObject document) {
    teacher(actor);
    JsonObject validated = ScenarioDocuments.validate(document);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    """
                    SELECT s.id,
                      EXISTS (SELECT 1 FROM lesson l WHERE l.scenario_id=s.id AND l.status='active') AS active_lesson,
                      EXISTS (SELECT 1 FROM background_job j WHERE j.state IN ('queued','running') AND
                        (j.scenario_id=s.id OR j.attempt_id IN (
                          SELECT a.id FROM training_attempt a
                          JOIN lesson_assignment la ON la.id=a.assignment_id
                          JOIN lesson l ON l.id=la.lesson_id WHERE l.scenario_id=s.id))) AS busy
                    FROM scenario s WHERE s.id=$1 AND s.author_id=$2 AND NOT s.archived FOR UPDATE OF s
                    """,
                    Tuple.of(scenario, actor.id()))
                .compose(
                    row -> {
                      if (row.getBoolean("active_lesson"))
                        return Future.failedFuture(
                            conflict("Нельзя изменять сценарий во время занятия."));
                      if (row.getBoolean("busy"))
                        return Future.failedFuture(
                            conflict("Дождитесь окончания обработки сценария или результатов занятия."));
                      return db.preparedQuery(
                              "UPDATE scenario SET title=$2,document=$3,status='preparing',"
                                  + " artifact=NULL,artifact_sha256=NULL,approved_by=NULL,"
                                  + " approved_at=NULL,updated_at=now() WHERE id=$1")
                          .execute(Tuple.of(scenario, validated.getString("title"), validated));
                    })
                .compose(ignored -> queueCompilation(db, scenario))
                .compose(
                    ignored -> audit(db, actor.id(), "scenario.updated", scenario, new JsonObject()))
                .map(
                    new JsonObject()
                        .put("id", scenario.toString())
                        .put("scenario_id", scenario.toString())
                        .put("status", "preparing")));
  }

  public Future<Void> archiveScenario(Account actor, UUID scenario) {
    teacher(actor);
    return pool.withTransaction(db ->
        one(db, "SELECT id FROM scenario WHERE id=$1 AND author_id=$2 FOR UPDATE",
            Tuple.of(scenario, actor.id()))
        .compose(ignored -> db.preparedQuery("UPDATE scenario SET archived=true WHERE id=$1")
            .execute(Tuple.of(scenario)))
        .compose(ignored -> audit(db, actor.id(), "scenario.archived", scenario, new JsonObject())));
  }

  private Future<Void> queueCompilation(SqlClient db, UUID scenario) {
    return db.preparedQuery(
            "INSERT INTO background_job(id,kind,scenario_id) VALUES ($1,'compile_scenario',$2)")
        .execute(Tuple.of(UUID.randomUUID(), scenario))
        .mapEmpty();
  }

  public Future<JsonObject> scenario(Account actor, UUID scenario) {
    teacher(actor);
    return one(
            pool,
            "SELECT to_jsonb(s)-'artifact'-'artifact_sha256' AS value FROM scenario s"
                + " WHERE s.id=$1 AND s.author_id=$2 AND NOT s.archived",
            Tuple.of(scenario, actor.id()))
        .map(row -> row.getJsonObject("value"));
  }

  public Future<Void> approve(Account actor, UUID scenario) {
    teacher(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT status FROM scenario WHERE id=$1 AND author_id=$2 AND NOT archived"
                        + " FOR UPDATE",
                    Tuple.of(scenario, actor.id()))
                .compose(
                    row -> {
                      if (!"prepared".equals(row.getString("status")))
                        return Future.failedFuture(
                            conflict("Сначала нужно успешно подготовить сценарий."));
                      return db.preparedQuery(
                              "UPDATE scenario SET"
                                  + " status='approved',approved_by=$2,approved_at=now() WHERE"
                                  + " id=$1")
                          .execute(Tuple.of(scenario, actor.id()));
                    })
                .compose(
                    ignored ->
                        audit(db, actor.id(), "scenario.approved", scenario, new JsonObject())));
  }

  public Future<JsonArray> jobs(Account actor) {
    teacher(actor);
    return list(
        pool,
        """
        SELECT jsonb_build_object('id',j.id,'kind',j.kind,'state',j.state,'tries',j.tries,'error',j.error,
          'scenario_id',j.scenario_id,'attempt_id',j.attempt_id) AS value FROM background_job j
        LEFT JOIN scenario s ON s.id=j.scenario_id
        LEFT JOIN training_attempt a ON a.id=j.attempt_id LEFT JOIN lesson_assignment la ON la.id=a.assignment_id
        LEFT JOIN lesson l ON l.id=la.lesson_id LEFT JOIN training_group g ON g.id=l.group_id
        WHERE s.author_id=$1 OR g.teacher_id=$1 ORDER BY j.created_at DESC LIMIT 100
        """,
        Tuple.of(actor.id()));
  }

  public Future<JsonObject> createLesson(Account actor, UUID group, UUID scenario, String mode) {
    teacher(actor);
    if (!Set.of("call", "card").contains(mode))
      throw new ApiException(400, "invalid_mode", "Неизвестный режим занятия.");
    UUID id = UUID.randomUUID();
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT id FROM training_group WHERE id=$1 AND teacher_id=$2 FOR UPDATE",
                    Tuple.of(group, actor.id()))
                .compose(
                    ignored ->
                        one(
                            db,
                            "SELECT id FROM scenario WHERE id=$1 AND author_id=$2 AND"
                                + " status='approved' AND NOT archived FOR UPDATE",
                            Tuple.of(scenario, actor.id())))
                .compose(
                    ignored ->
                        one(
                            db,
                            "INSERT INTO lesson(id,group_id,scenario_id,mode) VALUES ($1,$2,$3,$4)"
                                + " RETURNING to_jsonb(lesson) AS value",
                            Tuple.of(id, group, scenario, mode)))
                .compose(
                    row ->
                        audit(db, actor.id(), "lesson.created", id, new JsonObject())
                            .map(row.getJsonObject("value"))));
  }

  public Future<Void> startLesson(Account actor, UUID id) {
    teacher(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT l.*,s.status AS scenario_status FROM lesson l JOIN training_group g ON"
                        + " g.id=l.group_id JOIN scenario s ON s.id=l.scenario_id WHERE l.id=$1 AND"
                        + " g.teacher_id=$2 FOR UPDATE OF l,s",
                    Tuple.of(id, actor.id()))
                .compose(
                    row -> {
                      if (!"planned".equals(row.getString("status")))
                        return Future.failedFuture(conflict("Занятие уже запущено или завершено."));
                      if (!"approved".equals(row.getString("scenario_status")))
                        return Future.failedFuture(
                            conflict("Сценарий нужно повторно утвердить перед началом занятия."));
                      return db.preparedQuery(
                              "INSERT INTO lesson_assignment(id,lesson_id,learner_id) SELECT"
                                  + " gen_random_uuid(),$1,m.user_id FROM training_group_member m"
                                  + " JOIN app_user u ON u.id=m.user_id WHERE m.group_id=$2 AND NOT"
                                  + " u.blocked AND u.role='user'")
                          .execute(Tuple.of(id, row.getUUID("group_id")));
                    })
                .compose(
                    rows ->
                        rows.rowCount() == 0
                            ? Future.failedFuture(conflict("В группе нет обучающихся."))
                            : db.preparedQuery("UPDATE lesson SET status='active' WHERE id=$1")
                                .execute(Tuple.of(id)))
                .compose(ignored -> audit(db, actor.id(), "lesson.started", id, new JsonObject())));
  }

  public Future<JsonArray> assignments(Account actor) {
    return list(
        pool,
        """
        SELECT jsonb_build_object('id',a.id,'lesson_id',l.id,'learner_id',a.learner_id,'mode',l.mode,
           'status',l.status,'title',s.document->>'title','scenario_id',s.id,
           'group_name',g.name,'learner_login',u.login,
           'instructions',s.document->>'instructions','difficulty',s.document->>'difficulty',
           'caller_phone',s.document#>>'{facts,phone}',
           'card',latest.card,'card_deadline_seconds',deadline.seconds,'created_at',l.created_at,
           'attempt_id',latest.id,'attempt_status',latest.status) AS value
        FROM lesson_assignment a JOIN lesson l ON l.id=a.lesson_id
        JOIN training_group g ON g.id=l.group_id JOIN scenario s ON s.id=l.scenario_id
        JOIN app_user u ON u.id=a.learner_id
        LEFT JOIN LATERAL (SELECT t.id,t.status,t.card FROM training_attempt t
          WHERE t.assignment_id=a.id ORDER BY t.created_at DESC LIMIT 1) latest ON true
        LEFT JOIN LATERAL (SELECT min((criterion->>'seconds')::integer) AS seconds
          FROM jsonb_array_elements(s.document->'rubric') criterion
          WHERE criterion->>'kind'='deadline' AND criterion->>'action'='accepted') deadline ON true
        WHERE a.learner_id=$1 OR g.teacher_id=$1 ORDER BY l.created_at DESC,u.login LIMIT 1000
        """,
        Tuple.of(actor.id()));
  }

  public Future<JsonObject> createAttempt(Account actor, UUID assignment, UUID attempt) {
    if (!"user".equals(actor.role())) throw forbidden();
    return pool.withTransaction(
            db ->
                one(
                        db,
                        """
                        SELECT la.id,l.mode,l.status FROM lesson_assignment la JOIN lesson l ON l.id=la.lesson_id
                        WHERE la.id=$1 AND la.learner_id=$2 FOR UPDATE OF l,la
                        """,
                        Tuple.of(assignment, actor.id()))
                    .compose(
                        row -> {
                          if (!"active".equals(row.getString("status")))
                            return Future.failedFuture(conflict("Занятие не активно."));
                          boolean card = "card".equals(row.getString("mode"));
                          return db.preparedQuery(
                                  """
                                  INSERT INTO training_attempt(id,assignment_id,status,started_at)
                                  VALUES ($1,$2,$3::varchar,CASE WHEN $3::varchar='active' THEN now() ELSE NULL END)
                                  ON CONFLICT (id) DO NOTHING
                                  """)
                              .execute(
                                  Tuple.of(
                                      attempt,
                                      assignment,
                                      card ? "active" : "created"));
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
        SELECT a.*,la.learner_id,l.id AS lesson_id,l.scenario_id,l.mode,
          l.status AS lesson_status,g.teacher_id
        FROM training_attempt a JOIN lesson_assignment la ON la.id=a.assignment_id
        JOIN lesson l ON l.id=la.lesson_id JOIN training_group g ON g.id=l.group_id
        WHERE a.id=$1 AND (la.learner_id=$2 OR g.teacher_id=$2)
        """
            + (lock ? " FOR UPDATE OF a" : ""),
        Tuple.of(id, actor.id()));
  }

  public Future<JsonObject> attempt(Account actor, UUID id) {
    return accessibleAttempt(pool, actor, id, false)
        .compose(
            ignored ->
                one(
                    pool,
                    "SELECT to_jsonb(a) AS value FROM training_attempt a WHERE id=$1",
                    Tuple.of(id)))
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
                                  if (!type.equals(saved.getString("type"))
                                      || !payload.equals(saved.getJsonObject("payload"))
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
                                CardCommands.Applied applied =
                                    CardCommands.apply(
                                        row.getJsonObject("card"),
                                        row.getString("card_status"),
                                        type,
                                        payload);
                                return db.preparedQuery(
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
                                                payload));
                              });
                    }));
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
    return pool.withTransaction(
        db ->
            one(db, "SELECT status FROM training_attempt WHERE id=$1 FOR UPDATE", Tuple.of(id))
                .compose(
                    row ->
                        Set.of("completed", "failed").contains(row.getString("status"))
                            ? Future.succeededFuture()
                            : finish(db, id, null, failed)));
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
                db.preparedQuery(
                        "INSERT INTO background_job(id,kind,attempt_id) VALUES"
                            + " ($1,'evaluate_attempt',$2) ON CONFLICT DO NOTHING")
                    .execute(Tuple.of(UUID.randomUUID(), id)))
        .compose(
            ignored ->
                audit(
                    db,
                    actor,
                    failed ? "attempt.failed" : "attempt.completed",
                    id,
                    new JsonObject()));
  }

  public Future<JsonArray> finishLesson(Account actor, UUID id) {
    teacher(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT l.id FROM lesson l JOIN training_group g ON g.id=l.group_id WHERE"
                        + " l.id=$1 AND g.teacher_id=$2 FOR UPDATE OF l",
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
                            + " ORDER BY created_at",
                        Tuple.of(id))
                    .map(reviews -> row.getJsonObject("value").put("reviews", reviews)));
  }

  public Future<Void> review(Account actor, UUID id, JsonObject result, String reason) {
    teacher(actor);
    return pool.withTransaction(
        db ->
            accessibleAttempt(db, actor, id, true)
                .compose(
                    row -> {
                      if (!actor.id().equals(row.getUUID("teacher_id")))
                        return Future.failedFuture(forbidden());
                      if (!Set.of("completed", "failed").contains(row.getString("status")))
                        return Future.failedFuture(conflict("Попытка ещё не завершена."));
                      return db.preparedQuery(
                              "INSERT INTO"
                                  + " evaluation_review(id,attempt_id,teacher_id,result,reason)"
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
}
