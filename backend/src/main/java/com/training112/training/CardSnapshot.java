package com.training112.training;

import io.vertx.core.json.JsonObject;
import io.vertx.core.json.JsonArray;
import java.util.LinkedHashSet;
import java.util.StringJoiner;

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
        .put("description", descriptionForService(text(facts, "incident"), service))
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
        .put("services", services(survey, facts, service))
        .put("dds_service", service == null ? "" : service);
  }

  public static JsonObject fromTemplate(JsonObject template, String service) {
    JsonObject facts = template.getJsonObject("facts");
    JsonObject card = facts.copy();
    card.put("description", descriptionForService(card.getString("description", ""), service));
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

  static String descriptionForService(String description, String service) {
    if (!"103".equals(service == null ? "" : service.trim().replaceFirst("^Служба\\s+", "")))
      return description;
    return description.codePointCount(0, description.length()) > 100
        ? description.substring(0, description.offsetByCodePoints(0, 100)) : description;
  }

  private static String services(JsonObject survey, JsonObject facts, String service) {
    LinkedHashSet<String> names = new LinkedHashSet<>();
    if (survey != null) {
      add(names, survey.getJsonArray("services"));
      String victims = text(facts, "victims").trim();
      if (!victims.isEmpty() && !victims.equalsIgnoreCase("нет")
          && !victims.equalsIgnoreCase("неизвестно"))
        add(names, survey.getJsonArray("victim_services"));
      if ("true".equalsIgnoreCase(text(facts, "law_violation")))
        add(names, survey.getJsonArray("law_services"));
      String district = text(facts, "district").trim();
      String okrug = text(facts, "okrug").trim();
      boolean tinao = "ТиНАО".equals(okrug);
      if (!district.isEmpty() && survey.getBoolean(tinao ? "tinao_dds" : "district_dds", false))
        names.add("ДДС района " + district);
      if (!okrug.isEmpty() && survey.getBoolean(tinao ? "tinao_dds" : "okrug_dds", false))
        names.add("ДДС " + okrug);
    }
    if (service != null && !service.isBlank()) names.add(service);
    StringJoiner result = new StringJoiner(", ");
    names.forEach(result::add);
    return result.toString();
  }

  private static void add(LinkedHashSet<String> names, JsonArray values) {
    if (values != null) for (Object value : values) names.add((String) value);
  }
}
