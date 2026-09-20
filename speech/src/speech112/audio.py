from __future__ import annotations

import asyncio
import time
from collections import deque

import numpy as np
import torch
from numpy.typing import NDArray
from silero_vad import load_silero_vad

from speech112.config import VadConfig
from speech112.events import EventKind, SpeechEvent


class VadAudioChannel:
    def __init__(self, sample_rate: int, block_ms: int, vad: VadConfig) -> None:
        self._input_sample_rate = sample_rate
        self._block_ms = block_ms
        self._vad_config = vad
        self._frames: asyncio.Queue[NDArray[np.float32]] = asyncio.Queue(maxsize=64)
        self.events: asyncio.Queue[SpeechEvent] = asyncio.Queue()
        self._vad = load_silero_vad(onnx=True)
        self._playing = False
        self._playback_generation = 0
        self._overflow = False

    async def detect_speech(self) -> None:
        frame_ms = self._block_ms
        start_frames = max(1, self._vad_config.speech_start_ms // frame_ms)
        end_frames = max(1, self._vad_config.silence_end_ms // frame_ms)
        pre_roll_frames = max(1, self._vad_config.pre_roll_ms // frame_ms)
        max_frames = self._vad_config.max_utterance_seconds * 1000 // frame_ms
        pre_roll: deque[NDArray[np.float32]] = deque(maxlen=pre_roll_frames)
        utterance: list[NDArray[np.float32]] = []
        speech_run = 0
        silence_run = 0
        speaking = False
        last_speech_at = time.perf_counter()

        while True:
            frame = await self._frames.get()
            if self._overflow:
                raise RuntimeError("Обработка микрофона отстаёт: очередь аудио переполнена")
            tensor = torch.from_numpy(frame)
            probability = float(self._vad(tensor, self._input_sample_rate).item())
            threshold = (
                self._vad_config.barge_in_threshold if self._playing else self._vad_config.threshold
            )
            if probability >= threshold:
                last_speech_at = time.perf_counter()
                speech_run += 1
                silence_run = 0
            else:
                silence_run += 1
                speech_run = 0

            if not speaking:
                pre_roll.append(frame)
                if speech_run >= start_frames:
                    speaking = True
                    utterance = list(pre_roll)
                    pre_roll.clear()
                    if self._playing:
                        self.interrupt()
                        await self.events.put(SpeechEvent(EventKind.BARGE_IN))
                    else:
                        await self.events.put(SpeechEvent(EventKind.SPEECH_STARTED))
                continue

            utterance.append(frame)
            if silence_run >= end_frames or len(utterance) >= max_frames:
                audio = np.concatenate(utterance).astype(np.float32, copy=False)
                await self.events.put(SpeechEvent(EventKind.SPEECH_ENDED, audio, last_speech_at))
                utterance = []
                speaking = False
                speech_run = 0
                silence_run = 0
                self._vad.reset_states()

    @property
    def playback_generation(self) -> int:
        return self._playback_generation

    def interrupt(self) -> None:
        self._playback_generation += 1
        self._playing = False

    def _enqueue_frame(self, frame: NDArray[np.float32]) -> None:
        if self._frames.full():
            self._overflow = True
            return
        self._frames.put_nowait(frame)

