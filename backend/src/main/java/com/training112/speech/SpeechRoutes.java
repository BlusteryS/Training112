package com.training112.speech;

import com.training112.AppConfig;
import com.training112.auth.ApiException;
import com.training112.auth.AuthRepository;
import com.training112.auth.AuthRepository.Account;
import com.training112.auth.AuthSession;
import com.training112.auth.PlatformSettings;
import com.training112.training.TrainingRepository;
import com.training112.training.TrainingRoutes;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.eventbus.MessageConsumer;
import io.vertx.core.http.ServerWebSocket;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.sqlclient.Pool;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Reattachment preserves the live DEALER/socket/node. No replay into another provider. */
public final class SpeechRoutes {
  private final Vertx vertx;
  private final AuthRepository auth;
  private final AppConfig app;
  private final SpeechConfig config;
  private final TrainingRepository training;
  private final Pool pool;
  private final Map<UUID, Connection> calls = new HashMap<>();
  private final Set<UUID> attaching = new java.util.HashSet<>();
  private MessageConsumer<String> completed;
  private boolean stopping;

  public SpeechRoutes(
      Vertx vertx,
      AuthRepository auth,
      AppConfig app,
      SpeechConfig config,
      TrainingRepository training, Pool pool) {
    this.vertx = vertx;
    this.auth = auth;
    this.app = app;
    this.config = config;
    this.training = training;
    this.pool = pool;
  }

  public void mount(Router router) {
    completed =
        vertx
            .eventBus()
            .consumer(
                "training.attempt.closed",
                message -> {
                  Connection connection = calls.get(UUID.fromString(message.body()));
                  if (connection != null) {
                    connection.forward(new JsonObject().put("type", "ended")
                        .put("message", "Учебная попытка завершена."));
                    connection.close(false);
                  }
                });
    router
        .get("/api/speech/session")
        .handler(
            context -> {
              context.request().pause();
              context.addEndHandler(ignored -> context.request().resume());
              if (stopping) {
                context.fail(new ApiException(503, "shutting_down", "Сервер перезапускается."));
                return;
              }
              if (!app.appOrigin().equals(context.request().getHeader("Origin"))) {
                context.fail(
                    new ApiException(403, "forbidden_origin", "Запрос с этого сайта запрещён."));
                return;
              }
              UUID attempt = TrainingRoutes.uuid(context.request().getParam("attempt_id"));
              if (!attaching.add(attempt)) {
                context.fail(
                    new ApiException(409, "already_attaching", "Подключение уже выполняется."));
                return;
              }
              String token = AuthSession.tokenHash(context);
              auth.findSession(token)
                  .compose(
                      actor -> {
                        if (actor == null) return Future.failedFuture(ApiException.unauthorized());
                        return PlatformSettings.enabled(pool, "service_speech_enabled")
                            .compose(enabled -> enabled || calls.containsKey(attempt) ? training.speechAdmission(actor, attempt)
                                : Future.failedFuture(new ApiException(503, "speech_disabled", "Учебные звонки временно отключены.")))
                            .compose(
                                admission -> attach(context, actor, token, attempt, admission));
                      })
                  .onComplete(
                      result -> {
                        attaching.remove(attempt);
                        if (result.failed()) context.fail(result.cause());
                      });
            });
  }

  private Future<Void> attach(
      RoutingContext request, Account actor, String token, UUID attempt, JsonObject admission) {
    Connection existing = calls.get(attempt);
    if (existing != null && existing.socket != null)
      return Future.failedFuture(
          new ApiException(409, "already_connected", "Попытка уже подключена."));
    if (existing == null && !"created".equals(admission.getString("status"))) {
      return training
          .terminate(attempt, true)
          .compose(
              ignored ->
                  Future.failedFuture(
                      new ApiException(
                          409, "session_lost", "Речевой сеанс потерян. Начните новую попытку.")));
    }
    return request
        .request()
        .toWebSocket()
        .map(
            socket -> {
              if (stopping || (existing != null && existing.closed)) {
                socket.close();
                return null;
              }
              if (existing != null) existing.attach(socket, token, true);
              else {
                Connection connection = new Connection(attempt, actor);
                calls.put(attempt, connection);
                connection.attach(socket, token, false);
                connection.transport.start(
                    new JsonObject()
                        .put("type", "start")
                        .put("version", 2)
                        .put("attempt_id", attempt.toString())
                        .put("artifact", admission.getString("artifact"))
                        .put("sha256", admission.getString("sha256")));
                connection.timer = vertx.setPeriodic(5_000, ignored -> connection.maintain());
              }
              return null;
            });
  }

  public Future<Void> close() {
    stopping = true;
    if (completed != null) completed.unregister();
    return Future.all(
            java.util.List.copyOf(calls.values()).stream().map(c -> c.close(true)).toList())
        .mapEmpty();
  }

  private final class Connection {
    final UUID attempt;
    final Account actor;
    final SpeechTransport transport;
    ServerWebSocket socket;
    String token;
    boolean ready, closed, checking;
    long timer = -1, grace = -1, lastActivity = System.nanoTime();
    int pendingJournal;
    Future<Void> journal = Future.succeededFuture();
    Future<Void> closing;

    Connection(UUID attempt, Account actor) {
      this.attempt = attempt;
      this.actor = actor;
      transport = new SpeechTransport(config, Vertx.currentContext(), this::receive);
    }

    void attach(ServerWebSocket next, String sessionToken, boolean resume) {
      socket = next;
      token = sessionToken;
      lastActivity = System.nanoTime();
      if (grace != -1) {
        vertx.cancelTimer(grace);
        grace = -1;
      }
      next.setWriteQueueMaxSize(32768);
      next.binaryMessageHandler(
          data -> {
            if (socket != next || closed) return;
            lastActivity = System.nanoTime();
            if (!ready
                || data.length() != 1024
                || !transport.send(new SpeechTransport.Message("audio", data.getBytes())))
              fail("audio_overflow");
          });
      next.textMessageHandler(
          text -> {
            if (socket != next || closed) return;
            lastActivity = System.nanoTime();
            try {
              JsonObject message = new JsonObject(text);
              switch (message.getString("type", "")) {
                case "ping" -> next.writeTextMessage(new JsonObject().put("type", "pong").encode());
                case "end" -> {
                  Object failed = message.getValue("failed", false);
                  if (!(failed instanceof Boolean)) {
                    fail("invalid_command");
                    return;
                  }
                  close((Boolean) failed);
                }
                case "played" -> {
                  if (!ready
                      || !uint(message.getValue("id"))
                      || !uint(message.getValue("generation"))) {
                    fail("invalid_ack");
                    return;
                  }
                  send(
                      new JsonObject()
                          .put("type", "played")
                          .put("id", message.getValue("id"))
                          .put("generation", message.getValue("generation")));
                }
                default -> fail("unknown_command");
              }
            } catch (RuntimeException error) {
              fail("invalid_command");
            }
          });
      next.closeHandler(ignored -> detach(next));
      next.exceptionHandler(error -> detach(next));
      if (resume) {
        ready = false;
        send(new JsonObject().put("type", "resume"));
      }
    }

    void detach(ServerWebSocket previous) {
      if (closed || socket != previous) return;
      socket = null;
      previous.close();
      if (!ready) {
        close(true);
        return;
      }
      ready = false;
      send(new JsonObject().put("type", "suspend"));
      grace = vertx.setTimer(30_000, ignored -> close(true));
    }

    void maintain() {
      if (closed) return;
      if (socket != null && System.nanoTime() - lastActivity > 15_000_000_000L) detach(socket);
      if (checking) return;
      checking = true;
      auth.findSession(token)
          .compose(
              account -> {
                if (account == null || !account.id().equals(actor.id()))
                  return Future.failedFuture(ApiException.unauthorized());
                return training.attempt(actor, attempt);
              })
          .onComplete(
              result -> {
                checking = false;
                if (result.failed()) fail("authorization_lost");
                else if (Set.of("completed", "failed")
                    .contains(result.result().getString("status"))) close(false);
              });
    }

    void send(JsonObject command) {
      if (!transport.send(SpeechTransport.Message.command(command))) fail("transport_overflow");
    }

    void receive(SpeechTransport.Message message) {
      if (closed) return;
      if ("audio".equals(message.kind())) {
        if (socket != null) {
          if (socket.writeQueueFull()) {
            fail("playback_overflow");
            return;
          }
          ServerWebSocket target = socket;
          target
              .writeBinaryMessage(Buffer.buffer(message.payload()))
              .onFailure(error -> detach(target));
        }
        return;
      }
      JsonObject event = message.event();
      String type = event.getString("type", "");
      if (Set.of("ready", "resumed").contains(type)) ready = true;
      if (!Set.of("audio_stop", "pong", "listening").contains(type)) {
        if (++pendingJournal > 64) {
          fail("journal_overflow");
          return;
        }
        journal =
            journal
                .compose(ignored -> training.speechEvent(attempt, type, event))
                .onComplete(ignored -> pendingJournal--);
        journal.onFailure(error -> fail("journal_failed"));
      }
      if (Set.of("ready", "resumed").contains(type)) {
        journal.onSuccess(ignored -> forward(event));
      } else forward(event);
      if ("ended".equals(type)) close(false);
      else if (Set.of("unavailable", "busy", "closed").contains(type)) close(true);
    }

    void forward(JsonObject event) {
      if (closed || socket == null) return;
      ServerWebSocket target = socket;
      if (target.writeQueueFull()) {
        fail("playback_overflow");
        return;
      }
      target.writeTextMessage(event.encode()).onFailure(error -> detach(target));
    }

    void fail(String code) {
      if (closed) return;
      if (socket != null)
        socket.writeTextMessage(
            new JsonObject().put("type", "unavailable").put("code", code)
                .put("message", switch (code) {
                  case "authorization_lost" -> "Доступ к звонку потерян. Войдите в систему повторно.";
                  case "audio_overflow", "playback_overflow", "transport_overflow", "journal_overflow" ->
                      "Звонок остановлен: сервер или соединение перегружены. Повторите попытку позже.";
                  default -> "Звонок остановлен из-за ошибки соединения. Повторите попытку.";
                }).encode());
      close(true);
    }

    Future<Void> close(boolean failed) {
      if (closed) return closing == null ? Future.succeededFuture() : closing;
      closed = true;
      calls.remove(attempt, this);
      if (timer != -1) vertx.cancelTimer(timer);
      if (grace != -1) vertx.cancelTimer(grace);
      if (socket != null) socket.close();
      closing =
          Future.fromCompletionStage(transport.close(), Vertx.currentContext())
              .compose(ignored -> journal.recover(error -> Future.succeededFuture()))
              .compose(ignored -> training.terminate(attempt, failed));
      return closing;
    }
  }

  private static boolean uint(Object value) {
    return (value instanceof Integer || value instanceof Long)
        && ((Number) value).longValue() >= 0
        && ((Number) value).longValue() <= 0xFFFFFFFFL;
  }
}
