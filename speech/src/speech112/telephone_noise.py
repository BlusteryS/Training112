"""Per-call ambience assembled exclusively from recorded telephone sounds."""

from dataclasses import dataclass
from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


@dataclass(frozen=True, slots=True)
class PhoneRecordings:
    sample_rate: int
    line: np.ndarray
    interference: np.ndarray

    @classmethod
    def load(cls, directory: Path, sample_rate: int) -> "PhoneRecordings":
        recordings = []
        for name, target_rms in (("telephone-line", 0.006), ("mobile-interference", 0.004)):
            samples, rate = sf.read(directory / f"{name}.ogg", dtype="float32", always_2d=True)
            samples = samples.mean(axis=1)
            divisor = gcd(rate, sample_rate)
            samples = resample_poly(samples, sample_rate // divisor, rate // divisor)
            rms = float(np.sqrt(np.mean(samples**2)))
            if len(samples) < 5 * sample_rate or not np.isfinite(samples).all() or rms <= 0:
                raise ValueError(f"Некорректная запись телефонного шума: {name}")
            samples *= min(0.25, target_rms / rms)
            samples.flags.writeable = False
            recordings.append(samples)
        return cls(sample_rate, *recordings)


class RecordedPhoneNoise:
    def __init__(self, recordings: PhoneRecordings, level: float):
        self.recordings = recordings
        self.level = level
        self._rng = np.random.default_rng()
        self._position = 0
        self._next_line = 0
        self._next_interference = self._seconds(20, 45)
        self._clips: list[tuple[int, np.ndarray]] = []

    def _seconds(self, low: float, high: float) -> int:
        return int(self._rng.uniform(low, high) * self.recordings.sample_rate)

    def _segment(self, source: np.ndarray, start: int, duration: int, fade: int) -> None:
        offset = int(self._rng.integers(0, len(source) - duration + 1))
        clip = source[offset : offset + duration].copy() * self.level
        envelope = np.linspace(0, 1, fade, dtype=np.float32)
        clip[:fade] *= envelope
        clip[-fade:] *= envelope[::-1]
        self._clips.append((start, clip))

    def render(self, count: int) -> np.ndarray:
        end = self._position + count
        fade = self.recordings.sample_rate // 5
        while self._next_line < end:
            duration = self._seconds(3, 4)
            self._segment(self.recordings.line, self._next_line, duration, fade)
            self._next_line += duration - fade
        while self._next_interference < end:
            self._segment(
                self.recordings.interference,
                self._next_interference,
                self._seconds(1, 3),
                fade // 2,
            )
            self._next_interference += self._seconds(25, 55)
        output = np.zeros(count, dtype=np.float32)
        for start, clip in self._clips:
            left, right = max(start, self._position), min(start + len(clip), end)
            if left < right:
                output[left - self._position : right - self._position] += clip[
                    left - start : right - start
                ]
        self._clips = [(start, clip) for start, clip in self._clips if start + len(clip) > end]
        self._position = end
        return output
