"""Private ZeroMQ endpoint for the application backend."""

import asyncio
import json
import logging
import os
import signal
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import zmq
import zmq.asyncio

from speech112.config import AppConfig
from speech112.llm import OpenAiCompatibleDialogueModel
from speech112.metrics import TurnMetrics
from speech112.session import VoiceSession
from speech112.streaming_audio import SendJson, StreamingAudio
from speech112.stt import GigaAmRecognizer
from speech112.telephone_noise import PhoneRecordings, RecordedPhoneNoise
from speech112.transport_security import secure_socket
from speech112.tts_runtime import open_tts
from speech112.qwen_tts import QwenSynthesizer
from speech112.vad import SileroDetector

LOG = logging.getLogger(__name__)


@dataclass(slots=True)
class Peer:
    inbox: asyncio.Queue[tuple[bytes, bytes]] = field(
        default_factory=lambda: asyncio.Queue(maxsize=64)
    )
    task: asyncio.Task[None] | None = None


class Observer:
    def __init__(self, send: SendJson) -> None:
        self.send = send

    async def emit(self, event: str, **data: Any) -> None:
        payload = {
            key: value.as_dict() if isinstance(value, TurnMetrics) else value
            for key, value in data.items()
        }
        await self.send({"type": event, **payload})


class SpeechService:
    def __init__(
        self,
        socket: zmq.asyncio.Socket,
        config: AppConfig,
        stt: GigaAmRecognizer,
        llm: OpenAiCompatibleDialogueModel,
        tts: QwenSynthesizer,
        recordings: PhoneRecordings,
        max_sessions: int,
    ) -> None:
        self.socket = socket
        self.config = config
        self.stt = stt
        self.llm = llm
        self.tts = tts
        self.recordings = recordings
        self.max_sessions = max_sessions
        self.peers: dict[bytes, Peer] = {}

    async def send(self, identity: bytes, kind: bytes, payload: bytes) -> None:
        # A stalled backend must never suspend another conversation's audio.
        await self.socket.send_multipart([identity, kind, payload], flags=zmq.DONTWAIT)

    async def event(self, identity: bytes, value: dict) -> None:
        await self.send(identity, b"event", json.dumps(value, ensure_ascii=False).encode())

    async def receive(self) -> None:
        try:
            while True:
                frames = await self.socket.recv_multipart()
                if len(frames) != 3:
                    continue
                identity, kind, payload = frames
                try:
                    peer = self.peers.get(identity)
                    if peer is not None:
                        if peer.task is not None and not peer.task.cancelling():
                            try:
                                peer.inbox.put_nowait((kind, payload))
                            except asyncio.QueueFull:
                                peer.task.cancel()
                        continue
                    if kind != b"command":
                        continue
                    command = json.loads(payload)
                    if command["type"] == "voices":
                        await self.event(identity, {
                            "type": "voices", "default": self.config.voice_id,
                            "voices": [{"id": v.id, "name": v.caller_name, "age": v.caller_age}
                                       for v in self.config.voices],
                        })
                    elif command["type"] == "start":
                        if command.get("version") != 1:
                            raise ValueError("Несовместимая версия аудиопротокола")
                        config = self.config.for_voice(command["voice"])
                        if len(self.peers) >= self.max_sessions:
                            await self.event(identity, {
                                "type": "busy", "message": "Все линии заняты. Попробуйте позже.",
                            })
                            continue
                        peer = Peer()
                        self.peers[identity] = peer
                        peer.task = asyncio.create_task(self.conversation(identity, peer, config))
                        peer.task.add_done_callback(
                            lambda task, key=identity: self.peers.pop(key, None)
                        )
                except (ValueError, KeyError, TypeError):
                    with suppress(zmq.ZMQError):
                        await self.event(identity, {"type": "unavailable", "message": "Некорректный запрос сеанса."})
                except zmq.ZMQError:
                    LOG.warning("Backend disconnected or exceeded its transport queue")
        finally:
            tasks = [peer.task for peer in self.peers.values() if peer.task is not None]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def conversation(self, identity: bytes, peer: Peer, config: AppConfig) -> None:
        audio = None
        tasks = set()

        async def send_event(value: dict[str, object]) -> None:
            await self.event(identity, value)

        async def send_audio(value: bytes) -> None:
            await self.send(identity, b"audio", value)

        try:
            if not self.tts.available or not await self.llm.ready():
                await send_event({"type": "unavailable", "message": "Речевой сервис не готов."})
                return
            detector = await asyncio.to_thread(SileroDetector, config.audio.input_sample_rate)
            audio = StreamingAudio(
                config.audio, config.vad, detector, send_event, send_audio,
                RecordedPhoneNoise(self.recordings, config.telephone.level),
            )
            session = VoiceSession(config, audio, self.stt, self.llm,
                                   self.tts.speaker(config.voice_id), Observer(send_event))
            tasks = {asyncio.create_task(session.run()),
                     asyncio.create_task(self.receive_audio(identity, peer, audio))}
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except asyncio.CancelledError:
            raise
        except Exception:
            LOG.exception("Conversation failed")
            with suppress(zmq.ZMQError):
                await send_event({"type": "unavailable", "message": "Разговор прерван из-за ошибки сервиса."})
        finally:
            if audio is not None:
                audio.close()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            with suppress(zmq.ZMQError):
                await send_event({"type": "closed"})

    async def receive_audio(self, identity: bytes, peer: Peer, audio: StreamingAudio) -> None:
        while True:
            async with asyncio.timeout(15):
                kind, payload = await peer.inbox.get()
            if kind == b"audio":
                audio.feed_pcm16(payload)
                continue
            if kind != b"command":
                raise ValueError("Unknown message kind")
            event = json.loads(payload)
            match event["type"]:
                case "end":
                    return
                case "ping":
                    await self.event(identity, {"type": "pong"})
                case "played":
                    generation, sequence = event["generation"], event["id"]
                    if type(generation) is not int or type(sequence) is not int:
                        raise ValueError("Invalid playback acknowledgement")
                    audio.acknowledge(generation, sequence)
                case _:
                    raise ValueError("Unknown command")


async def serve() -> None:
    config = AppConfig.load(Path(os.environ.get("SPEECH_CONFIG", "config/default.toml")))
    max_sessions = int(os.environ.get("SPEECH_MAX_SESSIONS", "1"))
    if not 1 <= max_sessions <= 128:
        raise ValueError("SPEECH_MAX_SESSIONS must be between 1 and 128")
    if (config.audio.input_sample_rate, config.audio.output_sample_rate, config.audio.block_ms) != (16000, 24000, 32):
        raise ValueError("Protocol v1 requires 16 kHz input, 24 kHz output and 32 ms frames")
    recordings = await asyncio.to_thread(PhoneRecordings.load, Path(config.telephone.directory), config.audio.output_sample_rate)
    stt = await asyncio.to_thread(GigaAmRecognizer, config.stt)
    await asyncio.to_thread(stt.warmup)
    async with open_tts(config) as tts:
        llm = OpenAiCompatibleDialogueModel(config.llm)
        context = zmq.asyncio.Context()
        socket = context.socket(zmq.ROUTER)
        socket.setsockopt(zmq.LINGER, 0)
        socket.setsockopt(zmq.SNDHWM, 32)
        socket.setsockopt(zmq.RCVHWM, 64)
        socket.setsockopt(zmq.MAXMSGSIZE, 4096)
        socket.setsockopt(zmq.ROUTER_MANDATORY, 1)
        try:
            with secure_socket(context, socket):
                socket.bind(os.environ.get("SPEECH_BIND", "tcp://0.0.0.0:5555"))
                service = SpeechService(socket, config, stt, llm, tts, recordings, max_sessions)
                task = asyncio.create_task(service.receive())
                loop = asyncio.get_running_loop()
                for signum in (signal.SIGINT, signal.SIGTERM):
                    loop.add_signal_handler(signum, task.cancel)
                LOG.info("Speech ready; conversation limit: %s", max_sessions)
                with suppress(asyncio.CancelledError):
                    await task
        finally:
            socket.close()
            context.term()
            await llm.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(serve())


if __name__ == "__main__":
    main()
