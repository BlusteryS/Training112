"""Explicit card-field evidence in unpunctuated operator speech."""

import json
import re
from importlib.resources import files

from speech112.runtime.context_input import operator_text

_LANGUAGE = json.loads(
    files("speech112.contracts").joinpath("semantic-patterns.json").read_text()
)
_EXTRA = json.loads(
    files("speech112.contracts").joinpath("extra-intents.json").read_text()
)
RULE_INTENTS = frozenset(_EXTRA["intents"])
_PATTERNS = {
    label: tuple(re.compile(pattern) for pattern in patterns)
    for label, patterns in _LANGUAGE["fields"].items()
}
_PATTERNS.update({
    label: (re.compile(entry["pattern"]),)
    for label, entry in _EXTRA["intents"].items()
})
_REPEAT = re.compile(_LANGUAGE["repeat"])
_CONTACT = re.compile(_LANGUAGE["contact"])
_KNOWN = re.compile(_LANGUAGE["known"])
_NEGATED_GOODBYE = re.compile(_LANGUAGE["negated_goodbye"])
_VICTIM = re.compile(r"\b(?:пострадавш\w*|ранен\w*|пациент\w*)\b")
_CALLER_IDENTITY = re.compile(
    r"\b(?:ваш\w* (?:имя|фамили\w*|дат\w* рождени\w*|телефон\w*)|"
    r"сво\w* (?:имя|фамили\w*|телефон\w*)|как вас зовут|"
    r"имя заявител\w*|с кем я разговариваю)\b"
)
_VEHICLE_DETAILS = re.compile(
    r"\b(?:марка|цвет|номер|госномер|опис\w*|кака\w*)\b.{0,30}"
    r"\b(?:машин\w*|автомобил\w*|транспорт\w*)\b"
    r"|\b(?:машин\w*|автомобил\w*|транспорт\w*)\b.{0,30}"
    r"\b(?:марка|цвет|номер|госномер|опис\w*|кака\w*)\b"
)


def negated_goodbye(text: str) -> bool:
    return _NEGATED_GOODBYE.search(operator_text(text)) is not None


def strip_known(text: str) -> str:
    normalized = operator_text(text)
    cleaned = _KNOWN.sub("", normalized).strip()
    return text if cleaned == normalized else cleaned


def evidence(text: str) -> tuple[str, ...]:
    words = operator_text(strip_known(text))
    matches = []
    for label, patterns in _PATTERNS.items():
        start = min((match.start() for pattern in patterns
                     if (match := pattern.search(words)) is not None), default=None)
        if start is not None:
            matches.append((start, label))
    labels = [label for _, label in sorted(matches)]
    for specific, broad in (
        ("people_threatened", "danger"), ("collapse_risk", "danger"),
        ("fire_location", "fire"),
        ("fire_location", "address"), ("gas_sign", "fire"),
        ("explosion_location", "address"), ("injury", "victims"),
        ("building_storeys", "address_details"),
        ("building_storeys", "building_type"),
        ("inside_objects", "address_details"), ("inside_objects", "fire"),
        ("inside_objects", "address"),
        ("scene_access", "address_details"),
        ("gasified", "address_details"),
        ("gas_sign", "visible_damage"),
        ("law_violation", "people_threatened"),
    ):
        if specific in labels and broad in labels:
            labels.remove(broad)
    if "residence" in labels and "address" in labels:
        labels.remove("address")
    if "residence" in labels and "building_type" in labels and re.search(
        r"\b(?:домашн\w* адрес\w*|место жительств\w*)\b", words
    ):
        labels.remove("building_type")
    if "scene_access" in labels:
        if "vehicle" in labels and not _VEHICLE_DETAILS.search(words):
            labels.remove("vehicle")
        if "medical_help" in labels and not re.search(
            r"\b(?:нужн\w*|вызвать|требу\w*)\b.{0,25}\b(?:скор\w*|врач\w*|медик\w*)\b",
            words,
        ):
            labels.remove("medical_help")
    if "traffic_restricted" in labels and "vehicle" in labels and not _VEHICLE_DETAILS.search(words):
        labels.remove("vehicle")
    if "traffic_restricted" in labels and "scene_access" in labels and re.search(
        r"\b(?:дорог\w*|движени\w*|мимо|транспорт\w*|перекры\w*|закры\w*)\b",
        words,
    ) and not re.search(r"\b(?:к месту|туда|к вам|до места|добраться)\b", words):
        labels.remove("scene_access")
    if "fuel_spill" in labels and "vehicle" in labels and not _VEHICLE_DETAILS.search(words):
        labels.remove("vehicle")
    if "inside_objects" in labels and "visible_damage" in labels and re.search(
        r"\b(?:гор\w*|огн\w*|пожар\w*|дым\w*)\b", words
    ):
        labels.remove("visible_damage")
    if "building_type" in labels and "fire" in labels and not re.search(
        r"\b(?:видите|есть|пламя|дым|огонь)\b", words
    ):
        labels.remove("fire")
    if "caller_status" in labels and "victims" in labels and not re.search(
        r"\b(?:друг\w*|остальн\w*|еще)\b.{0,40}\b(?:люд\w*|пострад\w*|ранен\w*)\b",
        words,
    ):
        labels.remove("victims")
    if "gas_sign" in labels and "gasified" in labels and not re.search(
        r"\b(?:есть|проведен\w*|подведен\w*).{0,20}\bгаз\b.{0,25}\bдом\w*\b",
        words,
    ):
        labels.remove("gasified")
    if "injury" in labels and "visible_damage" in labels:
        labels.remove("visible_damage" if _VICTIM.search(words) or re.search(
            r"\b(?:у (?:него|нее|них)\b.{0,35}\bповрежден\w*|"
            r"поврежден\w* у (?:мужчин\w*|женщин\w*|ребенк\w*|человек\w*))\b", words
        ) else "injury")
    if "building_type" in labels and "address" in labels:
        if re.search(r"\bв как\w* (?:дом\w*|здани\w*)\b", words) and not re.search(
            r"\b(?:тип\w*|назначени\w*|жил\w*|нежил\w*)\b", words
        ):
            labels.remove("building_type")
        else:
            labels.remove("address")
    if "medical_help" in labels and "victims" in labels:
        if re.search(r"\b(?:врач нужен кому|кому\w* .{0,25}врач нужен)\b", words):
            labels.remove("medical_help")
        elif not re.search(
            r"\b(?:есть|видите|имеются) (?:ли )?(?:пострадавш\w*|ранен\w*)\b", words
        ):
            labels.remove("victims")
    if "fire_location" in labels and "inside_objects" in labels and re.search(
        r"\b(?:откуда|из как\w*|где находится очаг)\b", words
    ):
        labels.remove("inside_objects")
    if "fire_location" in labels and "inside_objects" in labels and re.search(
        r"\b(?:в как\w* помещени\w*|внутри|квартир\w*|балкон\w*|подвал\w*)\b", words
    ):
        labels.remove("fire_location")
    if "fire_location" in labels and "building_type" in labels and re.search(
        r"\bв как\w* (?:здани\w*|дом\w*)\b", words
    ) and not re.search(r"\b(?:где|откуда|очаг\w*)\b", words):
        labels.remove("fire_location")
    if "fire_location" in labels and "building_type" in labels and re.search(
        r"\b(?:част\w*|мест\w*|помещени\w*)\b.{0,35}"
        r"\b(?:гор\w*|пожар\w*|дым\w*|огн\w*)\b", words
    ):
        labels.remove("building_type")
    if "victim_identity" in labels and not _CALLER_IDENTITY.search(words):
        labels = [label for label in labels if label not in ("name", "birth_date", "phone")]
    if "caller_age" in labels and not _VICTIM.search(words):
        labels = [label for label in labels if label != "age"]
    if "weapon" in labels and "danger" in labels and re.search(
        r"\bчем (?:он|она|они) угрожа\w*\b", words
    ) and not re.search(
        r"\b(?:безопасн\w*|опасн\w*|опасност\w*|угроз\w*|угрожают|можете (?:ли )?(?:выйти|отойти))\b",
        words,
    ):
        labels.remove("danger")
    if "fire" in labels and "address" in labels and re.search(
        r"\b(?:горени\w*|пламя|огонь|дым) где именно (?:наблюда\w*|видн\w*|идет)", words
    ) and not re.search(r"\b(?:адрес\w*|улиц\w*|дом\w*|населенн\w* пункт|местоположени\w*|"
                        r"где конкретно требуется)\b", words):
        labels.remove("address")
    if "danger" in labels and "address" in labels and re.search(
        r"\bместо где вы (?:ждете|находитесь).{0,35}\b(?:угроз\w*|опасн\w*)", words
    ):
        labels.remove("address")
    if "victim_count" in labels or "age" in labels:
        # A count or age question alone does not also ask whether anyone was hurt.
        if not re.search(
            r"\b(?:есть(?: ли)?|кто|кому|врач нужен)\b.{0,35}\b(?:пострад\w*|ранен\w*|травм\w*|люди|кому|нужна помощь)\b"
            r"|\bлюди там целы\b|\bтравмированн\w* люди\b",
            words,
        ):
            labels = [label for label in labels if label != "victims"]
    if "help_sent" in labels or "not_sent" in labels:
        labels = [label for label in labels if label != "vehicle"]
    if "hold" in labels and "телефоне" in words and "phone" in labels:
        labels.remove("phone")
    return tuple(labels)


def explicit_action(text: str, targets: tuple[str, ...]) -> str | None:
    words = operator_text(text)
    if _REPEAT.search(words) and not any(target in targets for target in
                                          ("help_sent", "not_sent", "hold", "reassure")):
        return "repeat"
    if _CONTACT.search(words) and not targets:
        return "contact"
    if targets:
        if set(targets) == {"goodbye"}:
            return "end"
        if set(targets) <= {"help_sent", "not_sent", "hold", "reassure", "dismissal", "goodbye"}:
            return "inform"
        return "request"
    return None
