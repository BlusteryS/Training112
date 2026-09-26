package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.json.schema.Draft;
import io.vertx.json.schema.JsonSchema;
import io.vertx.json.schema.JsonSchemaOptions;
import io.vertx.json.schema.Validator;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public final class ScenarioDocuments {
  public static final int MAX_BYTES = 262_144;
  private static final Validator VALIDATOR = load();

  private ScenarioDocuments() {}

  private static Validator load() {
    try (var stream =
        ScenarioDocuments.class.getResourceAsStream("/contracts/scenario.schema.json")) {
      if (stream == null) throw new IllegalStateException("Missing scenario schema");
      return Validator.create(
          JsonSchema.of(new JsonObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8))),
          new JsonSchemaOptions()
              .setDraft(Draft.DRAFT202012)
              .setBaseUri("https://training112.local/contracts/"));
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }

  public static JsonObject validate(JsonObject document) {
    if (document == null || document.toBuffer().length() > MAX_BYTES) {
      throw new ApiException(
          400, "invalid_scenario", "Сценарий содержит неполные или некорректные данные.");
    }
    JsonObject scenario = document.copy();
    scenario.remove("acceptance_cases");
    fillExpected(scenario);
    if (!VALIDATOR.validate(scenario).getValid()) {
      throw new ApiException(
          400, "invalid_scenario", "Сценарий содержит неполные или некорректные данные.");
    }
    String classifierCode = scenario.getString("classifier_code");
    if (classifierCode != null && IncidentClassifier.card(classifierCode) == null) {
      throw new ApiException(400, "invalid_scenario", "Код происшествия отсутствует в классификаторе.");
    }
    return scenario;
  }

  static JsonObject fillExpected(JsonObject scenario) {
    if (!(scenario.getValue("facts") instanceof JsonObject facts)
        || !(scenario.getValue("rubric") instanceof JsonArray rubric)) return scenario;
    Object code = scenario.getValue("classifier_code");
    JsonObject classifier = code instanceof String value ? IncidentClassifier.card(value) : null;
    for (Object entry : rubric) {
      if (!(entry instanceof JsonObject rule)) continue;
      Object kind = rule.getValue("kind");
      if (!"field_equals".equals(kind) && !"semantic".equals(kind)) continue;
      if (!(rule.getValue("field") instanceof String field)) continue;
      Object expected = switch (field) {
        case "description" -> facts.getValue("incident");
        case "classifier_code" -> code;
        case "incident_code" -> classifier == null ? null : classifier.getValue("type");
        case "incident_sign_2" -> classifier == null ? null : classifier.getValue("sign2");
        case "incident_sign_3" -> classifier == null ? null : classifier.getValue("sign3");
        default -> facts.getValue(field);
      };
      if (expected instanceof String value) rule.put("expected", value);
    }
    return scenario;
  }
}
