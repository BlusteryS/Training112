from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray


class EventKind(StrEnum):
    SPEECH_STARTED = "speech_started"
    SPEECH_ENDED = "speech_ended"
    BARGE_IN = "barge_in"
    SUSPENDED = "suspended"
    RESUMED = "resumed"


@dataclass(frozen=True, slots=True)
class SpeechEvent:
    kind: EventKind
    audio: NDArray[np.float32] | None = None
    ended_at: float | None = None
    text: str | None = None
