package com.training112.training;

import io.vertx.core.json.JsonObject;
import io.vertx.core.json.JsonArray;

/** The card a DDS dispatcher receives. It is copied from the operator scenario and is not edited afterwards. */
public final class CardSnapshot {
  private CardSnapshot() {}

  public static JsonObject from(JsonObject document, String service) {
    JsonObject source = document == null ? new JsonObject() : document;
    JsonObject facts = source.getJsonObject("facts", new JsonObject());
    String classifierCode = text(source, "classifier_code");
    JsonObject survey = IncidentClassifier.card(classifierCode);
    String type = survey == null ? text(source, "title") : survey.getString("type");
    return new JsonObject()
        .put("caller_name", text(facts, "caller_name"))
        .put("phone", text(facts, "phone"))
        .put("address", text(facts, "address"))
        .put("description", text(facts, "incident"))
        .put("victims", text(facts, "victims"))
        .put("district", text(facts, "district"))
        .put("okrug", text(facts, "okrug"))
        .put("address_description", text(facts, "address_description"))
        .put("scene_phone", text(facts, "scene_phone"))
        .put("object", text(facts, "object"))
        .put("incident_code", type)
        .put("classifier_code", classifierCode)
        .put("incident_sign_2", survey == null ? "" : survey.getString("sign2"))
        .put("incident_sign_3", survey == null ? "" : survey.getString("sign3"))
        .put("origin", text(source, "origin"))
        .put("services", service == null ? "" : service)
        .put("dds_service", service == null ? "" : service);
  }

  public static JsonObject fromTemplate(JsonObject template, String service) {
    JsonObject facts = template.getJsonObject("facts");
    JsonObject card = facts.copy();
    if ("103".equals(service == null ? "" : service.trim().replaceFirst("^Служба\\s+", ""))) {
      String description = card.getString("description", "");
      int length = description.codePointCount(0, description.length());
      if (length > 100) card.put("description", description.substring(0, description.offsetByCodePoints(0, 100)));
    }
    JsonArray services = template.getJsonArray("services", new JsonArray());
    java.util.StringJoiner names = new java.util.StringJoiner(", ");
    for (Object item : services) names.add(String.valueOf(item));
    card.put("services", names.toString());
    card.put("origin", text(template, "origin"));
    card.put("dds_service", service);
    return card;
  }

  private static String text(JsonObject object, String key) {
    Object value = object.getValue(key);
    return value instanceof String text ? text : "";
  }
}
