#!/bin/sh
set -eu
/opt/qwen/bin/python /app/src/speech112/download_models.py
exec speech112 "$@"
