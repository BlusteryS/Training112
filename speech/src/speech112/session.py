from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import aclosing

import numpy as np

from speech112.config import AppConfig
from speech112.events import EventKind, SpeechEvent
from speech112.metrics import TurnMetrics
from speech112.providers import (
    AudioChannel,
    AudioChunk,
    DialogueControl,
    DialogueModel,
    SessionObserver,
    SpeechRecognizer,
    SpeechSynthesizer,
)
from speech112.scenario import Initiative, initiative_messages, system_prompt
from speech112.speech_text import sentence_boundaries, validate_speech_text


class VoiceSession:
    def __init__(
        self,
        config: AppConfig,
        audio: AudioChannel,
        stt: SpeechRecognizer,
        llm: DialogueModel,
        tts: SpeechSynthesizer,
        observer: SessionObserver,
    ) -> None:
        self._config = config
        self._audio = audio
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._observer = observer
        self._messages = [
            {
                "role": "system",
                "content": system_prompt(config.scenario),
            }
        ]
        self._response_task: asyncio.Task[None] | None = None
        self._turn = 0
        self._finished = asyncio.Event()
        self._operator_speaking = False
        self._idle_count = 0

    async def run(self) -> None:
        detector = asyncio.create_task(self._audio.detect_speech())
        finished = asyncio.create_task(self._finished.wait())
        event_task: asyncio.Task[SpeechEvent] | None = None
        try:
            await self._observer.emit("ready")
            event_task = asyncio.create_task(self._audio.events.get())
            self._start_response(initiative=Initiative.GREETING)
            idle_at: float | None = None
            while True:
                waiting = {detector, event_task, finished}
                if self._response_task is not None:
                    waiting.add(self._response_task)
                timeout = None if idle_at is None else max(0, idle_at - time.perf_counter())
                done, _ = await asyncio.wait(
                    waiting, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
                )
                if finished in done:
                    if self._response_task is not None:
                        await self._response_task
                    return
                if detector in done:
                    event_task.cancel()
                    detector.result()
                    raise RuntimeError("Детектор речи неожиданно завершил работу")
                # Microphone activity wins races against response completion / idle expiry.
                if event_task in done:
                    event = event_task.result()
                    event_task = asyncio.create_task(self._audio.events.get())
                    idle_at = None
                    self._idle_count = 0
                    if event.kind in (EventKind.SPEECH_STARTED, EventKind.BARGE_IN):
                        self._operator_speaking = True
                        await self._cancel_response(interrupt=event.kind is not EventKind.BARGE_IN)
                        await self._observer.emit(
                            "barge_in" if event.kind is EventKind.BARGE_IN else "listening"
                        )
                    elif event.kind is EventKind.SPEECH_ENDED:
                        self._operator_speaking = False
                        if event.audio is not None:
                            self._start_response(event=event)
                        else:
                            idle_at = time.perf_counter() + self._config.conversation.idle_seconds
                elif self._response_task is not None and self._response_task in done:
                    self._response_task.result()
                    self._response_task = None
                    if not self._operator_speaking:
                        delay = (
                            self._config.conversation.idle_repeat_seconds
                            if self._idle_count
                            else self._config.conversation.idle_seconds
                        )
                        idle_at = time.perf_counter() + delay
                elif not done and not self._operator_speaking:
                    self._idle_count += 1
                    self._start_response(initiative=Initiative.CHECK_IN)
                    idle_at = None
        finally:
            detector.cancel()
            finished.cancel()
            if event_task is not None:
                event_task.cancel()
            tasks = [task for task in (detector, event_task, finished) if task is not None]
            await asyncio.gather(*tasks, return_exceptions=True)
            await self._cancel_response()
            self._audio.close()

    def _start_response(
        self, *, event: SpeechEvent | None = None, initiative: Initiative | None = None
    ) -> None:
        self._turn += 1
        metrics = TurnMetrics(
            turn=self._turn,
            started_at=(event.ended_at if event else None) or time.perf_counter(),
        )
        audio = event.audio if event else None
        if audio is not None:
            metrics.utterance_seconds = len(audio) / self._config.audio.input_sample_rate
        self._response_task = asyncio.create_task(self._handle_turn(audio, metrics, initiative))

    async def _handle_turn(
        self, audio, metrics: TurnMetrics, initiative: Initiative | None = None
    ) -> None:
        reply_parts: list[str] = []
        collector: asyncio.Task[None] | None = None
        generation = self._audio.playback_generation
        try:
            if initiative is None:
                started = time.perf_counter()
                transcript = await self._stt.transcribe(audio)
                metrics.stt_ms = (time.perf_counter() - started) * 1000
                if not transcript:
                    await self._observer.emit("error", message="Речь не распознана")
                    return
                await self._observer.emit("transcript", text=transcript)
                self._messages.append({"role": "user", "content": transcript})
                messages = self._messages
            else:
                messages = initiative_messages(initiative)

            first_audio_at: float | None = None
            sentences: asyncio.Queue[str | DialogueControl | Exception | None] = asyncio.Queue(
                maxsize=4
            )
            end_call = False
            collector = asyncio.create_task(self._collect_sentences(sentences, metrics, messages))
            while (sentence := await sentences.get()) is not None:
                if isinstance(sentence, Exception):
                    raise sentence
                if sentence is DialogueControl.END_CALL:
                    if initiative is not None:
                        raise ValueError("Самостоятельная реплика не может завершать звонок")
                    end_call = True
                    continue
                tts_started = time.perf_counter()
                announced = False
                completed = True
                async with aclosing(self._tts.stream(sentence)) as chunks:
                    async for chunk in chunks:
                        if not len(chunk.samples):
                            continue
                        if first_audio_at is None:
                            first_audio_at = time.perf_counter()
                            metrics.tts_first_audio_ms = (first_audio_at - tts_started) * 1000
                            metrics.end_to_first_audio_ms = (
                                first_audio_at - metrics.started_at
                            ) * 1000
                        if not announced:
                            # Queue silence at the text boundary, not between TTS chunks.
                            # It follows prior speech even when playback lags generation.
                            pause_samples = (
                                chunk.sample_rate * self._config.conversation.part_pause_ms // 1000
                            )
                            if reply_parts and pause_samples:
                                completed = await self._audio.play(
                                    AudioChunk(
                                        samples=np.zeros(pause_samples, dtype=np.float32),
                                        sample_rate=chunk.sample_rate,
                                    )
                                )
                                if not completed:
                                    break
                            await self._observer.emit(
                                "assistant", text=sentence.strip(), turn=metrics.turn
                            )
                            announced = True
                        completed = await self._audio.play(chunk)
                        if not completed:
                            break
                if announced:
                    reply_parts.append(sentence)
                elif completed:
                    raise RuntimeError("TTS не вернул звук для реплики")
                if not completed:
                    metrics.interrupted = True
                    break
            await self._audio.drain()
            metrics.interrupted |= generation != self._audio.playback_generation
            await self._observer.emit("metrics", value=metrics)
            if (
                end_call
                and not metrics.interrupted
                and generation == self._audio.playback_generation
            ):
                await self._observer.emit("ended", reason="caller_hangup")
                self._finished.set()
        except asyncio.CancelledError:
            metrics.interrupted = True
            await self._observer.emit("metrics", value=metrics)
            raise
        except Exception as error:
            self._audio.interrupt()
            logging.exception("Ошибка обработки реплики")
            await self._observer.emit("error", message=str(error))
        finally:
            if collector is not None:
                collector.cancel()
                await asyncio.gather(collector, return_exceptions=True)
            if reply_parts:
                reply = " ".join(reply_parts)
                if metrics.interrupted:
                    reply += " [Оператор прервал ответ.]"
                self._messages.append({"role": "assistant", "content": reply})

    async def _collect_sentences(
        self, output: asyncio.Queue, metrics: TurnMetrics, messages: list[dict[str, str]]
    ) -> None:
        started = time.perf_counter()

        async def tokens() -> AsyncIterator[str | DialogueControl]:
            first = True
            async with aclosing(self._llm.stream_reply(messages)) as stream:
                async for token in stream:
                    if first:
                        metrics.llm_first_token_ms = (time.perf_counter() - started) * 1000
                        first = False
                    yield token

        try:
            async with aclosing(tokens()) as stream:
                async for sentence in self._sentences(stream):
                    if isinstance(sentence, str):
                        validate_speech_text(sentence)
                    await output.put(sentence)
        except Exception as error:
            await output.put(error)
        else:
            await output.put(None)

    async def _sentences(
        self, tokens: AsyncIterator[str | DialogueControl]
    ) -> AsyncIterator[str | DialogueControl]:
        buffer = ""
        async for token in tokens:
            if isinstance(token, DialogueControl):
                if buffer.strip():
                    yield buffer.strip()
                buffer = ""
                yield token
                continue
            buffer += token
            boundaries = list(sentence_boundaries(buffer))
            boundary = boundaries[-1] if boundaries else None
            complete = buffer[: boundary.start()].strip() if boundary else ""
            if complete and len(complete) >= self._config.llm.first_sentence_min_chars:
                yield complete
                buffer = buffer[boundary.end() :]
        if buffer.strip():
            yield buffer.strip()

    async def _cancel_response(self, *, interrupt: bool = True) -> None:
        if interrupt:
            self._audio.interrupt()
        response_task = self._response_task
        self._response_task = None
        if response_task is not None and not response_task.done():
            response_task.cancel()
            await asyncio.gather(response_task, return_exceptions=True)
