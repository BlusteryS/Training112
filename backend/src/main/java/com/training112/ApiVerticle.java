package com.training112;

import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.AuthRoutes;
import com.training112.auth.PasswordHasher;
import com.training112.speech.SpeechConfig;
import com.training112.speech.SpeechRoutes;
import io.vertx.core.Future;
import io.vertx.core.VerticleBase;
import io.vertx.core.http.HttpServer;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.sqlclient.Pool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ApiVerticle extends VerticleBase {
    private static final Logger LOG = LoggerFactory.getLogger(ApiVerticle.class);
    private final AppConfig config;
    private Pool pool;
    private PasswordHasher passwords;
    private HttpServer server;
    private SpeechRoutes speech;
    private final SpeechConfig speechConfig = SpeechConfig.fromEnvironment();
    private long cleanupTimer = -1;

    public ApiVerticle(AppConfig config) { this.config = config; }

    @Override
    public Future<?> start() {
        return Database.migrate(vertx, config).compose(ignored -> {
            pool = Database.connect(vertx, config);
            passwords = new PasswordHasher(vertx);
            return passwords.hash(java.util.UUID.randomUUID().toString());
        }).compose(dummyHash -> {
            AuthRepository repository = new AuthRepository(pool);
            Router router = Router.router(vertx);
            router.route().handler(context -> {
                context.response().putHeader("Content-Type", "application/json; charset=utf-8")
                        .putHeader("X-Content-Type-Options", "nosniff").putHeader("Cache-Control", "no-store");
                context.next();
            });
            router.get("/api/health/live").handler(context -> context.response().end("{\"status\":\"up\"}"));
            router.get("/api/health/ready").handler(context -> pool.query("SELECT 1").execute()
                    .onSuccess(ignored -> context.response().end("{\"status\":\"up\"}"))
                    .onFailure(error -> context.fail(new ApiException(503, "database_unavailable", "База данных недоступна."))));
            new AuthRoutes(repository, passwords, config, dummyHash).mount(router);
            speech = new SpeechRoutes(vertx, repository, config, speechConfig);
            speech.mount(router);
            router.route().handler(context -> context.fail(new ApiException(404, "not_found", "Маршрут не найден.")));
            router.route().failureHandler(context -> {
                Throwable failure = context.failure();
                int status = failure instanceof ApiException error ? error.status()
                        : context.statusCode() >= 400 ? context.statusCode() : 500;
                String code = failure instanceof ApiException error ? error.code() : "request_failed";
                String message = failure instanceof ApiException error ? error.getMessage()
                        : status == 413 ? "Слишком большой запрос." : status < 500 ? "Некорректный запрос." : "Внутренняя ошибка сервера.";
                if (status >= 500) {
                    LOG.error("Request failed: {} {}", context.request().method(), context.normalizedPath(), failure);
                }
                if (status == 429 || status == 503) {
                    context.response().putHeader("Retry-After", status == 429 ? "900" : "5");
                }
                context.response().setStatusCode(status).end(new JsonObject().put("error",
                        new JsonObject().put("code", code).put("message", message)).encode());
            });
            cleanupTimer = vertx.setPeriodic(300_000, ignored -> repository.cleanup()
                    .onFailure(error -> LOG.error("Session cleanup failed", error)));
            return vertx.createHttpServer(new HttpServerOptions().setHost("0.0.0.0").setPort(config.port())
                            .setIdleTimeout(120).setMaxHeaderSize(8192)
                            .setMaxWebSocketFrameSize(4096).setMaxWebSocketMessageSize(4096))
                    .requestHandler(router).listen().onSuccess(httpServer -> {
                        server = httpServer;
                        LOG.info("API listening on port {}", server.actualPort());
                    });
        });
    }

    public int port() { return server.actualPort(); }

    @Override
    public Future<?> stop() {
        if (cleanupTimer != -1) vertx.cancelTimer(cleanupTimer);
        Future<Void> stopServer = (speech == null ? Future.<Void>succeededFuture() : speech.close())
                .compose(ignored -> server == null ? Future.succeededFuture() : server.close());
        return stopServer.eventually(() -> pool == null ? Future.succeededFuture() : pool.close())
                .eventually(() -> passwords == null ? Future.succeededFuture() : passwords.close());
    }
}
