"""DEV-only calibration of the joint decoder's factor scales and cardinality prior.

The selected constants are merged into the single output matrix. Live inference
has no calibration search, extra model, phrase rules or alternate decision path.
"""

import argparse
import itertools
import json
from pathlib import Path

import numpy as np
from train import LABELS, frame

from speech112.runtime.contextual import ContextualUnderstanding
from speech112.runtime.learned import file_digest
from speech112.runtime.semantic_frame import ACTIONS


def run(args):
    root = Path("training/contextual/splits")
    path = root / "stage3-dev.jsonl"
    rows = [json.loads(s) for s in path.read_text().splitlines()]
    model = ContextualUnderstanding(Path(".models/e5-small-int8"), None, args.parent)
    logits = np.concatenate([model.logits([r]) for r in rows])
    n = len(LABELS)
    ranks = np.argsort(logits[:, :n], axis=1)[:, ::-1]
    cumulative = np.concatenate(
        [
            np.zeros((len(rows), 1)),
            np.cumsum(np.take_along_axis(logits[:, :n], ranks[:, :3], axis=1), axis=1),
        ],
        axis=1,
    )
    expected = [frame(r) for r in rows]
    y_actions = np.array([ACTIONS.index(a) for a, _ in expected])
    y_counts = np.array([len(t) for _, t in expected])
    target_match = np.array(
        [
            set(LABELS[j] for j in rank[: len(targets)]) == set(targets)
            for rank, (_, targets) in zip(ranks, expected, strict=True)
        ]
    )
    legal = np.full((len(ACTIONS), 4), -1e9)
    for i, a in enumerate(ACTIONS):
        ks = (0,) if a in ("contact", "reject") else range(0 if a == "repeat" else 1, 4)
        for k in ks:
            legal[i, k] = 0
    basic = np.array([r["family"] == "single" for r in rows])
    ood = np.array([r["family"] == "massive_ood" for r in rows])
    domain = ~ood
    history = []
    best = None
    for target_scale, count_scale, action_scale, single_prior in itertools.product(
        (0.5, 1.0, 2.0, 4.0), (0.25, 0.5, 1.0, 2.0), (0.25, 0.5, 1.0, 2.0), (0.0, 1.0, 2.0, 4.0)
    ):
        counts = logits[:, n : n + 4] * count_scale
        counts = counts.copy()
        counts[:, 1] += single_prior
        scores = (
            (logits[:, n + 4 :] * action_scale)[:, :, None]
            + counts[:, None, :]
            + (cumulative * target_scale)[:, None, :]
            + legal
        )
        choice = scores.reshape(len(rows), -1).argmax(1)
        acts = choice // 4
        ks = choice % 4
        exact = (acts == y_actions) & (ks == y_counts) & target_match
        semantics = (
            (ks == y_counts)
            & target_match
            & np.where(
                y_counts == 0,
                acts == y_actions,
                ~np.isin(acts, [ACTIONS.index("contact"), ACTIONS.index("reject")]),
            )
        )
        entry = dict(
            target_scale=target_scale,
            count_scale=count_scale,
            action_scale=action_scale,
            single_prior=single_prior,
            basic_correct=int(semantics[basic].sum()),
            basic_total=int(basic.sum()),
            exact=float(exact[domain].mean()),
            ood=float(exact[ood].mean()),
        )
        history.append(entry)
        gate = entry["basic_correct"] >= 40 and entry["ood"] >= 0.98
        score = (gate, entry["exact"] * 0.85 + entry["ood"] * 0.15)
        if best is None or score > best[0]:
            best = score, entry
    result = best[1]
    print(json.dumps(result, indent=2), flush=True)
    args.output.mkdir(parents=True, exist_ok=True)
    with np.load(args.parent / "context.npz", allow_pickle=False) as arrays:
        tensors = {k: arrays[k].copy() for k in arrays.files}
    scales = np.array(
        [result["target_scale"]] * n
        + [result["count_scale"]] * 4
        + [result["action_scale"]] * len(ACTIONS),
        dtype=np.float32,
    )
    tensors["head_weight"] *= scales[:, None]
    tensors["head_bias"] *= scales
    tensors["head_bias"][n + 1] += result["single_prior"]
    np.savez_compressed(args.output / "context.npz", **tensors)
    meta = json.loads((args.parent / "context.json").read_text())
    meta.update(
        parent_weights_sha256=meta["weights_sha256"],
        weights_sha256=file_digest(args.output / "context.npz"),
        factor_calibration=dict(
            selected=result,
            dev_sha256=file_digest(path),
            grid_size=len(history),
            source_sha256=file_digest(Path(__file__)),
        ),
    )
    (args.output / "context.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    (args.output / "calibration.json").write_text(json.dumps(history, indent=2) + "\n")
    if not best[0][0]:
        raise SystemExit("No factor calibration passed the DEV gate")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--parent", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    run(p.parse_args())
