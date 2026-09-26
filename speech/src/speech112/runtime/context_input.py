"""Shared training/inference encoding with bounded role-labelled conversational context."""

import re
from pathlib import Path

import numpy as np
from tokenizers import Tokenizer

LEGACY_CONTEXT_FORMAT = "role-pair-query-pooling-v1"
CONTEXT_FORMAT = "role-pair-query-pooling-asr-v2"


def operator_text(text: str) -> str:
    return " ".join(re.findall(r"\w+", text.lower().replace("ё", "е")))


_CLAUSE_BREAK = re.compile(
    r"[;.!?]+\s*|,\s*(?=(?:кто|где|сколько|есть|назовите|скажите|уточните|сообщите|опишите)\b)"
    r"|\s+(?:и|а также|затем|потом)\s+",
    re.IGNORECASE,
)
_QUESTION_WORD = re.compile(
    r"\b(?:кто|что|где|сколько|какой|какая|какие|какое|есть ли|можно ли"
    r"|назовите|скажите|уточните|сообщите|опишите)\b",
    re.IGNORECASE,
)


def question_parts(text: str) -> tuple[str, ...]:
    """Keep every part of a spoken multi-question, including unpunctuated ASR text."""
    clauses: list[str] = []
    for piece in _CLAUSE_BREAK.split(text):
        piece = piece.strip()
        if not piece:
            continue
        if len(piece.split()) < 2 and clauses:
            clauses[-1] += " " + piece
        else:
            clauses.append(piece)
    parts: list[str] = []
    for clause in clauses:
        start = 0
        for match in _QUESTION_WORD.finditer(clause):
            if match.group().lower() in ("что", "кто") and re.match(
                r"[-\s]+(?:то|нибудь)\b", clause[match.end():], re.IGNORECASE
            ):
                continue
            before = clause[start:match.start()].strip()
            after = clause[match.start():].strip()
            if len(before.split()) >= 3 and len(after.split()) >= 2:
                parts.append(before)
                start = match.start()
            elif (
                parts
                and before
                and len(before.split()) <= 2
                and not starts_question(before)
                and len(after.split()) >= 2
            ):
                parts[-1] += " " + before
                start = match.start()
        parts.append(clause[start:].strip())
    return tuple(part for part in parts if part)


def starts_question(text: str) -> bool:
    return _QUESTION_WORD.match(text.strip()) is not None


class OperatorUtteranceTooLong(ValueError):
    """The full current question cannot fit; silently dropping its end is forbidden."""


class ContextTokenizer:
    def __init__(self, path: Path, input_format: str = CONTEXT_FORMAT):
        if input_format not in (CONTEXT_FORMAT, LEGACY_CONTEXT_FORMAT):
            raise ValueError("Unsupported contextual input format")
        self.normalize_operator = input_format == CONTEXT_FORMAT
        self.tokenizer = Tokenizer.from_file(str(path))
        # Share tokenizer components; measure the question without truncation or
        # changing the inference tokenizer's state across concurrent requests.
        self.probe = Tokenizer(self.tokenizer.model)
        if self.tokenizer.normalizer is not None:
            self.probe.normalizer = self.tokenizer.normalizer
        if self.tokenizer.pre_tokenizer is not None:
            self.probe.pre_tokenizer = self.tokenizer.pre_tokenizer
        self.tokenizer.enable_truncation(
            max_length=192,
            strategy="only_first",
            direction="left",
        )
        self.tokenizer.enable_padding(pad_id=1, pad_token="<pad>")

    def batch(self, rows):
        pairs = []
        for row in rows:
            history = row.get("history", [])
            # Input history is [operator, caller, ...], always complete exchanges.
            if len(history) % 2:
                raise ValueError("Context must contain complete operator/caller exchanges")
            history = history[-4:]
            if self.normalize_operator:
                history = [operator_text(t) if i % 2 == 0 else t for i, t in enumerate(history)]
            past = (
                " ".join(
                    ("оператор: " if i % 2 == 0 else "заявитель: ") + t
                    for i, t in enumerate(history)
                )
                or "начало разговора"
            )
            text = operator_text(row["text"]) if self.normalize_operator else row["text"]
            current = "query: " + text.strip().lower()
            probe = self.probe.encode(current, add_special_tokens=False)
            if probe.overflowing or sum(probe.attention_mask) > 160:
                raise OperatorUtteranceTooLong("Operator question exceeds the model token budget")
            pairs.append((past.lower(), current))
        encoded = self.tokenizer.encode_batch(pairs)
        data = {
            "input_ids": np.array([e.ids for e in encoded], dtype=np.int64),
            "attention_mask": np.array([e.attention_mask for e in encoded], dtype=np.int64),
            "token_type_ids": np.array([e.type_ids for e in encoded], dtype=np.int64),
        }
        query = np.array([[int(s == 1) for s in e.sequence_ids] for e in encoded], dtype=np.float32)
        if (query.sum(1) == 0).any():
            raise ValueError("Empty operator utterance")
        return data, query
