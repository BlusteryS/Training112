"""Install only the pinned public data used by contextual training."""

import argparse
import json
from pathlib import Path

from speech112.install_models import install

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    source = json.loads(Path(__file__).with_name("massive-source.json").read_text())
    item = {k: source[k] for k in ("url", "sha256", "bytes")}
    install(
        Path(".cache/training"),
        offline=args.offline,
        catalog={"version": 1, "files": [dict(path="massive-ru-train.parquet", **item)]},
    )
