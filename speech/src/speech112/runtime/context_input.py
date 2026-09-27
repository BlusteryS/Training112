"""Shared training/inference encoding with bounded role-labelled conversational context."""

import re
from pathlib import Path

import numpy as np
from tokenizers import Tokenizer

LEGACY_CONTEXT_FORMAT = "role-pair-query-pooling-v1"
CONTEXT_FORMAT = "role-pair-query-pooling-asr-v2"


def operator_text(text: str) -> str:
    return " ".join(re.findall(r"\w+", text.lower().replace("ё", "е")))


_QUESTION_WORD = re.compile(
    r"\b(?:кто|что|где|куда|кому|сколько|какой|какая|какие|какое|как|есть ли|можно ли"
    r"|назовите|скажите|уточните|сообщите|опишите|расскажите|подскажите|видите ли"
    r"|можете ли|остались ли|дышит ли)\b",
    re.IGNORECASE,
)
_NEW_TOPIC = (
    r"(?:кто|что|где|куда|кому|как|сколько|какой|какая|какие|какое|есть|назовите|скажите"
    r"|уточните|сообщите|опишите|можете|видите|остались|дышит|в сознании|рядом есть"
    r"|адрес|телефон|пострадавшие|раненые|возраст)\b"
)
_CLAUSE_BREAK = re.compile(
    rf"[;.!?]+\s*|,\s*(?={_NEW_TOPIC})|\s+(?:затем|потом|после этого|а также|теперь|или хотя бы)\s+"
    rf"|\s+(?:и|или)\s+(?={_NEW_TOPIC})",
    re.IGNORECASE,
)
_SPOKEN_QUESTION = re.compile(
    r"\b(?:кто|что|где|куда|кому|сколько|какой|какая|какие|какое|"
    r"есть ли|дышит ли|в сознании ли|можете ли|видите ли|остались ли|"
    r"(?:он|она|человек) может (?:ли )?(?:говорить|отвечать)|"
    r"(?:он|она) дышит)\b",
    re.IGNORECASE,
)
_BARE_PROMPT = frozenset(("скажите", "уточните", "сообщите", "подскажите", "расскажите"))


def _spoken_parts(piece: str) -> list[str]:
    """Find question boundaries in ASR text without relying on punctuation."""
    parts = []
    start = 0
    for match in _SPOKEN_QUESTION.finditer(piece):
        before = piece[start:match.start()].strip()
        after = piece[match.start():].strip()
        if match.group().lower() == "кто" and after.lower().startswith("кто то"):
            continue
        if match.group().lower() == "где" and re.search(
            r"\b(?:горени\w*|пламя|дым|огонь|место)\s*$", before, re.IGNORECASE
        ):
            continue
        if match.group().lower() == "кому" and re.search(r"\bврач нужен\s*$", before, re.IGNORECASE):
            continue
        if match.group().lower() == "сколько" and re.search(
            r"\b(?:ранен\w*|пострадавш\w*) всего\s*$", before, re.IGNORECASE
        ):
            continue
        if re.search(r"\b(?:на|по|в|для)\s*$", before, re.IGNORECASE):
            continue
        if len(before.split()) < 2 or len(after.split()) < 2:
            continue
        first = before.split()[0].lower()
        if first in _BARE_PROMPT and len(before.split()) < 4:
            continue
        if not _QUESTION_WORD.search(before):
            continue
        parts.append(before)
        start = match.start()
    parts.append(piece[start:].strip())
    return parts


def question_parts(text: str) -> tuple[str, ...]:
    """Keep every part of a spoken multi-question, including unpunctuated ASR text."""
    clauses: list[str] = []
    prefix = ""
    for piece in (part for clause in _CLAUSE_BREAK.split(text) for part in _spoken_parts(clause)):
        piece = piece.strip()
        if not piece:
            continue
        if prefix:
            piece = prefix + " " + piece
            prefix = ""
        if len(piece.split()) < 2 and not clauses and piece.lower() not in ("адрес", "телефон"):
            prefix = piece
            continue
        if len(piece.split()) < 2 and clauses and piece.lower() not in ("адрес", "телефон"):
            clauses[-1] += " " + piece
        else:
            clauses.append(piece)
    if prefix:
        clauses.append(prefix)
    return tuple(clauses)


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
