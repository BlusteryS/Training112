package com.training112.cli;

import com.training112.AppConfig;
import com.training112.Database;
import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.Credentials;
import com.training112.auth.PasswordHasher;
import io.vertx.core.Vertx;
import io.vertx.core.VertxOptions;
import io.vertx.sqlclient.Pool;
import java.io.BufferedReader;
import java.io.Console;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;

@Command(name = "create-admin", mixinStandardHelpOptions = true, description = "Создать администратора.")
public final class CreateAdmin implements Callable<Integer> {
    @Parameters(index = "0", arity = "0..1", paramLabel = "LOGIN", description = "Логин администратора.")
    private String login;

    @Option(names = "--password-stdin", description = "Прочитать пароль из стандартного ввода.")
    private boolean passwordStdin;

    public static void main(String[] args) {
        int exitCode = new CommandLine(new CreateAdmin())
                .setExecutionExceptionHandler((error, command, result) -> {
                    Throwable cause = error instanceof ExecutionException ? error.getCause() : error;
                    String message = cause instanceof ApiException || cause instanceof IllegalArgumentException
                            ? cause.getMessage() : "Не удалось создать администратора. Проверьте подключение к БД и запуск backend.";
                    command.getErr().println(message);
                    return CommandLine.ExitCode.SOFTWARE;
                })
                .execute(args);
        System.exit(exitCode);
    }

    @Override
    public Integer call() throws Exception {
        AppConfig config = AppConfig.fromEnvironment();
        Credentials credentials = readCredentials();
        Vertx vertx = Vertx.vertx(new VertxOptions().setEventLoopPoolSize(1).setWorkerPoolSize(2));
        try {
            Pool pool = Database.connect(vertx, config);
            PasswordHasher passwords = new PasswordHasher(vertx);
            AuthRepository.Account account = passwords.hash(credentials.password())
                    .compose(hash -> new AuthRepository(pool).createAdmin(credentials.login(), hash))
                    .toCompletionStage().toCompletableFuture().get(30, TimeUnit.SECONDS);
            System.out.println("Администратор создан: " + account.login());
            return CommandLine.ExitCode.OK;
        } finally {
            vertx.close().toCompletionStage().toCompletableFuture().get(20, TimeUnit.SECONDS);
        }
    }

    private Credentials readCredentials() throws IOException {
        Console console = System.console();
        if (passwordStdin) {
            if (login == null) {
                throw new IllegalArgumentException("Укажите LOGIN при использовании --password-stdin.");
            }
            BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
            return Credentials.forCreation(login, input.readLine());
        }
        if (console == null) {
            throw new IllegalArgumentException("Нужен интерактивный терминал или параметр --password-stdin.");
        }
        String accountLogin = login == null ? console.readLine("Логин: ") : login;
        char[] password = console.readPassword("Пароль: ");
        char[] confirmation = console.readPassword("Повторите пароль: ");
        try {
            if (accountLogin == null || password == null || confirmation == null) {
                throw new IllegalArgumentException("Ввод отменён.");
            }
            if (!Arrays.equals(password, confirmation)) {
                throw new IllegalArgumentException("Пароли не совпадают.");
            }
            return Credentials.forCreation(accountLogin, new String(password));
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            if (confirmation != null) Arrays.fill(confirmation, '\0');
        }
    }
}
