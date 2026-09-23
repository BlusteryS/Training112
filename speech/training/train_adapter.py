"""CPU LoRA adaptation using real ParaPhraser pairs and authored operator language.

Only train/development data select checkpoints. Official test pairs and the authored
TEST split are evaluated once by a separate release evaluation command.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import time
from pathlib import Path

import numpy as np
import torch
from domain import DEV, TRAIN
from torch import nn
from transformers import AutoModel, AutoTokenizer


def normalize(text):
    return " ".join(re.findall(r"\w+", text.lower().replace("ё", "е")))


class LowRank(nn.Module):
    def __init__(self, linear, rank=8):
        super().__init__()
        self.linear = linear
        self.a = nn.Parameter(torch.randn(rank, linear.in_features) * 0.02)
        self.b = nn.Parameter(torch.zeros(linear.out_features, rank))
        self.scale = 2.0

    def forward(self, x):
        return self.linear(x) + (x @ self.a.T @ self.b.T) * self.scale


def encode(model, batch):
    hidden = model(**batch).last_hidden_state
    mask = batch["attention_mask"].unsqueeze(-1).float()
    pooled = (hidden * mask).sum(1) / mask.sum(1).clamp_min(1)
    return nn.functional.normalize(pooled, dim=1)


def load_pairs(root):
    rows = [json.loads(x) for x in (root / "paraphraser-train.jsonl").read_text().splitlines()]
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for r in rows:
        a, b = normalize(r["text_1"]), normalize(r["text_2"])
        parent[find(a)] = find(b)
    train, dev = [], []
    for r in rows:
        a, b = normalize(r["text_1"]), normalize(r["text_2"])
        group = find(a)
        target = dev if int(hashlib.sha256(group.encode()).hexdigest()[:8], 16) % 8 == 0 else train
        if int(r["class"]) != 0:
            target.append((a, b, 1.0 if int(r["class"]) == 1 else 0.0))
    rng = random.Random(112)
    # Each family stays wholly in its authored split; no surface augmentation leaks to DEV.
    domain_start = len(train)
    for label, values in TRAIN.items():
        others = [v for key, vs in TRAIN.items() if key != label for v in vs]
        for a in values:
            for b in values:
                if a != b:
                    train.append((normalize(a), normalize(b), 1.0))
            for b in rng.sample(others, min(12, len(others))):
                train.append((normalize(a), normalize(b), 0.0))
    # Targeted hard negatives: similar words, opposite consequences.
    for first, second in [
        ("help_sent", "not_sent"),
        ("goodbye", "hold"),
        ("victims", "victim_count"),
        ("consciousness", "breathing"),
    ]:
        for a in TRAIN[first]:
            for b in TRAIN[second]:
                train.append((normalize(a), normalize(b), 0.0))
                train.append((normalize(b), normalize(a), 0.0))
    domain_rows = train[domain_start:]
    train.extend(domain_rows)
    return train, dev


def run(args):
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    torch.manual_seed(112)
    random.seed(112)
    np.random.seed(112)
    model = AutoModel.from_pretrained(args.base, local_files_only=True, attn_implementation="eager")
    tokenizer = AutoTokenizer.from_pretrained(args.base, local_files_only=True)
    for parameter in model.parameters():
        parameter.requires_grad = False
    adapters = {}
    for index, layer in enumerate(model.encoder.layer):
        for name in ("query", "value"):
            wrapped = LowRank(getattr(layer.attention.self, name))
            setattr(layer.attention.self, name, wrapped)
            adapters[f"{index}_{name}"] = wrapped
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.01
    )
    train, dev = load_pairs(args.data)
    texts = sorted(
        {t for pair in train + dev for t in pair[:2]}
        | {normalize(t) for vs in DEV.values() for t in vs}
        | {normalize(t) for vs in TRAIN.values() for t in vs}
    )
    ids = {t: i for i, t in enumerate(texts)}
    tokens = tokenizer(
        texts, padding="max_length", truncation=True, max_length=64, return_tensors="pt"
    )

    def batch(indices):
        return {k: v[indices] for k, v in tokens.items()}

    def vectors(text_list):
        result = []
        with torch.no_grad():
            for offset in range(0, len(text_list), 64):
                result.append(
                    encode(model, batch([ids[t] for t in text_list[offset : offset + 64]]))
                )
        return torch.cat(result)

    ref_text = [normalize(t) for vs in TRAIN.values() for t in vs]
    ref_labels = [k for k, vs in TRAIN.items() for _ in vs]
    dev_text = [normalize(t) for vs in DEV.values() for t in vs]
    dev_labels = [k for k, vs in DEV.items() for _ in vs]

    def evaluate():
        model.eval()
        refs = vectors(ref_text)
        queries = vectors(dev_text)
        similarities = queries @ refs.T
        prediction = [ref_labels[i] for i in similarities.argmax(1).tolist()]
        domain_accuracy = sum(a == b for a, b in zip(prediction, dev_labels, strict=True)) / len(
            prediction
        )
        a = vectors([r[0] for r in dev])
        b = vectors([r[1] for r in dev])
        scores = (a * b).sum(1).numpy()
        labels = np.array([r[2] for r in dev])
        accuracy = max(
            float(np.mean((scores >= cut) == labels)) for cut in np.arange(0.3, 0.91, 0.025)
        )
        return dict(domain_accuracy=domain_accuracy, paraphrase_dev_accuracy=accuracy)

    args.output.mkdir(parents=True, exist_ok=True)
    baseline = evaluate()
    print("baseline", baseline, flush=True)
    history = []
    best = -1
    started = time.perf_counter()
    for epoch in range(args.epochs):
        model.train()
        random.shuffle(train)
        total = 0
        for offset in range(0, len(train), args.batch):
            rows = train[offset : offset + args.batch]
            encoded = encode(model, batch([ids[r[0]] for r in rows] + [ids[r[1]] for r in rows]))
            a, b = encoded.chunk(2)
            score = (a * b).sum(1)
            label = torch.tensor([r[2] for r in rows])
            # Bounded margins preserve generic language structure while separating wrong actions.
            loss = (
                label * nn.functional.relu(0.86 - score).square()
                + (1 - label) * nn.functional.relu(score - 0.35).square()
            ).mean()
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
            optimizer.step()
            total += float(loss.detach()) * len(rows)
        metrics = evaluate()
        metrics.update(
            epoch=epoch + 1, loss=total / len(train), elapsed_seconds=time.perf_counter() - started
        )
        print(metrics, flush=True)
        history.append(metrics)
        selection = metrics["domain_accuracy"] * 0.7 + metrics["paraphrase_dev_accuracy"] * 0.3
        if selection > best:
            best = selection
            arrays = {
                key + "_" + suffix: getattr(layer, suffix).detach().numpy()
                for key, layer in adapters.items()
                for suffix in ("a", "b")
            }
            np.savez_compressed(args.output / "adapter.npz", **arrays)
            (args.output / "selection.json").write_text(json.dumps(metrics, indent=2))
    (args.output / "training.json").write_text(
        json.dumps(
            dict(
                seed=112,
                epochs=args.epochs,
                rank=8,
                scale=2.0,
                learning_rate=args.lr,
                batch=args.batch,
                train_pairs=len(train),
                development_pairs=len(dev),
                baseline=baseline,
                history=history,
                train_sources={
                    "paraphraser": hashlib.sha256(
                        (args.data / "paraphraser-train.jsonl").read_bytes()
                    ).hexdigest(),
                    "operator_train": hashlib.sha256(
                        json.dumps(TRAIN, ensure_ascii=False, sort_keys=True).encode()
                    ).hexdigest(),
                    "operator_dev": hashlib.sha256(
                        json.dumps(DEV, ensure_ascii=False, sort_keys=True).encode()
                    ).hexdigest(),
                },
            ),
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=Path(".cache/training/rubert-base"))
    parser.add_argument("--data", type=Path, default=Path(".cache/training"))
    parser.add_argument("--output", type=Path, default=Path(".cache/training/adapter-candidate-v2"))
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=0.0008)
    run(parser.parse_args())
