package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/** Evaluates actions recorded in one DDS attempt, not the operator's card text. */
public final class DdsEvaluation {
  private DdsEvaluation() {}

  public static JsonObject evaluate(JsonObject template, JsonArray events, String attemptStatus) {
    String expected = template.getString("expected_primary");
    String outcome = template.getString("outcome");
    JsonObject first = null;
    JsonObject opened = null;
    boolean crew = false;
    boolean supervisorRefusal = false;
    boolean dispatched = false;
    boolean arrived = false;
    boolean working = false;
    boolean terminal = false;
    for (Object item : events) {
      JsonObject event = (JsonObject) item;
      String type = event.getString("type");
      JsonObject payload = event.getJsonObject("payload", new JsonObject());
      if (opened == null && "card.status".equals(type)
          && "received".equals(payload.getString("status"))) opened = event;
      if ("dds.crew.select".equals(type)) crew = true;
      if ("dds.phone.report".equals(type) && "supervisor".equals(payload.getString("party"))
          && "refused".equals(payload.getString("report_status"))) supervisorRefusal = true;
      if (!"card.status".equals(type)) continue;
      String status = payload.getString("status", "");
      if (first == null && ("accepted".equals(status) || "rejected".equals(status))) first = event;
      if ("dispatched".equals(status)) dispatched = true;
      if ("arrived".equals(status)) arrived = true;
      if ("working".equals(status)) working = true;
      if (outcome.equals(status) && !payload.getString("comment", "").isBlank()) terminal = true;
    }
    JsonArray checks = new JsonArray();
    boolean rejected = "rejected".equals(expected);
    add(checks, "primary", "Первичный статус соответствует полномочиям службы", rejected ? 50 : 25,
        first != null && expected.equals(first.getJsonObject("payload").getString("status")));
    add(checks, "open_deadline", "Карточка открыта в течение 30 секунд после поступления",
        rejected ? 20 : 15, opened != null && opened.getLong("elapsed_ms", Long.MAX_VALUE) <= 30_000);
    add(checks, "first_record", "Первый статус внесён в течение 3 минут",
        rejected ? 30 : 10, first != null && first.getLong("elapsed_ms", Long.MAX_VALUE) <= 180_000);
    if (rejected) return result(checks, attemptStatus);
    add(checks, "crew", "Бригада назначена либо отказ подтверждён руководителем", 10,
        crew || "refused".equals(outcome) && supervisorRefusal);
    if ("refused".equals(outcome)) {
      add(checks, "result", "Отказ отмечен после доклада с указанием причины", 40, terminal);
    } else {
      add(checks, "departure", "Выезд отмечен после доклада", 10, dispatched);
      add(checks, "arrival", "Прибытие отмечено после доклада", 10, arrived);
      add(checks, "work", "Проведение работ отмечено после доклада", 10, working);
      add(checks, "result", "Итог работ сохранён с комментарием", 10, terminal);
    }
    return result(checks, attemptStatus);
  }

  private static JsonObject result(JsonArray checks, String attemptStatus) {
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
