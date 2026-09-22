package com.training112.auth;

import io.vertx.core.http.Cookie;
import io.vertx.ext.web.RoutingContext;

public final class AuthSession {
    public static final String COOKIE = "training112_session";

    private AuthSession() {}

    public static String tokenHash(RoutingContext context) {
        Cookie cookie = context.request().getCookie(COOKIE);
        if (cookie == null || !cookie.getValue().matches("[A-Za-z0-9_-]{43}")) return null;
        return SessionToken.hash(cookie.getValue());
    }
}
