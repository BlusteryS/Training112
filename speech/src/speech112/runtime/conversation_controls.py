"""Shared dialogue defaults used when older scenarios omit optional contact replies."""

import json
from importlib.resources import files


CONTACT_REPLY = tuple(json.loads(
    files("speech112.contracts").joinpath("dialogue-defaults.json").read_text()
)["contact"])
