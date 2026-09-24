package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.Map;
import java.util.Set;

/** Builds a schema-valid reference scenario from the lesson parameters. Voice is prepared later by the compiler. */
public final class ScenarioReference {
  private static final Set<String> DIFFICULTIES = Set.of("basic", "intermediate", "advanced");
  private static final Map<String, String> INCIDENTS =
      Map.of(
          "Пожар или задымление", "В помещении дым. Источник я не вижу.",
          "Дорожно-транспортное происшествие", "Произошло столкновение автомобилей.",
          "Требуется медицинская помощь", "Человеку плохо, нужна скорая помощь.",
          "Нарушение общественного порядка", "Происходит драка, нужна полиция.",
          "Запах газа или авария газового оборудования", "Пахнет газом.",
          "Авария коммунальных сетей", "Прорвало трубу, вода заливает помещение.");
  private static final Map<String, String> VICTIMS =
      Map.of(
          "Пожар или задымление", "Пострадавших я не видел.",
          "Дорожно-транспортное происшествие", "В машине есть человек, он в сознании.",
          "Требуется медицинская помощь", "Плохо одному человеку, он в сознании.",
          "Нарушение общественного порядка", "Пострадавших не видно.",
          "Запах газа или авария газового оборудования", "Людей в помещении я не вижу.",
          "Авария коммунальных сетей", "Пострадавших нет.");

  private ScenarioReference() {}

  public static JsonObject build(
      JsonObject demo, String incident, String location, String difficulty, int seconds,
      String origin, String caller) {
    if (!INCIDENTS.containsKey(incident) || !DIFFICULTIES.contains(difficulty)
        || !IncidentOrigin.SOURCES.contains(origin) || seconds < 1 || seconds > 86_400
        || location.isBlank() || location.length() > 1000
        || caller.isBlank() || caller.length() > 200) {
      throw new ApiException(400, "invalid_scenario", "Проверьте тип, место, сложность, источник и норматив.");
    }
    String story = INCIDENTS.get(incident);
    if ("intermediate".equals(difficulty)) story = story + " Точный источник мне неизвестен.";
    if ("advanced".equals(difficulty)) story = story + " Рядом есть люди, которые не могут выйти сами.";
    JsonObject document = demo.copy();
    document.put("title", ("Учебный сценарий: " + incident).substring(0, Math.min(200, ("Учебный сценарий: " + incident).length())));
    document.put("origin", origin);
    document.put("difficulty", difficulty);
    document.put("instructions", "Примите учебное происшествие «" + incident + "». Уточните адрес, обстоятельства и сведения о пострадавших.");
    JsonObject facts = document.getJsonObject("facts");
    facts.put("caller_name", caller);
    facts.put("address", location);
    facts.put("incident", story);
    facts.put("victims", VICTIMS.get(incident));
    JsonArray rubric = document.getJsonArray("rubric");
    for (int i = 0; i < rubric.size(); i++) {
      JsonObject rule = rubric.getJsonObject(i);
      if ("address".equals(rule.getString("field"))) rule.put("expected", location);
      if ("description".equals(rule.getString("field"))) rule.put("expected", story);
      if ("deadline".equals(rule.getString("kind"))) {
        rule.put("seconds", seconds);
        rule.put("description", "Карточка принята в течение " + seconds + " секунд.");
      }
    }
    return ScenarioDocuments.validate(document);
  }
}
