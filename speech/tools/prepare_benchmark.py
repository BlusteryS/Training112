"""Synthetic fixtures are prepared in a separate process, never in the live runtime."""

from pathlib import Path

from benchmark_call import QUESTIONS

from speech112.config import AppConfig
from speech112.preparation.audio import AudioPreparer
from speech112.runtime.bundle import ScenarioBundle

if __name__ == "__main__":
    config = AppConfig.load(Path("config/default.toml"))
    bundle = ScenarioBundle.parse(Path("src/speech112/contracts/demo-scenario.json").read_bytes())
    preparer = AudioPreparer(config)
    preparer(bundle)
    for question in QUESTIONS:
        preparer.voices["demo"]._render(question)
