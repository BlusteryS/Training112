package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonObject;
import java.util.Map;
import java.util.Set;

/** Fixed IP-phone reports for the universal DDS exercise. */
public final class DdsPhone {
  private static final Set<String> CREWS = Set.of("Бригада 1", "Бригада 2", "Бригада 3");
  private static final Map<String, String> NEXT = Map.of(
      "accepted", "dispatched", "dispatched", "arrived", "arrived", "working",
      "working", "completed");
  private static final Map<String, String> AUDIO = Map.of(
      "dispatched", "crew-dispatched",
      "arrived", "crew-arrived",
      "working", "crew-working",
      "completed", "crew-completed",
      "refused", "crew-refused",
      "address", "caller-address",
      "situation", "caller-situation",
      "victims", "caller-victims");
  private static final Map<String, String> MESSAGE = Map.of(
      "dispatched", "Старший бригады: выезжаем на место происшествия.",
      "arrived", "Старший бригады: прибыли на место происшествия.",
      "working", "Старший бригады: приступили к работам.",
      "completed", "Старший бригады: работы завершены, результат передаю диспетчеру.",
      "refused", "Старший бригады: работы на месте не проводим, причину сообщаю диспетчеру.",
      "address", "Заявитель: адрес тот же, что указан в карточке.",
      "situation", "Заявитель: обстановка пока не изменилась, я нахожусь на месте.",
      "victims", "Заявитель: дополнительных сведений о пострадавших у меня нет.");

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
      if (!crewName(crew)) throw invalid("Сначала выберите бригаду.");
      if (!request.fieldNames().equals(Set.of("party", "direction"))) throw invalid("Лишние поля звонка.");
      String next = template != null && "refused".equals(template.getString("outcome"))
          ? "refused" : NEXT.get(status);
      return new JsonObject().put("request", request.copy()).put("party", party)
          .put("direction", direction).put("crew", crew).put("report_status", next)
          .put("audio", AUDIO.get(next)).put("message", MESSAGE.get(next));
    }
    if ("caller".equals(party) && "outgoing".equals(direction)) {
      if (!Set.of("received", "rejected", "accepted", "dispatched", "arrived", "working")
          .contains(status)) throw invalid("Карточка недоступна для звонка заявителю.");
      String topic = request.getString("topic", "");
      if (!Set.of("address", "situation", "victims").contains(topic)
          || !request.fieldNames().equals(Set.of("party", "direction", "topic")))
        throw invalid("Неизвестный вопрос заявителю.");
      return new JsonObject().put("request", request.copy()).put("party", party)
          .put("direction", direction).put("topic", topic).put("audio", AUDIO.get(topic))
          .put("message", MESSAGE.get(topic));
    }
    throw invalid("Недопустимый звонок.");
  }

  private static ApiException invalid(String message) {
    return new ApiException(400, "invalid_dds_phone", message);
  }
}
