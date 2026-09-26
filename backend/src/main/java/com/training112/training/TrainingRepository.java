package com.training112.training;

import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository.Account;
import com.training112.auth.PlatformSettings;
import io.vertx.core.Future;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;

/** Business transactions own scenarios, attempts and events; Speech never owns a DB connection. */
public final class TrainingRepository {
  static final int MAX_MATERIAL_BYTES = 8 * 1024 * 1024;
  private final Pool pool;
  private final CardLinks cardLinks;
  private final TrainingReports reports;

  public TrainingRepository(Pool pool) {
    this.pool = pool;
    this.cardLinks = new CardLinks(pool);
    this.reports = new TrainingReports(pool);
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

  static Future<JsonArray> list(SqlClient client, String sql, Tuple parameters) {
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
    instructor(actor);
    UUID id = UUID.randomUUID();
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "INSERT INTO training_group(id,instructor_id,name,service_code) VALUES"
                        + " ($1,$2,$3,$4) RETURNING to_jsonb(training_group) AS value",
                    Tuple.of(id, actor.id(), name, service))
                .compose(
                    row ->
                        audit(db, actor.id(), "group.created", id, new JsonObject())
                            .map(row.getJsonObject("value"))));
  }

  public Future<JsonArray> lessons(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT to_jsonb(l) || jsonb_build_object('group_name',g.name,
          'title',COALESCE(l.card_template->>'title',s.document->>'title')) AS value
        FROM lesson l JOIN training_group g ON g.id=l.group_id
        LEFT JOIN scenario s ON s.id=l.scenario_id
        WHERE g.instructor_id=$1 ORDER BY l.created_at DESC LIMIT 100
        """, Tuple.of(actor.id()));
  }

  public Future<JsonArray> learners(Account actor) {
    instructor(actor);
    return list(pool, "SELECT jsonb_build_object('id',id,'login',login) AS value FROM app_user WHERE role='user' AND NOT blocked ORDER BY login LIMIT 1000", Tuple.tuple());
  }

  public Future<JsonArray> groups(Account actor) {
    return list(
        pool,
        "SELECT to_jsonb(g) || jsonb_build_object('member_count', (SELECT count(*) FROM training_group_member WHERE group_id=g.id)) AS value FROM training_group g WHERE instructor_id=$1 OR EXISTS (SELECT 1"
            + " FROM training_group_member m WHERE m.group_id=g.id AND m.user_id=$1) ORDER BY"
            + " created_at DESC LIMIT 100",
        Tuple.of(actor.id()));
  }

  public Future<JsonArray> members(Account actor, UUID group) {
    instructor(actor);
    return one(pool, "SELECT id FROM training_group WHERE id=$1 AND instructor_id=$2",
        Tuple.of(group, actor.id())).compose(ignored -> list(pool, """
        SELECT jsonb_build_object('id',u.id,'login',u.login,'blocked',u.blocked) AS value
        FROM training_group_member m JOIN app_user u ON u.id=m.user_id
        WHERE m.group_id=$1 ORDER BY u.login
        """, Tuple.of(group)));
  }

  public Future<Void> removeMember(Account actor, UUID group, UUID learner) {
    instructor(actor);
    return pool.withTransaction(db ->
        one(db, "SELECT id FROM training_group WHERE id=$1 AND instructor_id=$2 FOR UPDATE",
            Tuple.of(group, actor.id()))
        .compose(ignored -> db.preparedQuery(
            "DELETE FROM training_group_member WHERE group_id=$1 AND user_id=$2")
            .execute(Tuple.of(group, learner)))
        .compose(ignored -> audit(db, actor.id(), "group.member_removed", group,
            new JsonObject().put("learner_id", learner.toString()))));
  }

  public Future<Void> addMember(Account actor, UUID group, UUID learner) {
    instructor(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT id FROM training_group WHERE id=$1 AND instructor_id=$2 FOR UPDATE",
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
    instructor(actor);
    return list(
        pool,
        "SELECT jsonb_build_object('id',id,'title',title,'status',status) AS value FROM"
            + " scenario WHERE author_id=$1 AND NOT archived ORDER BY created_at DESC LIMIT 100",
        Tuple.of(actor.id()));
  }

  public Future<JsonObject> createScenario(Account actor, JsonObject document) {
    instructor(actor);
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
    instructor(actor);
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
    instructor(actor);
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
    instructor(actor);
    return one(
            pool,
            "SELECT to_jsonb(s)-'artifact'-'artifact_sha256' AS value FROM scenario s"
                + " WHERE s.id=$1 AND s.author_id=$2 AND NOT s.archived",
            Tuple.of(scenario, actor.id()))
        .map(row -> row.getJsonObject("value"));
  }

  public Future<Void> approve(Account actor, UUID scenario) {
    instructor(actor);
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
    instructor(actor);
    return list(
        pool,
        """
        SELECT jsonb_build_object('id',j.id,'kind',j.kind,'state',j.state,'tries',j.tries,'error',j.error,
          'scenario_id',j.scenario_id,'attempt_id',j.attempt_id) AS value FROM background_job j
        LEFT JOIN scenario s ON s.id=j.scenario_id
        LEFT JOIN training_attempt a ON a.id=j.attempt_id LEFT JOIN lesson_assignment la ON la.id=a.assignment_id
        LEFT JOIN lesson l ON l.id=la.lesson_id LEFT JOIN training_group g ON g.id=l.group_id
        WHERE s.author_id=$1 OR g.instructor_id=$1 ORDER BY j.created_at DESC LIMIT 100
        """,
        Tuple.of(actor.id()));
  }

  public Future<JsonObject> createLesson(Account actor, UUID group, UUID scenario, String mode) {
    instructor(actor);
    if (!"call".equals(mode))
      throw new ApiException(400, "invalid_mode", "Неизвестный режим занятия.");
    UUID id = UUID.randomUUID();
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT id FROM training_group WHERE id=$1 AND instructor_id=$2 FOR UPDATE",
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

  public Future<JsonArray> operatorCards(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT jsonb_build_object('id',a.id,'incident_code',a.card->>'incident_code',
          'address',a.card->>'address','services',a.card->>'services',
          'created_at',a.created_at) AS value
        FROM training_attempt a
        JOIN lesson_assignment la ON la.id=a.assignment_id
        JOIN lesson l ON l.id=la.lesson_id
        JOIN training_group g ON g.id=l.group_id
        WHERE g.instructor_id=$1 AND l.mode='call' AND a.status='completed'
          AND a.card->>'description' IS NOT NULL
        ORDER BY a.created_at DESC LIMIT 100
        """, Tuple.of(actor.id()));
  }

  public Future<JsonObject> createCardLesson(Account actor, UUID group, JsonObject body) {
    instructor(actor);
    UUID id = UUID.randomUUID();
    return pool.withTransaction(db -> one(db,
        "SELECT service_code FROM training_group WHERE id=$1 AND instructor_id=$2 FOR UPDATE",
        Tuple.of(group, actor.id())).compose(groupRow -> {
      String service = groupRow.getString("service_code");
      Object sourceValue = body.getValue("sources");
      if (sourceValue != null && !(sourceValue instanceof JsonArray))
        return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неверная подборка карточек."));
      JsonArray sources = (JsonArray) sourceValue;
      if (sources != null) {
        if (sources.isEmpty() || sources.size() > 30)
          return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Выберите от 1 до 30 карточек."));
        Future<JsonArray> cards = Future.succeededFuture(new JsonArray());
        Set<String> unique = new java.util.HashSet<>();
        for (Object source : sources) {
          if (!(source instanceof JsonObject item))
            return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неверный источник карточки."));
          if (!unique.add(item.getString("type", "") + ":" + item.getString("id", "")))
            return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Карточка выбрана повторно."));
          cards = cards.compose(items -> sourceCard(db, actor, item, body, service)
              .map(card -> items.add(card)));
        }
        return cards.map(DdsCardPool::pack);
      }
      String source = body.getString("source_attempt_id", "");
      if (source.isBlank()) return Future.succeededFuture(DdsCardTemplate.manual(body, service));
      return sourceCard(db, actor, new JsonObject().put("type", "operator").put("id", source),
          body, service);
    }).compose(template -> one(db,
        "INSERT INTO lesson(id,group_id,scenario_id,card_template,mode) "
            + "VALUES ($1,$2,NULL,$3,'card') RETURNING to_jsonb(lesson) AS value",
        Tuple.of(id, group, template)).compose(row ->
            audit(db, actor.id(), "lesson.created", id, new JsonObject())
                .map(row.getJsonObject("value")))));
  }

  private Future<JsonObject> sourceCard(SqlClient db, Account actor, JsonObject source,
      JsonObject options, String service) {
    String type = source.getString("type", "");
    String value = source.getString("id", "");
    UUID sourceId;
    try { sourceId = UUID.fromString(value); }
    catch (RuntimeException error) {
      return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неизвестный источник карточки."));
    }
    if ("operator".equals(type)) return one(db, """
          SELECT a.card FROM training_attempt a
          JOIN lesson_assignment la ON la.id=a.assignment_id
          JOIN lesson l ON l.id=la.lesson_id
          JOIN training_group g ON g.id=l.group_id
          WHERE a.id=$1 AND g.instructor_id=$2 AND l.mode='call' AND a.status='completed'
          """, Tuple.of(sourceId, actor.id()))
          .map(row -> DdsCardTemplate.fromOperator(row.getJsonObject("card"), options, service, sourceId));
    if ("generated".equals(type)) return one(db,
        "SELECT document FROM scenario WHERE id=$1 AND author_id=$2 AND status='approved' AND NOT archived",
        Tuple.of(sourceId, actor.id())).map(row -> {
          JsonObject document = row.getJsonObject("document");
          JsonObject input = CardSnapshot.from(document, service);
          for (Object rule : document.getJsonArray("rubric", new JsonArray())) {
            JsonObject criterion = (JsonObject) rule;
            if ("incident_code".equals(criterion.getString("field"))) {
              input.put("incident_code", criterion.getString("expected", document.getString("title")));
              break;
            }
          }
          input.put("expected_primary", options.getString("expected_primary", "accepted"));
          input.put("outcome", options.getString("outcome", "completed"));
          return DdsCardTemplate.manual(input, service);
        });
    return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неизвестный источник карточки."));
  }

  public Future<Void> startLesson(Account actor, UUID id) {
    instructor(actor);
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT l.*,s.status AS scenario_status,s.document,g.service_code FROM lesson l"
                        + " JOIN training_group g ON g.id=l.group_id LEFT JOIN scenario s ON"
                        + " s.id=l.scenario_id WHERE l.id=$1 AND g.instructor_id=$2 FOR UPDATE OF l",
                    Tuple.of(id, actor.id()))
                .compose(
                    row -> {
                      if (!"planned".equals(row.getString("status")))
                        return Future.failedFuture(conflict("Занятие уже запущено или завершено."));
                      if (row.getUUID("scenario_id") != null
                          && !"approved".equals(row.getString("scenario_status")))
                        return Future.failedFuture(
                            conflict("Сценарий нужно повторно утвердить перед началом занятия."));
                      boolean card = "card".equals(row.getString("mode"));
                      JsonObject template = row.getJsonObject("card_template");
                      JsonObject legacyCard = card && template == null
                          ? CardSnapshot.from(row.getJsonObject("document"), row.getString("service_code"))
                          : null;
                      return db.preparedQuery(
                              "INSERT INTO lesson_assignment(id,lesson_id,learner_id) SELECT"
                                  + " gen_random_uuid(),$1,m.user_id FROM training_group_member m"
                                  + " JOIN app_user u ON u.id=m.user_id WHERE m.group_id=$2 AND NOT"
                                  + " u.blocked AND u.role='user'")
                          .execute(Tuple.of(id, row.getUUID("group_id")))
                          .compose(
                              rows -> {
                                if (rows.rowCount() == 0)
                                  return Future.failedFuture(conflict("В группе нет обучающихся."));
                                Future<Void> seeded = card
                                    ? seedCardAttempts(db, id, template, legacyCard, row.getString("service_code"))
                                    : Future.succeededFuture();
                                return seeded.compose(
                                    ignored ->
                                        db.preparedQuery("UPDATE lesson SET status='active' WHERE id=$1")
                                            .execute(Tuple.of(id))
                                            .mapEmpty());
                              });
                    })
                .compose(ignored -> audit(db, actor.id(), "lesson.started", id, new JsonObject())));
  }

  private Future<Void> seedCardAttempts(SqlClient db, UUID lesson, JsonObject pool,
      JsonObject legacyCard, String service) {
    return db.preparedQuery("SELECT id FROM lesson_assignment WHERE lesson_id=$1")
        .execute(Tuple.of(lesson)).compose(rows -> {
          Future<Void> chain = Future.succeededFuture();
          for (Row row : rows) {
            UUID assignment = row.getUUID("id");
            JsonObject selected = pool == null ? null : DdsCardPool.choose(pool, new JsonArray());
            JsonObject card = selected == null ? legacyCard : CardSnapshot.fromTemplate(selected, service);
            chain = chain.compose(ignored -> insertCardAttempt(db, assignment, selected, card));
          }
          return chain;
        });
  }

  private Future<Void> insertCardAttempt(SqlClient db, UUID assignment,
      JsonObject template, JsonObject card) {
    return db.preparedQuery("""
        INSERT INTO training_attempt(id,assignment_id,status,started_at,
          incident_source,vis_operator,card,card_status,card_template)
        VALUES ($1,$2,'active',now(),$3,NULL,$4,'added',$5)
        """).execute(Tuple.of(UUID.randomUUID(), assignment, IncidentOrigin.SERVICE_112,
            card, template)).mapEmpty();
  }

  public Future<JsonArray> assignments(Account actor) {
    return list(
        pool,
        """
        SELECT jsonb_build_object('id',a.id,'lesson_id',l.id,'learner_id',a.learner_id,'mode',l.mode,
           'status',l.status,'title',COALESCE(latest.card_template->>'title',l.card_template->>'title',s.document->>'title'),
           'scenario_id',s.id,
           'group_name',g.name,'learner_login',u.login,
           'instructions',s.document->>'instructions','difficulty',s.document->>'difficulty',
           'caller_phone',COALESCE(latest.card_template#>>'{facts,phone}',l.card_template#>>'{facts,phone}',s.document#>>'{facts,phone}'),
           'service',g.service_code,'origin',COALESCE(latest.card_template->>'origin',l.card_template->>'origin',s.document->>'origin'),
           'facts',COALESCE(latest.card_template->'facts',l.card_template->'facts',s.document->'facts','{}'::jsonb),
           'card',latest.card,'card_deadline_seconds',deadline.seconds,'created_at',latest.created_at,
           'attempt_started_at',latest.started_at,'card_status',latest.card_status,
           'workstation',latest.workstation,'incident_source',latest.incident_source,
           'vis_operator',latest.vis_operator,
           'attempt_id',latest.id,'attempt_status',latest.status,
           'link_count',(SELECT count(*) FROM card_link cl WHERE cl.parent_attempt_id=
             COALESCE((SELECT parent_attempt_id FROM card_link WHERE child_attempt_id=latest.id),latest.id))) AS value
        FROM lesson_assignment a JOIN lesson l ON l.id=a.lesson_id
        JOIN training_group g ON g.id=l.group_id LEFT JOIN scenario s ON s.id=l.scenario_id
        JOIN app_user u ON u.id=a.learner_id
        LEFT JOIN LATERAL (SELECT t.id,t.status,t.card,t.card_template,t.created_at,t.started_at,t.card_status,t.workstation,
          t.incident_source,t.vis_operator FROM training_attempt t
          WHERE t.assignment_id=a.id ORDER BY t.created_at DESC LIMIT 1) latest ON true
        LEFT JOIN LATERAL (SELECT min((criterion->>'seconds')::integer) AS seconds
          FROM jsonb_array_elements(COALESCE(s.document->'rubric','[]'::jsonb)) criterion
          WHERE criterion->>'kind'='deadline' AND criterion->>'action'='saved') deadline ON true
        WHERE a.learner_id=$1 OR g.instructor_id=$1 ORDER BY latest.created_at DESC NULLS LAST,u.login LIMIT 1000
        """,
        Tuple.of(actor.id()));
  }

  public Future<JsonArray> completedAttempts(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT jsonb_build_object('id',la.id,'attempt_id',a.id,'attempt_status',a.status,
          'learner_login',u.login,'mode',l.mode,'title',
          COALESCE(a.card_template->>'title',l.card_template->>'title',s.title),
          'created_at',a.created_at) AS value
        FROM training_attempt a
        JOIN lesson_assignment la ON la.id=a.assignment_id
        JOIN lesson l ON l.id=la.lesson_id
        JOIN training_group g ON g.id=l.group_id
        JOIN app_user u ON u.id=la.learner_id
        LEFT JOIN scenario s ON s.id=l.scenario_id
        WHERE g.instructor_id=$1 AND a.status IN ('completed','failed')
        ORDER BY a.created_at DESC LIMIT 1000
        """, Tuple.of(actor.id()));
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
                          boolean card = "card".equals(row.getString("mode"));
                          if (card) return Future.failedFuture(conflict("Карточку выдаёт занятие. Обновите список происшествий."));
                          String origin = card ? IncidentOrigin.SERVICE_112 : row.getString("origin");
                          if (!IncidentOrigin.SOURCES.contains(origin))
                            return Future.failedFuture(
                                new ApiException(
                                    400, "invalid_scenario", "У сценария не задан источник происшествия."));
                          JsonObject snapshot = new JsonObject();
                          return db.preparedQuery(
                                  """
                                  INSERT INTO training_attempt(id,assignment_id,status,started_at,
                                    workstation,incident_source,vis_operator,card,card_status)
                                  VALUES ($1,$2,$3::varchar,CASE WHEN $3::varchar='active' THEN now() ELSE NULL END,
                                    $4,$5,$6,$7,$8)
                                  ON CONFLICT (id) DO NOTHING
                                  """)
                              .execute(
                                  Tuple.of(
                                      attempt,
                                      assignment,
                                      "created",
                                      workstation,
                                      origin,
                                      IncidentOrigin.visOperator(origin, actor.login()),
                                      snapshot,
                                      "received"));
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
              boolean open =
                  "user".equals(actor.role())
                      && actor.id().equals(row.getUUID("learner_id"))
                      && "card".equals(row.getString("mode"))
                      && "added".equals(row.getString("card_status"))
                      && "active".equals(row.getString("status"));
              if (!open) return loadAttempt(pool, id);
              return pool.withTransaction(
                  db ->
                      db.preparedQuery(
                              "UPDATE training_attempt SET card_status='received' WHERE id=$1 AND"
                                  + " card_status='added' AND status='active'")
                          .execute(Tuple.of(id))
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

  public Future<JsonObject> phonePreview(Account actor, UUID id, JsonObject request) {
    return PlatformSettings.enabled(pool, "dds_phone_enabled")
        .compose(enabled -> enabled ? accessibleAttempt(pool, actor, id, false)
            : Future.failedFuture(new ApiException(503, "phone_disabled", "Учебный телефон временно отключён.")))
        .map(row -> {
      if (!"user".equals(actor.role()) || !actor.id().equals(row.getUUID("learner_id"))
          || !"card".equals(row.getString("mode"))
          || !"active".equals(row.getString("status"))) throw forbidden();
      JsonObject card = row.getJsonObject("card");
      if ("caller".equals(request.getString("party")) && card.getString("phone", "").isBlank())
        throw conflict("В карточке нет номера заявителя.");
      return DdsPhone.report(row.getString("card_status"), row.getString("dds_crew"),
          row.getJsonObject("card_template"), request);
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
      if ("caller".equals(payload.getString("party")) && card.getString("phone", "").isBlank())
        return Future.failedFuture(conflict("В карточке нет номера заявителя."));
      JsonObject report = DdsPhone.report(status, row.getString("dds_crew"),
          row.getJsonObject("card_template"), payload);
      return append(db, attempt, eventId, actor.id(), "operator", type, report);
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
                            + " ORDER BY created_at",
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
    instructor(actor);
    return pool.withTransaction(db ->
        one(db, """
            SELECT
              EXISTS (SELECT 1 FROM lesson l WHERE l.scenario_id=s.id) AS used,
              EXISTS (SELECT 1 FROM background_job j WHERE j.scenario_id=s.id AND j.state IN ('queued','running')) AS busy
            FROM scenario s WHERE s.id=$1 AND s.author_id=$2 FOR UPDATE OF s
            """, Tuple.of(scenario, actor.id()))
            .compose(row -> {
              if (row.getBoolean("used")) {
                return Future.failedFuture(conflict("Сценарий уже назначен на занятие. Уберите его из списка, история сохранится."));
              }
              if (row.getBoolean("busy")) {
                return Future.failedFuture(conflict("Дождитесь окончания подготовки сценария."));
              }
              return db.preparedQuery("DELETE FROM background_job WHERE scenario_id=$1").execute(Tuple.of(scenario))
                  .compose(ignored -> db.preparedQuery("DELETE FROM scenario WHERE id=$1").execute(Tuple.of(scenario)));
            })
            .compose(ignored -> audit(db, actor.id(), "scenario.deleted", scenario, new JsonObject())));
  }

  public Future<JsonArray> materials(Account actor) {
    String scope = "instructor".equals(actor.role())
        ? "m.instructor_id=$1"
        : """
          EXISTS (SELECT 1 FROM training_group g JOIN training_group_member gm ON gm.group_id=g.id
            WHERE g.instructor_id=m.instructor_id AND gm.user_id=$1)
          """;
    if (!Set.of("instructor", "user").contains(actor.role())) throw forbidden();
    return list(pool, """
        SELECT jsonb_build_object('id',m.id,'title',m.title,'filename',m.filename,
          'media_type',m.media_type,'byte_size',m.byte_size,'created_at',m.created_at) AS value
        FROM teaching_material m WHERE
        """ + scope + " ORDER BY m.created_at DESC LIMIT 200", Tuple.of(actor.id()));
  }

  public Future<JsonObject> material(Account actor, UUID id) {
    if (!Set.of("instructor", "user").contains(actor.role())) throw forbidden();
    String scope = "instructor".equals(actor.role())
        ? "instructor_id=$2"
        : """
          EXISTS (SELECT 1 FROM training_group g JOIN training_group_member gm ON gm.group_id=g.id
            WHERE g.instructor_id=teaching_material.instructor_id AND gm.user_id=$2)
          """;
    return one(pool, "SELECT title,filename,media_type,content FROM teaching_material WHERE id=$1 AND " + scope,
            Tuple.of(id, actor.id()))
        .map(row -> new JsonObject()
            .put("title", row.getString("title"))
            .put("filename", row.getString("filename"))
            .put("media_type", row.getString("media_type"))
            .put("content_base64", Base64.getEncoder().encodeToString(row.getBuffer("content").getBytes())));
  }

  public Future<JsonObject> addMaterial(Account actor, String title, String filename, String media, byte[] content) {
    instructor(actor);
    if (title.isBlank() || title.length() > 200 || filename.isBlank() || filename.length() > 200
        || !Set.of("application/pdf", "text/plain", "audio/wav", "audio/mpeg", "application/json").contains(media)
        || content.length < 1 || content.length > MAX_MATERIAL_BYTES) {
      throw new ApiException(400, "invalid_material", "Материал должен быть PDF, текстом, JSON или аудио до 8 МиБ.");
    }
    UUID id = UUID.randomUUID();
    return pool.withTransaction(db -> db.preparedQuery(
            "INSERT INTO teaching_material(id,instructor_id,title,filename,media_type,content,byte_size)"
                + " VALUES ($1,$2,$3,$4,$5,$6,$7)")
        .execute(Tuple.of(id, actor.id(), title, filename, media, Buffer.buffer(content), content.length))
        .compose(ignored -> audit(db, actor.id(), "material.created", id, new JsonObject().put("title", title)))
        .map(new JsonObject().put("id", id.toString()).put("title", title)));
  }

  public Future<Void> deleteMaterial(Account actor, UUID id) {
    instructor(actor);
    return pool.withTransaction(db ->
        one(db, "SELECT id FROM teaching_material WHERE id=$1 AND instructor_id=$2 FOR UPDATE", Tuple.of(id, actor.id()))
            .compose(ignored -> db.preparedQuery("DELETE FROM teaching_material WHERE id=$1").execute(Tuple.of(id)))
            .compose(ignored -> audit(db, actor.id(), "material.deleted", id, new JsonObject())));
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
