"""Optional offline expansion of factual caller replies during scenario compilation."""

from __future__ import annotations

import copy
import json
import time

import httpx

from speech112.runtime.bundle import render
from speech112.speech_text import validate_speech_text


FACTS_BY_INTENT = {
    "incident": "incident",
    "victims": "victims",
    "victim_count": "victim_count",
    "age": "age",
    "consciousness": "consciousness",
    "breathing": "breathing",
    "danger": "danger",
    "fire": "fire",
    "weapon": "weapon",
    "description": "description_details",
    "vehicle": "vehicle",
}

REPLY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["replies"],
    "properties": {
        "replies": {
            "type": "array",
            "minItems": 2,
            "maxItems": 2,
            "items": {"type": "string", "minLength": 4, "maxLength": 180},
        }
    },
}

SYSTEM_PROMPT = (
    "Ты мужчина, позвонивший в службу 112. Напиши ровно два разных коротких ответа "
    "на вопрос оператора. Говори от первого лица, естественно, по-русски. "
    "Каждый ответ должен сообщать только установленный факт. Не придумывай "
    "обстоятельства, людей, имена, адреса, числа или причины. Не меняй смысл, "
    "отрицание и степень уверенности. Не добавляй приветствие, пояснения и встречные вопросы. "
    "Верни только JSON по заданной схеме."
)
MODEL_URL = "http://reply-generator:8080"


class ReplyGenerator:
    def __init__(self):
        self.client = httpx.Client(timeout=httpx.Timeout(120.0, connect=5.0), trust_env=False)

    def _wait_ready(self) -> None:
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            try:
                response = self.client.get(f"{MODEL_URL}/health", timeout=5)
                if response.status_code == 200:
                    return
                if response.status_code != 503:
                    response.raise_for_status()
            except httpx.TransportError:
                pass
            time.sleep(5)
        raise TimeoutError("Reply generator was not ready within 10 minutes")

    def _generate(self, questions: list[str], fact: str, examples: list[str]) -> list[str]:
        prompt = json.dumps({
            "вопросы_оператора": questions[:2],
            "установленный_факт": fact,
            "образцы_тона": examples[:2],
            "задание": "Скажи тот же факт двумя разными короткими фразами от лица заявителя.",
        }, ensure_ascii=False)
        response = self.client.post(
            f"{MODEL_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object", "schema": REPLY_SCHEMA},
                "temperature": 0.35,
                "top_p": 0.9,
                "max_tokens": 160,
                "stream": False,
            },
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        replies = json.loads(content)["replies"]
        if not isinstance(replies, list) or len(replies) != 2 or not all(
            isinstance(reply, str) for reply in replies
        ) or len(set(replies)) != 2:
            raise ValueError("Reply generator returned incomplete replies")
        for reply in replies:
            if not 4 <= len(reply) <= 180:
                raise ValueError("Reply generator returned an invalid reply")
            validate_speech_text(reply)
        return replies

    def __call__(self, source: dict) -> dict:
        document = copy.deepcopy(source)
        facts = document["facts"]
        questions = {intent["id"]: intent["examples"] for intent in document["intents"]}
        selected = [
            response for response in document["responses"]
            if FACTS_BY_INTENT.get(response["intent"]) in facts
            and not response.get("end_call")
            and len(response["variants"]) <= 14
        ]
        if selected:
            self._wait_ready()
        for response in selected:
            fact_key = FACTS_BY_INTENT[response["intent"]]
            originals = response["variants"]
            examples = list(dict.fromkeys(render(text, facts) for text in originals))
            generated = self._generate(questions[response["intent"]], facts[fact_key], examples)
            response["variants"] = list(dict.fromkeys([*originals, *generated]))
        return document
