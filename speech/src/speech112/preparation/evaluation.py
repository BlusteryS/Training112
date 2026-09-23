"""Evidence-based scoring. Unsupported semantic checks remain pending, never silently pass."""

from __future__ import annotations

import re


def normalize(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold().replace("ё", "е")))


def evaluate(
    document: dict, card: dict, events: list[dict], *, attempt_status: str, semantic=None
) -> dict:
    checks = []
    for criterion in document["rubric"]:
        kind = criterion["kind"]
        evidence = []
        actual = None
        if kind in ("action", "deadline"):
            matches = [
                e
                for e in events
                if e["source"] == "operator"
                and e["type"] == "card.status"
                and e["payload"].get("status") == criterion["action"]
            ]
            if matches:
                first = min(matches, key=lambda e: e["sequence"])
                evidence = [str(first["event_id"])]
                actual = first["elapsed_ms"]
            passed = bool(matches) and (kind == "action" or actual <= criterion["seconds"] * 1000)
            status = "passed" if passed else "failed"
        elif kind == "field_equals":
            actual = card.get(criterion["field"], "")
            status = "passed" if normalize(actual) == normalize(criterion["expected"]) else "failed"
        elif kind == "semantic":
            actual = card.get(criterion["field"], "")
            # A model must return pass/fail/review using thresholds validated by teachers.
            status = semantic(actual, criterion["expected"]) if semantic else "review"
            if status not in ("passed", "failed", "review"):
                raise ValueError("Invalid semantic evaluator verdict")
        else:
            raise ValueError("Unsupported rubric check")
        if attempt_status == "failed":
            status = "review"
        checks.append(
            {
                "id": criterion["id"],
                "kind": kind,
                "status": status,
                "weight": criterion["weight"],
                "description": criterion["description"],
                "source": criterion.get("source"),
                "actual": actual,
                "expected": criterion.get("expected", criterion.get("action")),
                "event_ids": evidence,
            }
        )
    earned = sum(c["weight"] for c in checks if c["status"] == "passed")
    pending = any(c["status"] == "review" for c in checks)
    total = sum(c["weight"] for c in checks)
    return {
        "schema_version": 1,
        "checks": checks,
        "earned": earned,
        "possible": total,
        "score": None if pending or not total else round(earned / total * 100, 2),
        "requires_review": pending,
        "attempt_status": attempt_status,
    }
