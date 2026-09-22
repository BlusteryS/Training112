from __future__ import annotations

import asyncio
import threading
from pathlib import Path

import gigaam
import numpy as np
import torch
from numpy.typing import NDArray

from speech112.config import SttConfig


class GigaAmRecognizer:
    def __init__(self, config: SttConfig) -> None:
        if config.language != "ru":
            raise ValueError("GigaAM-v3 в Speech-112 должен работать только с языком ru")
        if config.device != "cuda":
            raise ValueError("GigaAM-v3 в Speech-112 должен работать на CUDA")

        download_root = Path(config.download_root)
        download_root.mkdir(parents=True, exist_ok=True)
        self._model = gigaam.load_model(
            config.model,
            device=config.device,
            fp16_encoder=config.fp16_encoder,
            use_flash=False,
            download_root=str(download_root),
        )
        self._inference_lock = threading.Lock()

    async def transcribe(self, audio: NDArray[np.float32]) -> str:
        return await asyncio.to_thread(self._transcribe_sync, audio)

    def warmup(self) -> None:
        self._transcribe_sync(np.zeros(16000, dtype=np.float32))

    def _transcribe_sync(self, audio: NDArray[np.float32]) -> str:
        with self._inference_lock, torch.inference_mode():
            waveform = torch.from_numpy(np.ascontiguousarray(audio)).unsqueeze(0)
            parameter = next(self._model.parameters())
            waveform = waveform.to(device=parameter.device, dtype=parameter.dtype)
            length = torch.tensor([waveform.shape[1]], device=parameter.device)
            encoded, encoded_length = self._model(waveform, length)
            decoded = self._model.decoding.decode(self._model.head, encoded, encoded_length)
            return decoded[0][0].strip()
