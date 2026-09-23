"""Reconstruct the exact dequantized base for training; export only changed initializers.

Inference uses the original INT8 graph and ORT kernels. No additional network,
LoRA branch or PyTorch dependency is introduced into live conversations.
"""

import json

import numpy as np
import onnx
import torch
from onnx import numpy_helper
from transformers import BertConfig, BertModel


def load_base(base, config, overrides=None):
    graph = onnx.load(base)
    arrays = {t.name: numpy_helper.to_array(t).copy() for t in graph.graph.initializer}
    if overrides is not None:
        with np.load(overrides, allow_pickle=False) as trained:
            for name in trained.files:
                if name in arrays:
                    arrays[name] = trained[name].copy()
    mapping = {}
    model = BertModel(BertConfig.from_dict(json.loads(config.read_text())), add_pooling_layer=False)
    state = model.state_dict()
    for name in state:
        if name in arrays:
            value = arrays[name]
            mapping[name] = (name, False)
        elif (
            name.startswith("embeddings.")
            and name.endswith(".weight")
            and name + "_quantized" in arrays
        ):
            value = (
                arrays[name + "_quantized"].astype(np.float32) - arrays[name + "_zero_point"]
            ) * arrays[name + "_scale"]
            mapping[name] = (name, False)
        else:
            node = next(
                (
                    n
                    for n in graph.graph.node
                    if n.op_type == "MatMulInteger"
                    and n.name.removeprefix("/").removesuffix("/MatMul_quant").replace("/", ".")
                    + ".weight"
                    == name
                ),
                None,
            )
            if node is None:
                raise ValueError("Missing base tensor " + name)
            key = node.input[1].removesuffix("_quantized")
            value = (
                (arrays[key + "_quantized"].astype(np.float32) - arrays[key + "_zero_point"])
                * arrays[key + "_scale"]
            ).T
            mapping[name] = (key, True)
        state[name] = torch.from_numpy(np.ascontiguousarray(value))
    model.load_state_dict(state, strict=True)
    return model, arrays, mapping


def export_overrides(model, arrays, mapping):
    out = {}
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        key, transpose = mapping[name]
        value = param.detach().cpu().numpy()
        if transpose:
            value = value.T
            scale = np.maximum(np.max(np.abs(value), axis=0) / 127, 1e-12).astype(np.float32)
            out[key + "_scale"] = scale
            out[key + "_zero_point"] = np.zeros_like(arrays[key + "_zero_point"])
            out[key + "_quantized"] = np.clip(np.rint(value / scale), -127, 127).astype(np.int8)
        else:
            out[key] = value.astype(np.float32)
    return out
