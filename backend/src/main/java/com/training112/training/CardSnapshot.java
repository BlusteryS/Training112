package com.training112.training;

import io.vertx.core.json.JsonObject;

/** The card a DDS dispatcher receives. It is copied from the operator scenario and is not edited afterwards. */
public final class CardSnapshot {
  private CardSnapshot() {}

  public static JsonObject from(JsonObject document, String service) {
    JsonObject source = document == null ? new JsonObject() : document;
    JsonObject facts = source.getJsonObject("facts", new JsonObject());
    return new JsonObject()
        .put("caller_name", text(facts, "caller_name"))
        .put("phone", text(facts, "phone"))
        .put("address", text(facts, "address"))
        .put("description", text(facts, "incident"))
        .put("victims", text(facts, "victims"))
        .put("incident_code", text(source, "title"))
        .put("origin", text(source, "origin"))
        .put("services", service == null ? "" : service);
  }

  private static String text(JsonObject object, String key) {
    Object value = object.getValue(key);
    return value instanceof String text ? text : "";
  }
}
