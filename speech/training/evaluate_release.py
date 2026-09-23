"""Held-out evaluation. Run after selection; never feed these results to training."""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import time
from math import gcd
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf
from domain import TEST, TRAIN
from reference_policy import EmbeddingIntentRecognizer, ExampleIntentRecognizer
from scipy.signal import resample_poly
from sklearn.metrics import f1_score

from speech112.config import AppConfig
from speech112.runtime.learned import OperatorHead, file_digest
from speech112.runtime.models import OnnxEncoder, ToneRecognizer
from speech112.runtime.scheduler import InferenceScheduler


def words(text):
    return ExampleIntentRecognizer.normalize(text).split()


def distance(a, b):
    previous = list(range(len(b) + 1))
    for i, left in enumerate(a, 1):
        row = [i]
        for j, right in enumerate(b, 1):
            row.append(min(row[-1] + 1, previous[j] + 1, previous[j - 1] + (left != right)))
        previous = row
    return previous[-1]


async def main(args):
    args.output.mkdir(exist_ok=True, parents=True)
    root = Path(".cache/training")
    config = AppConfig.load(Path("config/default.toml"))
    encoder_directory = Path(config.runtime.intent_directory)
    encoder = OnnxEncoder(encoder_directory, 1)
    scheduler = InferenceScheduler(1, 0)
    head = OperatorHead(encoder_directory / "model.onnx")

    def encode(texts, model=None):
        model = model or encoder
        return np.concatenate(
            [
                model.encode([" ".join(words(t)) for t in texts[i : i + 16]])
                for i in range(0, len(texts), 16)
            ]
        )

    baseline = EmbeddingIntentRecognizer(
        encoder, scheduler, config.runtime.intent_threshold, config.runtime.intent_margin
    )
    trained = EmbeddingIntentRecognizer(
        encoder, scheduler, config.runtime.intent_threshold, config.runtime.intent_margin, head
    )
    rows = []
    for label, texts in TEST.items():
        for text in texts:
            start = time.perf_counter()
            predicted = await trained.classify(text, TRAIN)
            rows.append(
                dict(
                    text=text,
                    expected=label,
                    trained=predicted,
                    milliseconds=(time.perf_counter() - start) * 1000,
                    baseline=await baseline.classify(text, TRAIN),
                )
            )
    ref_labels = [k for k, vs in TRAIN.items() for _ in vs]
    ref = encode([t for vs in TRAIN.values() for t in vs])
    query = encode([r["text"] for r in rows])
    head_predictions = [head.decide(v)[0] for v in query]
    base_predictions = [ref_labels[i] for i in (query @ ref.T).argmax(1)]

    def summary(key):
        taken = [r for r in rows if r[key] is not None]
        correct = sum(r[key] == r["expected"] for r in rows)
        return dict(
            correct=correct,
            total=len(rows),
            coverage=len(taken) / len(rows),
            accuracy_including_abstentions=correct / len(rows),
            accepted_precision=correct / len(taken) if taken else None,
        )

    report = {
        "operator": {
            "baseline": summary("baseline"),
            "trained": summary("trained"),
            "ungated_baseline_top1": float(
                np.mean([p == r["expected"] for p, r in zip(base_predictions, rows, strict=True)])
            ),
            "ungated_trained_top1": float(
                np.mean([p == r["expected"] for p, r in zip(head_predictions, rows, strict=True)])
            ),
            "cases": rows,
        }
    }
    # Official public test headlines, excluding any normalized text in public TRAIN.
    seen = {
        t
        for line in (root / "paraphraser-train.jsonl").read_text().splitlines()
        for r in [json.loads(line)]
        for t in (" ".join(words(r["text_1"])), " ".join(words(r["text_2"])))
    }
    candidates = sorted(
        {
            t
            for line in (root / "paraphraser-test.jsonl").read_text().splitlines()
            for r in [json.loads(line)]
            for t in (" ".join(words(r["text_1"])), " ".join(words(r["text_2"])))
        }
    )
    unseen = [t for t in candidates if t not in seen]
    decisions = [head.decide(v) for v in encode(unseen)]
    report["out_of_domain"] = dict(
        total=len(unseen),
        overlap_excluded=len(candidates) - len(unseen),
        accepted_as_operator=sum(ok and label != "other" for label, ok in decisions),
        source="Official ParaPhraser TEST; headlines, not emergency questions",
    )

    # Emotion is an independently evaluated research head, disabled in live policy.
    resource = Path("src/speech112/learned")
    with np.load(resource / "emotion.npz", allow_pickle=False) as w:
        emotion_train = pq.read_table(root / "cedr-main_train-00000-of-00001.parquet").to_pylist()
        seen = {" ".join(words(r["text"])) for r in emotion_train}
        all_test = pq.read_table(root / "cedr-main_test-00000-of-00001.parquet").to_pylist()
        test = [r for r in all_test if " ".join(words(r["text"])) not in seen]
        # The research emotion head retains its original encoder; it is not part
        # of the newly selected live intent model.
        emotion_encoder = OnnxEncoder(Path(".models/intent"), 1)
        x = encode([r["text"] for r in test], emotion_encoder)
        labels = np.array([[i in r["labels"] for i in range(5)] for r in test])
        logits = x @ w["weight"].T + w["bias"]
        probability = 1 / (1 + np.exp(-np.clip(logits, -60, 60)))
        prediction = probability >= w["thresholds"]
    report["emotion"] = dict(
        total=len(test),
        overlap_excluded=len(all_test) - len(test),
        macro_f1=float(f1_score(labels, prediction, average="macro", zero_division=0)),
        per_label_f1=f1_score(labels, prediction, average=None, zero_division=0).tolist(),
        deployed=False,
        limitation="Text emotion only; not acoustic emotion, not a grade",
    )
    (args.output / "understanding.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)
    )
    print({k: {a: b for a, b in v.items() if a != "cases"} for k, v in report.items()}, flush=True)

    if args.asr_samples:
        source = root / "golos-validation.parquet"
        rows = pq.read_table(source).to_pylist()
        # Uniform deterministic sample across the file; no selection by ASR outcome.
        indices = np.linspace(0, len(rows) - 1, min(args.asr_samples, len(rows)), dtype=int)
        recognizer = ToneRecognizer(Path(".models/t-one"), 1, scheduler)
        results, errors, count, seconds, cpu = [], 0, 0, 0.0, 0.0
        for index in indices:
            row = rows[index]
            audio, rate = sf.read(io.BytesIO(row["audio"]["bytes"]), dtype="float32")
            if audio.ndim != 1:
                raise ValueError("Expected mono human speech")
            divisor = gcd(rate, 16000)
            signal = resample_poly(audio, 16000 // divisor, rate // divisor).astype("float32")
            stream = recognizer.stream()
            start = time.process_time()
            # Streaming frames, same input rate as production (without VAD/network).
            for offset in range(0, len(signal), 512):
                await stream.accept(signal[offset : offset + 512])
            actual = await stream.finish()
            used = time.process_time() - start
            reference = row["transcription"]
            error = distance(words(reference), words(actual))
            errors += error
            count += len(words(reference))
            seconds += len(signal) / 16000
            cpu += used
            results.append(
                dict(
                    index=int(index),
                    reference=reference,
                    recognized=actual,
                    word_errors=error,
                    cpu_seconds=used,
                    audio_seconds=len(signal) / 16000,
                )
            )
        report = dict(
            samples=len(results),
            word_error_rate=errors / count,
            audio_seconds=seconds,
            cpu_seconds=cpu,
            cpu_realtime_factor=cpu / seconds,
            source_sha256=file_digest(source),
            source="Golos validation, human speech",
            limitation=(
                "General speech; possible overlap with pretrained T-one data is unknown. "
                "Not an emergency/noise benchmark."
            ),
            cases=results,
        )
        (args.output / "human-asr.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2)
        )
        print({k: v for k, v in report.items() if k != "cases"}, flush=True)
    await scheduler.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--asr-samples", type=int, default=128)
    asyncio.run(main(parser.parse_args()))
