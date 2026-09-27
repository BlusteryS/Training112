"""Compose held-out operator wordings into ASR-style multi-question checks."""

import json
import random
import re
from pathlib import Path

from domain import TEST

def operator_text(text: str) -> str:
    return " ".join(re.findall(r"\w+", text.lower().replace("ё", "е")))


def build(count: int = 1200) -> list[dict]:
    rng = random.Random(112)
    labels = [label for label in TEST if label not in {
        "help_sent", "not_sent", "reassure", "dismissal", "hold", "repeat", "goodbye"
    }]
    rows = []
    seen = set()
    while len(rows) < count:
        selected = rng.sample(labels, rng.choice((2, 2, 3)))
        phrases = [rng.choice(TEST[label]) for label in selected]
        text = operator_text(rng.choice((" и ", " затем ", " после этого ")).join(phrases))
        if text in seen:
            continue
        seen.add(text)
        rows.append({"text": text, "targets": selected, "family": "compound_holdout"})
    return rows


if __name__ == "__main__":
    path = Path(__file__).with_name("conversation_regression.jsonl")
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in build()))
