package com.training112.speech;

import io.vertx.core.Context;
import io.vertx.core.json.JsonObject;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.zeromq.SocketType;
import org.zeromq.ZContext;
import org.zeromq.ZMQ;

/** A DEALER belongs to one worker thread for its whole lifetime, including close. */
public final class SpeechTransport {
    private static final Logger LOG = LoggerFactory.getLogger(SpeechTransport.class);
    public record Message(String kind, byte[] payload) {
        public static Message command(JsonObject value) {
            return new Message("command", value.encode().getBytes(StandardCharsets.UTF_8));
        }
        public JsonObject event() { return new JsonObject(new String(payload, StandardCharsets.UTF_8)); }
    }

    private final SpeechConfig config;
    private final Context context;
    private final Consumer<Message> incoming;
    private final ArrayBlockingQueue<Message> outgoing = new ArrayBlockingQueue<>(32);
    private final AtomicInteger deliveries = new AtomicInteger();
    private final CompletableFuture<Void> terminated = new CompletableFuture<>();
    private volatile boolean closed;

    public SpeechTransport(SpeechConfig config, Context context, Consumer<Message> incoming) {
        this.config = config;
        this.context = context;
        this.incoming = incoming;
    }

    public void start(JsonObject command, int firstNode) {
        Thread.ofVirtual().name("speech-transport").start(() -> run(command, firstNode));
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
        if (deliveries.incrementAndGet() > 32) {
            deliveries.decrementAndGet();
            throw new IllegalStateException("Browser delivery queue exceeded");
        }
        context.runOnContext(ignored -> {
            deliveries.decrementAndGet();
            incoming.accept(message);
        });
    }

    private void run(JsonObject command, int firstNode) {
        boolean catalog = "voices".equals(command.getString("type"));
        try (ZContext zmq = new ZContext()) {
            List<String> endpoints = config.endpoints();
            if (!catalog) waiting(5);
            do {
                long earliestAvailability = Long.MAX_VALUE;
                for (int attempt = 0; attempt < endpoints.size() && !closed; attempt++) {
                    String endpoint = endpoints.get(Math.floorMod(firstNode + attempt, endpoints.size()));
                    boolean accepted = false;
                    try (ZMQ.Socket socket = zmq.createSocket(SocketType.DEALER)) {
                        socket.setIdentity(UUID.randomUUID().toString().getBytes(StandardCharsets.US_ASCII));
                        socket.setLinger(0);
                        socket.setSndHWM(32);
                        socket.setRcvHWM(32);
                        socket.setMaxMsgSize(65536);
                        socket.setSendTimeOut(100);
                        socket.setReceiveTimeOut(2);
                        if (!config.serverKey().isEmpty()) {
                            socket.setCurveServerKey(config.serverKey().getBytes(StandardCharsets.US_ASCII));
                            socket.setCurvePublicKey(config.publicKey().getBytes(StandardCharsets.US_ASCII));
                            socket.setCurveSecretKey(config.secretKey().getBytes(StandardCharsets.US_ASCII));
                        }
                        socket.connect(endpoint);
                        write(socket, Message.command(command));
                        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
                        long pingAt = System.nanoTime();
                        try {
                            while (!closed) {
                                Message message = read(socket);
                                if (message != null) {
                                    if (!accepted) {
                                        if (!"event".equals(message.kind())) throw new IllegalStateException("Expected admission event");
                                        String type = message.event().getString("type");
                                        if ("busy".equals(type) || "unavailable".equals(type)) {
                                            Object estimate = message.event().getValue("estimated_wait_seconds");
                                            if ("busy".equals(type) && estimate instanceof Number seconds
                                                    && seconds.doubleValue() > 0 && Double.isFinite(seconds.doubleValue())) {
                                                long wait = Math.min(86_400, Math.max(1, seconds.longValue()));
                                                earliestAvailability = Math.min(earliestAvailability,
                                                        System.nanoTime() + Duration.ofSeconds(wait).toNanos());
                                                waiting(Math.max(1, (earliestAvailability - System.nanoTime()) / 1_000_000_000L));
                                            }
                                            LOG.debug("Speech node {} declined admission: {}", endpoint, type);
                                            break;
                                        }
                                        if (!(catalog ? "voices" : "ready").equals(type)) {
                                            throw new IllegalStateException("Unexpected admission event");
                                        }
                                        accepted = true;
                                        LOG.info("Speech connection assigned to {}", endpoint);
                                    }
                                    deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
                                    if (!"event".equals(message.kind()) || !"pong".equals(message.event().getString("type"))) {
                                        deliver(message);
                                    }
                                    if (catalog || ("event".equals(message.kind())
                                            && "closed".equals(message.event().getString("type")))) return;
                                }
                                if (System.nanoTime() > deadline) {
                                    if (accepted) throw new IllegalStateException("Speech heartbeat expired");
                                    LOG.warn("Speech node {} did not answer admission", endpoint);
                                    break;
                                }
                                if (accepted) {
                                    for (int i = 0; i < 32; i++) {
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
                            // Once accepted, never migrate a live conversation to another node.
                            if (accepted || closed) return;
                        } finally {
                            if (!catalog) {
                                try { write(socket, Message.command(new JsonObject().put("type", "end"))); }
                                catch (RuntimeException error) { LOG.debug("Could not send Speech close", error); }
                            }
                        }
                    } catch (RuntimeException error) {
                        if (accepted) throw error;
                        LOG.warn("Speech node {} could not accept a connection", endpoint, error);
                    }
                }
                if (catalog) break;
                waiting(earliestAvailability == Long.MAX_VALUE ? 5
                        : Math.max(1, (earliestAvailability - System.nanoTime()) / 1_000_000_000L));
                // Retry admission without building an unbounded queue on a Speech node.
                long retryAt = System.nanoTime() + Duration.ofSeconds(3).toNanos();
                while (!closed && System.nanoTime() < retryAt) {
                    LockSupport.parkNanos(Duration.ofMillis(100).toNanos());
                }
                firstNode = Math.floorMod(firstNode + 1, endpoints.size());
            } while (!closed);
            deliver(Message.command(new JsonObject().put("type", "unavailable")
                    .put("message", "Нет свободного доступного речевого сервера. Попробуйте позже.")));
        } catch (RuntimeException error) {
            LOG.warn("Speech transport ended", error);
            context.runOnContext(ignored -> incoming.accept(Message.command(new JsonObject()
                    .put("type", "unavailable").put("message", "Соединение с речевым сервером потеряно."))));
        } finally {
            terminated.complete(null);
        }
    }

    private void waiting(long seconds) {
        deliver(Message.command(new JsonObject().put("type", "waiting")
                .put("estimated_wait_seconds", seconds)));
    }

    private static void write(ZMQ.Socket socket, Message message) {
        if (!socket.sendMore(message.kind()) || !socket.send(message.payload())) {
            throw new IllegalStateException("Speech send queue exceeded");
        }
    }

    private static Message read(ZMQ.Socket socket) {
        byte[] kind = socket.recv();
        if (kind == null) return null;
        if (!socket.hasReceiveMore()) throw new IllegalStateException("Missing Speech payload");
        byte[] payload = socket.recv();
        if (payload == null || socket.hasReceiveMore()) throw new IllegalStateException("Malformed Speech message");
        String name = new String(kind, StandardCharsets.US_ASCII);
        if (!name.equals("audio") && !name.equals("event")) throw new IllegalStateException("Unknown Speech frame");
        return new Message(name, payload);
    }
}
