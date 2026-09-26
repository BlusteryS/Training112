package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.LinkedHashSet;
import java.util.Set;

/** A finished 112 card used by a DDS lesson; it contains no caller dialogue. */
public final class DdsCardTemplate {
  private static final Set<String> FIELDS = Set.of(
      "caller_name", "phone", "address", "address_description", "description", "victims",
      "incident_code", "district", "okrug", "object", "scene_phone", "provided_phone",
      "communication_channel", "caller_status", "street", "house", "entrance", "floor",
      "landmark", "incident_sign_2", "incident_sign_3", "incident_details", "classifier_code",
      "incident_types",
      "city", "country", "foreign_language", "foreign_phone");

  private DdsCardTemplate() {}

  public static JsonObject manual(JsonObject input, String service) {
    return build(input, service, false).put("case_id", java.util.UUID.randomUUID().toString());
  }

  public static JsonObject fromOperator(JsonObject card, JsonObject options, String service,
      java.util.UUID source) {
    JsonObject input = card.copy();
    input.put("expected_primary", options.getString("expected_primary", "accepted"));
    input.put("outcome", options.getString("outcome", "completed"));
    return build(input, service, true).put("case_id", source.toString());
  }

  private static JsonObject build(JsonObject input, String service, boolean forwarded) {
    if (input == null) throw invalid();
    JsonObject facts = new JsonObject();
    for (String key : FIELDS) {
      Object value = input.getValue(key);
      int maxLength = "incident_types".equals(key) ? 20_000 : 4000;
      if (value != null && (!(value instanceof String) || ((String) value).length() > maxLength))
        throw invalid();
      facts.put(key, value == null ? "" : ((String) value).trim());
    }
    for (String key : new String[] {"phone", "address", "description", "incident_code"}) {
      if (facts.getString(key).isBlank()) throw new ApiException(
          400, "invalid_dds_card", "Для карточки ДДС нужны телефон, адрес, описание и тип происшествия.");
    }
    LinkedHashSet<String> services = new LinkedHashSet<>();
    Object requested = input.getValue("services");
    if (requested instanceof String line) {
      for (String item : line.split(",")) addService(services, item);
    } else if (requested instanceof JsonArray array) {
      for (Object item : array) {
        if (!(item instanceof String)) throw invalid();
        addService(services, (String) item);
      }
    } else if (requested != null) throw invalid();
    if (forwarded && services.stream().noneMatch(item -> sameService(item, service)))
      throw new ApiException(400, "wrong_dds", "Карточка оператора не направлена этой ДДС.");
    if (!forwarded) services.add(service);
    if (services.isEmpty() || services.size() > 20) throw invalid();
    String expected = input.getString("expected_primary", "accepted");
    String outcome = input.getString("outcome", "completed");
    if (!Set.of("accepted", "rejected").contains(expected)
        || !Set.of("completed", "refused").contains(outcome)) throw invalid();
    return new JsonObject()
        .put("title", "Карточка ДДС: " + facts.getString("incident_code"))
        .put("origin", "Служба 112")
        .put("facts", facts)
        .put("services", new JsonArray(new java.util.ArrayList<>(services)))
        .put("expected_primary", expected)
        .put("outcome", outcome);
  }

  private static void addService(Set<String> services, String value) {
    String service = value.trim();
    if (!service.isEmpty()) {
      if (service.length() > 100) throw invalid();
      services.add(service);
    }
  }

  private static boolean sameService(String left, String right) {
    String a = left.trim().toLowerCase();
    String b = right.trim().toLowerCase();
    if (a.equals(b)) return true;
    return a.matches("(?:служба )?10[1-4]") && b.matches("(?:служба )?10[1-4]")
        && a.replace("служба ", "").equals(b.replace("служба ", ""));
  }

  private static ApiException invalid() {
    return new ApiException(400, "invalid_dds_card", "Проверьте сведения карточки ДДС.");
  }
}
