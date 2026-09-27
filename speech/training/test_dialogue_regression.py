"""Dialogue behavior independent of the speech recognizer and model weights."""

import asyncio
import itertools
import json
import unittest
from pathlib import Path

from speech112.runtime.bundle import ScenarioBundle
from speech112.runtime.dialogue import ScenarioDialogue
from speech112.runtime.context_input import question_parts
from speech112.runtime.semantic_frame import SemanticFrame


TEMPLATE = Path(__file__).resolve().parents[1] / "src/speech112/contracts/demo-scenario.json"


class Recognizer:
    def __init__(self, targets):
        self.labels = tuple(targets)
        self.frame = SemanticFrame("request", (), 1.0)

    async def understand(self, text, history):
        return self.frame


class DialogueRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = json.loads(TEMPLATE.read_text())
        cls.bundle = ScenarioBundle.compile(cls.document)
        cls.routes = {route["intent"]: route for route in cls.document["responses"]}

    def setUp(self):
        self.recognizer = Recognizer(self.routes)
        self.dialogue = ScenarioDialogue(self.bundle, self.recognizer, 112)

    def answer(self, targets, action="request"):
        self.recognizer.frame = SemanticFrame(action, tuple(targets), 1.0)
        return asyncio.run(self.dialogue.respond("вопрос без запятых"))

    def test_all_prepared_lines_render(self):
        self.assertGreater(len(self.bundle.utterances()), 150)

    def test_compound_questions_keep_every_answer(self):
        available = [key for key in self.routes if key not in {"goodbye", "help_sent"}]
        for targets in itertools.combinations(available, 3):
            with self.subTest(targets=targets):
                reply = self.answer(targets)
                self.assertEqual(len(reply.fragments), 3)
                self.assertEqual(len(reply.choices), 3)
                self.assertFalse(reply.end_call)
                self.assertEqual(reply.text, " ".join(reply.fragments))

    def test_compound_reply_uses_prepared_short_answers(self):
        reply = self.answer(("incident", "address", "name"))
        self.assertEqual(len(reply.fragments), 3)
        for intent, fragment in zip(("incident", "address", "name"), reply.fragments):
            route = self.routes[intent]
            self.assertIn(fragment, [v.format_map(self.document["facts"])
                                     for v in route["compact_variants"]])
            self.assertIn(fragment, self.bundle.utterances())

    def test_existing_scenarios_use_their_first_prepared_answer(self):
        legacy = json.loads(TEMPLATE.read_text())
        for route in legacy["responses"]:
            route.pop("compact_variants", None)
        dialogue = ScenarioDialogue(ScenarioBundle.compile(legacy), self.recognizer, 112)
        self.recognizer.frame = SemanticFrame("request", ("incident", "address"), 1.0)
        reply = asyncio.run(dialogue.respond("что случилось где вы"))
        self.assertEqual(reply.fragments[0], legacy["facts"]["incident"])
        self.assertEqual(reply.fragments[1], legacy["facts"]["address"] + ".")

    def test_unpunctuated_questions_are_separate(self):
        self.assertEqual(question_parts("что произошло где вы находитесь сколько пострадавших"),
                         ("что произошло", "где вы находитесь", "сколько пострадавших"))

    def test_repeat_reuses_answer_after_state_change(self):
        first = self.answer(("address",))
        self.dialogue.commit(first)
        accepted = self.answer(("help_sent",), "inform")
        self.dialogue.commit(accepted)
        repeated = self.answer(("address",), "repeat")
        self.assertEqual(repeated.fragments, first.fragments)
        self.assertEqual(repeated.choices, ())
        self.dialogue.commit(repeated)

    def test_mixed_farewell_answers_question(self):
        accepted = self.answer(("help_sent",), "inform")
        self.dialogue.commit(accepted)
        reply = self.answer(("address", "goodbye"))
        self.assertEqual(len(reply.fragments), 1)
        self.assertFalse(reply.end_call)

    def test_variants_cycle_without_immediate_repetition(self):
        seen = set()
        for _ in range(len(self.routes["address"]["variants"])):
            reply = self.answer(("address",))
            self.assertNotIn(reply.text, seen)
            seen.add(reply.text)
            self.dialogue.commit(reply)


if __name__ == "__main__":
    unittest.main()
