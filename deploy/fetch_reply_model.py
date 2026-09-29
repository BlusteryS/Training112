#!/usr/bin/env python3
"""Download the optional local reply model before starting the GPU profile."""

import hashlib
from pathlib import Path
from urllib.request import urlopen


NAME = "Qwen_Qwen3-4B-Instruct-2507-Q8_0.gguf"
REVISION = "ae44f08e1392f39c0e474af10c3ff8355c8b6688"
SHA256 = "260b5b5b6ad73e44df81a43ea1f5c11c37007b6bac18eb3cd2016e8667c19662"
URL = f"https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/{REVISION}/{NAME}"
TARGET = Path(__file__).resolve().parent.parent / "speech/.models/generator" / NAME


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists():
        if digest(TARGET) != SHA256:
            raise ValueError(f"Некорректный файл модели: {TARGET}")
        return
    temporary = TARGET.with_suffix(".download")
    try:
        with urlopen(URL, timeout=30) as source, temporary.open("wb") as output:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
        if digest(temporary) != SHA256:
            raise ValueError("Контрольная сумма модели не совпадает")
        temporary.replace(TARGET)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
