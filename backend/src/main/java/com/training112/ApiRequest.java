package com.training112;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import java.util.UUID;

/** Values shared by the training and administration APIs. */
public final class ApiRequest {
  private ApiRequest() {}

  public static JsonObject body(RoutingContext context) {
    JsonObject value;
    try {
      value = context.body().asJsonObject();
    } catch (RuntimeException error) {
      throw invalid();
    }
    if (value == null) throw invalid();
    return value;
  }

  public static String text(RoutingContext context, String key, int maxLength) {
    Object value = body(context).getValue(key);
    if (!(value instanceof String text) || text.isBlank() || text.length() > maxLength)
      throw invalid();
    return text;
  }

  public static UUID id(RoutingContext context) {
    return uuid(context.pathParam("id"));
  }

  public static UUID uuid(JsonObject object, String key) {
    Object value = object.getValue(key);
    return uuid(value instanceof String text ? text : null);
  }

  public static UUID uuid(String value) {
    UUID id;
    try {
      id = UUID.fromString(value);
    } catch (IllegalArgumentException | NullPointerException error) {
      throw invalid();
    }
    if (!id.toString().equalsIgnoreCase(value)) throw invalid();
    return id;
  }

  private static ApiException invalid() {
    return new ApiException(400, "invalid_request", "Некорректный запрос.");
  }
}
