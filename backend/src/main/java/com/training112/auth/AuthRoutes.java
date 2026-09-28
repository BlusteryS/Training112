package com.training112.auth;

import com.training112.AppConfig;
import com.training112.ApiRequest;
import io.vertx.core.Future;
import io.vertx.core.http.Cookie;
import io.vertx.core.http.CookieSameSite;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

public final class AuthRoutes {
    private final AuthRepository repository;
    private final PasswordHasher passwords;
    private final AppConfig config;
    private final String dummyPasswordHash;

    public AuthRoutes(AuthRepository repository, PasswordHasher passwords, AppConfig config, String dummyPasswordHash) {
        this.repository = repository;
        this.passwords = passwords;
        this.config = config;
        this.dummyPasswordHash = dummyPasswordHash;
    }

    public void mount(Router router) {
        router.route("/api/auth/*").handler(context -> RequestGuard.jsonWrites(context, config));
        router.route("/api/auth/*").handler(BodyHandler.create().setBodyLimit(4096).setHandleFileUploads(false));
        router.post("/api/auth/login").handler(this::login);
        router.get("/api/auth/me").handler(this::currentUser);
        router.post("/api/auth/logout").handler(context -> repository.deleteSession(AuthSession.tokenHash(context))
                .onSuccess(ignored -> {
                    context.response().addCookie(cookie("", 0));
                    context.response().setStatusCode(204).end();
                }).onFailure(context::fail));
    }

    private void login(RoutingContext context) {
        Credentials credentials;
        try {
            credentials = Credentials.parse(ApiRequest.body(context));
        } catch (ApiException e) {
            context.fail(e);
            return;
        }
        String token = SessionToken.create();
        String tokenHash = SessionToken.hash(token);
        String previousTokenHash = AuthSession.tokenHash(context);
        PlatformSettings.sessionHours(repository.pool())
                .compose(hours -> {
                    OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusHours(hours);
                    return repository.checkRateLimit(credentials.login())
                            .compose(ignored -> repository.findByLogin(credentials.login()))
                            .compose(account -> passwords.verify(credentials.password(),
                                    account == null ? dummyPasswordHash : account.passwordHash()).compose(valid -> {
                                if (!valid || account == null) {
                                    return Future.failedFuture(new ApiException(401, "invalid_credentials", "Неверный логин или пароль."));
                                }
                                AuthRepository.Account identity = account.identity();
                                return repository.createSession(identity.id(), tokenHash, expiresAt, previousTokenHash,
                                        credentials.workstation(), identity.login())
                                        .map(new AuthRepository.Account(identity.id(), identity.login(),
                                                identity.role(), credentials.workstation()));
                            }))
                            .onSuccess(account -> {
                                context.response().addCookie(cookie(token, hours * 3600L));
                                context.response().end(new JsonObject().put("user", account.toJson()).encode());
                            });
                })
                .onFailure(context::fail);
    }

    private void currentUser(RoutingContext context) {
        repository.findSession(AuthSession.tokenHash(context)).onSuccess(account -> {
            if (account == null) {
                context.response().addCookie(cookie("", 0));
                context.fail(ApiException.unauthorized());
            } else {
                context.response().end(new JsonObject().put("user", account.toJson()).encode());
            }
        }).onFailure(context::fail);
    }

    private Cookie cookie(String token, long maxAge) {
        return Cookie.cookie(AuthSession.COOKIE, token).setPath("/api").setHttpOnly(true)
                .setSameSite(CookieSameSite.STRICT).setSecure(config.secureCookie()).setMaxAge(maxAge);
    }

}
