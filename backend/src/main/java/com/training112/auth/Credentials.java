package com.training112.auth;

import io.vertx.core.json.JsonObject;
import java.util.Locale;

public record Credentials(String login, String password) {
    public static Credentials parse(JsonObject body, boolean registration) {
        if (body == null || !(body.getValue("login") instanceof String login)
                || !(body.getValue("password") instanceof String password)) {
            throw new ApiException(400, "invalid_credentials", "Укажите логин и пароль.");
        }
        login = login.trim().toLowerCase(Locale.ROOT);
        if (!login.matches("[a-z0-9_]{3,32}")) {
            throw new ApiException(400, "invalid_login", "Логин: 3–32 латинские буквы, цифры или знак подчёркивания.");
        }
        int length = password.codePointCount(0, password.length());
        if (length > 128 || length < (registration ? 12 : 1)) {
            throw new ApiException(400, "invalid_password", registration
                    ? "Пароль должен содержать от 12 до 128 символов." : "Укажите пароль до 128 символов.");
        }
        return new Credentials(login, password);
    }

    @Override
    public String toString() { return "Credentials[login=" + login + "]"; }
}
