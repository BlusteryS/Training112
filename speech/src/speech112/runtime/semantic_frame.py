"""Output schema shared by training, export and inference of one semantic parser."""

from dataclasses import dataclass

import numpy as np

ACTIONS = ("request", "repeat", "contact", "inform", "end", "reject")
FRAME_SCHEMA = "action-target-set-v1"


@dataclass(frozen=True, slots=True)
class SemanticFrame:
    action: str
    targets: tuple[str, ...]
    confidence: float

    @property
    def intents(self) -> tuple[str, ...]:
        if self.action == "reject":
            return ("other",)
        if self.action == "contact":
            return ("contact",) if not self.targets else ("other",)
        if self.action == "repeat" and not self.targets:
            return ("repeat",)
        return self.targets or ("other",)


def decode_frame(logits: np.ndarray, labels: tuple[str, ...]) -> SemanticFrame:
    """Exact MAP over the typed frame grammar, with one shared model likelihood.

    For a fixed cardinality, the best subset contains the largest target logits.
    Bernoulli normalizers are constant across subsets and cancel. No second model,
    phrase matching, retry or confidence-triggered routing participates here.
    """
    n = len(labels)
    target = logits[:n]
    count = logits[n : n + 4]
    action = logits[n + 4 :]
    ranked = np.argsort(target)[::-1]
    cumulative = np.concatenate(([0.0], np.cumsum(target[ranked[:3]])))
    # Both softmax normalizers are also constant across competing frames.
    best = None
    for a, name in enumerate(ACTIONS):
        counts = (0,) if name in ("contact", "reject") else range(0 if name == "repeat" else 1, 4)
        for k in counts:
            score = float(action[a] + count[k] + cumulative[k])
            if best is None or score > best[0]:
                best = score, a, k
    _, a, k = best
    probability = np.exp(action - action.max())
    probability /= probability.sum()
    return SemanticFrame(
        ACTIONS[a], tuple(labels[i] for i in sorted(ranked[:k])), float(probability[a])
    )
