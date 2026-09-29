package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

final class FiasAddresses {
  private record Address(String id, String label, String district, String street, String house,
                         String search, String houseSearch) {}

  private static final List<Address> ADDRESSES = load();
  private static final Map<Character, List<Address>> BY_INITIAL = index(ADDRESSES);
  private static final Set<String> IGNORED_WORDS = Set.of(
      "москва", "город", "улица", "дом", "район", "проспект", "переулок", "бульвар");

  private FiasAddresses() {}

  static JsonArray search(String query) {
    JsonArray result = new JsonArray();
    if (query.trim().length() < 3 || query.length() > 120) return result;
    List<String> words = new ArrayList<>();
    for (String word : normalize(query).split(" ")) {
      if (!word.isEmpty() && !IGNORED_WORDS.contains(word)) words.add(word);
    }
    if (words.isEmpty()) return result;
    String house = words.getLast().matches("[0-9]+[а-яa-z]?") && words.size() > 1
        ? words.removeLast() : null;
    List<Address> candidates = ADDRESSES;
    for (String word : words) {
      if (word.length() >= 3 && Character.isLetter(word.charAt(0))) {
        List<Address> indexed = BY_INITIAL.getOrDefault(word.charAt(0), List.of());
        if (indexed.size() < candidates.size()) candidates = indexed;
      }
    }
    for (Address address : candidates) {
      if (house != null && !houseMatches(address.houseSearch, house)) continue;
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

  private static boolean houseMatches(String number, String query) {
    return number.startsWith(query) && (number.length() == query.length()
        || !Character.isDigit(number.charAt(query.length())));
  }

  private static String normalize(String value) {
    return value.toLowerCase(Locale.ROOT).replace('ё', 'е').replaceAll("[.,/]+", " ")
        .replaceAll("\\s+", " ").trim();
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
            normalize(fields[1] + " " + fields[2]), normalize(fields[4])));
      }
    } catch (IOException error) {
      throw new IllegalStateException("Cannot read Moscow FIAS addresses", error);
    }
    return List.copyOf(addresses);
  }

  private static Map<Character, List<Address>> index(List<Address> addresses) {
    Map<Character, List<Address>> indexed = new HashMap<>();
    for (Address address : addresses) {
      Set<Character> initials = new HashSet<>();
      for (String word : address.search.split(" ")) {
        if (!word.isEmpty() && Character.isLetter(word.charAt(0))) initials.add(word.charAt(0));
      }
      for (char initial : initials) indexed.computeIfAbsent(initial, key -> new ArrayList<>()).add(address);
    }
    return indexed;
  }
}
