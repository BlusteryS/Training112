package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.GZIPInputStream;

final class GeoAddresses {
  private record Address(float latitude, float longitude, String street, String house) {}

  private static final List<Address> ADDRESSES = load();

  private GeoAddresses() {}

  static JsonObject nearest(double latitude, double longitude) {
    double eastScale = Math.cos(Math.toRadians(latitude));
    Address nearest = null;
    double smallest = Double.POSITIVE_INFINITY;
    for (Address address : ADDRESSES) {
      double north = address.latitude - latitude;
      double east = (address.longitude - longitude) * eastScale;
      double squared = north * north + east * east;
      if (squared < smallest) {
        smallest = squared;
        nearest = address;
      }
    }
    if (nearest == null) throw new IllegalStateException("Moscow address index is empty");
    String label = "Москва, " + nearest.street + ", д. " + nearest.house;
    JsonObject result = new JsonObject().put("id", "").put("label", label)
        .put("district", "").put("street", nearest.street).put("house", nearest.house)
        .put("distance_m", Math.round(Math.sqrt(smallest) * 111_195));
    JsonArray fias = FiasAddresses.search(nearest.street + " " + nearest.house);
    for (int i = 0; i < fias.size(); i++) {
      JsonObject match = fias.getJsonObject(i);
      if (nearest.house.equalsIgnoreCase(match.getString("house"))) {
        result.put("id", match.getString("id")).put("label", match.getString("label"))
            .put("district", match.getString("district"))
            .put("street", match.getString("street"));
        break;
      }
    }
    return result;
  }

  private static List<Address> load() {
    var resource = GeoAddresses.class.getResourceAsStream("/contracts/osm-moscow-addresses.tsv.gz");
    if (resource == null) throw new IllegalStateException("Missing Moscow geocoded addresses");
    List<Address> addresses = new ArrayList<>(250_000);
    try (var reader = new BufferedReader(new InputStreamReader(
        new GZIPInputStream(resource), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        String[] fields = line.split("\\t", -1);
        if (fields.length != 4) throw new IllegalStateException("Invalid geocoded address row");
        addresses.add(new Address(Float.parseFloat(fields[0]), Float.parseFloat(fields[1]),
            fields[2], fields[3]));
      }
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read geocoded addresses", error);
    }
    return List.copyOf(addresses);
  }
}
