package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonObject;
import java.util.Map;
import java.util.Set;

public final class CardCommands {
  private static final Set<String> FIELDS =
      Set.of(
          "address", "caller_name", "caller_status", "city", "comment",
          "communication_channel", "country", "description", "district", "entrance", "floor",
          "foreign_language", "foreign_phone", "house", "incident_code", "incident_details",
          "phone", "provided_phone", "scene_phone", "services", "street", "victims");
  private static final Map<String, Set<String>> TRANSITIONS =
      Map.of(
          "received", Set.of("accepted", "rejected"),
          "rejected", Set.of("accepted"),
          "accepted", Set.of("dispatched", "arrived", "working", "completed", "refused"),
          "dispatched", Set.of("arrived", "working", "completed", "refused"),
          "arrived", Set.of("working", "completed", "refused"),
          "working", Set.of("completed", "refused"));

  public record Applied(JsonObject card, String status) {}

  private CardCommands() {}

  public static Applied apply(JsonObject card, String current, String type, JsonObject payload) {
    JsonObject copy = card.copy();
    if (!TRANSITIONS.containsKey(current)) throw invalid("Карточка закрыта для редактирования.");
    if ("card.update".equals(type)) {
      if (payload.isEmpty() || !FIELDS.containsAll(payload.fieldNames()))
        throw invalid("Неизвестные поля карточки.");
      for (var entry : payload) {
        if (!(entry.getValue() instanceof String value) || value.length() > 4000)
          throw invalid("Неверное значение поля.");
        copy.put(entry.getKey(), entry.getValue());
      }
      return new Applied(copy, current);
    }
    if (!"card.status".equals(type)
        || !Set.of("status", "comment").containsAll(payload.fieldNames())) {
      throw invalid("Неизвестная команда карточки.");
    }
    String next = payload.getString("status", "");
    String comment = payload.getString("comment", "");
    if (!TRANSITIONS.get(current).contains(next)) throw invalid("Недопустимый переход статуса.");
    if (comment.length() > 4000
        || (Set.of("rejected", "refused").contains(next) && comment.isBlank())) {
      throw invalid("Для отказа нужен комментарий.");
    }
    if (!comment.isEmpty()) copy.put("comment", comment);
    return new Applied(copy, next);
  }

  private static ApiException invalid(String message) {
    return new ApiException(400, "invalid_card_command", message);
  }
}
