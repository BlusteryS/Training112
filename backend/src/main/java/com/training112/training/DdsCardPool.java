package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/** A lesson's immutable cards; each attempt stores the particular card it received. */
public final class DdsCardPool {
  private DdsCardPool() {}

  public static JsonObject pack(JsonArray cards) {
    if (cards.isEmpty() || cards.size() > 30) throw invalid();
    if (cards.size() == 1) return cards.getJsonObject(0);
    return new JsonObject().put("title", "Карточки ДДС: " + cards.size())
        .put("cards", cards);
  }

  public static JsonObject choose(JsonObject lesson, JsonArray previous) {
    JsonArray cards = lesson.getJsonArray("cards");
    if (cards == null) return lesson;
    Map<String, Integer> uses = new HashMap<>();
    for (Object value : previous) {
      if (value instanceof String id) uses.merge(id, 1, Integer::sum);
    }
    int fewest = Integer.MAX_VALUE;
    List<JsonObject> candidates = new ArrayList<>();
    for (Object value : cards) {
      JsonObject card = (JsonObject) value;
      int count = uses.getOrDefault(card.getString("case_id"), 0);
      if (count < fewest) {
        fewest = count;
        candidates.clear();
      }
      if (count == fewest) candidates.add(card);
    }
    if (candidates.size() > 1 && !previous.isEmpty()) {
      String last = previous.getString(previous.size() - 1);
      candidates.removeIf(card -> last.equals(card.getString("case_id")));
    }
    return candidates.get(ThreadLocalRandom.current().nextInt(candidates.size()));
  }

  public static boolean hasSequence(JsonObject lesson) {
    JsonArray cards = lesson == null ? null : lesson.getJsonArray("cards");
    return cards != null && cards.size() > 1;
  }

  private static ApiException invalid() {
    return new ApiException(400, "invalid_dds_card", "Выберите от 1 до 30 карточек ДДС.");
  }
}
