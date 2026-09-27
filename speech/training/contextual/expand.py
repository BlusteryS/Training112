"""Freeze additional ASR-style questions without mixing training and evaluation wording."""

import argparse
import json
import random
from itertools import combinations
from pathlib import Path


TRAIN = {
    "incident": ["объясните с чего все началось", "какая сейчас ситуация", "почему пришлось позвонить", "что сейчас происходит"],
    "address": ["куда прислать людей", "в каком доме это случилось", "куда нашим сотрудникам ехать", "на какой улице вы ждете"],
    "name": ["кто сейчас со мной говорит", "как вас записать", "представьтесь для карточки", "как я могу к вам обращаться"],
    "phone": ["на какой номер вам перезвонить", "как с вами снова связаться", "контакт для обратного звонка назовите", "с какого номера звоните"],
    "victims": ["кому нибудь требуется помощь врача", "люди там целы", "есть раненые рядом с вами", "вы сами пострадали"],
    "victim_count": ["сколько человек нуждается в помощи", "раненых всего сколько", "сколько людей получили травмы", "назовите число пострадавших"],
    "age": ["какого возраста этот человек", "сколько лет пациенту", "возраст раненого знаете", "это взрослый человек или ребенок"],
    "consciousness": ["он может говорить с вами", "реагирует когда вы к нему обращаетесь", "он способен отвечать", "человек находится в сознании"],
    "breathing": ["он сам дышит", "какое у него дыхание", "заметно ли что грудь поднимается", "дыхание у него есть"],
    "danger": ["вы сами можете отойти", "вам сейчас угрожает опасность", "безопасно ли вам там оставаться", "рядом с вами нет угрозы"],
    "fire": ["из какого места идет дым", "видно ли открытое пламя", "что именно горит", "есть ли огонь поблизости"],
    "weapon": ["вы видели чем он угрожал", "у него было что то похожее на нож", "чем он вооружен", "заметили оружие"],
    "description": ["опишите как он выглядел", "какие приметы вам запомнились", "как выглядят участники", "можете описать внешность человека"],
    "vehicle": ["что это была за машина", "какой у нее госномер", "какой автомобиль вы видели", "марку и цвет машины помните"],
}

DEV = {
    "incident": ["расскажите как все произошло", "в чем заключается беда"],
    "address": ["по какому адресу вас искать", "куда должны приехать спасатели"],
    "name": ["как вас зовут для записи", "с кем я сейчас разговариваю"],
    "phone": ["какой номер оставить в карточке", "продиктуйте контактный номер"],
    "victims": ["есть ли люди которым нужен врач", "кто то получил ранения"],
    "victim_count": ["скольким людям нужна помощь", "уточните количество раненых"],
    "age": ["сколько ему примерно лет", "возраст больного можете сказать"],
    "consciousness": ["на ваш голос он откликается", "он в состоянии разговаривать"],
    "breathing": ["дышит ли пострадавший самостоятельно", "видите дыхание у человека"],
    "danger": ["можно ли вам оставаться на месте", "вы находитесь в безопасности"],
    "fire": ["вы наблюдаете дым или пламя", "где именно сейчас горит"],
    "weapon": ["заметили ли вы у него нож", "с чем он вам угрожал"],
    "description": ["как выглядит этот человек", "какие внешние признаки заметили"],
    "vehicle": ["опишите участвовавший автомобиль", "номер машины вам известен"],
}

EXTRA_TRAIN = [
    ("что вы хотите этим сказать", ["other"], None),
    ("не понимаю о чем вы говорите", ["other"], None),
    ("объясните свои слова", ["other"], None),
    ("а вы потом сами позвоните мне", ["other"], None),
    ("через сколько минут приедут", ["other"], None),
    ("у вас есть возможность перезвонить мне", ["other"], None),
    ("сколько будет стоить вызов", ["other"], None),
    ("назовите еще раз место происшествия", ["address"], "repeat"),
    ("повторите пожалуйста число раненых", ["victim_count"], "repeat"),
    ("снова скажите как к вам обращаться", ["name"], "repeat"),
    ("уточните еще раз телефон для связи", ["phone"], "repeat"),
    ("назовите еще раз адрес и число пострадавших", ["address", "victim_count"], "repeat"),
    ("я уже внес в карточку ваш адрес теперь расскажите что произошло", ["incident"], "request"),
    ("номер я успел записать уточните место происшествия", ["address"], "request"),
    ("ваше имя известно скажите есть ли пострадавшие", ["victims"], "request"),
    ("бригада направлена скажите где вы ждете", ["help_sent", "address"], "request"),
    ("помощь в пути расскажите сколько человек пострадало", ["help_sent", "victim_count"], "request"),
    ("сохраняйте спокойствие и скажите что произошло", ["reassure", "incident"], "request"),
    ("оставайтесь на линии и сообщите адрес", ["hold", "address"], "request"),
]

EXTRA_DEV = [
    ("расшифруйте пожалуйста свои слова", ["other"], None),
    ("когда вы сможете снова мне позвонить", ["other"], None),
    ("вызов платный или нет", ["other"], None),
    ("продиктуйте повторно телефон и адрес", ["phone", "address"], "repeat"),
    ("адрес мне уже известен расскажите кто пострадал", ["victims"], "request"),
    ("службы уже отправлены назовите ваш номер", ["help_sent", "phone"], "request"),
]


def rows(bank: dict[str, list[str]], seed: int, limit: int) -> list[dict]:
    rng = random.Random(seed)
    result = [{"text": phrase, "labels": [label], "history": [], "family": "single"}
              for label, phrases in bank.items() for phrase in phrases]
    labels = tuple(bank)
    pairs = list(combinations(labels, 2))
    triples = list(combinations(labels, 3))
    for group, count in ((pairs, limit), (triples, limit // 2)):
        for _ in range(count):
            selected = list(rng.choice(group))
            rng.shuffle(selected)
            text = " ".join(rng.choice(bank[label]) for label in selected)
            result.append({"text": text, "labels": selected, "history": [],
                           "family": "compound_diversity" if len(selected) == 2 else "triple_question"})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for split, bank, limit in (("train", TRAIN, 4000), ("dev", DEV, 400)):
        existing = [json.loads(line) for line in (args.base / f"stage3-{split}.jsonl").read_text().splitlines()]
        extra = EXTRA_TRAIN if split == "train" else EXTRA_DEV
        authored = [{"text": text, "labels": labels, "history": [], "family": "out_of_domain"
                     if labels == ["other"] else "compound_diversity", **({"action": action} if action else {})}
                    for text, labels, action in extra]
        merged = existing + rows(bank, 112 if split == "train" else 113, limit) + authored
        seen = set()
        unique = []
        for entry in merged:
            key = (entry["text"].casefold(), tuple(entry.get("history", ())))
            if key not in seen:
                seen.add(key)
                unique.append(entry)
        (args.output / f"{split}.jsonl").write_text(
            "".join(json.dumps(entry, ensure_ascii=False) + "\n" for entry in unique)
        )
        print(split, len(unique))


if __name__ == "__main__":
    main()
