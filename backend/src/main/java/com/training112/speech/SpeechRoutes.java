package com.training112.speech;

import com.training112.AppConfig;
import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.AuthSession;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.ServerWebSocket;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

public final class SpeechRoutes {
    private final Vertx vertx;
    private final AuthRepository auth;
    private final AppConfig app;
    private final SpeechConfig config;
    private final Set<Connection> connections = new HashSet<>();
    private boolean stopping;

    public SpeechRoutes(Vertx vertx, AuthRepository auth, AppConfig app, SpeechConfig config) {
        this.vertx = vertx;
        this.auth = auth;
        this.app = app;
        this.config = config;
    }

    public void mount(Router router) {
        router.get("/api/speech/session").handler(context -> {
            // Keep the upgrade request unread while authentication awaits the database.
            context.request().pause();
            context.addEndHandler(ignored -> context.request().resume());
            context.next();
        });
        router.route("/api/speech/*").handler(context -> {
            if (stopping) {
                context.fail(new ApiException(503, "shutting_down", "Сервер перезапускается."));
                return;
            }
            auth.findSession(AuthSession.tokenHash(context)).onSuccess(account -> {
                if (account == null) context.fail(ApiException.unauthorized());
                else context.next();
            }).onFailure(context::fail);
        });
        router.get("/api/speech/voices").handler(context -> new Connection(context, null).start());
        router.get("/api/speech/session").handler(context -> {
            if (!app.appOrigin().equals(context.request().getHeader("Origin"))) {
                context.fail(new ApiException(403, "forbidden_origin", "Запрос с этого сайта запрещён."));
                return;
            }
            String voice = context.request().getParam("voice");
            if (voice == null || !voice.matches("[a-z0-9_-]{1,40}")) {
                context.fail(new ApiException(400, "invalid_voice", "Выберите персонажа."));
                return;
            }
            context.request().toWebSocket().onSuccess(socket -> new Connection(context, socket).start())
                    .onFailure(context::fail);
        });
    }

    public Future<Void> close() {
        stopping = true;
        var waits = Set.copyOf(connections).stream().map(Connection::close).toList();
        return Future.all(waits).mapEmpty();
    }

    private final class Connection {
        private final RoutingContext request;
        private final ServerWebSocket socket;
        private final SpeechTransport transport;
        private final String token;
        private long timer = -1;
        private boolean closed;
        private boolean ready;
        private boolean validating;
        private long lastClientActivity = System.nanoTime();
        private final long openedAt = System.nanoTime();

        Connection(RoutingContext request, ServerWebSocket socket) {
            this.request = request;
            this.socket = socket;
            token = AuthSession.tokenHash(request);
            transport = new SpeechTransport(config, Vertx.currentContext(), this::receive);
        }

        void start() {
            connections.add(this);
            JsonObject command = new JsonObject().put("type", socket == null ? "voices" : "start")
                    .put("version", 1);
            if (socket != null) {
                command.put("voice", request.request().getParam("voice"));
                socket.setWriteQueueMaxSize(32768);
                socket.binaryMessageHandler(data -> {
                    lastClientActivity = System.nanoTime();
                    if (!ready || data.length() != 1024
                            || !transport.send(new SpeechTransport.Message("audio", data.getBytes()))) {
                        fail("Передача микрофона прервана.");
                    }
                });
                socket.textMessageHandler(text -> {
                    lastClientActivity = System.nanoTime();
                    try {
                        JsonObject event = new JsonObject(text);
                        switch (event.getString("type", "")) {
                            case "end" -> close();
                            case "played" -> {
                                Object generation = event.getValue("generation");
                                Object id = event.getValue("id");
                                if (!ready || !unsignedInteger(generation) || !unsignedInteger(id)
                                        || !transport.send(SpeechTransport.Message.command(event))) {
                                    fail("Некорректное подтверждение воспроизведения.");
                                }
                            }
                            default -> fail("Неизвестная команда сеанса.");
                        }
                    } catch (RuntimeException error) {
                        fail("Некорректная команда сеанса.");
                    }
                });
                socket.closeHandler(ignored -> close());
                socket.exceptionHandler(error -> close());
            } else {
                request.response().closeHandler(ignored -> close());
            }
            timer = vertx.setPeriodic(5_000, ignored -> maintain());
            transport.start(command, ThreadLocalRandom.current().nextInt(config.endpoints().size()));
            if (stopping || (socket != null && socket.isClosed())) close();
        }

        void maintain() {
            long now = System.nanoTime();
            if ((!ready && now - openedAt > 90_000_000_000L)
                    || (ready && now - lastClientActivity > 15_000_000_000L)) {
                fail("Сеанс завершён: соединение не отвечает.");
                return;
            }
            if (socket == null || validating) return;
            validating = true;
            auth.findSession(token).onComplete(result -> {
                validating = false;
                if (result.failed() || result.result() == null) fail("Войдите в аккаунт повторно.");
            });
        }

        void receive(SpeechTransport.Message message) {
            if (closed) return;
            if (socket == null) {
                JsonObject event = message.event();
                if ("voices".equals(event.getString("type"))) {
                    request.response().end(event.encode());
                } else {
                    request.fail(new ApiException(503, "speech_unavailable", event.getString("message", "Речевой сервис недоступен.")));
                }
                close();
                return;
            }
            if (socket.writeQueueFull()) {
                fail("Соединение не успевает воспроизводить звук.");
                return;
            }
            if ("audio".equals(message.kind())) {
                socket.writeBinaryMessage(Buffer.buffer(message.payload())).onFailure(error -> close());
                return;
            }
            JsonObject event = message.event();
            String type = event.getString("type");
            if ("ready".equals(type)) {
                ready = true;
                lastClientActivity = System.nanoTime();
            }
            socket.writeTextMessage(event.encode()).onComplete(result -> {
                if (result.failed() || Set.of("closed", "unavailable", "busy", "ended").contains(type)) close();
            });
        }

        void fail(String message) {
            if (closed) return;
            if (socket == null) {
                request.fail(new ApiException(503, "speech_unavailable", message));
            } else {
                socket.writeTextMessage(new JsonObject().put("type", "unavailable").put("message", message).encode());
            }
            close();
        }

        Future<Void> close() {
            if (!closed) {
                closed = true;
                connections.remove(this);
                if (timer != -1) vertx.cancelTimer(timer);
                if (socket != null && !socket.isClosed()) socket.close();
            }
            return Future.fromCompletionStage(transport.close(), Vertx.currentContext());
        }
    }

    private static boolean unsignedInteger(Object value) {
        return (value instanceof Integer || value instanceof Long)
                && ((Number) value).longValue() >= 0 && ((Number) value).longValue() <= 0xffff_ffffL;
    }
}
