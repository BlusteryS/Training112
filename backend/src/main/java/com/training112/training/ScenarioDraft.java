package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

/** Creates an editable dialogue from a classified incident and the instructor's case details. */
public final class ScenarioDraft {
  private static final Set<String> DIFFICULTIES = Set.of("basic", "intermediate", "advanced");
  private static final JsonObject TEMPLATE = loadJson("demo-scenario.json");
  private static final JsonObject PROFILE = loadJson("draft-profile.json");
  private static final JsonObject SIGNALS = PROFILE.getJsonObject("signals");
  private static final Pattern NO_VICTIMS = Pattern.compile(SIGNALS.getString("no_victims"));
  private static final Pattern VICTIMS = Pattern.compile(SIGNALS.getString("victims"));
  private static final Pattern FLAMES = Pattern.compile(SIGNALS.getString("flames"));
  private static final Pattern SMOKE = Pattern.compile(SIGNALS.getString("smoke"));

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
    document.put("title", PROFILE.getString("title_prefix") + description);
    document.put("classifier_code", classifierCode);
    document.put("origin", origin);
    document.put("difficulty", difficulty);
    document.put("instructions", PROFILE.getString("instructions"));

    JsonObject facts = document.getJsonObject("facts");
    JsonObject defaults = PROFILE.getJsonObject("facts");
    Map<String, JsonArray> answers = new HashMap<>();
    facts.put("caller_name", caller);
    facts.put("address", location);
    facts.put("incident", description);
    String lower = description.toLowerCase(Locale.ROOT);
    boolean noVictims = NO_VICTIMS.matcher(lower).find();
    boolean reportedVictims = !noVictims && VICTIMS.matcher(lower).find();
    JsonObject victims = defaults.getJsonObject("victims");
    answers.put("victims", victims.getJsonArray(
        noVictims ? "absent" : reportedVictims ? "present" : "unknown"));
    facts.put("victims", choose(answers.get("victims")));
    facts.put("phone", "+7 999 000-" + String.format("%04d", ThreadLocalRandom.current().nextInt(10_000)));
    answers.put("victim_count", defaults.getJsonObject("victim_count")
        .getJsonArray(noVictims ? "absent" : "unknown"));
    facts.put("victim_count", choose(answers.get("victim_count")));
    for (String field : Set.of("age", "consciousness", "breathing", "danger", "weapon",
        "description_details", "vehicle")) {
      JsonArray variants = defaults.getJsonArray(field);
      answers.put(field.equals("description_details") ? "description" : field, variants);
      facts.put(field, choose(variants));
    }
    String fire = FLAMES.matcher(lower).find() ? "flames"
        : SMOKE.matcher(lower).find() ? "smoke" : "absent";
    answers.put("fire", defaults.getJsonObject("fire").getJsonArray(fire));
    facts.put("fire", choose(answers.get("fire")));
    for (Object value : document.getJsonArray("responses")) {
      JsonObject response = (JsonObject) value;
      JsonArray variants = answers.get(response.getString("intent"));
      if (variants != null) {
        response.put("variants", variants.copy());
        response.put("compact_variants", variants.copy());
      }
    }

    JsonArray rubric = document.getJsonArray("rubric");
    JsonObject rubricText = PROFILE.getJsonObject("rubric");
    for (int i = 0; i < rubric.size(); i++) {
      JsonObject rule = rubric.getJsonObject(i);
      if ("deadline".equals(rule.getString("kind"))) {
        rule.put("seconds", seconds);
        rule.put("action", "saved");
        rule.put("description", rubricText.getString("deadline").replace("{seconds}", String.valueOf(seconds)));
      }
    }
    rubric.add(fieldRule("classifier_code", rubricText.getString("classifier_code")));
    if (!incident.getString("sign2").isEmpty()) {
      rubric.add(fieldRule("incident_sign_2", rubricText.getString("incident_sign_2")));
    }
    if (!incident.getString("sign3").isEmpty()) {
      rubric.add(fieldRule("incident_sign_3", rubricText.getString("incident_sign_3")));
    }
    return ScenarioDocuments.fillExpected(document);
  }

  private static JsonObject fieldRule(String field, String description) {
    return new JsonObject().put("id", field).put("kind", "field_equals")
        .put("field", field).put("weight", 1)
        .put("description", description);
  }

  private static String choose(JsonArray options) {
    if (options == null || options.isEmpty()) {
      throw new IllegalStateException("Missing scenario fact variants");
    }
    return options.getString(ThreadLocalRandom.current().nextInt(options.size()));
  }

  private static JsonObject loadJson(String name) {
    try (var input = ScenarioDraft.class.getResourceAsStream("/contracts/" + name)) {
      if (input == null) throw new IllegalStateException("Missing scenario resource: " + name);
      return new JsonObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read scenario resource: " + name, error);
    }
  }
}
