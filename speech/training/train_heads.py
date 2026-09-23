"""Train small heads over the fixed production encoder; no sklearn in inference.

Hyperparameters and abstention thresholds use development splits only. Test data
is reserved for evaluate_release.py. Raw public data stays outside the repository.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from domain import DEV, TRAIN
from fusion import FusedEncoder
from reference_policy import ExampleIntentRecognizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score

from speech112.runtime.learned import representation_digest
from speech112.runtime.models import OnnxEncoder


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def calibrate(model, dx, dy, ox):
    probability = model.predict_proba(dx)
    op = model.predict_proba(ox)
    calibration = []
    for threshold in np.arange(0.05, 0.96, 0.05):
        for margin in (0.02, 0.05, 0.1, 0.2, 0.3):
            sorted_p = np.sort(probability, axis=1)
            take = (
                (sorted_p[:, -1] >= threshold)
                & (sorted_p[:, -1] - sorted_p[:, -2] >= margin)
                & (model.classes_[probability.argmax(1)] != "other")
            )
            sorted_o = np.sort(op, axis=1)
            false_accept = (
                (sorted_o[:, -1] >= threshold)
                & (sorted_o[:, -1] - sorted_o[:, -2] >= margin)
                & (model.classes_[op.argmax(1)] != "other")
            )
            precision = (
                float(np.mean(model.classes_[probability[take].argmax(1)] == dy[take]))
                if take.any()
                else 0
            )
            calibration.append(
                dict(
                    threshold=threshold,
                    margin=margin,
                    precision=precision,
                    coverage=float(take.mean()),
                    ood_false_accept=float(false_accept.mean()),
                )
            )
    eligible = [r for r in calibration if r["precision"] >= 0.95 and r["ood_false_accept"] <= 0.01]
    selected = max(eligible, key=lambda r: (r["coverage"], r["precision"])) if eligible else None
    return selected, calibration


def calibrate_examples(x, y, dx, dy, ox):
    """Calibrate the generic scenario fallback on DEV, including unrelated texts."""
    labels = np.unique(y)

    def scores(vectors):
        similarities = vectors @ x.T
        return np.stack([similarities[:, y == label].max(1) for label in labels], axis=1)

    positive, outside = scores(dx), scores(ox)
    first, second = np.sort(positive, axis=1), np.sort(outside, axis=1)
    trials = []
    for threshold in np.arange(0.75, 0.981, 0.01):
        for margin in (0.0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.06, 0.08):
            take = (first[:, -1] >= threshold) & (first[:, -1] - first[:, -2] >= margin)
            false_accept = (second[:, -1] >= threshold) & (second[:, -1] - second[:, -2] >= margin)
            precision = (
                float(np.mean(labels[positive[take].argmax(1)] == dy[take])) if take.any() else 0
            )
            trials.append(
                dict(
                    threshold=round(float(threshold), 3),
                    margin=margin,
                    coverage=float(take.mean()),
                    precision=precision,
                    ood_false_accept=float(false_accept.mean()),
                )
            )
    eligible = [r for r in trials if r["precision"] >= 0.95 and r["ood_false_accept"] <= 0.01]
    selected = max(eligible, key=lambda r: (r["coverage"], r["precision"])) if eligible else None
    return dict(selected=selected, trials=trials)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--encoder", type=Path, default=Path(".models/e5-small-int8"))
    parser.add_argument("--auxiliary", type=Path)
    parser.add_argument("--output", type=Path, default=Path(".cache/training/heads"))
    parser.add_argument("--operator-only", action="store_true")
    args = parser.parse_args()
    root = Path(".cache/training")
    output = args.output
    output.mkdir(exist_ok=True, parents=True)
    encoder = OnnxEncoder(args.encoder, 1)
    if args.auxiliary:
        encoder = FusedEncoder(encoder, OnnxEncoder(args.auxiliary, 1))
    representation = representation_digest(args.encoder, args.auxiliary)

    def vectors(texts):
        texts = [ExampleIntentRecognizer.normalize(t) for t in texts]
        key = hashlib.sha256(
            (representation + json.dumps(texts, ensure_ascii=False)).encode()
        ).hexdigest()
        path = output / (key + ".npy")
        if path.exists():
            return np.load(path, allow_pickle=False)
        result = np.concatenate(
            [encoder.encode(texts[i : i + 16]) for i in range(0, len(texts), 16)]
        )
        np.save(path, result)
        return result

    x = vectors([t for vs in TRAIN.values() for t in vs])
    y = np.array([k for k, vs in TRAIN.items() for _ in vs])
    dx = vectors([t for vs in DEV.values() for t in vs])
    dy = np.array([k for k, vs in DEV.items() for _ in vs])
    # Real public headlines teach abstention rather than forcing every input into
    # one of the operator actions. Public TEST remains untouched.
    news = sorted(
        {
            ExampleIntentRecognizer.normalize(json.loads(r)["text_1"])
            for r in (root / "paraphraser-train.jsonl").read_text().splitlines()
        }
    )[::4]
    news_dev = np.array(
        [int(hashlib.sha256(t.encode()).hexdigest()[:8], 16) % 8 == 0 for t in news]
    )
    nx = vectors(news)
    tx = np.concatenate((x, nx[~news_dev]))
    ty = np.concatenate((y, np.array(["other"] * int((~news_dev).sum()))))
    trials = []
    models = []
    for c in (0.1, 1, 10, 100, 1000, 10000):
        model = LogisticRegression(
            C=c, max_iter=2000, random_state=112, class_weight="balanced"
        ).fit(tx, ty)
        score = float(np.mean(model.predict(dx) == dy))
        ood = float(np.mean(model.predict(nx[news_dev]) == "other"))
        trials.append({"C": c, "development_accuracy": score, "ood_rejection": ood})
        models.append(model)
    calibrations = [calibrate(m, dx, dy, nx[news_dev]) for m in models]
    for trial, (selection, _) in zip(trials, calibrations, strict=True):
        trial["calibrated_development"] = selection
    eligible_indices = [i for i, (selection, _) in enumerate(calibrations) if selection is not None]
    if not eligible_indices:
        raise ValueError("No candidate passed the development precision and OOD gates")
    best = max(
        eligible_indices,
        key=lambda i: (
            calibrations[i][0]["coverage"],
            calibrations[i][0]["precision"],
            trials[i]["development_accuracy"],
            -trials[i]["C"],
        ),
    )
    model = models[best]
    selected, calibration = calibrations[best]
    # Save only numeric tensors, labels in JSON. Pickle is never loaded by the service.
    np.savez_compressed(
        output / "operator.npz",
        weight=model.coef_.astype("float32"),
        bias=model.intercept_.astype("float32"),
    )
    baseline = float(np.mean(y[(dx @ x.T).argmax(1)] == dy))
    info = {
        "encoder_sha256": sha(args.encoder / "model.onnx"),
        "representation_sha256": representation,
        "embedding_dimensions": x.shape[1],
        "auxiliary_encoder_sha256": sha(args.auxiliary / "model.onnx") if args.auxiliary else None,
        "labels": model.classes_.tolist(),
        "trials": trials,
        "selected_C": trials[best]["C"],
        "baseline_development_accuracy": baseline,
        "train_size": len(y),
        "dev_size": len(dy),
        "weights_sha256": sha(output / "operator.npz"),
        "calibration": {"selected": selected, "trials": calibration},
        "prototype_calibration": calibrate_examples(x, y, dx, dy, nx[news_dev]),
        "ood_train_size": int((~news_dev).sum()),
        "ood_dev_size": int(news_dev.sum()),
        "public_train_sha256": sha(root / "paraphraser-train.jsonl"),
        "source": "Authored synthetic operator corpus, training/domain.py",
        "source_sha256": sha(Path("training/domain.py")),
    }
    (output / "operator.json").write_text(json.dumps(info, ensure_ascii=False, indent=2))
    print("operator", info, flush=True)
    if args.operator_only:
        return

    rows = pq.read_table(root / "cedr-main_train-00000-of-00001.parquet").to_pylist()
    # Stable text grouping prevents duplicate formulations crossing train/development.
    dev = np.array(
        [
            int(
                hashlib.sha256(ExampleIntentRecognizer.normalize(r["text"]).encode()).hexdigest()[
                    :8
                ],
                16,
            )
            % 8
            == 0
            for r in rows
        ]
    )
    cx = vectors([r["text"] for r in rows])
    cy = np.array([[int(i in r["labels"]) for i in range(5)] for r in rows])
    weights, biases, thresholds, metrics = [], [], [], []
    for i in range(5):
        candidates = []
        for c in (0.1, 1, 10):
            m = LogisticRegression(
                C=c, max_iter=2000, random_state=112, class_weight="balanced"
            ).fit(cx[~dev], cy[~dev, i])
            probability = m.predict_proba(cx[dev])[:, 1]
            for threshold in (0.4, 0.5, 0.6, 0.7, 0.8):
                score = f1_score(cy[dev, i], probability >= threshold, zero_division=0)
                candidates.append((float(score), c, threshold, m))
        score, c, threshold, m = max(candidates, key=lambda r: r[0])
        weights.append(m.coef_[0])
        biases.append(m.intercept_[0])
        thresholds.append(threshold)
        metrics.append({"label": i, "development_f1": score, "C": c, "threshold": threshold})
    np.savez_compressed(
        output / "emotion.npz",
        weight=np.array(weights, dtype="float32"),
        bias=np.array(biases, dtype="float32"),
        thresholds=np.array(thresholds, dtype="float32"),
    )
    info = {
        "encoder_sha256": sha(args.encoder / "model.onnx"),
        "labels": ["joy", "sadness", "surprise", "fear", "anger"],
        "metrics": metrics,
        "train_size": int((~dev).sum()),
        "dev_size": int(dev.sum()),
        "weights_sha256": sha(output / "emotion.npz"),
        "source": "sagteam/cedr_v1@abafbe63cf92c33791b217e8f4f3460f816f1d96",
        "source_sha256": sha(root / "cedr-main_train-00000-of-00001.parquet"),
        "use": "Text emotion research only; not voice emotion or an automatic grade.",
    }
    (output / "emotion.json").write_text(json.dumps(info, indent=2))
    print("emotion", info, flush=True)


if __name__ == "__main__":
    main()
