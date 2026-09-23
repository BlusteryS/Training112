"""Compare released contextual model and existing single-turn policy on a fixed split."""

import argparse
import asyncio
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from data import TRAIN
from reference_policy import (
    CONTACT,
    GREETING_PREFIX,
    REPAIR,
    EmbeddingIntentRecognizer,
    ExampleIntentRecognizer,
    question_parts,
)

from speech112.runtime.contextual import ContextualUnderstanding
from speech112.runtime.learned import OperatorHead
from speech112.runtime.models import OnnxEncoder
from speech112.runtime.scheduler import InferenceScheduler


async def run(args):
    split_path = Path(__file__).with_name("splits") / f"{args.split}.jsonl"
    rows = [json.loads(line) for line in split_path.read_text().splitlines()]
    scheduler = InferenceScheduler(1, 0)
    base = Path(".models/e5-small-int8")
    current = EmbeddingIntentRecognizer(
        OnnxEncoder(base, 1), scheduler, 0.88, 0.015, OperatorHead(base / "model.onnx")
    )
    candidate = ContextualUnderstanding(base, scheduler, args.model)
    counts = defaultdict(lambda: dict(total=0, baseline=0, candidate=0))
    cases = []
    latencies = []
    try:
        for r in rows:
            text = ExampleIntentRecognizer.normalize(r["text"]) if args.asr_style else r["text"]
            norm = ExampleIntentRecognizer.normalize(text)
            if norm in CONTACT:
                old = {"contact"}
            elif norm in REPAIR:
                old = {"repeat"}
            else:
                parts = question_parts(GREETING_PREFIX.sub("", text).strip() or text)
                old = (
                    {await current.classify(p, TRAIN) or "other" for p in parts}
                    if len(parts) <= 3
                    else {"other"}
                )
            start = time.perf_counter()
            new = set(candidate.predict(text, r["history"]).intents)
            latencies.append((time.perf_counter() - start) * 1000)
            expected = set(r["labels"])
            group = counts[r["family"]]
            group["total"] += 1
            group["baseline"] += int(old == expected)
            group["candidate"] += int(new == expected)
            cases.append(dict(**r, baseline=sorted(old), candidate=sorted(new)))
        summary = dict(
            split=args.split,
            asr_style=args.asr_style,
            total=len(rows),
            baseline_correct=sum(v["baseline"] for v in counts.values()),
            candidate_correct=sum(v["candidate"] for v in counts.values()),
            families=dict(counts),
            inference_ms={
                "median": float(np.median(latencies)),
                "p95": float(np.percentile(latencies, 95)),
            },
            limitation=(
                "Authored challenge split; public 112 calls and independent operator "
                "acceptance are not included."
            ),
        )
        report = dict(summary=summary, cases=cases)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        await scheduler.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--split", choices=["dev", "test"], default="dev")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--asr-style", action="store_true")
    asyncio.run(run(p.parse_args()))
