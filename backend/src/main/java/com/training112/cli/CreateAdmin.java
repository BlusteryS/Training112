package com.training112.cli;

import com.training112.AppConfig;
import com.training112.Database;
import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.Credentials;
import com.training112.auth.PasswordHasher;
import io.vertx.core.Vertx;
import io.vertx.core.VertxOptions;
import java.io.Console;
import java.util.Arrays;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

public final class CreateAdmin {
    private CreateAdmin() {}

    public static void main(String[] args) {
        try {
            if (args.length != 0) {
                throw new IllegalArgumentException("Запустите create-admin без параметров. Логин и пароль вводятся в терминале.");
            }
            Credentials credentials = readCredentials();
            create(credentials);
            System.out.println("Администратор создан: " + credentials.login());
        } catch (Exception error) {
            Throwable cause = error instanceof ExecutionException ? error.getCause() : error;
            System.err.println(cause instanceof ApiException || cause instanceof IllegalArgumentException
                    ? cause.getMessage()
                    : "Не удалось создать администратора. Проверьте состояние backend и базы данных.");
            System.exit(1);
        }
    }

    private static void create(Credentials credentials) throws Exception {
        AppConfig config = AppConfig.fromEnvironment();
        Vertx vertx = Vertx.vertx(new VertxOptions().setEventLoopPoolSize(1).setWorkerPoolSize(2));
        try {
            var pool = Database.connect(vertx, config);
            var passwords = new PasswordHasher(vertx);
            try {
                passwords.hash(credentials.password())
                        .compose(hash -> new AuthRepository(pool).createAdmin(credentials.login(), hash))
                        .toCompletionStage().toCompletableFuture().get(30, TimeUnit.SECONDS);
            } finally {
                passwords.close().eventually(pool::close)
                        .toCompletionStage().toCompletableFuture().get(20, TimeUnit.SECONDS);
            }
        } finally {
            vertx.close().toCompletionStage().toCompletableFuture().get(20, TimeUnit.SECONDS);
        }
    }

    private static Credentials readCredentials() {
        Console console = System.console();
        if (console == null || !console.isTerminal()) {
            throw new IllegalArgumentException("Нужен интерактивный терминал: docker compose exec backend create-admin");
        }
        String login = console.readLine("Логин администратора: ");
        char[] password = console.readPassword("Пароль: ");
        char[] confirmation = console.readPassword("Повторите пароль: ");
        try {
            if (login == null || password == null || confirmation == null) {
                throw new IllegalArgumentException("Ввод отменён.");
            }
            if (!Arrays.equals(password, confirmation)) {
                throw new IllegalArgumentException("Пароли не совпадают.");
            }
            return Credentials.forCreation(login, new String(password));
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            if (confirmation != null) Arrays.fill(confirmation, '\0');
        }
    }
}
