"""Validate and compile data, never Python code supplied by a scenario author."""

from __future__ import annotations

import hashlib
import json
import string
from dataclasses import dataclass
from importlib.resources import files
from typing import Any

from jsonschema import Draft202012Validator, ValidationError

from speech112.runtime.conversation_controls import CONTACT_REPLY
from speech112.speech_text import validate_speech_text

MAX_DOCUMENT_BYTES = 262_144
_SCHEMA = json.loads(files("speech112.contracts").joinpath("scenario.schema.json").read_text())
_VALIDATOR = Draft202012Validator(_SCHEMA)


def render(template: str, facts: dict[str, str]) -> str:
    for _, name, spec, conversion in string.Formatter().parse(template):
        if name is not None and (name not in facts or spec or conversion):
            raise ValueError(f"Unknown or unsafe scenario placeholder: {name}")
    text = template.format_map(facts)
    validate_speech_text(text)
    return text


def validate_document(document: dict[str, Any]) -> None:
    if len(json.dumps(document, ensure_ascii=False).encode()) > MAX_DOCUMENT_BYTES:
        raise ValueError("Scenario exceeds 256 KiB")
    try:
        _VALIDATOR.validate(document)
    except ValidationError as error:
        raise ValueError(f"Invalid scenario at {list(error.absolute_path)}") from error
    states = set(document["states"])
    if document["initial_state"] not in states:
        raise ValueError("Unknown initial state")
    intents = [intent["id"] for intent in document["intents"]]
    for values in (
        intents,
        [r["id"] for r in document["responses"]],
        [r["id"] for r in document["rubric"]],
    ):
        if len(set(values)) != len(values):
            raise ValueError("Duplicate scenario identifier")
    routes: set[tuple[str, str]] = set()
    for response in document["responses"]:
        if response["intent"] not in intents:
            raise ValueError("Unknown intent")
        for state in response["states"]:
            if state not in states or (state, response["intent"]) in routes:
                raise ValueError("Unknown state or ambiguous response route")
            routes.add((state, response["intent"]))
        if response.get("next_state", document["initial_state"]) not in states:
            raise ValueError("Unknown next state")
        for variant in response["variants"]:
            render(variant, document["facts"])
        for variant in response.get("compact_variants", ()):
            render(variant, document["facts"])
    for kind in ("greeting", "clarification", "check_in", "contact"):
        for variant in document.get(kind, CONTACT_REPLY):
            render(variant, document["facts"])
@dataclass(frozen=True, slots=True)
class ScenarioBundle:
    """The canonical JSON is the immutable source; callers only receive copies."""

    payload: bytes
    digest: str

    @classmethod
    def compile(cls, document: dict[str, Any]) -> ScenarioBundle:
        validate_document(document)
        payload = json.dumps(
            document, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
        return cls(payload, hashlib.sha256(payload).hexdigest())

    @classmethod
    def parse(cls, payload: bytes, digest: str | None = None) -> ScenarioBundle:
        if len(payload) > MAX_DOCUMENT_BYTES:
            raise ValueError("Scenario exceeds 256 KiB")
        bundle = cls.compile(json.loads(payload))
        if digest is not None and bundle.digest != digest:
            raise ValueError("Scenario checksum mismatch")
        return bundle

    @property
    def document(self) -> dict[str, Any]:
        return json.loads(self.payload)

    def utterances(self) -> tuple[str, ...]:
        document = self.document
        templates = [v for r in document["responses"]
                     for v in (*r["variants"], *r.get("compact_variants", ()))]
        templates += [v for k in ("greeting", "clarification", "check_in") for v in document[k]]
        templates += list(document.get("contact", CONTACT_REPLY))
        return tuple(dict.fromkeys(render(v, document["facts"]) for v in templates))
