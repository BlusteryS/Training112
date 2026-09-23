"""Compare frozen candidates in separate processes, with the same data and CPU budget."""

import argparse
import asyncio
import json
import resource
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from domain import DEV, TEST, TRAIN
from fusion import FusedEncoder
from reference_policy import EmbeddingIntentRecognizer, ExampleIntentRecognizer

from speech112.runtime.learned import OperatorHead
from speech112.runtime.models import OnnxEncoder
from speech112.runtime.scheduler import InferenceScheduler

CANDIDATES = {
    "rubert": (".models/intent", ".cache/training/heads-rubert-calibrated", None),
    "e5-small-int8": (".models/e5-small-int8", ".cache/training/heads-e5-small-int8", None),
    "fused": (".models/intent", ".cache/training/heads-fused", ".models/e5-small-int8"),
}


async def compare(name):
    directory, head_path = map(Path, CANDIDATES[name][:2])
    auxiliary = Path(CANDIDATES[name][2]) if CANDIDATES[name][2] else None
    encoder = OnnxEncoder(directory, 1)
    if auxiliary:
        encoder = FusedEncoder(encoder, OnnxEncoder(auxiliary, 1))
    head = OperatorHead(directory / "model.onnx", head_path, auxiliary)
    texts = [ExampleIntentRecognizer.normalize(t) for vs in DEV.values() for t in vs]
    for text in texts[:5]:
        head.decide(encoder.encode([text])[0])
    wall, cpu = [], []
    for _ in range(5):
        for text in texts:
            started, used = time.perf_counter(), time.process_time()
            head.decide(encoder.encode([text])[0])
            cpu.append((time.process_time() - used) * 1000)
            wall.append((time.perf_counter() - started) * 1000)
    scheduler = InferenceScheduler(1, 0)
    recognizer = EmbeddingIntentRecognizer(encoder, scheduler, 0.75, 0.08, head)
    rows = []
    try:
        for label, values in TEST.items():
            for text in values:
                top, accepted = head.decide(
                    encoder.encode([ExampleIntentRecognizer.normalize(text)])[0]
                )
                rows.append(
                    dict(
                        text=text,
                        expected=label,
                        top1=top,
                        accepted=accepted,
                        deployed_policy=await recognizer.classify(text, TRAIN),
                    )
                )
    finally:
        await scheduler.close()
    accepted = [r for r in rows if r["accepted"] and r["top1"] != "other"]
    answered = [r for r in rows if r["deployed_policy"] is not None]
    return dict(
        model=name,
        cpu_threads=1,
        measurements=len(wall),
        median_wall_ms=float(np.median(wall)),
        p95_wall_ms=float(np.percentile(wall, 95)),
        mean_cpu_ms=float(np.mean(cpu)),
        rss_max_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        * (1 if sys.platform == "darwin" else 1024),
        test_top1_correct=sum(r["top1"] == r["expected"] for r in rows),
        test_total=len(rows),
        head_accepted=len(accepted),
        head_accepted_correct=sum(r["top1"] == r["expected"] for r in accepted),
        policy_answered=len(answered),
        policy_answered_correct=sum(r["deployed_policy"] == r["expected"] for r in answered),
        cases=rows,
        limitation=(
            "Same authored TEST reused across model versions; not an independent human "
            "acceptance set. Thresholds and regularization selected on DEV only."
        ),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--one", choices=tuple(CANDIDATES))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.one:
        result = asyncio.run(compare(args.one))
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print({k: v for k, v in result.items() if k != "cases"}, flush=True)
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        for name in CANDIDATES:
            subprocess.run(
                [
                    sys.executable,
                    __file__,
                    "--one",
                    name,
                    "--output",
                    str(args.output / (name + ".json")),
                ],
                check=True,
            )
