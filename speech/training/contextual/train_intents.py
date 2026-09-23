"""Historical warm-start trainer; offline only, never a live inference fallback."""

import argparse
import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import torch
from data import LABELS, dataset, row
from model import export_overrides, load_base
from torch import nn

from speech112.runtime.context_input import LEGACY_CONTEXT_FORMAT as CONTEXT_FORMAT
from speech112.runtime.context_input import ContextTokenizer
from speech112.runtime.learned import file_digest


def public_ood(root):
    table = pq.read_table(root / "massive-ru-train.parquet")
    names = json.loads(table.schema.metadata[b"huggingface"])["info"]["features"]["intent"]["names"]
    groups = {}
    for r in table.to_pylist():
        name = names[r["intent"]]
        if name.startswith(("weather_", "play_", "cooking_", "music_", "calendar_", "iot_")):
            groups.setdefault(name, []).append(r["utt"])
    train, dev = [], []
    for _name, values in sorted(groups.items()):
        unique = sorted(set(values), key=lambda t: hashlib.sha256(t.encode()).hexdigest())
        train.extend(row(t, ["other"], family="massive_ood") for t in unique[:16])
        dev.extend(row(t, ["other"], family="massive_ood") for t in unique[16:20])
    return train, dev


def calibrate(logits, y, rows):
    counts = logits[:, len(LABELS) :].argmax(1) + 1
    predictions = np.zeros_like(y, dtype=bool)
    for i, count in enumerate(counts):
        predictions[i, np.argsort(logits[i, : len(LABELS)])[-count:]] = True
    other = predictions[:, LABELS.index("other")].copy()
    predictions[other] = False
    predictions[other, LABELS.index("other")] = True
    exact = (predictions == y).all(1)
    domain = np.array([r["family"] != "massive_ood" for r in rows])
    return dict(
        exact=float(exact[domain].mean()),
        ood=float(exact[~domain].mean()),
        overall=float(exact.mean()),
    )


def run(args):
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(112)
    np.random.seed(112)
    random.seed(112)
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    if bool(args.train_file) != bool(args.dev_file):
        raise ValueError("Both frozen train and dev files are required")
    if args.train_file:
        train = [json.loads(s) for s in args.train_file.read_text().splitlines()]
        dev = [json.loads(s) for s in args.dev_file.read_text().splitlines()]
    else:
        public_train, public_dev = public_ood(Path(".cache/training"))
        train = dataset("train") + public_train
        dev = dataset("dev") + public_dev

        def key(r):
            return r["text"].strip().lower(), tuple(r["history"])

        train = list({key(r): r for r in train}.values())
        train_keys = {key(r) for r in train}
        dev = list({key(r): r for r in dev if key(r) not in train_keys}.values())
    for name, rows in [("train", train), ("dev", dev)]:
        (out / f"{name}.jsonl").write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
        )
    from reference_policy import ExampleIntentRecognizer

    from speech112.runtime.models import OnnxEncoder

    teacher = OnnxEncoder(Path(".models/e5-small-int8"), 1)
    texts = sorted({r["text"] for r in train})
    vectors = {}
    for i in range(0, len(texts), 16):
        block = texts[i : i + 16]
        values = teacher.encode([ExampleIntentRecognizer.normalize(t) for t in block])
        vectors.update(zip(block, values, strict=True))
    anchors = np.stack([vectors[r["text"]] for r in train])
    anchor_rows = np.array(
        [r["family"] in ("single", "history_invariance", "history_distractor") for r in train]
    )
    del teacher, vectors
    tokenizer = ContextTokenizer(Path(".models/e5-small-int8/tokenizer.json"), args.input_format)
    model, arrays, mapping = load_base(
        Path(".models/e5-small-int8/model.onnx"),
        Path(__file__).with_name("base-config.json"),
        args.resume / "context.npz" if args.resume else None,
    )
    for name, p in model.named_parameters():
        p.requires_grad_(
            name.startswith(("encoder.layer.10.", "encoder.layer.11.")) and not args.head_only
        )
    head = nn.Linear(384, len(LABELS) + 3)
    old = json.loads(Path("src/speech112/learned/operator.json").read_text())
    with np.load("src/speech112/learned/operator.npz") as w, torch.no_grad():
        for i, label in enumerate(LABELS):
            if label in old["labels"]:
                j = old["labels"].index(label)
                head.weight[i].copy_(torch.from_numpy(w["weight"][j]))
                head.bias[i].copy_(torch.tensor(w["bias"][j]))

    if args.resume:
        with np.load(args.resume / "context.npz", allow_pickle=False) as trained, torch.no_grad():
            head.weight.copy_(torch.from_numpy(trained["head_weight"]))
            head.bias.copy_(torch.from_numpy(trained["head_bias"]))

    def targets(rows):
        y = np.zeros((len(rows), len(LABELS)), np.float32)
        for i, r in enumerate(rows):
            for label in r["labels"]:
                y[i, LABELS.index(label)] = 1
        return y

    ty, dy = targets(train), targets(dev)
    pos_weight = torch.tensor(
        np.clip(np.sqrt((len(train) - ty.sum(0)) / np.maximum(ty.sum(0), 1)), 1, 8)
    )
    params = [{"params": head.parameters(), "lr": args.head_learning_rate}]
    tuned = [p for p in model.parameters() if p.requires_grad]
    if tuned:
        params.append({"params": tuned, "lr": args.learning_rate})
    optimizer = torch.optim.AdamW(params, weight_decay=0.01)

    def forward(rows):
        data, mask = tokenizer.batch(rows)
        hidden = model(**{k: torch.from_numpy(v) for k, v in data.items()}).last_hidden_state
        mask = torch.from_numpy(mask).unsqueeze(-1)
        vector = nn.functional.normalize((hidden * mask).sum(1) / mask.sum(1), dim=1)
        return head(vector), vector

    def evaluate():
        model.eval()
        head.eval()
        pred = []
        with torch.no_grad():
            for i in range(0, len(dev), args.batch):
                pred.append(forward(dev[i : i + args.batch])[0].numpy())
        return calibrate(np.concatenate(pred), dy, dev)

    start = time.monotonic()
    best = -1
    history = []
    stale = 0
    print(
        json.dumps(
            {
                "train": len(train),
                "dev": len(dev),
                "trainable_encoder_parameters": sum(p.numel() for p in tuned),
                "initial": evaluate(),
            }
        ),
        flush=True,
    )
    for epoch in range(args.epochs):
        model.eval()
        head.train()
        order = np.random.permutation(len(train))
        losses = []
        for offset in range(0, len(order), args.batch):
            ix = order[offset : offset + args.batch]
            batch = [train[i] for i in ix]
            output, vector = forward(batch)
            logits = output[:, : len(LABELS)]
            labels = torch.from_numpy(ty[ix])
            bce = nn.functional.binary_cross_entropy_with_logits(
                logits, labels, pos_weight=pos_weight
            )
            single = labels.sum(1) == 1
            ce = (
                nn.functional.cross_entropy(logits[single], labels[single].argmax(1))
                if single.any()
                else 0
            )
            cardinality = nn.functional.cross_entropy(
                output[:, len(LABELS) :], labels.sum(1).long() - 1
            )
            mask = anchor_rows[ix]
            preserve = (
                (1 - (vector[mask] * torch.from_numpy(anchors[ix][mask])).sum(1)).mean()
                if mask.any()
                else 0
            )
            loss = bce + 0.3 * ce + 0.5 * cardinality + 2.0 * preserve
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(list(head.parameters()) + tuned, 1.0)
            optimizer.step()
            losses.append(loss.item())
        result = evaluate()
        score = result["exact"] * 0.85 + result["ood"] * 0.15
        entry = dict(
            epoch=epoch + 1, loss=float(np.mean(losses)), seconds=time.monotonic() - start, **result
        )
        history.append(entry)
        print(json.dumps(entry), flush=True)
        if score > best + 1e-5:
            best = score
            stale = 0
            overrides = export_overrides(model, arrays, mapping)
            np.savez_compressed(
                out / "context.npz",
                head_weight=head.weight.detach().numpy(),
                head_bias=head.bias.detach().numpy(),
                **overrides,
            )
            metadata = dict(
                labels=LABELS,
                cardinality=True,
                parent_weights_sha256=file_digest(args.resume / "context.npz")
                if args.resume
                else None,
                source_sha256=file_digest(Path(__file__)),
                training_config={
                    k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()
                },
                base_sha256=file_digest(Path(".models/e5-small-int8/model.onnx")),
                tokenizer_sha256=file_digest(Path(".models/e5-small-int8/tokenizer.json")),
                format=args.input_format,
                overrides=list(overrides),
                weights_sha256=file_digest(out / "context.npz"),
                selected=entry,
                train_sha256=file_digest(out / "train.jsonl"),
                dev_sha256=file_digest(out / "dev.jsonl"),
            )
            (out / "context.json").write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"
            )
        else:
            stale += 1
        (out / "training.json").write_text(json.dumps(history, indent=2) + "\n")
        if stale >= 8 and epoch >= 14:
            break
    print(
        "Selected checkpoint:",
        json.dumps(json.loads((out / "context.json").read_text())["selected"]),
        flush=True,
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, default=Path(".cache/training/context-v1"))
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=12)
    p.add_argument("--learning-rate", type=float, default=0.00005)
    p.add_argument("--head-only", action="store_true")
    p.add_argument("--head-learning-rate", type=float, default=0.003)
    p.add_argument("--resume", type=Path)
    p.add_argument("--input-format", default=CONTEXT_FORMAT)
    p.add_argument("--train-file", type=Path)
    p.add_argument("--dev-file", type=Path)
    run(p.parse_args())
