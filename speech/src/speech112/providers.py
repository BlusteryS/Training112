from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol

import numpy as np
from numpy.typing import NDArray

from speech112.events import SpeechEvent


@dataclass(frozen=True, slots=True)
class AudioChunk:
    samples: NDArray[np.float32]
    sample_rate: int


class SpeechRecognizer(Protocol):
    async def transcribe(self, audio: NDArray[np.float32]) -> str: ...


class DialogueControl(Enum):
    END_CALL = "end_call"


class DialogueModel(Protocol):
    def stream_reply(
        self, messages: list[dict[str, str]]
    ) -> AsyncIterator[str | DialogueControl]: ...


class SpeechSynthesizer(Protocol):
    def stream(self, text: str) -> AsyncIterator[AudioChunk]: ...


class AudioChannel(Protocol):
    events: asyncio.Queue[SpeechEvent]

    @property
    def playback_generation(self) -> int: ...

    async def detect_speech(self) -> None: ...

    async def play(self, chunk: AudioChunk) -> bool: ...

    async def drain(self) -> None: ...

    def interrupt(self) -> None: ...

    def close(self) -> None: ...


class SessionObserver(Protocol):
    async def emit(self, event: str, **data: Any) -> None: ...
