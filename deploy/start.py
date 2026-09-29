#!/usr/bin/env python3
"""Start the trainer with GPU reply preparation when a supported NVIDIA GPU exists."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "speech" / ".models" / "generator" / "Qwen_Qwen3.5-4B-Q4_K_M.gguf"
MODEL_SHA256 = json.loads((ROOT / "speech" / "src" / "speech112" / "contracts"
                           / "reply-generation.json").read_text())["model_sha256"]
MODEL_URL = (
    "https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/"
    "4168f45a16a1290d65a4ec0fa312ae917a4c15d6/"
    "Qwen_Qwen3.5-4B-Q4_K_M.gguf"
)


def gpu_memory_mib():
    if shutil.which("nvidia-smi") is None:
        return 0
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        return 0
    try:
        return max(int(line.strip()) for line in result.stdout.splitlines())
    except ValueError:
        return 0


def download_model():
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    if MODEL.exists() and digest(MODEL) == MODEL_SHA256:
        return
    part = MODEL.with_suffix(".part")
    with urlopen(MODEL_URL, timeout=60) as source, part.open("wb") as target:
        shutil.copyfileobj(source, target, length=1024 * 1024)
    if digest(part) != MODEL_SHA256:
        part.unlink()
        raise ValueError("Контрольная сумма модели генерации не совпадает.")
    part.replace(MODEL)


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def main():
    memory = gpu_memory_mib()
    command = ["docker", "compose", "-f", "compose.yaml"]
    env = os.environ.copy()
    if memory >= 3072:
        download_model()
        command += ["-f", "compose.gpu.yaml"]
        env["GENERATOR_GPU_LAYERS"] = "99" if memory >= 4096 else "20"
        print("Подготовка реплик: GPU, Qwen3.5-4B.")
    else:
        print("Подготовка реплик: готовые варианты из сценария.")
    subprocess.run([*command, "up", "-d", "--build", "--remove-orphans"],
                   cwd=ROOT, env=env, check=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"Запуск не завершён: {error}")
