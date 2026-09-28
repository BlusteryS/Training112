package com.training112.training;

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
import static com.training112.training.TrainingRepository.instructor;

final class TrainingGroups {
  private final Pool pool;

  TrainingGroups(Pool pool) {
    this.pool = pool;
  }

  Future<JsonObject> createGroup(Account actor, String name, String service) {
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

  Future<JsonArray> learners(Account actor) {
    instructor(actor);
    return list(pool, "SELECT jsonb_build_object('id',id,'login',login) AS value FROM app_user WHERE role='user' AND NOT blocked ORDER BY login LIMIT 1000", Tuple.tuple());
  }

  Future<JsonArray> groups(Account actor) {
    return list(
        pool,
        "SELECT to_jsonb(g) || jsonb_build_object('member_count', (SELECT count(*) FROM training_group_member WHERE group_id=g.id)) AS value FROM training_group g WHERE instructor_id=$1 OR EXISTS (SELECT 1"
            + " FROM training_group_member m WHERE m.group_id=g.id AND m.user_id=$1) ORDER BY"
            + " created_at DESC LIMIT 100",
        Tuple.of(actor.id()));
  }

  Future<JsonArray> members(Account actor, UUID group) {
    instructor(actor);
    return one(pool, "SELECT id FROM training_group WHERE id=$1 AND instructor_id=$2",
        Tuple.of(group, actor.id())).compose(ignored -> list(pool, """
        SELECT jsonb_build_object('id',u.id,'login',u.login,'blocked',u.blocked) AS value
        FROM training_group_member m JOIN app_user u ON u.id=m.user_id
        WHERE m.group_id=$1 ORDER BY u.login
        """, Tuple.of(group)));
  }

  Future<Void> removeMember(Account actor, UUID group, UUID learner) {
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

  Future<Void> addMember(Account actor, UUID group, UUID learner) {
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

}
