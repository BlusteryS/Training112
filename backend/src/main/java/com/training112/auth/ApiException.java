package com.training112.auth;

public final class ApiException extends RuntimeException {
    private final int status;
    private final String code;

    public ApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }

    public static ApiException unauthorized() {
        return new ApiException(401, "unauthorized", "Войдите в аккаунт, чтобы продолжить.");
    }
}
