package com.training112.speech;

import java.net.URI;
import java.util.Map;

/** One co-located Speech service; remote routing is deliberately unsupported. */
public record SpeechConfig(String endpoint) {
    public SpeechConfig {
        URI uri = URI.create(endpoint);
        if (!"tcp".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost())
                || uri.getPort() < 1 || uri.getPort() > 65535
                || uri.getRawUserInfo() != null || !uri.getRawPath().isEmpty()
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("SPEECH_ENDPOINT must be tcp://127.0.0.1:port");
        }
    }
    public static SpeechConfig fromEnvironment() { return from(System.getenv()); }
    static SpeechConfig from(Map<String, String> env) {
        if (env.containsKey("SPEECH_ENDPOINTS"))
            throw new IllegalArgumentException("Use one local SPEECH_ENDPOINT; clusters are unsupported");
        return new SpeechConfig(env.getOrDefault("SPEECH_ENDPOINT", "tcp://127.0.0.1:5555"));
    }
}
