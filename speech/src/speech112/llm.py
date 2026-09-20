from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import aclosing

import httpx

from speech112.config import LlmConfig
from speech112.dialogue_protocol import decode_reply
from speech112.providers import DialogueControl


class OpenAiCompatibleDialogueModel:
    def __init__(self, config: LlmConfig) -> None:
        self._config = config
        self._client = httpx.AsyncClient(
            base_url=config.base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {config.api_key}"},
            timeout=httpx.Timeout(60, connect=5),
        )

    async def stream_reply(
        self, messages: list[dict[str, str]]
    ) -> AsyncIterator[str | DialogueControl]:
        async with (
            aclosing(self._stream_text(messages)) as tokens,
            aclosing(decode_reply(tokens)) as reply,
        ):
            async for item in reply:
                yield item

    async def _stream_text(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        body = {
            "model": self._config.model,
            "messages": messages,
            "temperature": self._config.temperature,
            "top_p": self._config.top_p,
            "stream": True,
        }
        finished = False
        async with self._client.stream("POST", "/chat/completions", json=body) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload == "[DONE]":
                    if not finished:
                        raise ValueError("Модель не подтвердила окончание ответа")
                    return
                data = json.loads(payload)
                reason = data["choices"][0].get("finish_reason")
                if reason is not None:
                    if reason != "stop":
                        raise ValueError(f"Ответ модели оборван: {reason}")
                    finished = True
                token = data["choices"][0].get("delta", {}).get("content")
                if token:
                    yield token
        raise ConnectionError("Поток ответа модели оборвался без окончания")

    async def close(self) -> None:
        await self._client.aclose()

    async def ready(self) -> bool:
        try:
            response = await self._client.get("/models", timeout=2)
            return response.is_success
        except httpx.RequestError:
            return False
