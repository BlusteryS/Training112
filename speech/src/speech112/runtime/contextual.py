"""One contextual encoder with a trained multilabel output; no retrieval fallback."""

import hashlib
import json
import re
from importlib.resources import files
from io import BytesIO
from pathlib import Path

import numpy as np
import onnxruntime as ort

from speech112.runtime.context_input import (
    ContextTokenizer,
    OperatorUtteranceTooLong,
    operator_text,
    question_parts,
    starts_question,
)
from speech112.runtime.learned import file_digest
from speech112.runtime.scheduler import InferenceScheduler
from speech112.runtime.semantic_evidence import evidence, explicit_action, strip_known
from speech112.runtime.semantic_frame import ACTIONS, FRAME_SCHEMA, SemanticFrame, decode_frame

_INFORMED_INTENTS = frozenset(
    ("dismissal", "goodbye", "help_sent", "hold", "not_sent", "reassure")
)
_NO_DISPATCH_COMMAND = re.compile(
    r"\bне (?:отправляйте|посылайте|высылайте|присылайте|вызывайте)\b"
    r"|\bне надо (?:отправлять|посылать|высылать|присылать|вызывать)\b"
)


class ContextualUnderstanding:
    def __init__(self, base: Path, scheduler: InferenceScheduler, directory=None, threads=1):
        directory = directory or files("speech112.learned").joinpath("contextual")
        meta = json.loads(directory.joinpath("context.json").read_text())
        payload = directory.joinpath("context.npz").read_bytes()
        if (
            hashlib.sha256(payload).hexdigest() != meta["weights_sha256"]
            or file_digest(base / "model.onnx") != meta["base_sha256"]
            or file_digest(base / "tokenizer.json") != meta["tokenizer_sha256"]
        ):
            raise ValueError("Contextual model integrity mismatch")
        self.targets = tuple(meta["labels"])
        self.cardinality = meta.get("cardinality") is True
        if (
            not 2 <= len(self.targets) <= 64
            or len(set(self.targets)) != len(self.targets)
            or meta.get("schema") != FRAME_SCHEMA
            or tuple(meta.get("actions", ())) != ACTIONS
            or meta.get("decoder") != "joint-map-v1"
            or not self.cardinality
        ):
            raise ValueError("Invalid contextual output schema")
        self.labels = (*self.targets, "repeat", "contact", "other")
        self.version = meta["weights_sha256"]
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        options.add_session_config_entry("session.inter_op.allow_spinning", "0")
        self._initializers = []
        with np.load(BytesIO(payload), allow_pickle=False) as tensors:
            if set(tensors.files) != set(meta["overrides"]) | {"head_weight", "head_bias"}:
                raise ValueError("Invalid contextual parameters")
            self.weight = tensors["head_weight"].copy()
            self.bias = tensors["head_bias"].copy()
            for name in meta["overrides"]:
                value = np.ascontiguousarray(tensors[name])
                if (
                    value.dtype not in (np.dtype("float32"), np.dtype("int8"))
                    or not np.isfinite(value).all()
                ):
                    raise ValueError("Invalid contextual initializer")
                tensor = ort.OrtValue.ortvalue_from_numpy(value)
                self._initializers.append(tensor)
                options.add_initializer(name, tensor)
        if (
            self.weight.shape != (len(self.targets) + 4 + len(ACTIONS), 384)
            or self.bias.shape != (len(self.targets) + 4 + len(ACTIONS),)
            or not np.isfinite(self.weight).all()
            or not np.isfinite(self.bias).all()
        ):
            raise ValueError("Invalid contextual head shape")
        self.session = ort.InferenceSession(
            str(base / "model.onnx"), options, providers=["CPUExecutionProvider"]
        )
        self.input_names = {x.name for x in self.session.get_inputs()}
        self.tokenizer = ContextTokenizer(base / "tokenizer.json", meta["format"])
        self.scheduler = scheduler
        self.weight.flags.writeable = self.bias.flags.writeable = False

    def encode(self, rows):
        data, mask = self.tokenizer.batch(rows)
        hidden = self.session.run(None, {k: v for k, v in data.items() if k in self.input_names})[0]
        vectors = (hidden * mask[:, :, None]).sum(1) / mask.sum(1)[:, None]
        vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
        return vectors

    def logits(self, rows):
        vectors = self.encode(rows)
        logits = vectors @ self.weight.T + self.bias
        if not np.isfinite(logits).all():
            raise ValueError("Non-finite contextual prediction")
        return logits

    def scores(self, rows):
        return 1 / (1 + np.exp(-np.clip(self.logits(rows), -60, 60)))

    def predict(self, text, history=()):
        normalized = operator_text(text)
        if _NO_DISPATCH_COMMAND.search(normalized):
            return SemanticFrame("reject", (), 1.0)
        if re.fullmatch(r"(?:а )?сколько их(?: там)?", normalized):
            context = operator_text(" ".join(history[-2:]))
            if not re.search(r"\b(?:люд\w*|человек\w*|пострадавш\w*|ранен\w*|"
                             r"двое|трое|четверо|пятеро|шестеро|семеро|восьмеро|"
                             r"девятеро|десятеро)\b", context):
                return SemanticFrame("reject", (), 1.0)
        if re.fullmatch(r"(?:тогда )?(?:сообщите|расскажите) подробнее", normalized) and len(history) >= 2:
            referred = evidence(history[-2])
            if len(referred) == 1:
                return SemanticFrame("request", referred, 1.0)
        text = strip_known(text) or text
        stated = evidence(text)
        parts = question_parts(text)
        if not parts or len(parts) > 8:
            return SemanticFrame("reject", (), 0.0)
        try:
            whole = decode_frame(self.logits([{"text": text, "history": history}])[0], self.targets)
        except OperatorUtteranceTooLong:
            whole = None
        if stated == ("goodbye",) or (
            len(parts) == 1
            and stated
            and set(stated) <= {"help_sent", "not_sent", "hold", "reassure", "dismissal", "goodbye"}
        ):
            return self._ground(text, whole or SemanticFrame("reject", (), 0.0), stated)
        if len(parts) == 1 or (
            whole is not None
            and whole.action in ("inform", "end")
            and "?" not in text
            and not any(starts_question(part) for part in parts[1:])
        ):
            return self._ground(text, whole or SemanticFrame("reject", (), 0.0), stated)
        try:
            logits = self.logits([{"text": part, "history": history} for part in parts])
        except OperatorUtteranceTooLong:
            return self._ground(text, whole or SemanticFrame("reject", (), 0.0), stated)
        frames = [self._ground(part, decode_frame(row, self.targets), evidence(part))
                  for part, row in zip(parts, logits, strict=True)]
        targets = []
        for frame in frames:
            if frame.action in ("request", "repeat"):
                eligible = frame.targets
            elif frame.action in ("inform", "end"):
                eligible = (target for target in frame.targets if target in _INFORMED_INTENTS)
            else:
                continue
            for target in eligible:
                if target not in targets:
                    targets.append(target)
        if not targets or len(targets) > 6:
            return self._ground(text, whole or SemanticFrame("reject", (), 0.0), stated)
        if len(targets) > 1 and "goodbye" in targets:
            targets.remove("goodbye")
        action = "inform" if all(frame.action in ("inform", "end") for frame in frames) else "request"
        if explicit_action(text, tuple(targets)) == "repeat":
            action = "repeat"
        return SemanticFrame(action, tuple(targets), min(frame.confidence for frame in frames))

    @staticmethod
    def _ground(text: str, frame: SemanticFrame, stated: tuple[str, ...]) -> SemanticFrame:
        if stated:
            targets = tuple(target for target in stated if target != "goodbye") if len(stated) > 1 else stated
            action = explicit_action(text, targets)
            if frame.action in ("reject", "contact", "end"):
                if action is not None:
                    return SemanticFrame(action, targets, frame.confidence)
                return frame
            if frame.action == "repeat":
                return SemanticFrame("repeat", targets, frame.confidence)
            return SemanticFrame(action or frame.action, targets, frame.confidence)
        action = explicit_action(text, ())
        if action == "contact":
            return SemanticFrame("contact", (), frame.confidence)
        return frame

    async def understand(self, text, history):
        return await self.scheduler.run(self.predict, text, history)
