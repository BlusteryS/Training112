package com.training112.speech;

import io.vertx.core.Context;
import io.vertx.core.json.JsonObject;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.zeromq.SocketType;
import org.zeromq.ZContext;
import org.zeromq.ZMQ;

/** One thread owns its socket. The peer is always the local Speech process. */
public final class SpeechTransport {
  public record Message(String kind, byte[] payload) {
    public static Message command(JsonObject value) {
      return new Message("command", value.encode().getBytes(StandardCharsets.UTF_8));
    }

    public static Message event(JsonObject value) {
      return new Message("event", value.encode().getBytes(StandardCharsets.UTF_8));
    }

    public JsonObject event() {
      return new JsonObject(new String(payload, StandardCharsets.UTF_8));
    }
  }

  private final SpeechConfig config;
  private final Context context;
  private final Consumer<Message> incoming;
  private final ArrayBlockingQueue<Message> outgoing = new ArrayBlockingQueue<>(64);
  private final AtomicInteger deliveries = new AtomicInteger();
  private final CompletableFuture<Void> terminated = new CompletableFuture<>();
  private volatile boolean closed;

  public SpeechTransport(SpeechConfig config, Context context, Consumer<Message> incoming) {
    this.config = config;
    this.context = context;
    this.incoming = incoming;
  }

  public void start(JsonObject command) {
    Thread.ofVirtual().name("speech-transport").start(() -> run(command));
  }

  public boolean send(Message message) {
    return !closed && outgoing.offer(message);
  }

  public CompletableFuture<Void> close() {
    closed = true;
    return terminated;
  }

  private void deliver(Message message) {
    if (closed) return;
    if (deliveries.incrementAndGet() > 64) {
      deliveries.decrementAndGet();
      throw new IllegalStateException("Gateway queue exceeded");
    }
    context.runOnContext(
        ignored -> {
          deliveries.decrementAndGet();
          if (!closed) incoming.accept(message);
        });
  }

  private void run(JsonObject command) {
    boolean anyBusy = false;
    try (ZContext zmq = new ZContext()) {
      if (!closed) {
        String endpoint = config.endpoint();
        boolean admitted = false;
        try (ZMQ.Socket socket = zmq.createSocket(SocketType.DEALER)) {
          socket.setIdentity(UUID.randomUUID().toString().getBytes(StandardCharsets.US_ASCII));
          socket.setLinger(0);
          socket.setSndHWM(64);
          socket.setRcvHWM(64);
          socket.setMaxMsgSize(65536);
          socket.setSendTimeOut(100);
          socket.setReceiveTimeOut(2);
          socket.connect(endpoint);
          write(socket, Message.command(command));
          long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
          long pingAt = System.nanoTime();
          try {
            while (!closed) {
              Message message = read(socket);
              if (message != null) {
                if (!admitted) {
                  if (!"event".equals(message.kind()))
                    throw new IllegalStateException("Missing admission event");
                  JsonObject event = message.event();
                  String type = event.getString("type");
                  if ("busy".equals(type)) {
                    anyBusy = true;
                    break;
                  }
                  if ("unavailable".equals(type)) break;
                  if (!"ready".equals(type))
                    throw new IllegalStateException("Unexpected admission event");
                  admitted = true;
                  message = Message.event(event.put("node", endpoint));
                }
                deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
                if (!"event".equals(message.kind())
                    || !"pong".equals(message.event().getString("type"))) deliver(message);
                if ("event".equals(message.kind())
                    && "closed".equals(message.event().getString("type"))) return;
              }
              if (System.nanoTime() > deadline) {
                if (admitted) throw new IllegalStateException("Speech heartbeat expired");
                break;
              }
              if (admitted) {
                for (int n = 0; n < 64; n++) {
                  Message queued = outgoing.poll();
                  if (queued == null) break;
                  write(socket, queued);
                }
                if (System.nanoTime() >= pingAt) {
                  write(socket, Message.command(new JsonObject().put("type", "ping")));
                  pingAt = System.nanoTime() + Duration.ofSeconds(5).toNanos();
                }
              }
            }
          } finally {
            try {
              write(socket, Message.command(new JsonObject().put("type", "end")));
            } catch (RuntimeException ignored) {
              /* Disconnected peer expires its own heartbeat. */
            }
          }
          if (admitted || closed) return;
        } catch (RuntimeException error) {
          if (admitted) throw error;
        }
      }
      deliver(
          Message.event(
              new JsonObject()
                  .put("type", anyBusy ? "busy" : "unavailable")
                  .put("code", anyBusy ? "capacity_exceeded" : "speech_unavailable")));
    } catch (RuntimeException error) {
      // Bypass the bounded delivery path once to signal its own overflow.
      context.runOnContext(
          ignored -> {
            if (!closed)
              incoming.accept(
                  Message.event(
                      new JsonObject().put("type", "unavailable").put("code", "transport_failed")));
          });
    } finally {
      terminated.complete(null);
    }
  }

  private static void write(ZMQ.Socket socket, Message message) {
    if (!socket.sendMore(message.kind()) || !socket.send(message.payload()))
      throw new IllegalStateException("Speech send queue exceeded");
  }

  private static Message read(ZMQ.Socket socket) {
    byte[] kind = socket.recv();
    if (kind == null) return null;
    if (!socket.hasReceiveMore()) throw new IllegalStateException("Missing payload");
    byte[] payload = socket.recv();
    if (payload == null || socket.hasReceiveMore())
      throw new IllegalStateException("Malformed multipart");
    String name = new String(kind, StandardCharsets.US_ASCII);
    if (!name.equals("audio") && !name.equals("event"))
      throw new IllegalStateException("Unknown frame");
    return new Message(name, payload);
  }
}
