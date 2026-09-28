package com.training112.training;

import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository.Account;
import io.vertx.core.Future;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Tuple;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;

import static com.training112.training.TrainingDb.audit;
import static com.training112.training.TrainingDb.one;
import static com.training112.training.TrainingRepository.forbidden;
import static com.training112.training.TrainingRepository.instructor;

final class TrainingMaterials {
  static final int MAX_BYTES = 8 * 1024 * 1024;
  private static final Set<String> MEDIA_TYPES = Set.of(
      "application/pdf", "text/plain", "audio/wav", "audio/mpeg", "application/json");
  private final Pool pool;

  TrainingMaterials(Pool pool) {
    this.pool = pool;
  }

  Future<JsonArray> list(Account actor) {
    return TrainingDb.list(pool, """
        SELECT jsonb_build_object('id',m.id,'title',m.title,'filename',m.filename,
          'media_type',m.media_type,'byte_size',m.byte_size,'created_at',m.created_at) AS value
        FROM teaching_material m WHERE
        """ + scope(actor, "$1") + " ORDER BY m.created_at DESC LIMIT 200", Tuple.of(actor.id()));
  }

  Future<JsonObject> get(Account actor, UUID id) {
    return one(pool, "SELECT title,filename,media_type,content FROM teaching_material m "
            + "WHERE m.id=$1 AND " + scope(actor, "$2"), Tuple.of(id, actor.id()))
        .map(row -> new JsonObject()
            .put("title", row.getString("title"))
            .put("filename", row.getString("filename"))
            .put("media_type", row.getString("media_type"))
            .put("content_base64", Base64.getEncoder().encodeToString(row.getBuffer("content").getBytes())));
  }

  Future<JsonObject> add(Account actor, String title, String filename, String media, byte[] content) {
    instructor(actor);
    if (title.isBlank() || title.length() > 200 || filename.isBlank() || filename.length() > 200
        || !MEDIA_TYPES.contains(media) || content.length < 1 || content.length > MAX_BYTES) {
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

  Future<Void> delete(Account actor, UUID id) {
    instructor(actor);
    return pool.withTransaction(db ->
        one(db, "SELECT id FROM teaching_material WHERE id=$1 AND instructor_id=$2 FOR UPDATE",
            Tuple.of(id, actor.id()))
            .compose(ignored -> db.preparedQuery("DELETE FROM teaching_material WHERE id=$1")
                .execute(Tuple.of(id)))
            .compose(ignored -> audit(db, actor.id(), "material.deleted", id, new JsonObject())));
  }

  private static String scope(Account actor, String parameter) {
    if ("instructor".equals(actor.role())) return "m.instructor_id=" + parameter;
    if (!"user".equals(actor.role())) throw forbidden();
    return "EXISTS (SELECT 1 FROM training_group g "
        + "JOIN training_group_member gm ON gm.group_id=g.id "
        + "WHERE g.instructor_id=m.instructor_id AND gm.user_id=" + parameter + ")";
  }
}
