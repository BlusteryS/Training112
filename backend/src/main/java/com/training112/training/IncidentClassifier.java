package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Survey cards and technical response codes from the supplied v046 classifier. */
public final class IncidentClassifier {
  private static final JsonArray CARDS = load();
  private static final Map<String, JsonObject> BY_CODE = index();
  private static final Map<Signs, JsonObject> BY_SIGNS = indexSigns();

  private record Signs(String type, String second, String third) {}

  private IncidentClassifier() {}

  public static JsonArray cards() {
    return CARDS;
  }

  public static JsonObject card(String code) {
    return BY_CODE.get(code);
  }

  public static JsonObject card(String type, String second, String third) {
    return BY_SIGNS.get(new Signs(type, second, third));
  }

  private static JsonArray load() {
    try (var input = IncidentClassifier.class.getResourceAsStream("/contracts/incident-classifier.json")) {
      if (input == null) throw new IllegalStateException("Missing incident classifier");
      return new JsonArray(new String(input.readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }

  private static Map<String, JsonObject> index() {
    Map<String, JsonObject> result = new HashMap<>();
    for (Object value : CARDS) {
      JsonObject card = (JsonObject) value;
      result.put(card.getString("code"), card);
    }
    return Map.copyOf(result);
  }

  private static Map<Signs, JsonObject> indexSigns() {
    Map<Signs, JsonObject> result = new HashMap<>();
    for (Object value : CARDS) {
      JsonObject card = (JsonObject) value;
      result.putIfAbsent(new Signs(card.getString("type"), card.getString("sign2"),
          card.getString("sign3")), card);
    }
    return Map.copyOf(result);
  }
}
