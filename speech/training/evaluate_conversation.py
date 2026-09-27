"""Run unpunctuated operator questions through the live semantic parser."""

import argparse
import json
from collections import Counter
from pathlib import Path

from speech112.runtime.contextual import ContextualUnderstanding


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cases", type=Path)
    parser.add_argument("--model", type=Path, default=Path(".models/e5-small-int8"))
    parser.add_argument("--head", type=Path)
    args = parser.parse_args()

    understanding = ContextualUnderstanding(args.model, None, args.head)
    failures = []
    counts = Counter()
    families = Counter()
    passed = Counter()
    for line in args.cases.read_text().splitlines():
        case = json.loads(line)
        labels = set(case.get("targets", case.get("labels", ())))
        control = next(iter(labels)) if len(labels) == 1 and labels & {"contact", "other", "repeat"} else None
        inferred = {"contact": "contact", "other": "reject", "repeat": "repeat"}.get(control)
        if inferred is None:
            inferred = "end" if labels == {"goodbye"} else "inform" if labels and labels <= {
                "help_sent", "not_sent", "hold", "reassure", "dismissal"
            } else "request"
        expected_action = case.get("action", inferred)
        expected_targets = labels - {"contact", "other", "repeat"}
        frame = understanding.predict(case["text"], case.get("history", ()))
        counts[expected_action] += 1
        family = case.get("family", "challenge")
        families[family] += 1
        if frame.action == expected_action and set(frame.targets) == expected_targets:
            passed[family] += 1
        else:
            failures.append({"text": case["text"], "expected": [expected_action, sorted(expected_targets)],
                             "actual": [frame.action, sorted(frame.targets)]})
    print(json.dumps({"total": sum(counts.values()), "correct": sum(counts.values()) - len(failures),
                      "by_action": counts, "families": {name: [passed[name], total] for name, total in families.items()},
                      "failures": failures}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
