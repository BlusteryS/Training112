package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/** Creates an editable dialogue from a classified incident and the instructor's case details. */
public final class ScenarioDraft {
  private static final Set<String> DIFFICULTIES = Set.of("basic", "intermediate", "advanced");
  private static final JsonObject TEMPLATE = loadTemplate();

  private ScenarioDraft() {}

  public static JsonObject build(String classifierCode, String location,
      String difficulty, int seconds, String origin, String caller) {
    JsonObject incident = IncidentClassifier.card(classifierCode);
    if (incident == null || !DIFFICULTIES.contains(difficulty)
        || !IncidentOrigin.SOURCES.contains(origin) || seconds < 1 || seconds > 86_400
        || location.isBlank() || location.length() > 1000
        || caller.isBlank() || caller.length() > 200) {
      throw new ApiException(400, "invalid_scenario", "Проверьте тип, место, сложность, источник и норматив.");
    }

    String description = incident.getString("result");
    JsonObject document = TEMPLATE.copy();
    document.put("title", "Учебный сценарий: " + description);
    document.put("classifier_code", classifierCode);
    document.put("origin", origin);
    document.put("difficulty", difficulty);
    document.put("instructions", "Примите учебное происшествие. Уточните адрес, обстоятельства и сведения о пострадавших.");

    JsonObject facts = document.getJsonObject("facts");
    facts.put("caller_name", caller);
    facts.put("address", location);
    facts.put("incident", description);
    String lower = description.toLowerCase(Locale.ROOT);
    boolean noVictims = lower.contains("без пострадавших") || lower.contains("без раненых");
    boolean reportedVictims = !noVictims && lower.matches(
        ".*(?:пострадавш[а-яё]*|ранен[а-яё]*|травм[а-яё]*|ожог[а-яё]*|боль[а-яё]*|"
            + "отравл[а-яё]*|кровотеч[а-яё]*|задыха[а-яё]*|судорог[а-яё]*|"
            + "без сознания|умира[а-яё]*).*");
    facts.put("victims", noVictims ? "Пострадавших нет." : reportedVictims
        ? "Да, есть пострадавшие." : "Я пока не знаю, есть ли пострадавшие.");
    facts.put("phone", "+7 999 000-" + String.format("%04d", ThreadLocalRandom.current().nextInt(10_000)));
    facts.put("victim_count", noVictims ? "Пострадавших нет."
        : "Точное число пострадавших пока неизвестно.");
    facts.put("age", "Возраст неизвестен.");
    facts.put("consciousness", "Не могу проверить, в сознании ли человек.");
    facts.put("breathing", "Не могу проверить, дышит ли он.");
    facts.put("danger", "Непосредственной опасности для меня нет.");
    facts.put("fire", lower.matches(".*(?:пожар|возгоран[а-яё]*|огонь|пламя).*")
        ? "Вижу огонь." : lower.matches(".*(?:дым|задымлен[а-яё]*).*")
        ? "Вижу дым." : "Огня не вижу.");
    facts.put("weapon", "Оружия не видел.");
    facts.put("description_details", "Других примет я не заметил.");
    facts.put("vehicle", "Ничего о машине сказать не могу.");

    JsonArray rubric = document.getJsonArray("rubric");
    for (int i = 0; i < rubric.size(); i++) {
      JsonObject rule = rubric.getJsonObject(i);
      if ("deadline".equals(rule.getString("kind"))) {
        rule.put("seconds", seconds);
        rule.put("action", "saved");
        rule.put("description", "Карточка сохранена в течение " + seconds + " секунд.");
      }
    }
    rubric.add(fieldRule("classifier_code", "Код сценария реагирования выбран верно."));
    if (!incident.getString("sign2").isEmpty()) {
      rubric.add(fieldRule("incident_sign_2", "Второй признак происшествия выбран верно."));
    }
    if (!incident.getString("sign3").isEmpty()) {
      rubric.add(fieldRule("incident_sign_3", "Третий признак происшествия выбран верно."));
    }
    return ScenarioDocuments.fillExpected(document);
  }

  private static JsonObject fieldRule(String field, String description) {
    return new JsonObject().put("id", field).put("kind", "field_equals")
        .put("field", field).put("weight", 1)
        .put("description", description);
  }

  private static JsonObject loadTemplate() {
    try (var input = ScenarioDraft.class.getResourceAsStream("/contracts/demo-scenario.json")) {
      if (input == null) throw new IllegalStateException("Missing scenario template");
      return new JsonObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read scenario template", error);
    }
  }
}
