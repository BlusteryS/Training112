from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from speech112.config import QwenTtsConfig, VoiceConfig
from speech112.providers import AudioChunk
from speech112.qwen_protocol import FRAME_SIZE, MAX_FRAME_BYTES, SAMPLE_RATE
from speech112.speech_text import normalize_for_tts


class QwenSynthesizer:
    """One CUDA worker in an isolated environment, shared by immutable voice handles."""

    def __init__(self, process: asyncio.subprocess.Process, voices: tuple[VoiceConfig, ...]):
        self._process = process
        self._voices = {voice.id for voice in voices}
        self._lock = asyncio.Lock()
        self._pending_read: asyncio.Task[tuple[bytes, bytes]] | None = None
        self._request_id = 0
        self._cleanup: asyncio.Task[None] | None = None
        self._failure: Exception | None = None
        self._closing = False
        self._watcher = asyncio.create_task(self._watch_process(), name="qwen-process")

    async def _watch_process(self) -> None:
        code = await self._process.wait()
        if not self._closing:
            self._failure = RuntimeError(f"Процесс Qwen завершился с кодом {code}")
            logging.error("%s", self._failure)

    @property
    def available(self) -> bool:
        return (
            not self._closing
            and self._failure is None
            and self._process.returncode is None
            and self._process.stdin is not None
            and not self._process.stdin.is_closing()
        )

    def _require_available(self) -> None:
        if not self.available:
            raise RuntimeError(
                "Qwen TTS недоступен: требуется перезапуск голосового сервера"
            ) from self._failure

    @classmethod
    async def start(cls, config: QwenTtsConfig, voices: tuple[VoiceConfig, ...]) -> QwenSynthesizer:
        env = os.environ.copy()
        env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
        env["HF_HUB_OFFLINE"] = "1"
        env["TRANSFORMERS_OFFLINE"] = "1"
        # Use the worker's own CUDA libraries, not the parent environment's versions.
        env.pop("LD_LIBRARY_PATH", None)
        process = await asyncio.create_subprocess_exec(
            str(Path(config.python).absolute()),
            "-m",
            "speech112.qwen_worker",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            env=env,
        )
        runtime = cls(process, voices)
        try:
            await runtime._send({"config": asdict(config), "voices": [asdict(v) for v in voices]})
            async with asyncio.timeout(180):
                kind, payload = await runtime._read()
            if kind != b"R":
                raise RuntimeError(payload.decode("utf-8"))
        except BaseException:
            await runtime.close()
            raise
        return runtime

    def speaker(self, voice_id: str) -> QwenSpeaker:
        if voice_id not in self._voices:
            raise ValueError("Неизвестный голос Qwen")
        return QwenSpeaker(self, voice_id)

    async def _send(self, value: dict) -> None:
        if self._process.stdin is None or self._process.stdin.is_closing():
            raise RuntimeError("Канал команд Qwen закрыт")
        self._process.stdin.write((json.dumps(value, ensure_ascii=False) + "\n").encode())
        await self._process.stdin.drain()

    async def _read(self) -> tuple[bytes, bytes]:
        if self._process.stdout is None:
            raise RuntimeError("Канал звука Qwen закрыт")
        try:
            size = FRAME_SIZE.unpack(await self._process.stdout.readexactly(FRAME_SIZE.size))[0]
            if not 1 <= size <= MAX_FRAME_BYTES:
                raise RuntimeError("Повреждён кадр Qwen")
            data = await self._process.stdout.readexactly(size)
        except asyncio.IncompleteReadError as error:
            raise RuntimeError("Процесс Qwen завершился, требуется перезапуск сервиса") from error
        return data[:1], data[1:]

    async def _discard_response(self) -> None:
        async with asyncio.timeout(30):
            while (await self._next_frame())[0] != b"D":
                pass

    async def _cancel_and_drain(self, request_id: int) -> None:
        # Runtime-owned task keeps the IPC lock, independent of the caller's lifetime.
        # A second cancellation (disconnect after barge-in) must not kill shared TTS.
        try:
            await self._send({"cancel": request_id})
            await self._discard_response()
        except Exception as error:
            self._failure = error
            logging.exception("Не удалось завершить отменённый запрос Qwen %s", request_id)
        finally:
            self._lock.release()

    async def _next_frame(self) -> tuple[bytes, bytes]:
        # Cancellation must not consume a frame header and lose its payload.
        if self._pending_read is None:
            self._pending_read = asyncio.create_task(self._read())
        result = await asyncio.shield(self._pending_read)
        self._pending_read = None
        return result

    async def _stream(self, text: str, voice_id: str) -> AsyncIterator[AudioChunk]:
        text = normalize_for_tts(text)
        self._require_available()
        await self._lock.acquire()
        done = False
        sent = False
        try:
            self._require_available()
            self._request_id += 1
            request_id = self._request_id
            sent = True
            await self._send({"id": request_id, "voice": voice_id, "text": text})
            while True:
                async with asyncio.timeout(30):
                    kind, payload = await self._next_frame()
                if kind == b"D":
                    done = True
                    return
                if kind == b"E":
                    raise RuntimeError(payload.decode("utf-8"))
                if kind != b"A" or len(payload) <= SAMPLE_RATE.size:
                    raise RuntimeError("Некорректный аудиопакет Qwen")
                rate = SAMPLE_RATE.unpack(payload[: SAMPLE_RATE.size])[0]
                samples = np.frombuffer(payload[SAMPLE_RATE.size :], dtype="<f4")
                if rate != 24000 or not np.isfinite(samples).all():
                    raise RuntimeError("Некорректный аудиосигнал Qwen")
                yield AudioChunk(samples, rate)
        finally:
            if sent and not done and self._process.returncode is None:
                self._cleanup = asyncio.create_task(
                    self._cancel_and_drain(request_id), name=f"qwen-drain-{request_id}"
                )
            else:
                self._lock.release()

    async def close(self) -> None:
        self._closing = True
        if self._cleanup is not None:
            await asyncio.shield(self._cleanup)
        if self._pending_read is not None:
            self._pending_read.cancel()
            await asyncio.gather(self._pending_read, return_exceptions=True)
            self._pending_read = None
        if self._process.returncode is not None:
            return
        self._process.terminate()
        try:
            async with asyncio.timeout(10):
                await self._process.wait()
        except TimeoutError:
            self._process.kill()
            await self._process.wait()
        await self._watcher


@dataclass(frozen=True, slots=True)
class QwenSpeaker:
    synthesizer: QwenSynthesizer
    voice_id: str

    def stream(self, text: str) -> AsyncIterator[AudioChunk]:
        return self.synthesizer._stream(text, self.voice_id)
