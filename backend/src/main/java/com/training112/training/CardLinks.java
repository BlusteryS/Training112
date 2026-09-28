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
import java.util.UUID;

import static com.training112.training.TrainingDb.list;

/** Parent-child links between saved operator cards. Each chain has one main card. */
public final class CardLinks {
  private final Pool pool;

  public CardLinks(Pool pool) {
    this.pool = pool;
  }

  public Future<JsonArray> chain(Account actor, UUID attempt) {
    return accessible(pool, actor, attempt, false).compose(current -> {
      requireSavedCall(current);
      return root(pool, attempt).compose(main -> list(pool, """
            SELECT jsonb_build_object('id',a.id,'main',a.id=$1::uuid,
              'incident',a.card->>'incident_code','address',a.card->>'address',
              'phone',a.card->>'phone','created_at',a.created_at) AS value
            FROM training_attempt a LEFT JOIN card_link cl ON cl.child_attempt_id=a.id
            WHERE a.id=$1 OR cl.parent_attempt_id=$1 ORDER BY (a.id=$1) DESC,a.created_at
            """, Tuple.of(main)));
    });
  }

  public Future<JsonArray> candidates(Account actor, UUID attempt, String query, String phone, String address) {
    if (query.length() > 100) throw invalid("Слишком длинный поисковый запрос.");
    if (phone.length() > 100 || address.length() > 500)
      throw invalid("Слишком длинные данные для поиска карточек.");
    return accessible(pool, actor, attempt, false).compose(current -> {
      if (!"call".equals(current.getString("mode")))
        throw invalid("Связывать можно только карточки оператора 112.");
      JsonObject card = current.getJsonObject("card");
      String currentPhone = phone.isBlank() ? card.getString("phone", "") : phone.trim();
      String currentAddress = address.isBlank() ? card.getString("address", "") : address.trim();
      return list(pool, """
          SELECT jsonb_build_object('id',a.id,'incident',a.card->>'incident_code',
            'address',a.card->>'address','phone',a.card->>'phone',
            'created_at',a.created_at,'matched',
            ($3<>'' AND a.card->>'phone'=$3) OR ($4<>'' AND a.card->>'address'=$4)) AS value
          FROM training_attempt a
          JOIN lesson_assignment la ON la.id=a.assignment_id
          JOIN lesson l ON l.id=la.lesson_id
          JOIN training_group g ON g.id=l.group_id
          WHERE g.instructor_id=$1 AND l.mode='call' AND a.status='completed' AND a.id<>$2
            AND ($5='' OR a.card->>'incident_code' ILIKE $5
              OR a.card->>'address' ILIKE $5 OR a.card->>'phone' ILIKE $5)
          ORDER BY (($3<>'' AND a.card->>'phone'=$3) OR ($4<>'' AND a.card->>'address'=$4)) DESC,
            a.created_at DESC
          LIMIT 100
          """, Tuple.of(current.getUUID("instructor_id"), attempt,
              currentPhone, currentAddress,
              query.isBlank() ? "" : "%" + query.trim() + "%"));
    });
  }

  public Future<Void> attach(Account actor, UUID attempt, UUID parent) {
    return pool.withTransaction(db -> accessible(db, actor, attempt, true).compose(current -> {
      requireSavedCall(current);
      return db.preparedQuery("""
          SELECT a.id,a.status,l.mode FROM training_attempt a
          JOIN lesson_assignment la ON la.id=a.assignment_id
          JOIN lesson l ON l.id=la.lesson_id
          JOIN training_group g ON g.id=l.group_id
          WHERE a.id=$1 AND g.instructor_id=$2 FOR UPDATE OF a
          """).execute(Tuple.of(parent, current.getUUID("instructor_id"))).compose(rows -> {
        if (rows.size() == 0) return Future.failedFuture(invalid("Карточка для связи не найдена."));
        requireSavedCall(rows.iterator().next());
        return root(db, parent).compose(main -> {
          if (attempt.equals(main)) return Future.failedFuture(invalid("Карточки уже связаны."));
          return db.preparedQuery("SELECT parent_attempt_id FROM card_link WHERE child_attempt_id=$1")
              .execute(Tuple.of(attempt)).compose(existing -> {
                if (existing.size() > 0)
                  return Future.failedFuture(invalid("Сначала отвяжите карточку от прежней главной."));
                return db.preparedQuery("""
                    UPDATE card_link SET parent_attempt_id=$2 WHERE parent_attempt_id=$1
                    """).execute(Tuple.of(attempt, main))
                    .compose(ignored -> db.preparedQuery("""
                        INSERT INTO card_link(child_attempt_id,parent_attempt_id) VALUES ($1,$2)
                        """).execute(Tuple.of(attempt, main)))
                    .compose(ignored -> audit(db, actor.id(), "card.linked", attempt, main))
                    .mapEmpty();
              });
        });
      });
    }));
  }

  public Future<Void> detach(Account actor, UUID attempt) {
    return pool.withTransaction(db -> accessible(db, actor, attempt, true).compose(current -> {
      requireSavedCall(current);
      return db.preparedQuery("DELETE FROM card_link WHERE child_attempt_id=$1 RETURNING parent_attempt_id")
          .execute(Tuple.of(attempt)).compose(rows -> {
            if (rows.size() == 0) return Future.failedFuture(invalid("Карточка не привязана."));
            UUID parent = rows.iterator().next().getUUID("parent_attempt_id");
            return audit(db, actor.id(), "card.unlinked", attempt, parent);
          });
    }));
  }

  public Future<Void> promote(Account actor, UUID attempt) {
    return pool.withTransaction(db -> accessible(db, actor, attempt, true).compose(current -> {
      requireSavedCall(current);
      return db.preparedQuery("SELECT parent_attempt_id FROM card_link WHERE child_attempt_id=$1 FOR UPDATE")
          .execute(Tuple.of(attempt)).compose(rows -> {
            if (rows.size() == 0) return Future.failedFuture(invalid("Карточка уже главная."));
            UUID oldMain = rows.iterator().next().getUUID("parent_attempt_id");
            return db.preparedQuery("""
                UPDATE card_link SET parent_attempt_id=$1
                WHERE parent_attempt_id=$2 AND child_attempt_id<>$1
                """).execute(Tuple.of(attempt, oldMain))
                .compose(ignored -> db.preparedQuery("DELETE FROM card_link WHERE child_attempt_id=$1")
                    .execute(Tuple.of(attempt)))
                .compose(ignored -> db.preparedQuery("""
                    INSERT INTO card_link(child_attempt_id,parent_attempt_id) VALUES ($1,$2)
                    """).execute(Tuple.of(oldMain, attempt)))
                .compose(ignored -> audit(db, actor.id(), "card.promoted", attempt, oldMain));
          });
    }));
  }

  private static Future<Row> accessible(SqlClient db, Account actor, UUID attempt, boolean lock) {
    return db.preparedQuery("""
        SELECT a.id,a.status,a.card,l.mode,g.instructor_id
        FROM training_attempt a JOIN lesson_assignment la ON la.id=a.assignment_id
        JOIN lesson l ON l.id=la.lesson_id JOIN training_group g ON g.id=l.group_id
        WHERE a.id=$1 AND (la.learner_id=$2 OR g.instructor_id=$2)
        """ + (lock ? " FOR UPDATE OF a" : ""))
        .execute(Tuple.of(attempt, actor.id()))
        .compose(rows -> rows.size() == 0
            ? Future.failedFuture(new ApiException(404, "not_found", "Карточка не найдена."))
            : Future.succeededFuture(rows.iterator().next()));
  }

  private static Future<UUID> root(SqlClient db, UUID attempt) {
    return db.preparedQuery("""
        SELECT COALESCE((SELECT parent_attempt_id FROM card_link WHERE child_attempt_id=$1),$1::uuid) AS id
        """).execute(Tuple.of(attempt)).map(rows -> rows.iterator().next().getUUID("id"));
  }

  private static Future<Void> audit(SqlClient db, UUID actor, String action, UUID card, UUID related) {
    return TrainingDb.audit(db, actor, action, card,
        new JsonObject().put("related_card", related.toString()));
  }

  private static void requireSavedCall(Row row) {
    if (!"call".equals(row.getString("mode")) || !"completed".equals(row.getString("status")))
      throw invalid("Связывать можно только сохранённые карточки оператора 112.");
  }

  private static ApiException invalid(String message) {
    return new ApiException(409, "invalid_card_link", message);
  }
}
