package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.GZIPInputStream;

final class FiasAddresses {
  private record Address(String id, String label, String district, String street, String house,
                         String search) {}

  private static final List<Address> ADDRESSES = load();

  private FiasAddresses() {}

  static JsonArray search(String query) {
    String[] words = query.toLowerCase(Locale.ROOT).trim().split("\\s+");
    JsonArray result = new JsonArray();
    if (query.trim().length() < 3 || query.length() > 120) return result;
    for (Address address : ADDRESSES) {
      boolean matches = true;
      for (String word : words) {
        if (!address.search.contains(word)) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      result.add(new JsonObject().put("id", address.id).put("label", address.label)
          .put("district", address.district).put("street", address.street)
          .put("house", address.house));
      if (result.size() == 12) break;
    }
    return result;
  }

  private static List<Address> load() {
    var resource = FiasAddresses.class.getResourceAsStream("/contracts/fias-moscow.tsv.gz");
    if (resource == null) throw new IllegalStateException("Missing Moscow FIAS addresses");
    List<Address> addresses = new ArrayList<>(300_000);
    try (var reader = new BufferedReader(new InputStreamReader(
        new GZIPInputStream(resource), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        String[] fields = line.split("\\t", -1);
        if (fields.length != 5) throw new IllegalStateException("Invalid Moscow FIAS address row");
        addresses.add(new Address(fields[0], fields[1], fields[2], fields[3], fields[4],
            fields[1].toLowerCase(Locale.ROOT)));
      }
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read Moscow FIAS addresses", error);
    }
    return List.copyOf(addresses);
  }
}
