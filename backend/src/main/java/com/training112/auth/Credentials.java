package com.training112.auth;

import io.vertx.core.json.JsonObject;
import java.util.Locale;

public record Credentials(String login, String password, String workstation) {
    public Credentials {
        if (login == null || password == null || workstation == null) {
            throw new ApiException(400, "invalid_credentials", "Укажите логин, пароль и номер АРМ.");
        }
        login = login.trim().toLowerCase(Locale.ROOT);
        if (!login.matches("[a-z0-9_]{3,32}")) {
            throw new ApiException(400, "invalid_login", "Логин: 3–32 латинские буквы, цифры или знак подчёркивания.");
        }
        int length = password.codePointCount(0, password.length());
        if (length > 128 || length < 1) {
            throw new ApiException(400, "invalid_password", "Укажите пароль до 128 символов.");
        }
        workstation = workstation.trim();
        if (!workstation.matches("[0-9]{1,4}")) {
            throw new ApiException(400, "invalid_workstation", "Номер АРМ должен содержать от одной до четырёх цифр.");
        }
    }

    public static Credentials parse(JsonObject body) {
        if (body == null || !(body.getValue("login") instanceof String login)
                || !(body.getValue("password") instanceof String password)
                || !(body.getValue("workstation") instanceof String workstation)) {
            throw new ApiException(400, "invalid_credentials", "Укажите логин, пароль и номер АРМ.");
        }
        return new Credentials(login, password, workstation);
    }

    public static Credentials forCreation(String login, String password) {
        Credentials credentials = new Credentials(login, password, "0");
        if (password.codePointCount(0, password.length()) < 8) {
            throw new ApiException(400, "invalid_password", "Пароль должен содержать от 8 до 128 символов.");
        }
        return credentials;
    }

    @Override
    public String toString() { return "Credentials[login=" + login + "]"; }
}
