package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.Set;

/** Creates an editable dialogue from a classified incident and the teacher's case details. */
public final class ScenarioDraft {
  private static final Set<String> DIFFICULTIES = Set.of("basic", "intermediate", "advanced");

  private ScenarioDraft() {}

  public static JsonObject build(JsonObject demo, String classifierCode, String location,
      String difficulty, int seconds, String origin, String caller) {
    JsonObject incident = IncidentClassifier.card(classifierCode);
    if (incident == null || !DIFFICULTIES.contains(difficulty)
        || !IncidentOrigin.SOURCES.contains(origin) || seconds < 1 || seconds > 86_400
        || location.isBlank() || location.length() > 1000
        || caller.isBlank() || caller.length() > 200) {
      throw new ApiException(400, "invalid_scenario", "Проверьте тип, место, сложность, источник и норматив.");
    }

    String type = incident.getString("type");
    String description = incident.getString("result");
    JsonObject document = demo.copy();
    document.put("title", "Учебный сценарий: " + description);
    document.put("classifier_code", classifierCode);
    document.put("origin", origin);
    document.put("difficulty", difficulty);
    document.put("instructions", "Примите учебное происшествие. Уточните адрес, обстоятельства и сведения о пострадавших.");

    JsonObject facts = document.getJsonObject("facts");
    for (String key : facts.fieldNames()) facts.put(key, "");
    facts.put("caller_name", caller);
    facts.put("address", location);
    facts.put("incident", description);
    facts.put("district", "");
    facts.put("okrug", "");

    JsonArray rubric = document.getJsonArray("rubric");
    for (int i = 0; i < rubric.size(); i++) {
      JsonObject rule = rubric.getJsonObject(i);
      String field = rule.getString("field", "");
      if ("address".equals(field)) rule.put("expected", location);
      if ("caller_name".equals(field)) rule.put("expected", caller);
      if ("incident_code".equals(field)) rule.put("expected", type);
      if ("description".equals(field)) rule.put("expected", description);
      if ("deadline".equals(rule.getString("kind"))) {
        rule.put("seconds", seconds);
        rule.put("action", "saved");
        rule.put("description", "Карточка сохранена в течение " + seconds + " секунд.");
      }
    }
    rubric.add(fieldRule("classifier_code", "Код сценария реагирования выбран верно.", classifierCode));
    if (!incident.getString("sign2").isEmpty()) {
      rubric.add(fieldRule("incident_sign_2", "Второй признак происшествия выбран верно.",
          incident.getString("sign2")));
    }
    if (!incident.getString("sign3").isEmpty()) {
      rubric.add(fieldRule("incident_sign_3", "Третий признак происшествия выбран верно.",
          incident.getString("sign3")));
    }
    return document;
  }

  private static JsonObject fieldRule(String field, String description, String expected) {
    return new JsonObject().put("id", field).put("kind", "field_equals")
        .put("field", field).put("expected", expected).put("weight", 1)
        .put("description", description);
  }
}
