package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.SqlClient;
import io.vertx.sqlclient.Tuple;
import java.util.UUID;

final class TrainingDb {
  private TrainingDb() {}

  static Future<Row> one(SqlClient client, String sql, Tuple parameters) {
    return client.preparedQuery(sql).execute(parameters).compose(rows ->
        rows.size() == 0
            ? Future.failedFuture(new ApiException(404, "not_found", "Объект не найден."))
            : Future.succeededFuture(rows.iterator().next()));
  }

  static Future<JsonArray> list(SqlClient client, String sql, Tuple parameters) {
    return client.preparedQuery(sql).execute(parameters).map(rows -> {
      JsonArray values = new JsonArray();
      for (Row row : rows) values.add(row.getJsonObject("value"));
      return values;
    });
  }

  static Future<Void> audit(SqlClient client, UUID actor, String action, UUID entity,
      JsonObject detail) {
    return client.preparedQuery(
            "INSERT INTO audit_event(actor_id,action,entity_id,detail) VALUES ($1,$2,$3,$4)")
        .execute(Tuple.of(actor, action, entity, detail)).mapEmpty();
  }
}
