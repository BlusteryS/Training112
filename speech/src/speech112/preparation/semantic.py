"""Conservative meaning check using the local conversational encoder."""

from __future__ import annotations

import re

import numpy as np

from speech112.preparation.evaluation import normalize
from speech112.runtime.context_input import OperatorUtteranceTooLong


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

        # Numbers and negation often reverse the meaning of a short emergency report.
        # The embedding alone cannot safely decide these cases.
        if set(re.findall(r"\d+", actual_text)) != set(re.findall(r"\d+", expected_text)):
            return "review"
        negative = re.compile(r"\b(?:не|нет|никто|ничего|отсутств\w*)\b")
        if bool(negative.search(actual_text)) != bool(negative.search(expected_text)):
            return "review"

        # A near-identical sentence with a changed object (smoke versus gas, for
        # example) can still have a high cosine similarity.
        expected_terms = {word[:4] for word in expected_text.split() if len(word) >= 4}
        actual_terms = {word[:4] for word in actual_text.split() if len(word) >= 4}
        if not expected_terms.issubset(actual_terms):
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
        if similarity >= 0.9:
            return "passed"
        if similarity <= 0.55:
            return "failed"
        return "review"
