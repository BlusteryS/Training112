"""Score the saved operator card against the teacher's scenario rubric."""

from __future__ import annotations

import re


def normalize(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold().replace("ё", "е")))


_ADVICE = {
    "address": "Уточняйте улицу, номер дома и место происшествия до сохранения карточки.",
    "caller_name": "Спросите имя заявителя и запишите его ответ.",
    "incident_code": "Выбирайте тип происшествия по описанной заявителем обстановке.",
    "description": "Перед сохранением сопоставьте описание с тем, что сообщил заявитель.",
    "accepted": "Сохраняйте заполненную карточку в отведённое время.",
}


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
    recommendations = []
    for check in checks:
        if check["status"] == "failed":
            recommendations.append(_ADVICE.get(check["id"], check["description"]))
        elif check["status"] == "review":
            recommendations.append(f"Попросите преподавателя проверить: {check['description']}")
    return {
        "schema_version": 1,
        "checks": checks,
        "earned": earned,
        "possible": total,
        "score": None if pending or not total else round(earned / total * 100, 2),
        "requires_review": pending,
        "recommendations": recommendations,
        "attempt_status": attempt_status,
    }
