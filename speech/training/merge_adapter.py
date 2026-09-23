"""Merge trained low-rank attention deltas once at installation, without PyTorch.

The release retains the base ONNX graph and kernels. No adapter is executed in
Python during a call. Every base and adapter file must match its release digest.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

import numpy as np


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while block := stream.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()


def merge_adapter(
    base: Path, adapter: Path, output: Path, *, expected_base: str, expected_adapter: str
):
    import onnx
    from onnx import numpy_helper

    if sha256(base) != expected_base or sha256(adapter) != expected_adapter:
        raise ValueError("Encoder base or learned adapter integrity failure")
    model = onnx.load(base)
    initializers = {tensor.name: tensor for tensor in model.graph.initializer}
    with np.load(adapter, allow_pickle=False) as weights:
        expected = {
            f"{i}_{name}_{part}"
            for i in range(3)
            for name in ("query", "value")
            for part in ("a", "b")
        }
        if set(weights.files) != expected:
            raise ValueError("Unexpected adapter keys")
        for index in range(3):
            name = f"Attention_{index}_qkv_weight"
            tensor = initializers[name]
            matrix = numpy_helper.to_array(tensor).copy()
            if matrix.shape != (312, 936):
                raise ValueError("Incompatible fused attention layout")
            for projection, offset in (("query", 0), ("value", 624)):
                a, b = weights[f"{index}_{projection}_a"], weights[f"{index}_{projection}_b"]
                if (
                    a.shape != (8, 312)
                    or b.shape != (312, 8)
                    or not np.isfinite(a).all()
                    or not np.isfinite(b).all()
                ):
                    raise ValueError("Invalid low-rank matrices")
                matrix[:, offset : offset + 312] += (
                    b.astype(np.float32) @ a.astype(np.float32)
                ).T * 2.0
            tensor.CopyFrom(numpy_helper.from_array(matrix, name))
    onnx.checker.check_model(model)
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=output.parent, suffix=".onnx.part")
    os.close(fd)
    try:
        onnx.save(model, temp)
        os.replace(temp, output)
    finally:
        Path(temp).unlink(missing_ok=True)
    return sha256(output)
