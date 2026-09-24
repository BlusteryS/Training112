from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AudioConfig:
    input_sample_rate: int = 16000
    output_sample_rate: int = 24000
    block_ms: int = 32


@dataclass(frozen=True, slots=True)
class VadConfig:
    threshold: float = 0.55
    barge_in_threshold: float = 0.72
    speech_start_ms: int = 96
    silence_end_ms: int = 320
    pre_roll_ms: int = 224
    max_utterance_seconds: int = 30


@dataclass(frozen=True, slots=True)
class ConversationConfig:
    idle_seconds: float = 8
    idle_repeat_seconds: float = 15
    resume_seconds: int = 30


@dataclass(frozen=True, slots=True)
class TelephoneConfig:
    directory: str = "assets/telephone"
    level: float = 0.35


@dataclass(frozen=True, slots=True)
class RuntimeConfig:
    workers: int = 2
    queue_size: int = 32
    model_threads: int = 1
    vad_model: str = ".models/silero/silero_vad.onnx"
    asr_directory: str = ".models/t-one"
    intent_provider: str = "contextual"
    intent_directory: str = ".models/e5-small-int8"
    context_directory: str | None = None
    audio_cache: str = ".cache/audio"


@dataclass(frozen=True, slots=True)
class VoiceConfig:
    id: str
    model: str


@dataclass(frozen=True, slots=True)
class AppConfig:
    audio: AudioConfig
    vad: VadConfig
    conversation: ConversationConfig
    telephone: TelephoneConfig
    runtime: RuntimeConfig
    voices: tuple[VoiceConfig, ...]

    @classmethod
    def load(cls, path: Path) -> AppConfig:
        with path.open("rb") as stream:
            values = tomllib.load(stream)
        if values.pop("version", None) != 2:
            raise ValueError("Only CPU runtime configuration version 2 is supported")
        unknown = set(values) - {"audio", "vad", "conversation", "telephone", "runtime", "voices"}
        if unknown:
            raise ValueError(f"Unknown configuration sections: {sorted(unknown)}")
        config = cls(
            AudioConfig(**values.get("audio", {})),
            VadConfig(**values.get("vad", {})),
            ConversationConfig(**values.get("conversation", {})),
            TelephoneConfig(**values.get("telephone", {})),
            RuntimeConfig(**values.get("runtime", {})),
            tuple(VoiceConfig(key, **value) for key, value in values.get("voices", {}).items()),
        )
        if config.audio != AudioConfig():
            raise ValueError("Audio protocol requires 16 kHz PCM16 input / 24 kHz output / 32 ms")
        r, v, c = config.runtime, config.vad, config.conversation
        if (
            not 1 <= r.workers <= 32
            or not 0 <= r.queue_size <= 256
            or not 1 <= r.model_threads <= 8
        ):
            raise ValueError("Invalid CPU worker/thread/queue limits")
        if r.intent_provider != "contextual":
            raise ValueError("Live runtime requires the contextual semantic parser")
        if not 0 < v.threshold <= v.barge_in_threshold < 1:
            raise ValueError("Invalid VAD thresholds")
        if not 32 <= v.speech_start_ms <= v.pre_roll_ms <= 1024:
            raise ValueError("Invalid speech start / pre-roll")
        if not 96 <= v.silence_end_ms <= 1500 or not 1 <= v.max_utterance_seconds <= 60:
            raise ValueError("Invalid end-of-turn settings")
        if not 0 < c.idle_seconds <= c.idle_repeat_seconds or c.resume_seconds != 30:
            raise ValueError("Invalid idle or reconnect settings")
        if not 0 <= config.telephone.level <= 1 or not config.voices:
            raise ValueError("A voice and valid ambience level are required")
        return config
