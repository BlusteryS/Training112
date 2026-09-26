package com.training112.auth;

import com.training112.AppConfig;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.RoutingContext;

public final class RequestGuard {
  private RequestGuard() {}

  public static void jsonWrites(RoutingContext context, AppConfig config) {
    if (context.request().method() == HttpMethod.GET) {
      context.next();
      return;
    }
    String origin = context.request().getHeader("Origin");
    if (!"training112".equals(context.request().getHeader("X-Requested-With"))
        || (origin != null && !config.appOrigin().equals(origin))
        || "cross-site".equals(context.request().getHeader("Sec-Fetch-Site"))) {
      context.fail(new ApiException(403, "forbidden_origin", "Запрос с этого сайта запрещён."));
      return;
    }
    String content = context.request().getHeader("Content-Type");
    if (content == null || !content.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) {
      context.fail(new ApiException(415, "unsupported_media_type", "Отправьте данные в формате JSON."));
      return;
    }
    context.next();
  }
}
