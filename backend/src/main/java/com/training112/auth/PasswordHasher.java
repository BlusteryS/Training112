package com.training112.auth;

import com.password4j.Argon2Function;
import com.password4j.Password;
import com.password4j.types.Argon2;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.WorkerExecutor;
import java.util.concurrent.Callable;
import java.util.concurrent.Semaphore;

public final class PasswordHasher {
    private static final Argon2Function FUNCTION = Argon2Function.getInstance(19456, 2, 1, 32, Argon2.ID);
    private final WorkerExecutor workers;
    private final Semaphore capacity = new Semaphore(16);

    public PasswordHasher(Vertx vertx) {
        workers = vertx.createSharedWorkerExecutor("password-hashing", 4);
    }

    public Future<String> hash(String password) {
        return submit(() -> Password.hash(password).addRandomSalt(16).with(FUNCTION).getResult());
    }

    public Future<Boolean> verify(String password, String hash) {
        return submit(() -> Password.check(password, hash).with(FUNCTION));
    }

    private <T> Future<T> submit(Callable<T> action) {
        if (!capacity.tryAcquire()) {
            return Future.failedFuture(new ApiException(503, "auth_busy", "Сервис занят. Попробуйте через несколько секунд."));
        }
        return workers.executeBlocking(action, false).andThen(ignored -> capacity.release());
    }

    public Future<Void> close() { return workers.close(); }
}
