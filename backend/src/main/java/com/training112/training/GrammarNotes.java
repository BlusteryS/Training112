package com.training112.training;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/** Surface checks of Russian card text. A finding is a concrete defect in the stored string. */
public final class GrammarNotes {
  private GrammarNotes() {}

  public static JsonArray inspect(String field, String text) {
    JsonArray notes = new JsonArray();
    if (text == null || text.isBlank()) {
      notes.add(note(field, "Пустое поле."));
      return notes;
    }
    String trimmed = text.strip();
    if (text.contains("  ")) notes.add(note(field, "Повторный пробел."));
    if (trimmed.matches(".*\\s[,.!?;:].*")) notes.add(note(field, "Пробел перед знаком препинания."));
    int first = trimmed.codePointAt(0);
    if (Character.isLetter(first) && Character.isLowerCase(first)) {
      notes.add(note(field, "Текст начинается со строчной буквы."));
    }
    if (trimmed.chars().anyMatch(ch -> (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z'))
        && trimmed.codePoints().anyMatch(ch -> Character.UnicodeScript.of(ch) == Character.UnicodeScript.CYRILLIC)) {
      notes.add(note(field, "Латинские буквы внутри русского текста."));
    }
    if (trimmed.length() > 40 && !".!?".contains(trimmed.substring(trimmed.length() - 1))) {
      notes.add(note(field, "Нет конечного знака препинания."));
    }
    return notes;
  }

  private static JsonObject note(String field, String message) {
    return new JsonObject().put("field", field).put("message", message);
  }
}
