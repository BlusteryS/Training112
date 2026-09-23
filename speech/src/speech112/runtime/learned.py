"""Small trained linear heads, bound to an exact encoder and loaded without pickle."""

from __future__ import annotations

import hashlib
import json
from importlib.resources import files
from pathlib import Path

import numpy as np


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def representation_digest(directory: Path, auxiliary: Path | None = None) -> str:
    config = directory / "encoder.json"
    metadata = json.loads(config.read_text()) if config.exists() else {}
    value = {
        "model": file_digest(directory / "model.onnx"),
        "tokenizer": file_digest(directory / "tokenizer.json"),
        "settings": metadata,
        "normalization": "lowercase-word-tokens-yo-to-e-v1",
    }
    if auxiliary is not None:
        value["auxiliary"] = representation_digest(auxiliary)
        value["fusion"] = "concatenate-unit-embeddings-divide-sqrt2-v1"
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


class OperatorHead:
    def __init__(self, encoder: Path, directory=None, auxiliary: Path | None = None):
        directory = directory or files("speech112.learned")
        metadata = json.loads(directory.joinpath("operator.json").read_text())
        payload = directory.joinpath("operator.npz").read_bytes()
        if (
            hashlib.sha256(payload).hexdigest() != metadata["weights_sha256"]
            or file_digest(encoder) != metadata["encoder_sha256"]
            or representation_digest(encoder.parent, auxiliary) != metadata["representation_sha256"]
        ):
            raise ValueError("Operator head does not match the installed encoder")
        from io import BytesIO

        with np.load(BytesIO(payload), allow_pickle=False) as weights:
            if set(weights.files) != {"weight", "bias"}:
                raise ValueError("Invalid learned head keys")
            self.weight = weights["weight"].copy()
            self.bias = weights["bias"].copy()
        self.labels = tuple(metadata["labels"])
        if (
            not 2 <= len(self.labels) <= 64
            or not all(isinstance(label, str) for label in self.labels)
            or len(set(self.labels)) != len(self.labels)
            or not 128 <= metadata["embedding_dimensions"] <= 2048
            or self.weight.shape != (len(self.labels), metadata["embedding_dimensions"])
            or self.bias.shape != (len(self.labels),)
            or not np.isfinite(self.weight).all()
            or not np.isfinite(self.bias).all()
        ):
            raise ValueError("Invalid learned operator head")
        calibration = metadata["calibration"]["selected"]
        if calibration is None:
            raise ValueError("Operator head failed its development release gate")
        self.threshold = calibration["threshold"]
        self.margin = calibration["margin"]
        if not 0 <= self.threshold <= 1 or not 0 <= self.margin <= 1:
            raise ValueError("Invalid learned confidence thresholds")
        self.weight.flags.writeable = False
        self.bias.flags.writeable = False

    def decide(self, vector: np.ndarray) -> tuple[str, bool]:
        logits = self.weight @ vector + self.bias
        if not np.isfinite(logits).all():
            raise ValueError("Non-finite intent scores")
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()
        order = np.argsort(probabilities)
        first, second = order[-1], order[-2]
        accepted = (
            probabilities[first] >= self.threshold
            and probabilities[first] - probabilities[second] >= self.margin
        )
        return self.labels[first], bool(accepted)
