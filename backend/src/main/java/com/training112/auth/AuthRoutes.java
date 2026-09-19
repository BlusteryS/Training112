package com.training112.auth;

import com.training112.AppConfig;
import io.vertx.core.Future;
import io.vertx.core.http.Cookie;
import io.vertx.core.http.CookieSameSite;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.json.DecodeException;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

public final class AuthRoutes {
    private static final String COOKIE = "training112_session";
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
        router.route("/api/auth/*").handler(context -> {
            context.response().putHeader("Cache-Control", "no-store");
            if (context.request().method() == HttpMethod.POST) {
                String origin = context.request().getHeader("Origin");
                String fetchSite = context.request().getHeader("Sec-Fetch-Site");
                if (!"training112".equals(context.request().getHeader("X-Requested-With"))
                        || (origin != null && !config.appOrigin().equals(origin)) || "cross-site".equals(fetchSite)) {
                    context.fail(new ApiException(403, "forbidden_origin", "Запрос с этого сайта запрещён."));
                    return;
                }
                String contentType = context.request().getHeader("Content-Type");
                if (contentType == null || !contentType.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) {
                    context.fail(new ApiException(415, "unsupported_media_type", "Отправьте данные в формате JSON."));
                    return;
                }
            }
            context.next();
        });
        router.route("/api/auth/*").handler(BodyHandler.create().setBodyLimit(4096).setHandleFileUploads(false));
        router.post("/api/auth/register").handler(context -> authenticate(context, true));
        router.post("/api/auth/login").handler(context -> authenticate(context, false));
        router.get("/api/auth/me").handler(this::currentUser);
        router.post("/api/auth/logout").handler(context -> repository.deleteSession(currentTokenHash(context))
                .onSuccess(ignored -> {
                    context.response().addCookie(cookie("", 0));
                    context.response().setStatusCode(204).end();
                }).onFailure(context::fail));
    }

    private void authenticate(RoutingContext context, boolean registration) {
        Credentials credentials;
        try {
            credentials = Credentials.parse(context.body().asJsonObject(), registration);
        } catch (DecodeException e) {
            context.fail(new ApiException(400, "invalid_json", "Некорректный JSON."));
            return;
        } catch (ApiException e) {
            context.fail(e);
            return;
        }
        String token = SessionToken.create();
        String tokenHash = SessionToken.hash(token);
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plus(config.sessionTtl());
        String previousTokenHash = currentTokenHash(context);
        repository.checkRateLimit(credentials.login()).compose(ignored -> {
            if (registration) {
                return passwords.hash(credentials.password()).compose(hash -> repository.register(
                        credentials.login(), hash, tokenHash, expiresAt, previousTokenHash));
            }
            return repository.findByLogin(credentials.login()).compose(account ->
                    passwords.verify(credentials.password(), account == null ? dummyPasswordHash : account.passwordHash())
                            .compose(valid -> {
                                if (!valid || account == null) {
                                    return Future.failedFuture(new ApiException(401, "invalid_credentials", "Неверный логин или пароль."));
                                }
                                return repository.createSession(account.id(), tokenHash, expiresAt, previousTokenHash).map(account);
                            }));
        }).onSuccess(account -> {
            context.response().addCookie(cookie(token, config.sessionTtl().toSeconds()));
            context.response().setStatusCode(registration ? 201 : 200)
                    .end(new JsonObject().put("user", account.toJson()).encode());
        }).onFailure(context::fail);
    }

    private void currentUser(RoutingContext context) {
        repository.findSession(currentTokenHash(context)).onSuccess(account -> {
            if (account == null) {
                context.response().addCookie(cookie("", 0));
                context.fail(ApiException.unauthorized());
            } else {
                context.response().end(new JsonObject().put("user", account.toJson()).encode());
            }
        }).onFailure(context::fail);
    }

    private Cookie cookie(String token, long maxAge) {
        return Cookie.cookie(COOKIE, token).setPath("/api").setHttpOnly(true)
                .setSameSite(CookieSameSite.STRICT).setSecure(config.secureCookie()).setMaxAge(maxAge);
    }

    private static String currentTokenHash(RoutingContext context) {
        Cookie cookie = context.request().getCookie(COOKIE);
        if (cookie == null || !cookie.getValue().matches("[A-Za-z0-9_-]{43}")) {
            return null;
        }
        return SessionToken.hash(cookie.getValue());
    }
}
