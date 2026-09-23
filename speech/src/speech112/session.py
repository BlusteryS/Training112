"""Full-duplex session. Recognition is already incremental when an utterance ends."""

from __future__ import annotations

import asyncio
import time
from contextlib import aclosing

from speech112.config import ConversationConfig
from speech112.events import EventKind
from speech112.providers import AudioChannel, SessionObserver, SpeechSynthesizer
from speech112.runtime.dialogue import Reply, ScenarioDialogue


class VoiceSession:
    def __init__(
        self,
        config: ConversationConfig,
        audio: AudioChannel,
        dialogue: ScenarioDialogue,
        tts: SpeechSynthesizer,
        observer: SessionObserver,
    ):
        self.config, self.audio, self.dialogue = config, audio, dialogue
        self.tts, self.observer = tts, observer
        self.response: asyncio.Task | None = None
        self.finished = False
        self.turn = 0

    async def cancel_response(self):
        self.audio.interrupt()
        if self.response:
            self.response.cancel()
            await asyncio.gather(self.response, return_exceptions=True)
            self.response = None

    async def run(self):
        detector = asyncio.create_task(self.audio.detect_speech())
        incoming = asyncio.create_task(self.audio.events.get())
        suspended = False
        speaking = False
        idle_at = None
        try:
            await self.observer.emit("ready", protocol=2)
            self.response = asyncio.create_task(self.say(self.dialogue.initiative("greeting")))
            while not self.finished:
                tasks = {detector, incoming}
                if self.response:
                    tasks.add(self.response)
                timeout = None if idle_at is None else max(0, idle_at - time.monotonic())
                done, _ = await asyncio.wait(
                    tasks, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
                )
                if detector in done:
                    detector.result()
                    raise RuntimeError("Audio detector stopped")
                if incoming in done:
                    event = incoming.result()
                    incoming = asyncio.create_task(self.audio.events.get())
                    idle_at = None
                    if event.kind is EventKind.SUSPENDED:
                        suspended, speaking = True, False
                        await self.cancel_response()
                    elif event.kind is EventKind.RESUMED:
                        suspended = False
                        idle_at = time.monotonic() + self.config.idle_seconds
                        await self.observer.emit("resumed", state=self.dialogue.snapshot())
                    elif not suspended and event.kind in (
                        EventKind.SPEECH_STARTED,
                        EventKind.BARGE_IN,
                    ):
                        speaking = True
                        await self.cancel_response()
                        await self.observer.emit("listening")
                    elif not suspended and event.kind is EventKind.SPEECH_ENDED:
                        speaking = False
                        if event.text:
                            await self.cancel_response()
                            self.response = asyncio.create_task(
                                self.answer(event.text, event.ended_at)
                            )
                        else:
                            idle_at = time.monotonic() + self.config.idle_seconds
                elif self.response and self.response in done:
                    self.response.result()
                    self.response = None
                    if not speaking and not suspended:
                        idle_at = time.monotonic() + self.config.idle_repeat_seconds
                elif not done and not suspended and not speaking:
                    idle_at = None
                    self.response = asyncio.create_task(
                        self.say(self.dialogue.initiative("check_in"))
                    )
        finally:
            detector.cancel()
            incoming.cancel()
            await asyncio.gather(detector, incoming, return_exceptions=True)
            await self.cancel_response()
            self.audio.close()

    async def answer(self, text: str, ended_at: float | None):
        await self.observer.emit("transcript", text=text)
        reply = await self.dialogue.respond(text)
        await self.say(reply, ended_at)

    async def say(self, reply: Reply, ended_at: float | None = None):
        self.turn += 1
        turn = self.turn
        generation = self.audio.playback_generation
        announced = False
        try:
            for fragment in reply.fragments or (reply.text,):
                async with aclosing(self.tts.stream(fragment)) as stream:
                    async for chunk in stream:
                        if generation != self.audio.playback_generation:
                            return
                        if not announced:
                            # Server enqueue time is not the first audible sample on the client.
                            await self.observer.emit(
                                "assistant",
                                text=reply.text,
                                turn=turn,
                                response_id=reply.response_id,
                                end_to_audio_enqueued_ms=(
                                    (time.perf_counter() - ended_at) * 1000 if ended_at else None
                                ),
                            )
                            announced = True
                        if not await self.audio.play(chunk):
                            return
            if not announced:
                raise RuntimeError("TTS returned no audio")
            await self.audio.drain()
            if generation != self.audio.playback_generation:
                return
            self.dialogue.commit(reply)
            await self.observer.emit("turn_completed", turn=turn, state=self.dialogue.snapshot())
            if reply.end_call:
                await self.observer.emit("ended", reason="caller_hangup")
                self.finished = True
        except asyncio.CancelledError:
            if announced:
                await self.observer.emit("turn_interrupted", turn=turn)
            raise
