package com.training112.training;

import java.util.Set;
import java.util.regex.Pattern;

/** Systems that register a card. The names match scenario.schema.json. */
public final class IncidentOrigin {
  public static final String SERVICE_112 = "Служба 112";
  public static final Set<String> SOURCES =
      Set.of(
          SERVICE_112,
          "Служба 101 (КИС УСС (МЧС))",
          "Служба 102 (СОДЧ (МВД))",
          "Служба 103",
          "Служба 104",
          "ЦОДД",
          "Мосводоканал",
          "ЭРА-ГЛОНАСС",
          "112 Московской области",
          "112 Калужской области");

  private static final Pattern NUMBER = Pattern.compile("\\d+");

  private IncidentOrigin() {}

  public static String operatorNumber(String login) {
    var matcher = NUMBER.matcher(login);
    return matcher.find() ? matcher.group() : login;
  }

  /** The 112 operator who opened a card delivered by an external system. */
  public static String visOperator(String origin, String login) {
    return SERVICE_112.equals(origin) ? null : operatorNumber(login);
  }
}
