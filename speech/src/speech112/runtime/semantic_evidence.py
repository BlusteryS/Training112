"""Explicit card-field evidence in unpunctuated operator speech."""

import json
import re
from importlib.resources import files

from speech112.runtime.context_input import operator_text

_LANGUAGE = json.loads(
    files("speech112.contracts").joinpath("semantic-patterns.json").read_text()
)
_PATTERNS = {
    label: tuple(re.compile(pattern) for pattern in patterns)
    for label, patterns in _LANGUAGE["fields"].items()
}
_REPEAT = re.compile(_LANGUAGE["repeat"])
_CONTACT = re.compile(_LANGUAGE["contact"])
_KNOWN = re.compile(_LANGUAGE["known"])


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
        if not re.search(r"\b(?:есть ли|кто|кому|врач нужен)\b.{0,35}\b(?:пострад|ранен|травм|люди|кому)", words):
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
