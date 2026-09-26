package com.training112.training;

import com.training112.auth.ApiException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import java.util.Map;
import java.util.Set;

/** Builds an editable call scenario draft from the lesson parameters. */
public final class ScenarioDraft {
  private static final Set<String> DIFFICULTIES = Set.of("basic", "intermediate", "advanced");
  private static final Map<String, String> INCIDENTS =
      Map.of(
          "Пожар или задымление", "В помещении дым. Источник я не вижу.",
          "Дорожно-транспортное происшествие", "Произошло столкновение автомобилей.",
          "Требуется медицинская помощь", "Человеку плохо, нужна скорая помощь.",
          "Нарушение общественного порядка", "Происходит драка, нужна полиция.",
          "Запах газа или авария газового оборудования", "Пахнет газом.",
          "Авария коммунальных сетей", "Прорвало трубу, вода заливает помещение.");
  private static final Map<String, String> VICTIMS =
      Map.of(
          "Пожар или задымление", "Пострадавших я не видел.",
          "Дорожно-транспортное происшествие", "В машине есть человек, он в сознании.",
          "Требуется медицинская помощь", "Плохо одному человеку, он в сознании.",
          "Нарушение общественного порядка", "Пострадавших не видно.",
          "Запах газа или авария газового оборудования", "Людей в помещении я не вижу.",
          "Авария коммунальных сетей", "Пострадавших нет.");
  private static final Set<String> ONE_VICTIM = Set.of(
      "Дорожно-транспортное происшествие", "Требуется медицинская помощь");
  private record Details(String intermediate, String advanced) {}

  private static final Map<String, Details> DIFFICULTY_DETAILS = Map.of(
      "Пожар или задымление", new Details("Дым сильнее на верхнем этаже.", "За дверью квартиры слышны голоса, но дверь закрыта."),
      "Дорожно-транспортное происшествие", new Details("Одна машина перегородила проезд.", "Водитель одной машины не может открыть дверь."),
      "Требуется медицинская помощь", new Details("Человеку становится хуже.", "Он говорит с трудом."),
      "Нарушение общественного порядка", new Details("Драка продолжается возле входа.", "К участникам драки подходят другие люди."),
      "Запах газа или авария газового оборудования", new Details("Запах особенно сильный у подъезда.", "В окнах дома горит свет, но людей я не вижу."),
      "Авария коммунальных сетей", new Details("Вода дошла до коридора.", "Вода уже вытекает на лестничную площадку."));
  private static final Map<String, Map<String, String>> INCIDENT_DETAILS = Map.of(
      "Пожар или задымление", Map.of(
          "age", "Возраст людей не могу оценить.",
          "breathing", "Не могу проверить, как дышат люди внутри.",
          "danger", "Я вышел на улицу и не подхожу к дыму.",
          "fire", "Открытого огня я не вижу, только дым.",
          "weapon", "Оружия здесь не видел.",
          "description_details", "Дым идёт из подъезда, источник не виден.",
          "vehicle", "Машин рядом с местом происшествия не заметил."),
      "Дорожно-транспортное происшествие", Map.of(
          "age", "Возраст человека в машине на вид около тридцати лет.",
          "breathing", "Человек дышит и разговаривает.",
          "danger", "Я стою у обочины, движение рядом продолжается.",
          "fire", "Огня не видно.",
          "weapon", "Оружия я не видел.",
          "description_details", "Одна машина белая, другая тёмная.",
          "vehicle", "Номера машин не разглядел, одна машина белая, другая тёмная."),
      "Требуется медицинская помощь", Map.of(
          "age", "На вид человеку около пятидесяти лет.",
          "breathing", "Он дышит тяжело.",
          "danger", "Мы на тротуаре, непосредственной опасности не вижу.",
          "fire", "Огня здесь нет.",
          "weapon", "Оружия здесь нет.",
          "description_details", "Человек побледнел и с трудом говорит.",
          "vehicle", "Машины к происшествию отношения не имеют."),
      "Нарушение общественного порядка", Map.of(
          "age", "На вид участникам драки около тридцати лет.",
          "breathing", "Проверить дыхание участников я не могу.",
          "danger", "Я отошёл от дерущихся, ко мне они не подходят.",
          "fire", "Огня нет.",
          "weapon", "Оружия у них не заметил.",
          "description_details", "Двое мужчин в тёмной одежде дерутся возле входа.",
          "vehicle", "Автомобилей рядом с ними не заметил."),
      "Запах газа или авария газового оборудования", Map.of(
          "age", "Возраст других жильцов не знаю.",
          "breathing", "Не могу проверить, как дышат люди внутри.",
          "danger", "Я вышел из дома и к подъезду не подхожу.",
          "fire", "Пламени нет, только запах газа.",
          "weapon", "Оружия я не видел.",
          "description_details", "Запах газа чувствуется возле подъезда.",
          "vehicle", "Машин возле подъезда не заметил."),
      "Авария коммунальных сетей", Map.of(
          "age", "Пострадавших нет, возраст назвать не могу.",
          "breathing", "Пострадавших нет, дыхание проверять не у кого.",
          "danger", "Я вышел из затопленного помещения.",
          "fire", "Огня нет, течёт вода.",
          "weapon", "Оружия здесь нет.",
          "description_details", "Вода течёт из трубы и заливает помещение.",
          "vehicle", "Автомобили к аварии отношения не имеют."));

  private ScenarioDraft() {}

  public static JsonObject build(
      JsonObject demo, String incident, String location, String difficulty, int seconds,
      String origin, String caller) {
    if (!INCIDENTS.containsKey(incident) || !DIFFICULTIES.contains(difficulty)
        || !IncidentOrigin.SOURCES.contains(origin) || seconds < 1 || seconds > 86_400
        || location.isBlank() || location.length() > 1000
        || caller.isBlank() || caller.length() > 200) {
      throw new ApiException(400, "invalid_scenario", "Проверьте тип, место, сложность, источник и норматив.");
    }
    String story = INCIDENTS.get(incident);
    Details details = DIFFICULTY_DETAILS.get(incident);
    if ("intermediate".equals(difficulty)) story += " " + details.intermediate();
    if ("advanced".equals(difficulty)) story += " " + details.advanced();
    JsonObject document = demo.copy();
    document.put("title", ("Учебный сценарий: " + incident).substring(0, Math.min(200, ("Учебный сценарий: " + incident).length())));
    document.put("origin", origin);
    document.put("difficulty", difficulty);
    document.put("instructions", "Примите учебное происшествие «" + incident + "». Уточните адрес, обстоятельства и сведения о пострадавших.");
    JsonObject facts = document.getJsonObject("facts");
    facts.put("caller_name", caller);
    facts.put("address", location);
    facts.put("incident", story);
    facts.put("victims", VICTIMS.get(incident));
    facts.put("victim_count", ONE_VICTIM.contains(incident)
        ? "Пострадал один человек." : "Точное число назвать не могу.");
    facts.put("consciousness", ONE_VICTIM.contains(incident)
        ? "Да, человек в сознании и отвечает." : "Не могу проверить, в сознании ли человек.");
    INCIDENT_DETAILS.get(incident).forEach(facts::put);
    JsonArray rubric = document.getJsonArray("rubric");
    for (int i = 0; i < rubric.size(); i++) {
      JsonObject rule = rubric.getJsonObject(i);
      if ("address".equals(rule.getString("field"))) rule.put("expected", location);
      if ("caller_name".equals(rule.getString("field"))) rule.put("expected", caller);
      if ("incident_code".equals(rule.getString("field"))) rule.put("expected", incident);
      if ("description".equals(rule.getString("field"))) rule.put("expected", story);
      if ("deadline".equals(rule.getString("kind"))) {
        rule.put("seconds", seconds);
        rule.put("action", "saved");
        rule.put("description", "Карточка сохранена в течение " + seconds + " секунд.");
      }
    }
    return ScenarioDocuments.validate(document);
  }
}
