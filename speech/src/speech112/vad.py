import numpy as np
import torch
from numpy.typing import NDArray
from silero_vad import load_silero_vad


class SileroDetector:
    """A separate stateful detector is prepared for each conversation."""

    def __init__(self, sample_rate: int) -> None:
        self._sample_rate = sample_rate
        self._model = load_silero_vad(onnx=True)

    def probability(self, frame: NDArray[np.float32]) -> float:
        return float(self._model(torch.from_numpy(frame), self._sample_rate).item())

    def reset(self) -> None:
        self._model.reset_states()
