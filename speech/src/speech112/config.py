from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class AudioConfig:
    input_sample_rate: int
    output_sample_rate: int
    block_ms: int


@dataclass(frozen=True, slots=True)
class VadConfig:
    threshold: float
    barge_in_threshold: float
    speech_start_ms: int
    silence_end_ms: int
    pre_roll_ms: int
    max_utterance_seconds: int


@dataclass(frozen=True, slots=True)
class SttConfig:
    model: str
    device: str
    language: str
    fp16_encoder: bool
    download_root: str


@dataclass(frozen=True, slots=True)
class LlmConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float
    top_p: float
    first_sentence_min_chars: int


@dataclass(frozen=True, slots=True)
class ConversationConfig:
    idle_seconds: float
    idle_repeat_seconds: float
    part_pause_ms: int

    def __post_init__(self) -> None:
        if not 0 < self.idle_seconds <= self.idle_repeat_seconds:
            raise ValueError("Интервалы ожидания должны быть положительными и не убывать")
        if not 0 <= self.part_pause_ms <= 1000:
            raise ValueError("Пауза между частями ответа должна быть от 0 до 1000 мс")


@dataclass(frozen=True, slots=True)
class TelephoneConfig:
    directory: str
    level: float

    def __post_init__(self) -> None:
        if not 0 <= self.level <= 1:
            raise ValueError("Громкость телефонного фона должна быть от 0 до 1")


@dataclass(frozen=True, slots=True)
class QwenTtsConfig:
    model_dir: str
    python: str
    device: str
    chunk_size: int
    max_sequence_length: int


@dataclass(frozen=True, slots=True)
class VoiceConfig:
    id: str
    caller_name: str
    caller_age: int
    reference_audio: str
    reference_start_seconds: float
    reference_end_seconds: float
    reference_text: str


@dataclass(frozen=True, slots=True)
class ScenarioConfig:
    caller_name: str
    caller_age: int
    emotion: str
    location: str
    incident: str
    difficulty: str


@dataclass(frozen=True, slots=True)
class AppConfig:
    audio: AudioConfig
    vad: VadConfig
    stt: SttConfig
    llm: LlmConfig
    conversation: ConversationConfig
    telephone: TelephoneConfig
    tts: QwenTtsConfig
    scenario: ScenarioConfig
    voices: tuple[VoiceConfig, ...]
    voice_id: str

    def for_voice(self, voice_id: str) -> AppConfig:
        voice = next((voice for voice in self.voices if voice.id == voice_id), None)
        if voice is None:
            raise ValueError("Неизвестный персонаж")
        return replace(
            self,
            voice_id=voice_id,
            scenario=replace(
                self.scenario, caller_name=voice.caller_name, caller_age=voice.caller_age
            ),
        )

    @classmethod
    def load(cls, path: Path) -> AppConfig:
        with path.open("rb") as stream:
            values = tomllib.load(stream)
        values = _expand_environment(values)
        voices = tuple(VoiceConfig(id=key, **value) for key, value in values["voices"].items())
        voice = next((voice for voice in voices if voice.id == values["voice_id"]), None)
        if voice is None:
            raise ValueError("Неизвестный персонаж по умолчанию")
        return cls(
            audio=AudioConfig(**values["audio"]),
            vad=VadConfig(**values["vad"]),
            stt=SttConfig(**values["stt"]),
            llm=LlmConfig(**values["llm"]),
            conversation=ConversationConfig(**values["conversation"]),
            telephone=TelephoneConfig(**values["telephone"]),
            tts=QwenTtsConfig(**values["tts"]),
            scenario=ScenarioConfig(
                **values["scenario"], caller_name=voice.caller_name, caller_age=voice.caller_age
            ),
            voices=voices,
            voice_id=voice.id,
        )


def _expand_environment(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _expand_environment(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_expand_environment(item) for item in value]
    if isinstance(value, str):
        expanded = os.path.expandvars(value)
        if "${" in expanded:
            raise ValueError(f"Unresolved environment variable in configuration: {value}")
        return expanded
    return value
