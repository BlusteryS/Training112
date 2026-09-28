package com.training112.training;

import com.training112.auth.AuthRepository.Account;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.util.UUID;

import static com.training112.training.TrainingDb.audit;
import static com.training112.training.TrainingDb.list;
import static com.training112.training.TrainingDb.one;
import static com.training112.training.TrainingRepository.conflict;
import static com.training112.training.TrainingRepository.instructor;

final class TrainingScenarios {
  private final Pool pool;

  TrainingScenarios(Pool pool) {
    this.pool = pool;
  }

  Future<JsonArray> scenarios(Account actor) {
    instructor(actor);
    return list(
        pool,
        "SELECT jsonb_build_object('id',id,'title',title,'status',status) AS value FROM"
            + " scenario WHERE author_id=$1 AND NOT archived ORDER BY created_at DESC LIMIT 100",
        Tuple.of(actor.id()));
  }

  Future<JsonObject> createScenario(Account actor, JsonObject document) {
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

  Future<JsonObject> updateScenario(Account actor, UUID scenario, JsonObject document) {
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

  Future<Void> archiveScenario(Account actor, UUID scenario) {
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

  Future<JsonObject> scenario(Account actor, UUID scenario) {
    instructor(actor);
    return one(
            pool,
            "SELECT to_jsonb(s)-'artifact'-'artifact_sha256' AS value FROM scenario s"
                + " WHERE s.id=$1 AND s.author_id=$2 AND NOT s.archived",
            Tuple.of(scenario, actor.id()))
        .map(row -> row.getJsonObject("value"));
  }

  Future<Void> approve(Account actor, UUID scenario) {
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

  Future<JsonArray> jobs(Account actor) {
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

  Future<Void> deleteScenario(Account actor, UUID scenario) {
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

}
