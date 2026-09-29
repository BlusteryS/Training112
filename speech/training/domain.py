"""Authored operator-language dataset, not recordings of real emergency calls.

Train/development/test formulations are authored separately; no random split of
augmented paraphrases is used. Public corpora have their own official test splits.
"""

import json
from pathlib import Path

DATA = json.loads(Path(__file__).with_name("domain_examples.json").read_text())
TRAIN = DATA["TRAIN"]
DEV = DATA["DEV"]
TEST = DATA["TEST"]
