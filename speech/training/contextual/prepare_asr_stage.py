"""Deterministic ASR-only adaptation and explicit-object repeat contrast examples."""

import json
from pathlib import Path

from speech112.runtime.context_input import operator_text


def prepare():
    root = Path(__file__).with_name("splits")
    targets = {
        "address": ["адрес", "точный адрес", "улицу и номер дома"],
        "name": ["ваше имя", "как вас зовут", "имя заявителя"],
        "phone": ["номер телефона", "контактный номер", "номер для связи"],
        "incident": ["что произошло", "что случилось", "описание происшествия"],
        "victim_count": ["количество пострадавших", "сколько человек пострадало"],
        "age": ["ваш возраст", "сколько вам лет"],
        "vehicle": ["марку автомобиля", "номер машины"],
        "description": ["приметы человека", "описание подозреваемого"],
        "weapon": ["какое оружие", "вид оружия"],
        "fire": ["что горит", "место возгорания"],
        "breathing": ["дышит ли пострадавший", "состояние дыхания"],
        "consciousness": ["в сознании ли человек", "состояние сознания"],
    }
    histories = [
        [],
        ["что случилось", "В подъезде пахнет дымом. Источник я не вижу."],
        ["как вас зовут", "Меня зовут Алексей."],
        ["где вы находитесь", "Улица Полевая, дом восемь."],
    ]
    for split in ("train", "dev"):
        rows = [json.loads(s) for s in (root / f"stage2-{split}.jsonl").read_text().splitlines()]
        frames = (
            ["повтори {}", "повторите {}", "скажите еще раз {}", "я не расслышал {} повторите"]
            if split == "train"
            else ["еще раз пожалуйста {}", "мне надо повторно записать {}"]
        )
        for label, objects in targets.items():
            # These repeat/object combinations are held out from training.
            if split == "train" and label in ("weapon", "fire", "breathing", "consciousness"):
                continue
            for obj in objects:
                for frame in frames:
                    for history in histories:
                        rows.append(
                            dict(
                                text=frame.format(obj),
                                history=history,
                                labels=[label],
                                action="repeat",
                                family="explicit_object_repeat",
                            )
                        )
        normalized = [
            dict(
                r,
                text=operator_text(r["text"]),
                history=[operator_text(t) if i % 2 == 0 else t for i, t in enumerate(r["history"])],
            )
            for r in rows
        ]
        unique = {(r["text"], tuple(r["history"])): r for r in normalized}
        (root / f"stage3-{split}.jsonl").write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in unique.values())
        )
        print(split, len(unique))


if __name__ == "__main__":
    prepare()
