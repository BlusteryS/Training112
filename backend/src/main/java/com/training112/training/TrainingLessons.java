package com.training112.training;

import com.training112.ApiRequest;
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

import static com.training112.training.TrainingDb.audit;
import static com.training112.training.TrainingDb.list;
import static com.training112.training.TrainingDb.one;
import static com.training112.training.TrainingRepository.conflict;
import static com.training112.training.TrainingRepository.instructor;

final class TrainingLessons {
  private final Pool pool;

  TrainingLessons(Pool pool) {
    this.pool = pool;
  }

  Future<JsonArray> lessons(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT to_jsonb(l) || jsonb_build_object('group_name',g.name,'module_title',m.title,
          'title',COALESCE(l.card_template->>'title',s.document->>'title')) AS value
        FROM lesson l JOIN training_group g ON g.id=l.group_id
        LEFT JOIN training_module m ON m.id=l.module_id
        LEFT JOIN scenario s ON s.id=l.scenario_id
        WHERE g.instructor_id=$1 ORDER BY l.created_at DESC LIMIT 100
        """, Tuple.of(actor.id()));
  }

  Future<JsonObject> createLesson(Account actor, UUID group, UUID module, UUID scenario, String mode) {
    instructor(actor);
    if (!"call".equals(mode))
      throw new ApiException(400, "invalid_mode", "Неизвестный режим занятия.");
    UUID id = UUID.randomUUID();
    return pool.withTransaction(
        db ->
            one(
                    db,
                    "SELECT g.id FROM training_group g JOIN training_module m ON m.group_id=g.id"
                        + " WHERE g.id=$1 AND m.id=$2 AND g.instructor_id=$3 AND m.instructor_id=$3"
                        + " FOR UPDATE OF g",
                    Tuple.of(group, module, actor.id()))
                .compose(
                    ignored ->
                        one(
                            db,
                            "SELECT s.id FROM scenario s JOIN training_module m ON m.id=$3"
                                + " WHERE s.id=$1 AND s.author_id=$2 AND s.status='approved'"
                                + " AND NOT s.archived AND COALESCE(s.document->>'difficulty','basic')=m.difficulty FOR UPDATE OF s",
                            Tuple.of(scenario, actor.id(), module)))
                .compose(
                    ignored ->
                        one(
                            db,
                            "INSERT INTO lesson(id,group_id,module_id,scenario_id,mode) VALUES ($1,$2,$3,$4,$5)"
                                + " RETURNING to_jsonb(lesson) AS value",
                            Tuple.of(id, group, module, scenario, mode)))
                .compose(
                    row ->
                        audit(db, actor.id(), "lesson.created", id, new JsonObject())
                            .map(row.getJsonObject("value"))));
  }

  Future<JsonArray> operatorCards(Account actor) {
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

  Future<JsonObject> createCardLesson(Account actor, UUID group, UUID module, JsonObject body) {
    instructor(actor);
    UUID id = UUID.randomUUID();
    return pool.withTransaction(db -> one(db,
        "SELECT g.service_code,m.difficulty FROM training_group g JOIN training_module m ON m.group_id=g.id"
            + " WHERE g.id=$1 AND m.id=$2 AND g.instructor_id=$3 AND m.instructor_id=$3"
            + " FOR UPDATE OF g",
        Tuple.of(group, module, actor.id())).compose(groupRow -> {
      String service = groupRow.getString("service_code");
      String difficulty = groupRow.getString("difficulty");
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
          Object type = item.getValue("type");
          Object sourceId = item.getValue("id");
          if (!(type instanceof String selectedType) || !(sourceId instanceof String selectedId))
            return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неверный источник карточки."));
          if (!unique.add(selectedType + ":" + selectedId))
            return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Карточка выбрана повторно."));
          cards = cards.compose(items -> sourceCard(db, actor, item, body, service, difficulty)
              .map(card -> items.add(card)));
        }
        return cards.map(DdsCardPool::pack);
      }
      Object sourceValueSingle = body.getValue("source_attempt_id");
      if (sourceValueSingle != null && !(sourceValueSingle instanceof String))
        return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неверный источник карточки."));
      String source = sourceValueSingle == null ? "" : (String) sourceValueSingle;
      if (source.isBlank()) return Future.succeededFuture(DdsCardTemplate.manual(body, service));
      return sourceCard(db, actor, new JsonObject().put("type", "operator").put("id", source),
          body, service, difficulty);
    }).compose(template -> one(db,
        "INSERT INTO lesson(id,group_id,module_id,scenario_id,card_template,mode) "
            + "VALUES ($1,$2,$3,NULL,$4,'card') RETURNING to_jsonb(lesson) AS value",
        Tuple.of(id, group, module, template)).compose(row ->
            audit(db, actor.id(), "lesson.created", id, new JsonObject())
                .map(row.getJsonObject("value")))));
  }

  private Future<JsonObject> sourceCard(SqlClient db, Account actor, JsonObject source,
      JsonObject options, String service, String difficulty) {
    Object selectedType = source.getValue("type");
    String type = selectedType instanceof String text ? text : "";
    UUID sourceId;
    try { sourceId = ApiRequest.uuid(source, "id"); }
    catch (ApiException error) {
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
        "SELECT document FROM scenario WHERE id=$1 AND author_id=$2 AND status='approved' AND NOT archived"
            + " AND COALESCE(document->>'difficulty','basic')=$3",
        Tuple.of(sourceId, actor.id(), difficulty)).map(row -> {
          JsonObject document = row.getJsonObject("document");
          JsonObject input = CardSnapshot.from(document, service);
          for (Object rule : document.getJsonArray("rubric", new JsonArray())) {
            JsonObject criterion = (JsonObject) rule;
            if ("incident_code".equals(criterion.getString("field"))) {
              input.put("incident_code", criterion.getString("expected", document.getString("title")));
              break;
            }
          }
          input.put("expected_primary", DdsCardTemplate.option(options, "expected_primary", "accepted"));
          input.put("outcome", DdsCardTemplate.option(options, "outcome", "completed"));
          return DdsCardTemplate.manual(input, service);
        });
    return Future.failedFuture(new ApiException(400, "invalid_dds_card", "Неизвестный источник карточки."));
  }

  Future<Void> startLesson(Account actor, UUID id) {
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
                                    ? seedCardAttempts(db, id, template, row.getString("service_code"))
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
      String service) {
    return db.preparedQuery("SELECT id FROM lesson_assignment WHERE lesson_id=$1")
        .execute(Tuple.of(lesson)).compose(rows -> {
          Future<Void> chain = Future.succeededFuture();
          for (Row row : rows) {
            UUID assignment = row.getUUID("id");
            JsonObject selected = DdsCardPool.choose(pool, new JsonArray());
            JsonObject card = CardSnapshot.fromTemplate(selected, service);
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

  Future<JsonArray> assignments(Account actor) {
    return list(
        pool,
        """
        SELECT jsonb_build_object('id',a.id,'lesson_id',l.id,'learner_id',a.learner_id,'mode',l.mode,
           'status',l.status,'title',COALESCE(latest.card_template->>'title',l.card_template->>'title',s.document->>'title'),
           'scenario_id',s.id,'module_id',m.id,'module_title',m.title,
           'group_name',g.name,'learner_login',u.login,
           'instructions',s.document->>'instructions','difficulty',COALESCE(s.document->>'difficulty',m.difficulty),
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
        JOIN training_group g ON g.id=l.group_id
        LEFT JOIN training_module m ON m.id=l.module_id
        LEFT JOIN scenario s ON s.id=l.scenario_id
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

  Future<JsonArray> completedAttempts(Account actor) {
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

}
