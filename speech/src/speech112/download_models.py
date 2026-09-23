"""Prepare the pinned TTS model before starting the CUDA runtime."""

from __future__ import annotations

import json
import logging
from fnmatch import fnmatch
from pathlib import Path

from filelock import FileLock
from huggingface_hub import HfApi, snapshot_download

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
MODEL_REVISION = "fd4b254389122332181a7c3db7f27e918eec64e3"
MODEL_DIR = Path(".models/qwen3-tts-1.7b-base")
LOG = logging.getLogger(__name__)
IGNORE_PATTERNS = ["*.md", ".gitattributes"]


def is_complete(directory: Path, marker: Path) -> bool:
    try:
        manifest = json.loads(marker.read_text())
        return (
            manifest["revision"] == MODEL_REVISION
            and bool(manifest["files"])
            and all(
                (directory / name).is_file() and (directory / name).stat().st_size == size
                for name, size in manifest["files"].items()
            )
        )
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False


def prepare_model(directory: Path = MODEL_DIR) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    marker = directory / ".download-complete.json"
    with FileLock(str(directory.parent / ".qwen-download.lock")):
        if is_complete(directory, marker):
            LOG.info("Модель Qwen3-TTS готова, используются локальные файлы")
            return
        LOG.info("Загрузка %s. Файлы сохраняются для следующих запусков", MODEL_ID)
        try:
            # Require the remote manifest: snapshot_download may otherwise return
            # an incomplete local directory when the network is unavailable.
            info = HfApi().model_info(MODEL_ID, revision=MODEL_REVISION, files_metadata=True)
            files = {
                item.rfilename: item.size
                for item in info.siblings
                if not any(fnmatch(item.rfilename, pattern) for pattern in IGNORE_PATTERNS)
            }
            if (
                info.sha != MODEL_REVISION
                or not files
                or any(not isinstance(size, int) or size < 0 for size in files.values())
            ):
                raise ValueError("Некорректный список файлов модели")
            snapshot_download(
                repo_id=MODEL_ID,
                revision=MODEL_REVISION,
                local_dir=directory,
                ignore_patterns=IGNORE_PATTERNS,
            )
            if not all(
                (directory / name).is_file() and (directory / name).stat().st_size == size
                for name, size in files.items()
            ):
                raise ValueError("Загружены не все файлы модели")
        except Exception as error:
            raise RuntimeError(
                "Не удалось загрузить Qwen3-TTS. Проверьте доступ к huggingface.co "
                "и свободное место. При следующем запуске загрузка продолжится."
            ) from error
        temporary = marker.with_suffix(".tmp")
        temporary.write_text(json.dumps({"revision": MODEL_REVISION, "files": files}))
        temporary.replace(marker)
        LOG.info("Модель Qwen3-TTS загружена")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    prepare_model()
