"""One learned semantic plan, scenario routing and transactional playback state."""

from __future__ import annotations

import random
from dataclasses import dataclass, replace
from typing import Protocol

from speech112.runtime.bundle import ScenarioBundle, render
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
        self._used_choices: dict[str, set[str]] = {}
        self._choice_catalog: dict[str, set[str]] = {}
        self._last_reply: Reply | None = None
        self._answered: dict[str, str] = {}
        self._history: list[str] = []
        self._routes = {
            state: {response["intent"]: response for response in self._document["responses"]
                    if state in response["states"]}
            for state in self._document["states"]
        }
        self._response_intents = {
            response["id"]: response["intent"] for response in self._document["responses"]
        }
        unsupported = {i["id"] for i in self._document["intents"]} - set(recognizer.labels)
        if unsupported:
            raise ValueError(f"Scenario uses untrained semantic intents: {sorted(unsupported)}")

    def _choose(self, key: str, variants: list[str]) -> str:
        texts = [render(v, self._document["facts"]) for v in variants]
        self._choice_catalog[key] = set(texts)
        alternatives = [t for t in texts if t not in self._used_choices.get(key, set())]
        if not alternatives:
            alternatives = [t for t in texts if t != self._last_choices.get(key)]
        return self._rng.choice(alternatives or texts)

    @staticmethod
    def _variants(response: dict, compound: bool) -> list[str]:
        if not compound:
            return response["variants"]
        return response.get("compact_variants") or response["variants"]

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
        plan = await self._recognizer.understand(text, tuple(self._history))
        intents = tuple(dict.fromkeys(plan.intents))
        if intents == ("contact",):
            return replace(self.initiative("contact"), operator_text=text)
        if intents == ("repeat",):
            previous = self._last_reply or self.initiative("greeting")
            return Reply(
                previous.text,
                "repeat",
                self.revision,
                self.state,
                fragments=previous.fragments,
                operator_text=text,
            )
        if plan.action == "repeat" and intents:
            routes = self._routes[self.state]
            if any(intent in self._answered or intent in routes for intent in intents):
                choices = []
                fragments = []
                for intent in intents:
                    if intent in self._answered:
                        fragments.append(self._answered[intent])
                    elif intent in routes:
                        route = routes[intent]
                        value = self._choose(route["id"], self._variants(route, len(intents) > 1))
                        choices.append((route["id"], value))
                        fragments.append(value)
                    else:
                        value = self._choose("clarification", self._document["clarification"])
                        choices.append(("clarification", value))
                        fragments.append(value)
                return Reply(" ".join(fragments), "repeat", self.revision, self.state,
                             fragments=tuple(fragments), choices=tuple(choices), operator_text=text)
        if not intents or set(intents) & {"other", "contact", "repeat"} or len(intents) > 6:
            return replace(self.initiative("clarification"), operator_text=text)
        routes = self._routes[self.state]
        missing = [intent for intent in intents if intent not in routes]
        responses = [routes[intent] for intent in intents if intent in routes]
        if not responses:
            return replace(self.initiative("clarification"), operator_text=text)
        # Answer the questions before accepting a mixed farewell.
        if len(responses) + len(missing) > 1 and any(r.get("end_call", False) for r in responses):
            responses = [r for r in responses if not r.get("end_call", False)]
        if not responses:
            return replace(self.initiative("clarification"), operator_text=text)
        next_states = {r["next_state"] for r in responses if "next_state" in r}
        if len(next_states) > 1:
            return replace(self.initiative("clarification"), operator_text=text)
        choices = tuple(
            (response["id"], self._choose(response["id"], self._variants(response, len(responses) > 1)))
            for response in responses
        )
        if missing:
            choices += (("clarification", self._choose("clarification", self._document["clarification"])),)
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
        for key, value in reply.choices:
            used = self._used_choices.setdefault(key, set())
            if used >= self._choice_catalog[key]:
                used.clear()
            used.add(value)
        for key, value in reply.choices:
            if key in self._response_intents:
                self._answered[self._response_intents[key]] = value
        if reply.operator_text is not None:
            self._history.extend((reply.operator_text, reply.text))
            self._history = self._history[-4:]
        if reply.response_id not in ("clarification", "check_in", "repeat"):
            self._last_reply = reply

    def snapshot(self) -> dict:
        return {"state": self.state, "revision": self.revision}
