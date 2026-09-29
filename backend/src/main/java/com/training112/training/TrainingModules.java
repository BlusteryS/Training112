package com.training112.training;

import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository.Account;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Tuple;
import java.util.UUID;

import static com.training112.training.TrainingDb.audit;
import static com.training112.training.TrainingDb.list;
import static com.training112.training.TrainingDb.one;
import static com.training112.training.TrainingRepository.conflict;
import static com.training112.training.TrainingRepository.instructor;

final class TrainingModules {
  private final Pool pool;

  TrainingModules(Pool pool) {
    this.pool = pool;
  }

  Future<JsonArray> modules(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT to_jsonb(m) || jsonb_build_object('group_name',g.name) AS value
        FROM training_module m JOIN training_group g ON g.id=m.group_id
        WHERE m.instructor_id=$1 ORDER BY m.created_at DESC LIMIT 100
        """, Tuple.of(actor.id()));
  }

  Future<JsonObject> create(Account actor, UUID group, String title, String difficulty) {
    instructor(actor);
    String name = title.trim();
    if (name.isEmpty() || name.length() > 200)
      throw new ApiException(400, "invalid_module", "Укажите название модуля.");
    if (!java.util.Set.of("basic", "intermediate", "advanced").contains(difficulty))
      throw new ApiException(400, "invalid_module", "Выберите уровень сложности.");
    UUID id = UUID.randomUUID();
    return pool.withTransaction(db ->
        one(db, "SELECT name FROM training_group WHERE id=$1 AND instructor_id=$2",
            Tuple.of(group, actor.id()))
            .compose(row -> db.preparedQuery("""
                INSERT INTO training_module(id,instructor_id,group_id,title,difficulty)
                VALUES ($1,$2,$3,$4,$5)
                """).execute(Tuple.of(id, actor.id(), group, name, difficulty))
                .compose(ignored -> audit(db, actor.id(), "module.created", id, new JsonObject()))
                .map(new JsonObject().put("id", id.toString()).put("group_id", group.toString())
                    .put("title", name).put("difficulty", difficulty).put("group_name", row.getString("name")))))
        .recover(error -> error instanceof io.vertx.pgclient.PgException pg
                && "23505".equals(pg.getSqlState())
            ? Future.failedFuture(conflict("Модуль с таким названием уже есть в группе."))
            : Future.failedFuture(error));
  }
}
