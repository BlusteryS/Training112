"""Experimental feature fusion; not loaded by the live runtime."""

import numpy as np

from speech112.runtime.models import OnnxEncoder


class FusedEncoder:
    """Fixed normalized feature fusion; a trained head learns how to use both encoders."""

    def __init__(self, primary: OnnxEncoder, auxiliary: OnnxEncoder):
        self.primary, self.auxiliary = primary, auxiliary

    @staticmethod
    def _combine(first, second):
        return np.concatenate((first, second), axis=1) * np.float32(2**-0.5)

    def encode(self, texts):
        return self._combine(self.primary.encode(texts), self.auxiliary.encode(texts))

    def encode_examples(self, texts):
        return self._combine(
            self.primary.encode_examples(texts), self.auxiliary.encode_examples(texts)
        )
