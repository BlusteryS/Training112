"""Authored training dialogues. Public data never masquerades as actual 112 calls.

Surface families and context wordings are split before composition. TEST is only
loaded by the release evaluator. Counterfactual examples share the same question
but change the history, so a model cannot pass by memorizing that question alone.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from domain import DEV, TEST, TRAIN

LABELS = tuple(sorted(set(TRAIN) | {"contact", "other"}))


def row(text, labels, history=(), family="single"):
    return dict(text=text, labels=list(labels), history=list(history), family=family)


# Distinct wording sets; no augmentation of test examples goes into training.
DATA = json.loads(Path(__file__).with_name("data_examples.json").read_text())
CONTEXTS = DATA["CONTEXTS"]
FOLLOWUPS = DATA["FOLLOWUPS"]
CONTACT = DATA["CONTACT"]
REPAIR = DATA["REPAIR"]
NEGATION = DATA["NEGATION"]
OTHER = DATA["OTHER"]


def dataset(split):
    source = {"train": TRAIN, "dev": DEV, "test": TEST}[split]
    out = [row(text, [label]) for label, texts in source.items() for text in texts]
    out += [row(t, ["contact"], family="contact") for t in CONTACT[split]]
    out += [
        row(t, ["repeat"], DATA["repair_history"], "repair") for t in REPAIR[split]
    ]
    out += [row(t, [label], family="negation") for t, label in NEGATION[split]]
    out += [row(t, ["other"], family="out_of_domain") for t in OTHER[split]]
    for label, contexts in CONTEXTS[split].items():
        for c in contexts:
            for q in FOLLOWUPS[split][label]:
                out.append(row(q, [label], [DATA["context_question"], c], "context"))
    # Same ambiguous utterance, different history: essential causal context check.
    ambiguous = DATA["ambiguous"][split]
    for label in ("address", "name", "phone", "incident"):
        for _c in CONTEXTS[split][label]:
            for q in ambiguous:
                out.append(
                    row(
                        q,
                        [label],
                        [
                            DATA["counterfactual_questions"][label],
                            DATA["counterfactual_answers"][split],
                        ],
                        "counterfactual",
                    )
                )
    # Questions without a referent should be clarified, not assigned an invented referent.
    for q in ambiguous + FOLLOWUPS[split]["victim_count"][:1]:
        out.append(row(q, ["other"], DATA["ambiguous_history"], "ambiguous"))
    # Learn to ignore acknowledged/retracted requests and follow the current request.
    ack = DATA["ack"][split]
    nouns = DATA["nouns"]
    for old, noun in nouns.items():
        for new in nouns:
            if old == new:
                continue
            for suffix in ack:
                q = source[new][0]
                out.append(
                    row(
                        noun + suffix + ". " + q,
                        [new],
                        [DATA["correction_question"], CONTEXTS[split][old][0]],
                        "correction",
                    )
                )
    # Independently authored questions combined only within their split.
    pairs = [
        ("address", "name"),
        ("victims", "address"),
        ("consciousness", "breathing"),
        ("age", "victim_count"),
        ("phone", "name"),
    ]
    joiners = DATA["joiners"][split]
    for a, b in pairs:
        for j in joiners:
            for i in range(min(2, len(source[a]), len(source[b]))):
                out.append(row(source[a][i] + j + source[b][i], [a, b], family="compound"))
    # History is never itself an instruction: explicit current questions win.
    for label, texts in source.items():
        for i, t in enumerate(texts[:2]):
            out.append(
                row(
                    t,
                    [label],
                    [DATA["history_question"], CONTEXTS[split]["address"][i % len(CONTEXTS[split]["address"])]],
                    "history_distractor",
                )
            )
    if split == "train":
        # Orthogonal augmentation: every explicit question is seen after unrelated topics.
        # No DEV/TEST phrase, context or answer is used by this construction.
        histories = DATA["histories"]
        for label, phrases in (("contact", CONTACT[split]), ("repeat", REPAIR[split])):
            for phrase in phrases:
                for history in [
                    [],
                    *histories,
                    *DATA["control_histories"],
                ]:
                    out.append(row(phrase, [label], history, "control_invariance"))
        for label, texts in source.items():
            for text in texts:
                for history in histories:
                    out.append(row(text, [label], history, "history_invariance"))
                out.append(row(DATA["greeting_prefix"] + text, [label], family="greeting_question"))
        for old, noun in nouns.items():
            for new in nouns:
                if old == new:
                    continue
                for text in source[new]:
                    for prefix in DATA["correction_prefixes"]:
                        out.append(row(prefix.format(noun=noun, noun_lower=noun.lower()) + text,
                                       [new], family="correction_diversity"))
        for i in range(min(len(source["address"]), len(source["name"]), len(source["phone"]))):
            out.append(
                row(
                    " ".join(source[label][i] for label in ("address", "name", "phone")),
                    ["address", "name", "phone"],
                    family="triple_question",
                )
            )
        for first, second in pairs:
            for a in source[first]:
                for b in source[second]:
                    out.append(row(a + " " + b, [first, second], family="compound_diversity"))
                    out.append(row(b + " " + a, [second, first], family="compound_diversity"))
    unique = {(r["text"], tuple(r["history"]), tuple(r["labels"])): r for r in out}
    result = list(unique.values())
    if split != "train":
        train_keys = {(r["text"].lower().strip(), tuple(r["history"])) for r in dataset("train")}
        result = [
            r for r in result if (r["text"].lower().strip(), tuple(r["history"])) not in train_keys
        ]
    return result
