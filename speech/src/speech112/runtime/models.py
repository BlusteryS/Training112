"""CPU-only model adapters. Startup never downloads weights or changes providers."""

from __future__ import annotations

import json
import threading
from collections import OrderedDict
from pathlib import Path

import numpy as np

from speech112.runtime.scheduler import InferenceScheduler

_PHONEMIZER_LOCK = threading.Lock()


def onnx_session(path: Path, threads: int):
    import onnxruntime as ort

    if not path.is_file():
        raise ValueError(f"Required local model is missing: {path}")
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.add_session_config_entry("session.intra_op.allow_spinning", "0")
    options.add_session_config_entry("session.inter_op.allow_spinning", "0")
    return ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])


class OnnxVad:
    """Shared Silero v5/v6 ONNX weights; context/state belong to each detector."""

    def __init__(self, session):
        self.session = session
        self.reset()

    def reset(self):
        self.state = np.zeros((2, 1, 128), dtype=np.float32)
        self.context = np.zeros((1, 64), dtype=np.float32)

    def probability(self, frame):
        if frame.shape != (512,):
            raise ValueError("Silero requires 512 samples at 16 kHz")
        signal = np.concatenate((self.context, frame[None, :]), axis=1)
        output, self.state = self.session.run(
            None, {"input": signal, "state": self.state, "sr": np.array(16000, dtype=np.int64)}
        )
        self.context = signal[:, -64:].copy()
        return float(output.reshape(-1)[0])


class ToneRecognizer:
    def __init__(self, directory: Path, threads: int, scheduler: InferenceScheduler):
        import sherpa_onnx

        for name in ("model.onnx", "tokens.txt"):
            if not (directory / name).is_file():
                raise ValueError(f"Required T-one artifact is missing: {directory / name}")
        self.recognizer = sherpa_onnx.OnlineRecognizer.from_t_one_ctc(
            tokens=str(directory / "tokens.txt"),
            model=str(directory / "model.onnx"),
            num_threads=threads,
            provider="cpu",
            enable_endpoint_detection=False,
        )
        self.scheduler = scheduler

    def stream(self):
        return ToneStream(self.recognizer, self.scheduler)


class ToneStream:
    def __init__(self, recognizer, scheduler):
        self.recognizer = recognizer
        self.scheduler = scheduler
        self.reset()

    def reset(self):
        # A cancelled native call may still own its old stream. Never mutate it in place.
        self._stream = self.recognizer.create_stream()

    async def accept(self, frame: np.ndarray) -> str:
        return await self.scheduler.run(self._decode, self._stream, frame.copy(), False)

    async def finish(self) -> str:
        return await self.scheduler.run(self._decode, self._stream, np.zeros(0), True)

    def _decode(self, stream, frame, final):
        if final:
            # Right context is required to flush T-one's last acoustic window.
            stream.accept_waveform(16000, np.zeros(8000, dtype=np.float32))
            stream.input_finished()
        else:
            stream.accept_waveform(16000, np.asarray(frame, dtype=np.float32))
        while self.recognizer.is_ready(stream):
            self.recognizer.decode_stream(stream)
        return self.recognizer.get_result(stream)


class OnnxEncoder:
    """BERT-compatible tokenizer.json + ONNX last_hidden_state with masked mean pooling."""

    def __init__(self, directory: Path, threads: int):
        from tokenizers import Tokenizer

        metadata = directory / "encoder.json"
        settings = json.loads(metadata.read_text()) if metadata.exists() else {}
        if set(settings) - {"prefix", "max_length", "pooling"}:
            raise ValueError("Unknown sentence encoder setting")
        if settings.get("pooling", "mean") != "mean":
            raise ValueError("Only masked mean pooling is supported")
        self.prefix = settings.get("prefix", "")
        if not isinstance(self.prefix, str) or len(self.prefix) > 64:
            raise ValueError("Invalid sentence encoder prefix")
        max_length = settings.get("max_length", 256)
        if not isinstance(max_length, int) or not 32 <= max_length <= 512:
            raise ValueError("Invalid sentence encoder token budget")
        self.tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=max_length)
        pad_token = "[PAD]" if self.tokenizer.token_to_id("[PAD]") is not None else "<pad>"
        pad_id = self.tokenizer.token_to_id(pad_token)
        if pad_id is None:
            raise ValueError("Sentence encoder tokenizer has no supported padding token")
        self.tokenizer.enable_padding(pad_id=pad_id, pad_token=pad_token)
        self.session = onnx_session(directory / "model.onnx", threads)
        self._lock = threading.Lock()
        self._examples = OrderedDict()
        self._examples_lock = threading.Lock()

    def encode(self, texts: list[str]) -> np.ndarray:
        # Tokenizer padding state is mutable; serialize the small tokenization operation.
        with self._lock:
            encoded = self.tokenizer.encode_batch([self.prefix + text for text in texts])
        ids = np.array([e.ids for e in encoded], dtype=np.int64)
        mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
        candidates = {
            "input_ids": ids,
            "attention_mask": mask,
            "token_type_ids": np.array([e.type_ids for e in encoded], dtype=np.int64),
        }
        output = self.session.run(
            None, {i.name: candidates[i.name] for i in self.session.get_inputs()}
        )[0]
        if output.ndim == 3:
            weights = mask.astype(np.float32)
            output = (output * weights[:, :, None]).sum(1) / np.maximum(weights.sum(1)[:, None], 1)
        if output.ndim != 2 or not np.isfinite(output).all():
            raise ValueError("Encoder must produce finite sentence or token embeddings")
        return output / np.maximum(np.linalg.norm(output, axis=1, keepdims=True), 1e-12)

    def encode_examples(self, texts: tuple[str, ...]) -> np.ndarray:
        with self._examples_lock:
            if texts in self._examples:
                self._examples.move_to_end(texts)
                return self._examples[texts]
        # Bound temporary tensors even for a large scenario library.
        result = np.concatenate(
            [self.encode(list(texts[i : i + 16])) for i in range(0, len(texts), 16)]
        )
        result.flags.writeable = False
        with self._examples_lock:
            self._examples[texts] = result
            self._examples.move_to_end(texts)
            while len(self._examples) > 32:
                self._examples.popitem(last=False)
        return result


class PiperEngine:
    """One shared voice model with an explicit CPU thread budget."""

    def __init__(self, model: Path, threads: int):
        from piper import PiperVoice
        from piper.config import PiperConfig

        config = json.loads(Path(str(model) + ".json").read_text())
        if config.get("language", {}).get("code") != "ru_RU":
            raise ValueError("The CPU profile requires a Russian Piper voice")
        self.voice = PiperVoice(
            session=onnx_session(model, threads), config=PiperConfig.from_dict(config)
        )
        self._lock = _PHONEMIZER_LOCK

    def synthesize(self, text: str) -> tuple[np.ndarray, int]:
        # eSpeak phonemizer has process-global state. Protect it across conversations.
        with self._lock:
            chunks = list(self.voice.synthesize(text))
        if not chunks:
            raise ValueError("Synthesizer returned no audio")
        return np.concatenate([c.audio_float_array for c in chunks]), chunks[0].sample_rate
