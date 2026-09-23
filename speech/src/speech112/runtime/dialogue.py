"""One learned semantic plan, scenario routing and transactional playback state."""

from __future__ import annotations

import random
from dataclasses import dataclass, replace
from typing import Protocol

from speech112.runtime.bundle import ScenarioBundle, render
from speech112.runtime.conversation_controls import CONTACT_REPLY
from speech112.runtime.semantic_frame import SemanticFrame


class IntentRecognizer(Protocol):
    labels: tuple[str, ...]

    async def understand(self, text: str, history: tuple[str, ...]) -> SemanticFrame: ...


@dataclass(frozen=True, slots=True)
class Reply:
    text: str
    response_id: str
    expected_revision: int
    next_state: str
    end_call: bool = False
    fragments: tuple[str, ...] = ()
    choices: tuple[tuple[str, str], ...] = ()
    operator_text: str | None = None


class ScenarioDialogue:
    def __init__(self, bundle: ScenarioBundle, recognizer: IntentRecognizer, seed: int):
        self._document = bundle.document
        self._recognizer = recognizer
        self._rng = random.Random(seed)
        self.state = self._document["initial_state"]
        self.revision = 0
        self._last_choices: dict[str, str] = {}
        self._last_reply: Reply | None = None
        self._history: list[str] = []
        unsupported = {i["id"] for i in self._document["intents"]} - set(recognizer.labels)
        if unsupported:
            raise ValueError(f"Scenario uses untrained semantic intents: {sorted(unsupported)}")

    def _choose(self, key: str, variants: list[str]) -> str:
        texts = [render(v, self._document["facts"]) for v in variants]
        alternatives = [t for t in texts if t != self._last_choices.get(key)]
        return self._rng.choice(alternatives or texts)

    def initiative(self, kind: str) -> Reply:
        if kind not in ("greeting", "check_in", "clarification", "contact"):
            raise ValueError("Unknown initiative")
        text = self._choose(kind, self._document.get(kind, CONTACT_REPLY))
        return Reply(
            text,
            kind,
            self.revision,
            self.state,
            choices=((kind, text),),
        )

    async def respond(self, text: str) -> Reply:
        plan = await self._recognizer.understand(text, tuple(self._history))
        intents = set(plan.intents)
        if intents == {"contact"}:
            return replace(self.initiative("contact"), operator_text=text)
        if intents == {"repeat"}:
            previous = self._last_reply or self.initiative("greeting")
            return Reply(
                previous.text,
                "repeat",
                self.revision,
                self.state,
                fragments=previous.fragments,
                operator_text=text,
            )
        if not intents or intents & {"other", "contact", "repeat"} or len(intents) > 3:
            return replace(self.initiative("clarification"), operator_text=text)
        responses = [
            r
            for r in self._document["responses"]
            if r["intent"] in intents and self.state in r["states"]
        ]
        if {r["intent"] for r in responses} != intents:
            return replace(self.initiative("clarification"), operator_text=text)
        # A hangup mixed with a question must never terminate an unfinished exchange.
        if len(responses) > 1 and any(r.get("end_call", False) for r in responses):
            return replace(self.initiative("clarification"), operator_text=text)
        next_states = {r["next_state"] for r in responses if "next_state" in r}
        if len(next_states) > 1:
            return replace(self.initiative("clarification"), operator_text=text)
        choices = tuple((r["id"], self._choose(r["id"], r["variants"])) for r in responses)
        fragments = tuple(value for _, value in choices)
        return Reply(
            " ".join(fragments),
            "+".join(key for key, _ in choices),
            self.revision,
            next(iter(next_states), self.state),
            any(r.get("end_call", False) for r in responses),
            fragments,
            choices,
            text,
        )

    def commit(self, reply: Reply) -> None:
        if reply.expected_revision != self.revision:
            raise ValueError("Stale dialogue response")
        self.state = reply.next_state
        self.revision += 1
        self._last_choices.update(reply.choices)
        if reply.operator_text is not None:
            self._history.extend((reply.operator_text, reply.text))
            self._history = self._history[-4:]
        if reply.response_id not in ("clarification", "check_in", "repeat"):
            self._last_reply = reply

    def snapshot(self) -> dict:
        return {"state": self.state, "revision": self.revision}
