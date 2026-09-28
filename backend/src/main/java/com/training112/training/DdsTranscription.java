package com.training112.training;

import com.training112.auth.ApiException;
import com.training112.speech.SpeechConfig;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import org.zeromq.SocketType;
import org.zeromq.ZContext;
import org.zeromq.ZMQ;

/** One spoken DDS turn uses the already loaded local recognition model. */
final class DdsTranscription {
  private final Vertx vertx;
  private final SpeechConfig speech;

  DdsTranscription(Vertx vertx, SpeechConfig speech) {
    this.vertx = vertx;
    this.speech = speech;
  }

  Future<JsonObject> recognize(JsonObject request) {
    if (request == null || !request.fieldNames().equals(Set.of("pcm16"))) throw invalid();
    Object encoded = request.getValue("pcm16");
    if (!(encoded instanceof String pcm) || pcm.length() < 10_000 || pcm.length() > 440_000)
      throw invalid();
    return vertx.executeBlocking(() -> exchange(pcm), false);
  }

  private JsonObject exchange(String pcm) {
    try (ZContext context = new ZContext(); ZMQ.Socket socket = context.createSocket(SocketType.DEALER)) {
      socket.setIdentity(UUID.randomUUID().toString().getBytes(StandardCharsets.US_ASCII));
      socket.setLinger(0);
      socket.setSendTimeOut(500);
      socket.setReceiveTimeOut(12_000);
      socket.setMaxMsgSize(4096);
      socket.connect(speech.endpoint());
      if (!socket.sendMore("command")
          || !socket.send(new JsonObject().put("type", "recognize").put("pcm16", pcm).encode()))
        throw unavailable();
      byte[] kind = socket.recv();
      if (kind == null || !"event".equals(new String(kind, StandardCharsets.US_ASCII))
          || !socket.hasReceiveMore()) throw unavailable();
      byte[] payload = socket.recv();
      if (payload == null || socket.hasReceiveMore()) throw unavailable();
      JsonObject event = new JsonObject(new String(payload, StandardCharsets.UTF_8));
      if (!"transcript".equals(event.getString("type"))) throw unavailable();
      return new JsonObject().put("text", event.getString("text", ""));
    } catch (ApiException error) {
      throw error;
    } catch (RuntimeException error) {
      throw unavailable();
    }
  }

  private static ApiException invalid() {
    return new ApiException(400, "invalid_audio", "Неверные данные микрофона.");
  }

  private static ApiException unavailable() {
    return new ApiException(503, "recognition_unavailable", "Распознавание речи недоступно.");
  }
}
