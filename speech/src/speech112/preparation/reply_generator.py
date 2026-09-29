"""Prepare additional caller replies before a scenario is approved."""

from __future__ import annotations

import copy
import json
import time
from importlib.resources import files

import httpx

from speech112.runtime.bundle import render
from speech112.speech_text import validate_speech_text


_FACTS = {
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
_PROMPT = json.loads(
    files("speech112.contracts").joinpath("reply-generation.json").read_text()
)

_REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "variants": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {"type": "string", "minLength": 5, "maxLength": 180},
        }
    },
    "required": ["variants"],
    "additionalProperties": False,
}


class ReplyGenerator:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=180)

    def _ready(self) -> None:
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            try:
                response = self.client.get(f"{self.base_url}/health", timeout=5)
                if response.status_code == 200:
                    return
                if response.status_code != 503:
                    response.raise_for_status()
            except httpx.TransportError:
                pass
            time.sleep(5)
        raise RuntimeError("Reply generator did not become ready")

    def __call__(self, source: dict) -> dict:
        self._ready()
        document = copy.deepcopy(source)
        facts = document["facts"]
        for response in document["responses"]:
            fact_name = _FACTS.get(response["intent"])
            if fact_name is None or fact_name not in facts:
                continue
            fact = facts[fact_name]
            examples = list(dict.fromkeys(render(text, facts) for text in response["variants"]))[:4]
            request = {
                "messages": [
                    {"role": "system", "content": _PROMPT["system"]},
                    {"role": "user", "content": json.dumps({
                        "тема_вопроса": _PROMPT["topics"][response["intent"]],
                        "установленный_факт": fact,
                        "примеры_ответов": examples,
                        "задание": _PROMPT["task"],
                    }, ensure_ascii=False)},
                ],
                "response_format": {"type": "json_object", "schema": _REPLY_SCHEMA},
                "chat_template_kwargs": {"enable_thinking": False},
                "temperature": 0.5,
                "top_p": 0.8,
                "max_tokens": 256,
                "stream": False,
            }
            result = self.client.post(f"{self.base_url}/v1/chat/completions", json=request)
            result.raise_for_status()
            variants = json.loads(result.json()["choices"][0]["message"]["content"])["variants"]
            if len(variants) != 4 or len(set(variants)) != 4:
                raise ValueError("Reply generator returned incomplete variants")
            for text in variants:
                validate_speech_text(text)
            response["variants"] = variants
            response["compact_variants"] = variants[:2]
        return document
