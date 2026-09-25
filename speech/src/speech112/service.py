"""Private protocol v2: immutable scenario admission, binary audio and same-node resume."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
import uuid
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path

import zmq
import zmq.asyncio

from speech112.config import AppConfig
from speech112.runtime.bundle import ScenarioBundle
from speech112.runtime.dialogue import ScenarioDialogue
from speech112.runtime.factory import open_models
from speech112.runtime.models import OnnxVad
from speech112.runtime.scheduler import Overloaded
from speech112.session import VoiceSession
from speech112.streaming_audio import StreamingAudio
from speech112.telephone_noise import PhoneRecordings, RecordedPhoneNoise
from speech112.transport_security import secure_socket

LOG = logging.getLogger(__name__)


@dataclass(slots=True)
class Peer:
    attempt_id: str
    bundle: ScenarioBundle
    inbox: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=64))
    task: asyncio.Task | None = None
    suspended_until: float | None = None


class Observer:
    def __init__(self, send):
        self.send = send

    async def emit(self, event, **payload):
        await self.send({"type": event, **payload})


class SpeechService:
    def __init__(self, socket, config, models, recordings):
        self.socket, self.config, self.recordings = socket, config, recordings
        self.scheduler, self.vad, self.asr, self.intent, self.voice = models
        self.peers: dict[bytes, Peer] = {}

    async def event(self, identity, value):
        await self.socket.send_multipart(
            [identity, b"event", json.dumps(value, ensure_ascii=False).encode()], flags=zmq.DONTWAIT
        )

    async def receive(self):
        try:
            while True:
                frames = await self.socket.recv_multipart()
                if len(frames) != 3:
                    continue
                identity, kind, payload = frames
                try:
                    if identity in self.peers:
                        peer = self.peers[identity]
                        if (kind == b"audio" and len(payload) != 1024) or len(payload) > 4096:
                            raise ValueError("Invalid session frame")
                        if peer.inbox.full():
                            await self.event(
                                identity, {"type": "unavailable", "code": "overloaded"}
                            )
                            peer.task.cancel()
                        else:
                            peer.inbox.put_nowait((kind, payload))
                        continue
                    if kind != b"command":
                        raise ValueError("Admission command required")
                    command = json.loads(payload)
                    if not isinstance(command, dict):
                        raise ValueError("Command must be an object")
                    # Acknowledgements/end may cross the final closed event in flight.
                    # They must not recreate a conversation or start a new admission.
                    if command.get("type") in ("played", "end"):
                        continue
                    if command.get("type") == "ping":
                        await self.event(identity, {"type": "pong"})
                        continue
                    if command.get("type") == "health":
                        await self.event(
                            identity,
                            {
                                "type": "health",
                                "protocol": 2,
                                "active": len(self.peers),
                                "pending_inference": self.scheduler.pending,
                                "understanding_sha256": getattr(self.intent, "version", None),
                            },
                        )
                        continue
                    if command.get("type") != "start" or command.get("version") != 2:
                        raise ValueError("Unsupported protocol")
                    attempt = str(uuid.UUID(command["attempt_id"]))
                    if any(p.attempt_id == attempt for p in self.peers.values()):
                        raise ValueError("Attempt already admitted on this node")
                    bundle = ScenarioBundle.parse(command["artifact"].encode(), command["sha256"])
                    peer = Peer(attempt, bundle)
                    self.peers[identity] = peer
                    peer.task = asyncio.create_task(self.conversation(identity, peer))
                    peer.task.add_done_callback(
                        lambda task, key=identity: self.peers.pop(key, None)
                    )
                except (ValueError, KeyError, TypeError) as error:
                    LOG.warning("Rejected speech command: %s", error)
                    with suppress(zmq.ZMQError):
                        await self.event(
                            identity, {"type": "unavailable", "code": "invalid_request"}
                        )
                    if identity in self.peers:
                        self.peers[identity].task.cancel()
                except zmq.ZMQError:
                    LOG.warning("Gateway transport unavailable")
        finally:
            tasks = [p.task for p in self.peers.values()]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def conversation(self, identity, peer):
        async def event(value):
            await self.event(identity, {**value, "attempt_id": peer.attempt_id})

        async def send_audio(payload):
            await self.socket.send_multipart([identity, b"audio", payload], flags=zmq.DONTWAIT)

        audio = StreamingAudio(
            self.config.audio,
            self.config.vad,
            OnnxVad(self.vad),
            event,
            send_audio,
            RecordedPhoneNoise(self.recordings, self.config.telephone.level),
            self.asr.stream(),
        )
        dialogue = ScenarioDialogue(peer.bundle, self.intent, uuid.UUID(peer.attempt_id).int)
        session = VoiceSession(
            self.config.conversation,
            audio,
            dialogue,
            self.voice,
            Observer(event),
        )
        tasks = set()
        try:
            await self.scheduler.run(self.voice.require, peer.bundle.utterances())
            tasks = {
                asyncio.create_task(session.run()),
                asyncio.create_task(self.receive_audio(identity, peer, audio)),
            }
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            LOG.exception("Speech attempt %s failed", peer.attempt_id)
            with suppress(zmq.ZMQError):
                await event(
                    {
                        "type": "unavailable",
                        "code": "overloaded" if isinstance(error, Overloaded) else "runtime_failed",
                    }
                )
        finally:
            audio.close()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            with suppress(zmq.ZMQError):
                await event({"type": "closed"})

    async def receive_audio(self, identity, peer, audio):
        while True:
            remaining = (
                peer.suspended_until - time.monotonic() if peer.suspended_until is not None else 15
            )
            if remaining <= 0:
                raise TimeoutError("Reconnect grace period expired")
            async with asyncio.timeout(min(15, remaining)):
                kind, payload = await peer.inbox.get()
            if kind == b"audio":
                audio.feed_pcm16(payload)
                continue
            if kind != b"command":
                raise ValueError("Unknown frame kind")
            value = json.loads(payload)
            match value["type"]:
                case "ping":
                    await self.event(identity, {"type": "pong"})
                case "end":
                    return
                case "suspend":
                    if peer.suspended_until is None:
                        peer.suspended_until = time.monotonic() + 30
                        audio.suspend()
                        await self.event(identity, {"type": "suspended"})
                case "resume":
                    if peer.suspended_until is None:
                        raise ValueError("Session is not suspended")
                    peer.suspended_until = None
                    audio.resume()
                case "played":
                    if any(
                        type(value.get(k)) is not int or not 0 <= value[k] <= 0xFFFFFFFF
                        for k in ("generation", "id")
                    ):
                        raise ValueError("Invalid playback acknowledgement")
                    audio.acknowledge(value["generation"], value["id"])
                case _:
                    raise ValueError("Unknown command")


async def serve():
    config = AppConfig.load(Path(os.environ.get("SPEECH_CONFIG", "config/default.toml")))
    recordings = await asyncio.to_thread(
        PhoneRecordings.load, Path(config.telephone.directory), 24000
    )
    async with open_models(config) as models:
        context = zmq.asyncio.Context()
        socket = context.socket(zmq.ROUTER)
        socket.setsockopt(zmq.LINGER, 0)
        socket.setsockopt(zmq.SNDHWM, 32)
        socket.setsockopt(zmq.RCVHWM, 64)
        socket.setsockopt(zmq.MAXMSGSIZE, 524288)
        socket.setsockopt(zmq.ROUTER_MANDATORY, 1)
        try:
            with secure_socket(context, socket):
                endpoint = os.environ.get("SPEECH_BIND", "tcp://127.0.0.1:5555")
                from urllib.parse import urlparse
                if urlparse(endpoint).hostname != "127.0.0.1":
                    raise ValueError("Speech must bind to the host loopback interface")
                socket.bind(endpoint)
                service = SpeechService(socket, config, models, recordings)
                task = asyncio.create_task(service.receive())
                for signum in (signal.SIGINT, signal.SIGTERM):
                    asyncio.get_running_loop().add_signal_handler(signum, task.cancel)
                LOG.info("CPU Speech ready; session count is not capped")
                with suppress(asyncio.CancelledError):
                    await task
        finally:
            socket.close()
            context.term()


def main():
    logging.basicConfig(level=logging.INFO)
    asyncio.run(serve())
