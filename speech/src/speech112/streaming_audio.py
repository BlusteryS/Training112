from __future__ import annotations

import asyncio
import struct
from collections import deque
from collections.abc import Awaitable, Callable

import numpy as np

from speech112.audio import VadAudioChannel
from speech112.config import AudioConfig, VadConfig
from speech112.providers import AudioChunk
from speech112.telephone_noise import RecordedPhoneNoise

SendJson = Callable[[dict[str, object]], Awaitable[None]]
SendBytes = Callable[[bytes], Awaitable[None]]
_HEADER = struct.Struct("<III")  # generation, chunk ID, sample rate


class StreamingAudio(VadAudioChannel):
    def __init__(
        self,
        audio: AudioConfig,
        vad: VadConfig,
        send_json: SendJson,
        send_bytes: SendBytes,
        noise: RecordedPhoneNoise,
    ):
        super().__init__(audio.input_sample_rate, audio.block_ms, vad)
        self._send_json = send_json
        self._send_bytes = send_bytes
        self._frame_bytes = audio.input_sample_rate * audio.block_ms // 1000 * 2
        self._closed = False
        self._sequence = 0
        self._pending: dict[int, tuple[asyncio.Future[None], bool]] = {}
        self._send_tasks: set[asyncio.Task[None]] = set()
        self._noise = noise
        self._rate = audio.output_sample_rate
        self._output_samples = self._rate * audio.block_ms // 1000
        self._voice: deque[np.ndarray] = deque()
        self._queued_samples = 0
        self._changed = asyncio.Event()

    async def detect_speech(self) -> None:
        async with asyncio.TaskGroup() as group:
            group.create_task(super().detect_speech())
            group.create_task(self._send_audio())

    async def _send_audio(self) -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        interval = self._output_samples / self._rate
        while not self._closed:
            await asyncio.sleep(max(0, deadline - loop.time()))
            # Bound unacknowledged transport independently from the TTS queue.
            while len(self._pending) * interval >= 0.4:
                await self._wait_oldest()
            samples = self._noise.render(self._output_samples)
            offset = 0
            while self._voice and offset < len(samples):
                voice = self._voice.popleft()
                count = min(len(voice), len(samples) - offset)
                samples[offset : offset + count] += voice[:count]
                offset += count
                self._queued_samples -= count
                if count < len(voice):
                    self._voice.appendleft(voice[count:])
            self._sequence += 1
            self._pending[self._sequence] = (loop.create_future(), offset > 0)
            self._update_playing()
            payload = _HEADER.pack(self._playback_generation, self._sequence, self._rate)
            np.clip(samples, -1, 1, out=samples)
            payload += samples.astype("<f4", copy=False).tobytes()
            await self._send_bytes(payload)
            deadline = max(deadline + interval, loop.time() - interval)

    def _update_playing(self) -> None:
        # Noise must not arm speech barge-in or keep drain()/idle timers waiting.
        self._playing = bool(self._queued_samples) or any(
            speech for _, speech in self._pending.values()
        )
        self._changed.set()

    def feed_pcm16(self, data: bytes) -> None:
        if self._closed:
            return
        if len(data) != self._frame_bytes:
            raise ValueError("Неверный размер микрофонного кадра")
        self._enqueue_frame(np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0)

    async def play(self, chunk: AudioChunk) -> bool:
        if chunk.sample_rate != self._rate:
            raise ValueError("Частота TTS не совпадает с частотой серверного микшера")
        generation = self._playback_generation
        while self._queued_samples >= self._rate * 4:
            self._changed.clear()
            await self._changed.wait()
            if generation != self._playback_generation:
                return False
        self._voice.append(np.asarray(chunk.samples, dtype=np.float32).copy())
        self._queued_samples += len(chunk.samples)
        self._update_playing()
        return True

    def acknowledge(self, generation: int, sequence: int) -> None:
        if generation != self._playback_generation:
            return
        item = self._pending.pop(sequence, None)
        if item is not None and not item[0].done():
            item[0].set_result(None)
        self._update_playing()

    async def _wait_oldest(self) -> None:
        future, _ = next(iter(self._pending.values()))
        async with asyncio.timeout(15):
            await asyncio.shield(future)

    async def drain(self) -> None:
        while self._playing:
            self._changed.clear()
            await self._changed.wait()

    def interrupt(self) -> None:
        super().interrupt()
        for future, _ in self._pending.values():
            if not future.done():
                future.set_result(None)
        self._pending.clear()
        self._voice.clear()
        self._queued_samples = 0
        self._update_playing()
        if not self._closed:
            task = asyncio.create_task(
                self._send_json(
                    {
                        "type": "audio_stop",
                        "generation": self._playback_generation,
                    }
                )
            )
            self._send_tasks.add(task)
            task.add_done_callback(self._send_finished)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.interrupt()
        for task in self._send_tasks:
            task.cancel()

    def _send_finished(self, task: asyncio.Task[None]) -> None:
        self._send_tasks.discard(task)
        if not task.cancelled():
            task.exception()
