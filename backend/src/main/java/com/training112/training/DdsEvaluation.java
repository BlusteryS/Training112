package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/** Evaluates actions recorded in one DDS attempt, not the operator's card text. */
public final class DdsEvaluation {
  private DdsEvaluation() {}

  public static JsonObject evaluate(JsonObject template, JsonArray events, String attemptStatus) {
    String expected = template == null ? "accepted" : template.getString("expected_primary", "accepted");
    String outcome = template == null ? "completed" : template.getString("outcome", "completed");
    JsonObject first = null;
    boolean crew = false;
    boolean dispatched = false;
    boolean arrived = false;
    boolean working = false;
    boolean terminal = false;
    for (Object item : events) {
      JsonObject event = (JsonObject) item;
      String type = event.getString("type");
      JsonObject payload = event.getJsonObject("payload", new JsonObject());
      if ("dds.crew.select".equals(type)) crew = true;
      if (!"card.status".equals(type)) continue;
      String status = payload.getString("status", "");
      if (first == null && ("accepted".equals(status) || "rejected".equals(status))) first = event;
      if ("dispatched".equals(status)) dispatched = true;
      if ("arrived".equals(status)) arrived = true;
      if ("working".equals(status)) working = true;
      if (outcome.equals(status) && !payload.getString("comment", "").isBlank()) terminal = true;
    }
    JsonArray checks = new JsonArray();
    add(checks, "primary", "Первичный статус соответствует полномочиям службы", 25,
        first != null && expected.equals(first.getJsonObject("payload").getString("status")));
    add(checks, "deadline", "Первичный статус установлен в течение 30 секунд", 15,
        first != null && first.getLong("elapsed_ms", Long.MAX_VALUE) <= 30_000);
    if ("rejected".equals(expected)) {
      add(checks, "reason", "Причина отказа указана в комментарии", 10,
          first != null && "rejected".equals(first.getJsonObject("payload").getString("status"))
              && !first.getJsonObject("payload").getString("comment", "").isBlank());
    } else {
      add(checks, "acceptance", "Карточка принята службой", 10, first != null);
    }
    add(checks, "crew", "Бригада выбрана диспетчером", 10, crew);
    if ("refused".equals(outcome)) {
      add(checks, "result", "Отказ отмечен после доклада с указанием причины", 40, terminal);
    } else {
      add(checks, "departure", "Выезд отмечен после доклада", 10, dispatched);
      add(checks, "arrival", "Прибытие отмечено после доклада", 10, arrived);
      add(checks, "work", "Проведение работ отмечено после доклада", 10, working);
      add(checks, "result", "Итог работ сохранён с комментарием", 10, terminal);
    }
    int earned = 0;
    JsonArray recommendations = new JsonArray();
    for (Object item : checks) {
      JsonObject check = (JsonObject) item;
      if ("passed".equals(check.getString("status"))) earned += check.getInteger("weight");
      else recommendations.add("Повторите: " + check.getString("description"));
    }
    return new JsonObject().put("schema_version", 1).put("checks", checks)
        .put("earned", earned).put("possible", 100).put("score", earned)
        .put("requires_review", false).put("recommendations", recommendations)
        .put("attempt_status", attemptStatus);
  }

  private static void add(JsonArray checks, String id, String description, int weight, boolean passed) {
    checks.add(new JsonObject().put("id", id).put("description", description)
        .put("weight", weight).put("status", passed ? "passed" : "failed"));
  }
}
