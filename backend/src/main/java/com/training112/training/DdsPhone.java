package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

/** Fixed IP-phone reports for the universal DDS exercise. */
public final class DdsPhone {
  private static final Set<String> CREWS = Set.of("Бригада 1", "Бригада 2", "Бригада 3");
  private static final Map<String, String> NEXT = Map.of(
      "accepted", "dispatched", "dispatched", "arrived", "arrived", "working",
      "working", "completed");
  private static final JsonObject REPLIES = loadReplies();

  private DdsPhone() {}

  public static boolean crewName(String name) {
    return name != null && CREWS.contains(name);
  }

  public static JsonObject report(String status, String crew, JsonObject template, JsonObject request) {
    String party = request.getString("party", "");
    String direction = request.getString("direction", "");
    if (!Set.of("incoming", "outgoing").contains(direction)) throw invalid("Неизвестный тип звонка.");
    if ("crew".equals(party)) {
      if (!NEXT.containsKey(status)) throw invalid("Сначала примите карточку службы.");
      if (crew == null || crew.isBlank()) throw invalid("Сначала выберите бригаду.");
      if (!request.fieldNames().equals(Set.of("party", "direction"))) throw invalid("Лишние поля звонка.");
      String next = template != null && "refused".equals(template.getString("outcome"))
          ? "refused" : NEXT.get(status);
      JsonObject reply = reply(next);
      return new JsonObject().put("request", request.copy()).put("party", party)
          .put("direction", direction).put("crew", crew).put("report_status", next)
          .put("audio", reply.getString("audio")).put("message", reply.getString("message"));
    }
    if ("caller".equals(party) && "outgoing".equals(direction)) {
      if (!Set.of("received", "rejected", "accepted", "dispatched", "arrived", "working")
          .contains(status)) throw invalid("Карточка недоступна для звонка заявителю.");
      String topic = request.getString("topic", "");
      if (!Set.of("address", "situation", "victims").contains(topic)
          || !request.fieldNames().equals(Set.of("party", "direction", "topic")))
        throw invalid("Неизвестный вопрос заявителю.");
      JsonObject reply = reply(topic);
      return new JsonObject().put("request", request.copy()).put("party", party)
          .put("direction", direction).put("topic", topic).put("audio", reply.getString("audio"))
          .put("message", reply.getString("message"));
    }
    throw invalid("Недопустимый звонок.");
  }

  private static ApiException invalid(String message) {
    return new ApiException(400, "invalid_dds_phone", message);
  }

  private static JsonObject reply(String key) {
    JsonObject value = REPLIES.getJsonObject(key);
    if (value == null || value.getString("audio") == null || value.getString("message") == null)
      throw new IllegalStateException("Missing DDS phone reply: " + key);
    return value;
  }

  private static JsonObject loadReplies() {
    try (var input = DdsPhone.class.getResourceAsStream("/dds-phone.json")) {
      if (input == null) throw new IllegalStateException("Missing DDS phone replies");
      return new JsonObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read DDS phone replies", error);
    }
  }
}
