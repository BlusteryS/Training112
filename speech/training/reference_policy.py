"""Offline historical benchmark only; never imported by the live runtime."""

from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from speech112.runtime.bundle import ScenarioBundle, render
from speech112.runtime.scheduler import InferenceScheduler

EXAMPLES = json.loads(Path(__file__).with_name("reference_examples.json").read_text())
CONTACT = frozenset(EXAMPLES["CONTACT"])
REPAIR = frozenset(EXAMPLES["REPAIR"])
GREETING_PREFIX = re.compile(
    r"^(?:(?:алло|здравствуйте|добрый день|добрый вечер|доброе утро)[\s,!.:;]+)+", re.I
)



class IntentRecognizer(Protocol):
    async def classify(self, text: str, examples: dict[str, list[str]]) -> str | None: ...


class ExampleIntentRecognizer:
    """Explicit bootstrap provider. No fuzzy guesses or claims of neural understanding."""

    @staticmethod
    def normalize(text: str) -> str:
        return " ".join(re.findall(r"\w+", text.lower().replace("ё", "е")))

    async def classify(self, text: str, examples: dict[str, list[str]]) -> str | None:
        normalized = self.normalize(text)
        matches = {
            key
            for key, values in examples.items()
            if any(self.normalize(value) == normalized for value in values)
        }
        return next(iter(matches)) if len(matches) == 1 else None


class EmbeddingIntentRecognizer:
    """Replace/export the encoder independently of transport, scenario data and policy."""

    def __init__(
        self, encoder, scheduler: InferenceScheduler, threshold: float, margin: float, head=None
    ):
        self.encoder = encoder
        self.scheduler = scheduler
        self.threshold = threshold
        self.margin = margin
        self.head = head

    async def classify(self, text: str, examples: dict[str, list[str]]) -> str | None:
        if not examples:
            return None
        # Explicit scenario examples are authoritative, even when a instructor groups
        # several fine-grained canonical intents into one response.
        exact = await ExampleIntentRecognizer().classify(text, examples)
        if exact is not None:
            return exact
        query = await self.scheduler.run(
            self.encoder.encode, [ExampleIntentRecognizer.normalize(text)]
        )
        specialist = None
        if self.head is not None:
            specialist, accepted = self.head.decide(query[0])
            if accepted:
                if specialist in examples:
                    return specialist
                if specialist == "other":
                    return None
                # A instructor may define new intent identifiers. The fixed head
                # cannot classify those: allow the scenario encoder to match them.
                examples = {
                    key: values for key, values in examples.items() if key not in self.head.labels
                }
                if not examples:
                    return None
        labels = [key for key, values in examples.items() for _ in values]
        # ASR output is lowercase and unpunctuated. Use the same representation for
        # instructor-entered examples and recognized questions to avoid modality drift.
        values = [
            ExampleIntentRecognizer.normalize(value)
            for values in examples.values()
            for value in values
        ]
        # Encoder maintains a bounded cache of example vectors; the user text is not cached.
        vectors = await self.scheduler.run(self.encoder.encode_examples, tuple(values))
        scores = vectors @ query[0]
        ranked = sorted(
            (
                (
                    max(float(s) for label, s in zip(labels, scores, strict=True) if label == key),
                    key,
                )
                for key in examples
            ),
            reverse=True,
        )
        best, label = ranked[0]
        if self.head is not None and label in ("help_sent", "goodbye") and specialist != label:
            return None
        runner_up = ranked[1][0] if len(ranked) > 1 else -1.0
        if not np.isfinite(best) or best < self.threshold or best - runner_up < self.margin:
            return None
        return label


@dataclass(frozen=True, slots=True)
class Reply:
    text: str
    response_id: str
    expected_revision: int
    next_state: str
    end_call: bool = False
    fragments: tuple[str, ...] = ()
    choices: tuple[tuple[str, str], ...] = ()


_QUESTION_START = (
    r"(?:как\b|где\b|кто\b|что\b|сколько\b|како\w*\b|есть\b|назовите\b|скажите\b|уточните\b)"
)
_QUESTION_SPLIT = re.compile(
    rf"(?:[?!.;]+\s*|\s+(?:и|а также)\s+)(?={_QUESTION_START})", re.IGNORECASE
)


def question_parts(text: str) -> tuple[str, ...]:
    """Conservative boundaries, including unpunctuated ASR; never truncate questions."""
    return tuple(part.strip() for part in _QUESTION_SPLIT.split(text) if part.strip())


class ScenarioDialogue:
    def __init__(self, bundle: ScenarioBundle, recognizer: IntentRecognizer, seed: int):
        self._document = bundle.document
        self._recognizer = recognizer
        self._rng = random.Random(seed)
        self.state = self._document["initial_state"]
        self.revision = 0
        self._last_choices: dict[str, str] = {}
        self._last_reply: Reply | None = None

    def _choose(self, key: str, variants: list[str]) -> str:
        texts = [render(v, self._document["facts"]) for v in variants]
        alternatives = [t for t in texts if t != self._last_choices.get(key)]
        return self._rng.choice(alternatives or texts)

    def initiative(self, kind: str) -> Reply:
        if kind not in ("greeting", "check_in", "clarification", "contact"):
            raise ValueError("Unknown initiative")
        text = self._choose(kind, self._document[kind])
        return Reply(
            text,
            kind,
            self.revision,
            self.state,
            choices=((kind, text),),
        )

    async def respond(self, text: str) -> Reply:
        normalized = ExampleIntentRecognizer.normalize(text)
        if normalized in CONTACT:
            return self.initiative("contact")
        if normalized in REPAIR:
            previous = self._last_reply
            if previous is None:
                return self.initiative("greeting")
            return Reply(
                previous.text, "repeat", self.revision, self.state, fragments=previous.fragments
            )
        # A greeting before a substantive question must not replace that question.
        parts = question_parts(GREETING_PREFIX.sub("", text).strip() or text)
        if not parts or len(parts) > 3:
            return self.initiative("clarification")
        # Classify against all intents. Removing ineligible actions before classification
        # can turn a forbidden goodbye into the nearest *allowed* action.
        examples = {i["id"]: i["examples"] for i in self._document["intents"]}
        examples.setdefault(
            "repeat",
            EXAMPLES["REPEAT_EXAMPLES"],
        )
        state = self.state
        fragments, ids, choices = [], [], []
        end_call = False
        for index, part in enumerate(parts):
            intent = await self._recognizer.classify(part, examples)
            if intent == "repeat" and self._last_reply is not None and len(parts) == 1:
                previous = self._last_reply
                return Reply(
                    previous.text, "repeat", self.revision, self.state, fragments=previous.fragments
                )
            response = next(
                (
                    r
                    for r in self._document["responses"]
                    if r["intent"] == intent and state in r["states"]
                ),
                None,
            )
            if response is None:
                clarification = self.initiative("clarification")
                if "clarification" not in ids:
                    fragments.append(clarification.text)
                    ids.append("clarification")
                continue
            if response["id"] in ids:
                continue
            if response.get("end_call", False) and index != len(parts) - 1:
                return self.initiative("clarification")
            value = self._choose(response["id"], response["variants"])
            fragments.append(value)
            ids.append(response["id"])
            choices.append((response["id"], value))
            state = response.get("next_state", state)
            end_call = response.get("end_call", False)
            if end_call:
                break
        return Reply(
            " ".join(fragments),
            "+".join(ids),
            self.revision,
            state,
            end_call,
            tuple(fragments),
            tuple(choices),
        )

    def commit(self, reply: Reply) -> None:
        if reply.expected_revision != self.revision:
            raise ValueError("Stale dialogue response")
        self.state = reply.next_state
        self.revision += 1
        self._last_choices.update(reply.choices)
        if reply.response_id not in ("clarification", "check_in", "repeat"):
            self._last_reply = reply

    def snapshot(self) -> dict:
        return {"state": self.state, "revision": self.revision}
