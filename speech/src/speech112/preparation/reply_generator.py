"""Prepare additional caller replies before a scenario is approved."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import tempfile
import time
from importlib.resources import files
from pathlib import Path

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
        },
        "compact_variants": {
            "type": "array",
            "minItems": 2,
            "maxItems": 2,
            "items": {"type": "string", "minLength": 5, "maxLength": 100},
        },
    },
    "required": ["variants", "compact_variants"],
    "additionalProperties": False,
}


class ReplyGenerator:
    def __init__(self, base_url: str, cache_dir: Path):
        self.base_url = base_url.rstrip("/")
        self.cache_dir = cache_dir
        self.client = httpx.Client(timeout=180)
        self.ready = False

    def _ready(self) -> None:
        if self.ready:
            return
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            try:
                response = self.client.get(f"{self.base_url}/health", timeout=5)
                if response.status_code == 200:
                    self.ready = True
                    return
                if response.status_code != 503:
                    response.raise_for_status()
            except httpx.TransportError:
                pass
            time.sleep(5)
        raise RuntimeError("Reply generator did not become ready")

    @staticmethod
    def _key(intent: str, fact: str, examples: list[str]) -> str:
        material = json.dumps(
            [_PROMPT, _REPLY_SCHEMA, intent, fact, examples],
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        )
        return hashlib.sha256(material.encode()).hexdigest()

    @staticmethod
    def _read_replies(value: dict) -> dict:
        for field, count in (("variants", 4), ("compact_variants", 2)):
            texts = value[field]
            if not isinstance(texts, list) or len(texts) != count or not all(
                isinstance(text, str) for text in texts
            ):
                raise ValueError("Reply generator returned incomplete variants")
            for text in texts:
                validate_speech_text(text)
        if len(set(value["variants"] + value["compact_variants"])) != 6:
            raise ValueError("Reply generator returned duplicate variants")
        return value

    def _generate(self, intent: str, fact: str, examples: list[str]) -> dict:
        task = {
            "тема_вопроса": _PROMPT["topics"][intent],
            "установленный_факт": fact,
            "примеры_ответов": examples,
            "задание": _PROMPT["task"],
        }
        request = {
            "messages": [
                {"role": "system", "content": _PROMPT["system"]},
                {"role": "user", "content": json.dumps(task, ensure_ascii=False)},
            ],
            "response_format": {"type": "json_object", "schema": _REPLY_SCHEMA},
            "chat_template_kwargs": {"enable_thinking": False},
            "temperature": 0.5,
            "top_p": 0.8,
            "max_tokens": 384,
            "stream": False,
        }
        result = self.client.post(f"{self.base_url}/v1/chat/completions", json=request)
        result.raise_for_status()
        content = result.json()["choices"][0]["message"]["content"]
        return self._read_replies(json.loads(content))

    def _replies(self, intent: str, fact: str, examples: list[str]) -> dict:
        path = self.cache_dir / (self._key(intent, fact, examples) + ".json")
        if path.exists():
            return self._read_replies(json.loads(path.read_text()))
        self._ready()
        replies = self._generate(intent, fact, examples)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(dir=self.cache_dir)
        try:
            with os.fdopen(descriptor, "w") as output:
                json.dump(replies, output, ensure_ascii=False)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return replies

    def __call__(self, source: dict) -> dict:
        document = copy.deepcopy(source)
        facts = document["facts"]
        for response in document["responses"]:
            fact_name = _FACTS.get(response["intent"])
            if fact_name is None or fact_name not in facts:
                continue
            examples = list(dict.fromkeys(
                render(text, facts) for text in response["variants"]
            ))[:4]
            replies = self._replies(response["intent"], facts[fact_name], examples)
            response.update(replies)
        return document
