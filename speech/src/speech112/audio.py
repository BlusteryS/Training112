from __future__ import annotations

import asyncio
import time
from collections import deque

import numpy as np
from numpy.typing import NDArray

from speech112.config import VadConfig
from speech112.events import EventKind, SpeechEvent
from speech112.providers import RecognitionStream, VoiceActivityDetector


class VadAudioChannel:
    def __init__(
        self,
        sample_rate: int,
        block_ms: int,
        vad: VadConfig,
        detector: VoiceActivityDetector,
        recognizer: RecognitionStream,
    ) -> None:
        self._input_sample_rate = sample_rate
        self._block_ms = block_ms
        self._vad_config = vad
        self._frames: asyncio.Queue[NDArray[np.float32]] = asyncio.Queue(maxsize=128)
        self.events: asyncio.Queue[SpeechEvent] = asyncio.Queue(maxsize=16)
        self._vad = detector
        self._recognizer = recognizer
        self._playing = False
        self._playback_generation = 0
        self._overflow = False
        self._capture_epoch = 0
        self._suspended = False

    def suspend(self) -> None:
        self._suspended = True
        self._capture_epoch += 1
        self.interrupt()
        while not self._frames.empty():
            self._frames.get_nowait()
        while not self.events.empty():
            self.events.get_nowait()
        self.events.put_nowait(SpeechEvent(EventKind.SUSPENDED))

    def resume(self) -> None:
        self._suspended = False
        self._capture_epoch += 1
        self.events.put_nowait(SpeechEvent(EventKind.RESUMED))

    async def detect_speech(self) -> None:
        frame_ms = self._block_ms
        start_frames = max(1, self._vad_config.speech_start_ms // frame_ms)
        end_frames = max(1, self._vad_config.silence_end_ms // frame_ms)
        pre_roll_frames = max(1, self._vad_config.pre_roll_ms // frame_ms)
        max_frames = self._vad_config.max_utterance_seconds * 1000 // frame_ms
        pre_roll: deque[NDArray[np.float32]] = deque(maxlen=pre_roll_frames)
        utterance: list[NDArray[np.float32]] = []
        recognition_frames: list[NDArray[np.float32]] = []
        speech_run = 0
        silence_run = 0
        speaking = False
        last_speech_at = time.perf_counter()
        epoch = self._capture_epoch

        while True:
            frame = await self._frames.get()
            if epoch != self._capture_epoch:
                epoch = self._capture_epoch
                self._recognizer.reset()
                self._vad.reset()
                pre_roll.clear()
                utterance = []
                recognition_frames = []
                speaking = False
                speech_run = silence_run = 0
            if self._overflow:
                raise RuntimeError("Обработка микрофона отстаёт: очередь аудио переполнена")
            probability = self._vad.probability(frame)
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
                    recognition_frames.extend(utterance)
                continue

            utterance.append(frame)
            recognition_frames.append(frame)
            if len(recognition_frames) >= 8:
                await self._recognizer.accept(np.concatenate(recognition_frames))
                recognition_frames.clear()
            if epoch != self._capture_epoch:
                continue
            if silence_run >= end_frames or len(utterance) >= max_frames:
                if recognition_frames:
                    await self._recognizer.accept(np.concatenate(recognition_frames))
                    recognition_frames.clear()
                text = await self._recognizer.finish()
                if epoch != self._capture_epoch:
                    continue
                audio = np.concatenate(utterance).astype(np.float32, copy=False)
                await self.events.put(
                    SpeechEvent(EventKind.SPEECH_ENDED, audio, last_speech_at, text)
                )
                utterance = []
                speaking = False
                speech_run = 0
                silence_run = 0
                self._vad.reset()
                self._recognizer.reset()

    @property
    def playback_generation(self) -> int:
        return self._playback_generation

    def interrupt(self) -> None:
        self._playback_generation += 1
        self._playing = False

    def _enqueue_frame(self, frame: NDArray[np.float32]) -> None:
        if self._suspended:
            return
        if self._frames.full():
            self._overflow = True
            return
        self._frames.put_nowait(frame)
