"""Explicit installation phase. Live inference never needs network access."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
import time
from importlib.resources import files
from pathlib import Path

import httpx
from filelock import FileLock


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def install(directory: Path, *, offline: bool = False, catalog=None) -> None:
    catalog = catalog or json.loads(
        files("speech112.assets_catalog").joinpath("cpu-v1.json").read_text()
    )
    directory.mkdir(parents=True, exist_ok=True)
    with (
        FileLock(str(directory / ".install.lock"), timeout=600),
        httpx.Client(follow_redirects=True, timeout=120) as client,
    ):
        for item in catalog["files"]:
            relative = Path(item["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Unsafe artifact path")
            destination = directory / relative
            if destination.is_file() and digest(destination) == item["sha256"]:
                continue
            if "resource" in item:
                resource = Path(item["resource"])
                if resource.is_absolute() or len(resource.parts) != 1:
                    raise ValueError("Unsafe packaged artifact path")
                payload = files("speech112.assets_catalog").joinpath(resource.name).read_bytes()
                if (
                    len(payload) != item["bytes"]
                    or hashlib.sha256(payload).hexdigest() != item["sha256"]
                ):
                    raise ValueError("Packaged artifact integrity failure")
                destination.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.TemporaryDirectory(dir=destination.parent) as staging:
                    temporary = Path(staging) / relative.name
                    with temporary.open("wb") as stream:
                        stream.write(payload)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temporary, destination)
                continue
            if offline:
                raise ValueError(f"Missing or damaged model: {relative}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            for attempt in range(3):
                try:
                    with tempfile.TemporaryDirectory(dir=destination.parent) as staging:
                        temporary = Path(staging) / relative.name
                        with (
                            temporary.open("wb") as stream,
                            client.stream("GET", item["url"]) as response,
                        ):
                            response.raise_for_status()
                            length = 0
                            for block in response.iter_bytes(1024 * 1024):
                                length += len(block)
                                if length > item["bytes"]:
                                    raise ValueError("Artifact exceeds manifest size")
                                stream.write(block)
                            stream.flush()
                            os.fsync(stream.fileno())
                        if length != item["bytes"] or digest(temporary) != item["sha256"]:
                            raise ValueError(f"Artifact integrity failure: {relative}")
                        os.replace(temporary, destination)
                    print(f"Installed {relative}", flush=True)
                    break
                except (httpx.HTTPError, OSError):
                    if attempt == 2:
                        raise
                    time.sleep(2**attempt)


def main():
    parser = argparse.ArgumentParser(description="Install and verify pinned CPU speech models")
    parser.add_argument("--directory", type=Path, default=Path(".models"))
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    install(args.directory, offline=args.offline)
    from speech112.runtime.contextual import ContextualUnderstanding

    ContextualUnderstanding(args.directory / "e5-small-int8", None)
