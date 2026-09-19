package com.training112;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

public record AppConfig(int port, String dbHost, int dbPort, String dbName, String dbUser,
                        String dbPassword, String appOrigin, boolean secureCookie, Duration sessionTtl) {
    public static AppConfig fromEnvironment() {
        return from(System.getenv());
    }

    static AppConfig from(Map<String, String> env) {
        String origin = env.getOrDefault("APP_ORIGIN", "http://localhost:5173");
        URI uri = URI.create(origin);
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || !uri.getRawPath().isEmpty()) {
            throw new IllegalArgumentException("APP_ORIGIN must be an HTTP(S) origin without a trailing slash");
        }
        String password = env.get("DB_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("DB_PASSWORD is required");
        }
        return new AppConfig(number(env, "PORT", 8080, 1, 65535),
                env.getOrDefault("DB_HOST", "localhost"), number(env, "DB_PORT", 5432, 1, 65535),
                env.getOrDefault("DB_NAME", "training112"), env.getOrDefault("DB_USER", "training112"),
                password, origin, "https".equals(uri.getScheme()),
                Duration.ofHours(number(env, "SESSION_TTL_HOURS", 168, 1, 720)));
    }

    private static int number(Map<String, String> env, String key, int fallback, int min, int max) {
        int value = Integer.parseInt(env.getOrDefault(key, Integer.toString(fallback)));
        if (value < min || value > max) {
            throw new IllegalArgumentException(key + " is outside the allowed range");
        }
        return value;
    }

    @Override
    public String toString() {
        return "AppConfig[port=" + port + ", appOrigin=" + appOrigin + "]";
    }
}
