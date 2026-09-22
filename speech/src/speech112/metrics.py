from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class TurnMetrics:
    turn: int
    utterance_seconds: float = 0.0
    stt_ms: float = 0.0
    llm_first_token_ms: float = 0.0
    tts_first_audio_ms: float = 0.0
    end_to_first_audio_ms: float = 0.0
    interrupted: bool = False
    started_at: float = field(default_factory=time.perf_counter)

    def as_dict(self) -> dict[str, Any]:
        return {
            "turn": self.turn,
            "utterance_seconds": round(self.utterance_seconds, 3),
            "stt_ms": round(self.stt_ms, 1),
            "llm_first_token_ms": round(self.llm_first_token_ms, 1),
            "tts_first_audio_ms": round(self.tts_first_audio_ms, 1),
            "end_to_first_audio_ms": round(self.end_to_first_audio_ms, 1),
            "interrupted": self.interrupted,
        }

