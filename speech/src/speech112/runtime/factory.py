"""Process lifetime owns models; conversation lifetime owns only mutable state."""

from __future__ import annotations

import hashlib
from contextlib import asynccontextmanager
from pathlib import Path

from speech112.config import AppConfig, VoiceConfig
from speech112.runtime.models import ToneRecognizer, onnx_session
from speech112.runtime.scheduler import InferenceScheduler
from speech112.runtime.voices import CachedVoice


def fingerprint(model: Path) -> str:
    digest = hashlib.sha256(b"speech112-piper-normalizer-v1-24000")
    for path in (model, Path(str(model) + ".json")):
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
    return digest.hexdigest()


def voice_fingerprint(voice: VoiceConfig) -> str:
    return fingerprint(Path(voice.model))


class PreparationEngines:
    """Only the preparation worker loads synthesis weights; voice aliases share weights."""

    def __init__(self):
        self.models = {}

    def load(self, voice: VoiceConfig, threads: int):
        from speech112.runtime.models import PiperEngine

        key = (str(Path(voice.model).resolve()), threads)
        if key not in self.models:
            self.models[key] = PiperEngine(Path(voice.model), threads)
        return self.models[key]


@asynccontextmanager
async def open_models(config: AppConfig):
    settings = config.runtime
    scheduler = InferenceScheduler(settings.workers, settings.queue_size)
    try:
        vad = await scheduler.run(onnx_session, Path(settings.vad_model), settings.model_threads)
        asr = await scheduler.run(
            ToneRecognizer, Path(settings.asr_directory), settings.model_threads, scheduler
        )
        intent = await scheduler.run(make_understanding, settings, scheduler)
        voices = {}
        for voice in config.voices:
            digest = await scheduler.run(voice_fingerprint, voice)
            voices[voice.id] = CachedVoice(None, scheduler, Path(settings.audio_cache), digest)
        yield scheduler, vad, asr, intent, voices
    finally:
        await scheduler.close()


def make_understanding(settings, scheduler):
    """Load the one configured semantic parser; no provider cascade exists."""
    from speech112.runtime.contextual import ContextualUnderstanding

    return ContextualUnderstanding(
        Path(settings.intent_directory), scheduler,
        Path(settings.context_directory) if settings.context_directory else None,
        settings.model_threads,
    )
