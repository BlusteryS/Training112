"""Audio preparation in a background process before teacher approval."""

import asyncio
import os
from pathlib import Path

from speech112.config import AppConfig
from speech112.preparation.quality import assess
from speech112.runtime.factory import PreparationEngines, make_understanding, voice_fingerprint
from speech112.runtime.scheduler import InferenceScheduler
from speech112.runtime.voices import CachedVoice


class AudioPreparer:
    def __init__(self, config=None):
        self.config = config or AppConfig.load(
            Path(os.environ.get("SPEECH_CONFIG", "config/default.toml"))
        )
        self.voices = {}
        self.engines = PreparationEngines()
        self.recognizer = make_understanding(self.config.runtime, None)

    def __call__(self, bundle):
        async def check():
            scheduler = InferenceScheduler(1, 0)
            try:
                self.recognizer.scheduler = scheduler
                result = await assess(bundle, self.recognizer)
                if not all(case["passed"] for case in result):
                    raise ValueError("Scenario understanding acceptance cases failed")
            finally:
                await scheduler.close()

        asyncio.run(check())
        voice_id = bundle.document["voice_id"]
        if voice_id not in self.voices:
            voice = next((v for v in self.config.voices if v.id == voice_id), None)
            if voice is None:
                raise ValueError("Scenario voice is not installed")
            self.voices[voice_id] = CachedVoice(
                self.engines.load(voice, 1),
                None,
                Path(self.config.runtime.audio_cache),
                voice_fingerprint(voice),
            )
        for text in bundle.utterances():
            self.voices[voice_id]._render(text)


def main():
    import argparse

    from speech112.runtime.bundle import ScenarioBundle

    parser = argparse.ArgumentParser(description="Validate and prepare scenario speech offline")
    parser.add_argument("source", type=Path)
    parser.add_argument("--config", type=Path, default=Path("config/default.toml"))
    args = parser.parse_args()
    AudioPreparer(AppConfig.load(args.config))(ScenarioBundle.parse(args.source.read_bytes()))


if __name__ == "__main__":
    main()
