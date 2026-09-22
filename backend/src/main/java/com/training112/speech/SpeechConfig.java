package com.training112.speech;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public record SpeechConfig(List<String> endpoints, String serverKey,
                           String publicKey, String secretKey) {
    public static SpeechConfig fromEnvironment() {
        Map<String, String> env = System.getenv();
        List<String> endpoints = Arrays.stream(env.getOrDefault("SPEECH_ENDPOINTS", "tcp://speech:5555")
                .split(",", -1)).map(String::trim).toList();
        for (String endpoint : endpoints) {
            URI uri = URI.create(endpoint);
            if (!"tcp".equals(uri.getScheme()) || uri.getHost() == null || uri.getPort() < 1
                    || uri.getPort() > 65535 || uri.getRawUserInfo() != null
                    || !uri.getRawPath().isEmpty() || uri.getRawQuery() != null || uri.getRawFragment() != null) {
                throw new IllegalArgumentException("SPEECH_ENDPOINTS must contain tcp://host:port addresses");
            }
        }
        if (endpoints.size() > 16 || endpoints.stream().distinct().count() != endpoints.size()) {
            throw new IllegalArgumentException("Configure between 1 and 16 distinct Speech endpoints");
        }
        String server = env.getOrDefault("SPEECH_CURVE_SERVER_KEY", "");
        String pub = env.getOrDefault("SPEECH_CURVE_PUBLIC_KEY", "");
        String secret = env.getOrDefault("SPEECH_CURVE_SECRET_KEY", "");
        if (!(server.isEmpty() && pub.isEmpty() && secret.isEmpty())
                && !(server.length() == 40 && pub.length() == 40 && secret.length() == 40)) {
            throw new IllegalArgumentException("Supply all three 40-character Z85 CURVE keys or none");
        }
        return new SpeechConfig(endpoints, server, pub, secret);
    }

    @Override
    public String toString() { return "SpeechConfig[endpoints=" + endpoints + "]"; }
}
