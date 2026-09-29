package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.Map;
import java.util.Set;

public final class CardCommands {
  private static final Set<String> FIELDS =
      Set.of(
          "address", "address_description", "landmark", "caller_name", "caller_status", "birth_date",
          "residence", "city", "comment",
          "communication_channel", "country", "description", "district", "entrance", "floor",
          "foreign_language", "foreign_phone", "house", "incident_code", "classifier_code", "incident_types",
          "law_violation",
          "incident_sign_2", "incident_sign_3", "incident_details", "survey_answers",
          "object", "okrug", "phone", "provided_phone", "scene_phone", "services", "street", "victims",
          "medical_help", "blocked_people", "building", "structure", "apartment", "entry_code",
          "location_lat", "location_lon");
  private static final Set<String> OKRUGS =
      Set.of("ЦАО", "САО", "СВАО", "ВАО", "ЮВАО", "ЮАО", "ЮЗАО", "ЗАО", "СЗАО", "ЗелАО", "ТиНАО");
  private static final Set<String> SIGN_2 =
      Set.of(
          "Квартира", "Частный дом", "Подъезд", "Транспорт", "Мусор", "Трава", "Лес", "Другое",
          "Легковые автомобили", "Грузовой транспорт", "Общественный транспорт", "Пешеход",
          "В сознании", "Без сознания", "Неизвестно", "Нападение", "Угроза", "Драка", "Кража",
          "В квартире", "В подъезде", "На улице", "В организации", "Водоснабжение", "Канализация",
          "Отопление", "Электроснабжение");
  private static final Set<String> SIGN_3 =
      Set.of(
          "Открытое пламя", "Дым", "Запах гари", "Неизвестно", "Есть пострадавшие",
          "Заблокированы люди", "Есть возгорание", "Без пострадавших", "Травма",
          "Затруднено дыхание", "Боль", "Отравление", "Другое", "Да", "Нет", "Запах газа",
          "Повреждение оборудования", "Прорыв", "Отключение", "Затопление", "Повреждение");
  private static final Set<String> STATUSES_REQUIRING_COMMENT = Set.of("rejected", "refused", "completed");
  private static final Map<String, Set<String>> TRANSITIONS =
      Map.of(
          "added", Set.of("received"),
          "received", Set.of("accepted", "rejected"),
          "rejected", Set.of("accepted"),
          "accepted", Set.of("dispatched", "refused"),
          "dispatched", Set.of("arrived", "refused"),
          "arrived", Set.of("working", "refused"),
          "working", Set.of("completed", "refused"));

  public record Applied(JsonObject card, String status) {}

  private CardCommands() {}

  public static Applied apply(JsonObject card, String current, String type, JsonObject payload) {
    JsonObject copy = card.copy();
    if (!TRANSITIONS.containsKey(current)) throw invalid("Карточка закрыта для редактирования.");
    if ("card.update".equals(type)) {
      if (payload.isEmpty() || !FIELDS.containsAll(payload.fieldNames()))
        throw invalid("Неизвестные поля карточки.");
      for (var entry : payload) {
        int maxLength = Set.of("incident_types", "survey_answers").contains(entry.getKey()) ? 20_000 : 4000;
        if (!(entry.getValue() instanceof String value) || value.length() > maxLength)
          throw invalid("Неверное значение поля.");
        copy.put(entry.getKey(), entry.getValue());
      }
      String okrug = copy.getString("okrug", "");
      if (!okrug.isEmpty() && !OKRUGS.contains(okrug)) throw invalid("Неизвестный округ.");
      String classifierCode = copy.getString("classifier_code", "");
      if (!classifierCode.isEmpty()) {
        if (!matchesClassifier(copy)) {
          throw invalid("Код и признаки происшествия не совпадают с классификатором.");
        }
        validateIncidentTypes(copy);
      } else if (!allowed(copy.getString("incident_sign_2", ""), SIGN_2)
          || !allowed(copy.getString("incident_sign_3", ""), SIGN_3)) {
        throw invalid("Неизвестный признак происшествия.");
      }
      return new Applied(copy, current);
    }
    if (!"card.status".equals(type)
        || !Set.of("status", "comment").containsAll(payload.fieldNames())) {
      throw invalid("Неизвестная команда карточки.");
    }
    Object nextValue = payload.getValue("status");
    Object commentValue = payload.getValue("comment");
    if (!(nextValue instanceof String next) || !(commentValue instanceof String comment))
      throw invalid("Неверное значение статуса или комментария.");
    if (!TRANSITIONS.get(current).contains(next)) throw invalid("Недопустимый переход статуса.");
    if (comment.length() > 4000 || STATUSES_REQUIRING_COMMENT.contains(next)
        && comment.isBlank()) {
      throw invalid("К статусу нужен комментарий.");
    }
    return new Applied(copy, next);
  }

  private static boolean allowed(String value, Set<String> options) {
    return value.isEmpty() || options.contains(value);
  }

  public static void validateForSave(JsonObject card) {
    String comment = card.getString("comment", "");
    if (Set.of("Нет контакта с заявителем", "Срыв звонка").contains(comment)
        && comment.equals(card.getString("incident_code", ""))
        && comment.equals(card.getString("description", ""))) return;
    for (String field : new String[] {"caller_name", "caller_status", "address", "okrug",
        "description", "incident_details", "services", "classifier_code"}) {
      if (card.getString(field, "").isBlank()) {
        throw invalid("Заполните обязательные поля карточки перед сохранением.");
      }
    }
    if (!matchesClassifier(card)) {
      throw invalid("Проверьте тип и признаки происшествия.");
    }
    validateIncidentTypes(card);
  }

  private static boolean matchesClassifier(JsonObject card) {
    JsonObject survey = IncidentClassifier.card(card.getString("classifier_code", ""));
    return survey != null && survey.getString("type").equals(card.getString("incident_code", ""))
        && survey.getString("sign2").equals(card.getString("incident_sign_2", ""))
        && survey.getString("sign3").equals(card.getString("incident_sign_3", ""));
  }

  private static void validateIncidentTypes(JsonObject card) {
    String value = card.getString("incident_types", "");
    if (value.isBlank()) return;
    JsonArray incidents;
    try {
      incidents = new JsonArray(value);
    } catch (RuntimeException error) {
      throw invalid("Неверные типы происшествия.");
    }
    if (incidents.isEmpty() || incidents.size() > 30) throw invalid("Неверные типы происшествия.");
    Set<String> seen = new java.util.HashSet<>();
    for (Object item : incidents) {
      if (!(item instanceof JsonObject selected)) throw invalid("Неверные типы происшествия.");
      if (!(selected.getValue("type") instanceof String type)
          || !(selected.getValue("sign2") instanceof String second)
          || !(selected.getValue("sign3") instanceof String third))
        throw invalid("Неверные типы происшествия.");
      Object selectedCode = selected.getValue("code");
      if (selectedCode != null && !(selectedCode instanceof String))
        throw invalid("Неверные типы происшествия.");
      String code = selectedCode == null ? "" : (String) selectedCode;
      JsonObject row = code.isEmpty()
          ? IncidentClassifier.card(type, second, third) : IncidentClassifier.card(code);
      if (row == null || !row.getString("type").equals(type)
          || !row.getString("sign2").equals(second)
          || !row.getString("sign3").equals(third)) {
        throw invalid("Неизвестный тип или признак происшествия.");
      }
      if (!seen.add(row.getString("code"))) throw invalid("Тип происшествия выбран повторно.");
    }
    JsonObject first = incidents.getJsonObject(0);
    if (!first.getString("type").equals(card.getString("incident_code"))
        || !first.getString("sign2").equals(card.getString("incident_sign_2"))
        || !first.getString("sign3").equals(card.getString("incident_sign_3"))
        || !first.getString("code", card.getString("classifier_code"))
            .equals(card.getString("classifier_code"))) {
      throw invalid("Основной тип происшествия не совпадает с карточкой.");
    }
  }

  private static ApiException invalid(String message) {
    return new ApiException(400, "invalid_card_command", message);
  }
}
