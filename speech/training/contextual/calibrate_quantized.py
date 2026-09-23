"""Calibrate the structured decoder on the adapted encoder, using actual single-item INT8 features.

A fixed DEV-only regularization grid tests whether retaining the original encoder
avoids catastrophic forgetting on a small domain corpus. One model is deployed.
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from train import LABELS, calibrate, frame, frame_nll

from speech112.runtime.contextual import ContextualUnderstanding
from speech112.runtime.learned import file_digest
from speech112.runtime.semantic_frame import ACTIONS


def run(args):
    torch.set_num_threads(2)
    torch.manual_seed(112)
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    base = Path(".models/e5-small-int8")
    encoder = ContextualUnderstanding(base, None, args.parent)
    parent_meta = json.loads((args.parent / "context.json").read_text())
    head = torch.nn.Linear(384, len(LABELS) + 4 + len(ACTIONS))
    with torch.no_grad():
        head.weight.copy_(torch.from_numpy(encoder.weight.copy()))
        head.bias.copy_(torch.from_numpy(encoder.bias.copy()))
    initial = {k: v.detach().clone() for k, v in head.state_dict().items()}
    with np.load(args.parent / "context.npz", allow_pickle=False) as arrays:
        overrides = {k: arrays[k].copy() for k in parent_meta["overrides"]}
    meta = dict(
        parent_meta,
        parent_weights_sha256=parent_meta["weights_sha256"],
        objective="structured-post-quantization-head-calibration-v1",
        feature_batch_size=1,
    )

    def save(folder, model, metadata):
        folder.mkdir(exist_ok=True)
        np.savez_compressed(
            folder / "context.npz",
            head_weight=model.weight.detach().numpy(),
            head_bias=model.bias.detach().numpy(),
            **overrides,
        )
        (folder / "context.json").write_text(
            json.dumps(dict(metadata, weights_sha256=file_digest(folder / "context.npz")), indent=2)
            + "\n"
        )

    rows = {}
    features = {}
    for split in ("train", "dev"):
        path = Path("training/contextual/splits") / f"stage3-{split}.jsonl"
        rows[split] = [json.loads(s) for s in path.read_text().splitlines()]
        values = []
        for i in range(0, len(rows[split]), 1):
            values.append(encoder.encode(rows[split][i : i + 1]))
        features[split] = torch.from_numpy(np.concatenate(values))
        meta[split + "_sha256"] = file_digest(path)
    del encoder
    labels = torch.zeros((len(rows["train"]), len(LABELS)))
    for i, r in enumerate(rows["train"]):
        for label in frame(r)[1]:
            labels[i, LABELS.index(label)] = 1
    actions = torch.tensor([ACTIONS.index(frame(r)[0]) for r in rows["train"]])
    dy = np.zeros((len(rows["dev"]), len(LABELS)))
    best = -1
    history = []
    start = time.monotonic()
    for alpha in (0.1, 1.0, 10.0):
        head.load_state_dict(initial)
        optimizer = torch.optim.AdamW(head.parameters(), lr=0.003, weight_decay=0.01)
        for epoch in range(1000):
            output = head(features["train"])
            prior = ((head.weight - initial["weight"]) ** 2).mean()
            prior += ((head.bias - initial["bias"]) ** 2).mean()
            loss = frame_nll(output, labels, actions) + alpha * prior
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            if (epoch + 1) % 25:
                continue
            with torch.no_grad():
                result = calibrate(head(features["dev"]).numpy(), dy, rows["dev"])
            entry = dict(
                alpha=alpha,
                epoch=epoch + 1,
                seconds=time.monotonic() - start,
                loss=float(loss.detach()),
                **result,
            )
            history.append(entry)
            print(json.dumps(entry), flush=True)
            score = (
                result["exact"] * 0.85
                + result["ood"] * 0.15
                + int(result["basic_intents_correct"] >= 40)
            )
            if score > best:
                best = score
                save(
                    out,
                    head,
                    dict(
                        meta,
                        selected=entry,
                        regularization_grid=[0.1, 1, 10],
                        source_sha256=file_digest(Path(__file__)),
                    ),
                )
        (out / "training.json").write_text(json.dumps(history, indent=2) + "\n")
    print("Selected:", json.loads((out / "context.json").read_text())["selected"], flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--parent", type=Path, required=True)
    run(p.parse_args())
