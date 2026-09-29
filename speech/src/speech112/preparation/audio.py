"""Audio preparation in a background process before instructor approval."""

import json
import os
from importlib.resources import files
from pathlib import Path

from speech112.config import AppConfig
from speech112.runtime.factory import PreparationEngines, voice_fingerprint
from speech112.runtime.semantic_evidence import RULE_INTENTS
from speech112.runtime.voices import CachedVoice


class AudioPreparer:
    def __init__(self, config=None):
        self.config = config or AppConfig.load(
            Path(os.environ.get("SPEECH_CONFIG", "config/default.toml"))
        )
        self.voice = None
        self.engines = PreparationEngines()
        directory = self.config.runtime.context_directory
        metadata = (
            Path(directory) / "context.json"
            if directory
            else files("speech112.learned").joinpath("contextual", "context.json")
        )
        self.labels = set(json.loads(metadata.read_text())["labels"]) | RULE_INTENTS

    def __call__(self, bundle):
        unsupported = {item["id"] for item in bundle.document["intents"]} - (
            self.labels | {"repeat", "contact", "other"})
        if unsupported:
            raise ValueError(f"Scenario contains unsupported questions: {sorted(unsupported)}")
        if self.voice is None:
            self.voice = CachedVoice(
                self.engines.load(self.config.voice, 1),
                None,
                Path(self.config.runtime.audio_cache),
                voice_fingerprint(self.config.voice),
            )
        for text in bundle.utterances():
            self.voice._render(text)


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
