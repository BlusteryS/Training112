"""Scenario-specific regression gate, separate from the examples used by the encoder."""

from speech112.runtime.context_input import operator_text
from speech112.runtime.dialogue import ScenarioDialogue


async def assess(bundle, recognizer):
    results = []
    for case in bundle.document["acceptance_cases"]:
        for mode, text in (
            ("authored", case["text"]),
            ("asr_style", operator_text(case["text"])),
        ):
            dialogue = ScenarioDialogue(bundle, recognizer, 0)
            dialogue.state = case["state"]
            reply = await dialogue.respond(text)
            results.append(
                {
                    **case,
                    "input_mode": mode,
                    "input_text": text,
                    "actual": reply.response_id,
                    "passed": reply.response_id
                    == "+".join(case.get("response_ids", [case.get("response_id")])),
                }
            )
    return results


def main():
    import argparse
    import asyncio
    import json
    from pathlib import Path

    from speech112.config import AppConfig
    from speech112.runtime.bundle import ScenarioBundle
    from speech112.runtime.factory import make_understanding
    from speech112.runtime.scheduler import InferenceScheduler

    parser = argparse.ArgumentParser(description="Evaluate scenario understanding regression cases")
    parser.add_argument("source", type=Path)
    parser.add_argument("--config", type=Path, default=Path("config/default.toml"))
    args = parser.parse_args()
    config = AppConfig.load(args.config)
    bundle = ScenarioBundle.parse(args.source.read_bytes())

    async def check():
        scheduler = InferenceScheduler(1, 0)
        try:
            recognizer = make_understanding(config.runtime, scheduler)
            return await assess(bundle, recognizer)
        finally:
            await scheduler.close()

    result = asyncio.run(check())
    print(
        json.dumps(
            {"scenario_sha256": bundle.digest, "cases": result}, ensure_ascii=False, indent=2
        )
    )
    raise SystemExit(0 if all(case["passed"] for case in result) else 1)
