package com.training112;

import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.pgclient.PgBuilder;
import io.vertx.pgclient.PgConnectOptions;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.PoolOptions;
import org.flywaydb.core.Flyway;

public final class Database {
    private Database() {}

    public static Future<Void> migrate(Vertx vertx, AppConfig config) {
        return vertx.executeBlocking(() -> {
            Flyway.configure()
                    .dataSource("jdbc:postgresql://" + config.dbHost() + ":" + config.dbPort() + "/" + config.dbName(),
                            config.dbUser(), config.dbPassword())
                    .locations("classpath:db/migration")
                    .cleanDisabled(true)
                    .load().migrate();
            return null;
        });
    }

    public static Pool connect(Vertx vertx, AppConfig config) {
        return PgBuilder.pool().using(vertx)
                .connectingTo(new PgConnectOptions().setHost(config.dbHost()).setPort(config.dbPort())
                        .setDatabase(config.dbName()).setUser(config.dbUser()).setPassword(config.dbPassword())
                        .setCachePreparedStatements(true))
                .with(new PoolOptions().setMaxSize(10).setMaxWaitQueueSize(100))
                .build();
    }
}
