"""Evaluate action and target composition on frozen DEV, including held-out pairs."""

import argparse
import json
from pathlib import Path

from speech112.runtime.contextual import ContextualUnderstanding


def run(args):
    model = ContextualUnderstanding(Path(".models/e5-small-int8"), None, args.model)
    rows = [
        json.loads(s)
        for s in Path("training/contextual/splits/stage3-dev.jsonl").read_text().splitlines()
    ]
    cases = []
    for row in rows:
        if row["family"] != "explicit_object_repeat":
            continue
        frame = model.predict(row["text"], row["history"])
        cases.append(
            dict(
                **row,
                predicted_action=frame.action,
                predicted_targets=frame.targets,
                passed=frame.action == row["action"] and set(frame.targets) == set(row["labels"]),
            )
        )
    held = [r for r in cases if set(r["labels"]) & {"weapon", "fire", "breathing", "consciousness"}]
    report = dict(
        summary=dict(
            explicit_repeat_correct=sum(r["passed"] for r in cases),
            explicit_repeat_total=len(cases),
            unseen_action_object_correct=sum(r["passed"] for r in held),
            unseen_action_object_total=len(held),
            limitation=("DEV, used for checkpoint selection. "
                        "Authored templates, not independent call acceptance."),
        ),
        cases=cases,
    )
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    run(parser.parse_args())
