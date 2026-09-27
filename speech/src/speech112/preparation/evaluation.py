"""Score the saved operator card against the instructor's scenario rubric."""

from __future__ import annotations

import json
import re
from importlib.resources import files


def normalize(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold().replace("ё", "е")))


_ADVICE = json.loads(
    files("speech112.contracts").joinpath("evaluation-advice.json").read_text()
)


def evaluate(
    document: dict, card: dict, events: list[dict], *, attempt_status: str, semantic=None
) -> dict:
    checks = []
    criteria = document["rubric"] if attempt_status == "completed" else []
    for criterion in criteria:
        kind = criterion["kind"]
        evidence = []
        actual = None
        if kind in ("action", "deadline"):
            matches = [
                e
                for e in events
                if e["source"] == "operator"
                and (
                    (criterion["action"] == "saved" and e["type"] == "card.update")
                    or (
                        e["type"] == "card.status"
                        and e["payload"].get("status") == criterion["action"]
                    )
                )
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
            status = semantic(actual, criterion["expected"]) if semantic else "review"
            if status not in ("passed", "failed", "review"):
                raise ValueError("Invalid semantic evaluator verdict")
        else:
            raise ValueError("Unsupported rubric check")
        checks.append(
            {
                "id": criterion["id"],
                "kind": kind,
                "status": status,
                "weight": criterion["weight"],
                "mandatory": criterion.get("mandatory", False),
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
    errors = sum(c["status"] == "failed" for c in checks)
    score = None if pending or not total else round(earned / total * 100, 2)
    passed = None if score is None else (
        score >= document.get("pass_score", 70)
        and errors <= document.get("max_errors", 2)
        and not any(c["mandatory"] and c["status"] == "failed" for c in checks)
    )
    recommendations = []
    for check in checks:
        if check["status"] == "failed":
            recommendations.append(_ADVICE.get(check["id"], check["description"]))
        elif check["status"] == "review":
            recommendations.append(_ADVICE["review"].format(description=check["description"]))
    return {
        "schema_version": 1,
        "checks": checks,
        "earned": earned,
        "possible": total,
        "score": score,
        "passed": passed,
        "errors": errors,
        "pass_score": document.get("pass_score", 70),
        "max_errors": document.get("max_errors", 2),
        "requires_review": pending,
        "recommendations": recommendations,
        "attempt_status": attempt_status,
    }
