package com.training112.auth;

import io.vertx.core.Future;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Tuple;

public final class PlatformSettings {
  private PlatformSettings() {}

  public static Future<Integer> passwordMinLength(Pool pool) {
    return number(pool, "password_min_length", 8, 64);
  }

  public static Future<Integer> sessionHours(Pool pool) {
    return number(pool, "session_hours", 1, 24 * 30);
  }

  public static Future<Boolean> enabled(Pool pool, String key) {
    if (!"service_speech_enabled".equals(key) && !"dds_phone_enabled".equals(key))
      throw new IllegalArgumentException("Unknown service");
    return number(pool, key, 0, 1).map(value -> value == 1);
  }

  public static Future<Integer> auditRetentionDays(Pool pool) {
    return number(pool, "audit_retention_days", 30, 3650);
  }

  private static Future<Integer> number(Pool pool, String key, int min, int max) {
    return pool.preparedQuery("SELECT value FROM platform_setting WHERE key=$1")
        .execute(Tuple.of(key))
        .compose(rows -> {
          if (rows.size() != 1) {
            return Future.failedFuture(new ApiException(500, "settings_missing", "Не задан параметр «" + key + "»."));
          }
          int value;
          try {
            value = Integer.parseInt(rows.iterator().next().getString("value"));
          } catch (NumberFormatException error) {
            return Future.failedFuture(new ApiException(500, "settings_invalid", "Параметр «" + key + "» повреждён."));
          }
          if (value < min || value > max) {
            return Future.failedFuture(new ApiException(500, "settings_invalid", "Параметр «" + key + "» вне допустимого диапазона."));
          }
          return Future.succeededFuture(value);
        });
  }
}
