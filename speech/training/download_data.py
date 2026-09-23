"""Explicit, checksum-verified research data installation. Never called by Speech."""

import argparse
import json
from pathlib import Path

from speech112.install_models import install

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, default=Path(".cache/training"))
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    catalog = json.loads(Path(__file__).with_name("data_catalog.json").read_text())
    install(args.directory, offline=args.offline, catalog=catalog)
