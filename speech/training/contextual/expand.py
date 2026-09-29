"""Freeze additional ASR-style questions without mixing training and evaluation wording."""

import argparse
import json
import random
from itertools import combinations
from pathlib import Path


DATA = json.loads(Path(__file__).with_name("expand_examples.json").read_text())
TRAIN = DATA["TRAIN"]
DEV = DATA["DEV"]
EXTRA_TRAIN = DATA["EXTRA_TRAIN"]
EXTRA_DEV = DATA["EXTRA_DEV"]


def rows(bank: dict[str, list[str]], seed: int, limit: int) -> list[dict]:
    rng = random.Random(seed)
    result = [{"text": phrase, "labels": [label], "history": [], "family": "single"}
              for label, phrases in bank.items() for phrase in phrases]
    labels = tuple(bank)
    pairs = list(combinations(labels, 2))
    triples = list(combinations(labels, 3))
    for group, count in ((pairs, limit), (triples, limit // 2)):
        for _ in range(count):
            selected = list(rng.choice(group))
            rng.shuffle(selected)
            text = " ".join(rng.choice(bank[label]) for label in selected)
            result.append({"text": text, "labels": selected, "history": [],
                           "family": "compound_diversity" if len(selected) == 2 else "triple_question"})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for split, bank, limit in (("train", TRAIN, 4000), ("dev", DEV, 400)):
        existing = [json.loads(line) for line in (args.base / f"stage3-{split}.jsonl").read_text().splitlines()]
        extra = EXTRA_TRAIN if split == "train" else EXTRA_DEV
        authored = [{"text": text, "labels": labels, "history": [], "family": "out_of_domain"
                     if labels == ["other"] else "compound_diversity", **({"action": action} if action else {})}
                    for text, labels, action in extra]
        merged = existing + rows(bank, 112 if split == "train" else 113, limit) + authored
        seen = set()
        unique = []
        for entry in merged:
            key = (entry["text"].casefold(), tuple(entry.get("history", ())))
            if key not in seen:
                seen.add(key)
                unique.append(entry)
        (args.output / f"{split}.jsonl").write_text(
            "".join(json.dumps(entry, ensure_ascii=False) + "\n" for entry in unique)
        )
        print(split, len(unique))


if __name__ == "__main__":
    main()
