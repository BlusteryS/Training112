package com.training112;

import io.vertx.core.Vertx;
import java.util.concurrent.TimeUnit;
import org.slf4j.LoggerFactory;

public final class Main {
    private Main() {}

    public static void main(String[] args) {
        AppConfig config = AppConfig.fromEnvironment();
        Vertx vertx = Vertx.vertx(new io.vertx.core.VertxOptions()
                .setEventLoopPoolSize(2).setWorkerPoolSize(4));
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                vertx.close().toCompletionStage().toCompletableFuture().get(20, TimeUnit.SECONDS);
            } catch (Exception e) {
                LoggerFactory.getLogger(Main.class).error("Shutdown failed", e);
            }
        }, "shutdown"));
        vertx.deployVerticle(new ApiVerticle(config)).onFailure(error -> {
            LoggerFactory.getLogger(Main.class).error("API startup failed", error);
            vertx.close().onComplete(ignored -> System.exit(1));
        });
    }
}
