"""Meaning check for the operator's description using the local encoder."""

from __future__ import annotations

import re

import numpy as np

from speech112.preparation.evaluation import normalize
from speech112.runtime.context_input import OperatorUtteranceTooLong


_NEGATION = re.compile(r"\b(?:не|нет|никто|ничего|отсутств\w*|без)\b")
_CRITICAL = (
    re.compile(r"\b(?:дым\w*|задым\w*)\b"),
    re.compile(r"\b(?:газ\w*|газов\w*)\b"),
    re.compile(r"\b(?:вод\w*|затоп\w*|труб\w*|прорыв\w*)\b"),
    re.compile(r"\b(?:машин\w*|автомобил\w*|дтп|столкнов\w*)\b"),
    re.compile(r"\b(?:пострад\w*|ранен\w*|травм\w*)\b"),
    re.compile(r"\b(?:огн\w*|плам\w*|гор\w*|пожар\w*)\b"),
    re.compile(r"\b(?:драк\w*|напад\w*|избиен\w*)\b"),
)


class SemanticCardEvaluator:
    def __init__(self, understanding):
        self.understanding = understanding

    def __call__(self, actual: str, expected: str) -> str:
        actual_text = normalize(actual)
        expected_text = normalize(expected)
        if not actual_text:
            return "failed"
        if actual_text == expected_text:
            return "passed"

        if set(re.findall(r"\d+", actual_text)) != set(re.findall(r"\d+", expected_text)):
            return "review"
        if bool(_NEGATION.search(actual_text)) != bool(_NEGATION.search(expected_text)):
            return "review"
        if any(bool(concept.search(actual_text)) != bool(concept.search(expected_text))
               for concept in _CRITICAL):
            return "review"

        try:
            vectors = self.understanding.encode(
                [{"text": text, "history": []} for text in (actual, expected)]
            )
        except OperatorUtteranceTooLong:
            return "review"
        similarity = float(np.dot(vectors[0], vectors[1]))
        if not np.isfinite(similarity):
            raise ValueError("Non-finite semantic similarity")
        if similarity >= 0.84:
            return "passed"
        if similarity <= 0.45:
            return "failed"
        return "review"
