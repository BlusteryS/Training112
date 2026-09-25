"""Content-addressed private audio cache, separate from scenario/learning data."""

from __future__ import annotations

import hashlib
import os
import tempfile
import threading
from collections import OrderedDict
from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from filelock import FileLock
from scipy.signal import resample_poly

from speech112.providers import AudioChunk
from speech112.runtime.scheduler import InferenceScheduler
from speech112.speech_text import normalize_for_tts


class CachedVoice:
    def __init__(
        self,
        engine,
        scheduler: InferenceScheduler,
        directory: Path,
        fingerprint: str,
        sample_rate: int = 24000,
    ):
        if len(fingerprint) != 64 or any(c not in "0123456789abcdef" for c in fingerprint):
            raise ValueError("Voice fingerprint must be SHA-256")
        self.engine = engine
        self.scheduler = scheduler
        self.directory = directory / fingerprint
        self.root = directory
        self.max_bytes = int(os.environ.get("SPEECH_AUDIO_CACHE_BYTES", str(2 * 1024**3)))
        if self.max_bytes < 1024 * 1024:
            raise ValueError("Audio cache quota must be at least 1 MiB")
        self.rate = sample_rate
        self._memory = OrderedDict()
        self._memory_bytes = 0
        self._memory_limit = int(os.environ.get("SPEECH_AUDIO_MEMORY_BYTES", str(256 * 1024**2)))
        if not 1024**2 <= self._memory_limit <= 1024**3:
            raise ValueError("Per-voice audio memory limit must be between 1 MiB and 1 GiB")
        self._lock = threading.Lock()

    def path(self, text: str) -> Path:
        key = hashlib.sha256(normalize_for_tts(text).encode()).hexdigest()
        return self.directory / (key + ".wav")

    def require(self, texts: tuple[str, ...]) -> None:
        """Reject unprepared scenarios before admitting a conversation."""
        for text in texts:
            path = self.path(text)
            if not path.is_file():
                raise ValueError("Scenario audio is not prepared for the configured voice")
            info = sf.info(path)
            if (
                info.samplerate != self.rate
                or info.channels != 1
                or not 0 < info.frames <= self.rate * 120
            ):
                raise ValueError("Invalid prepared scenario audio")

    def _remember(self, key: str, audio: np.ndarray) -> np.ndarray:
        audio.flags.writeable = False
        with self._lock:
            if key not in self._memory and audio.nbytes <= self._memory_limit:
                while self._memory_bytes + audio.nbytes > self._memory_limit:
                    _, old = self._memory.popitem(last=False)
                    self._memory_bytes -= old.nbytes
                self._memory[key] = audio
                self._memory_bytes += audio.nbytes
        return audio

    def _render(self, text: str) -> np.ndarray:
        normalized = normalize_for_tts(text)
        key = hashlib.sha256(normalized.encode()).hexdigest()
        with self._lock:
            if key in self._memory:
                self._memory.move_to_end(key)
                return self._memory[key]
        path = self.directory / (key + ".wav")
        if path.is_file():
            info = sf.info(path)
            if (
                info.samplerate != self.rate
                or info.channels != 1
                or not 0 < info.frames <= self.rate * 120
            ):
                raise ValueError("Invalid cached audio")
            audio, _ = sf.read(path, dtype="float32")
            if not np.isfinite(audio).all():
                raise ValueError("Non-finite cached audio")
            return self._remember(key, audio)
        if self.engine is None:
            raise ValueError("Prepared audio missing; synthesis is disabled during live calls")
        audio, rate = self.engine.synthesize(normalized)
        if not len(audio) or len(audio) > rate * 120 or not np.isfinite(audio).all():
            raise ValueError("Invalid synthesized audio")
        divisor = gcd(rate, self.rate)
        audio = resample_poly(audio, self.rate // divisor, rate // divisor).astype(np.float32)
        self.directory.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(suffix=".wav", dir=self.directory)
        try:
            os.close(fd)
            sf.write(temporary, audio, self.rate, subtype="PCM_16")
            with FileLock(str(self.root / ".quota.lock"), timeout=10):
                used = sum(p.stat().st_size for p in self.root.glob("*/*.wav") if len(p.stem) == 64)
                replacing = path.stat().st_size if path.exists() else 0
                if used - replacing + os.path.getsize(temporary) > self.max_bytes:
                    raise ValueError("Audio cache quota exceeded; remove unused prepared audio")
                os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        # Both the first and subsequent playbacks use the exact installed PCM artifact.
        audio, _ = sf.read(path, dtype="float32")
        return self._remember(key, audio)

    async def prepare(self, text: str) -> None:
        await self.scheduler.run(self._render, text)

    async def stream(self, text: str):
        audio = await self.scheduler.run(self._render, text)
        for offset in range(0, len(audio), self.rate // 10):
            yield AudioChunk(audio[offset : offset + self.rate // 10], self.rate)
