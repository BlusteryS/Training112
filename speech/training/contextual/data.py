"""Authored training dialogues. Public data never masquerades as actual 112 calls.

Surface families and context wordings are split before composition. TEST is only
loaded by the release evaluator. Counterfactual examples share the same question
but change the history, so a model cannot pass by memorizing that question alone.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from domain import DEV, TEST, TRAIN

LABELS = tuple(sorted(set(TRAIN) | {"contact", "other"}))


def row(text, labels, history=(), family="single"):
    return dict(text=text, labels=list(labels), history=list(history), family=family)


# Distinct wording sets; no augmentation of test examples goes into training.
CONTEXTS = {
    "train": {
        "victim_count": [
            "Здесь есть пострадавшие.",
            "Внутри остались люди.",
            "Вижу раненых возле машины.",
            "Несколько человек лежат на земле.",
        ],
        "address": [
            "Я нахожусь возле дома.",
            "Авария произошла около магазина.",
            "Горит склад.",
            "Мы стоим на дороге.",
        ],
        "name": [
            "Со мной можно разговаривать.",
            "Я звоню от своего имени.",
            "Я заявитель.",
            "Я вызвал помощь.",
        ],
        "phone": [
            "Могу оставить телефон.",
            "Вы сможете мне перезвонить.",
            "У меня есть мобильный номер.",
            "Запишите мой телефон.",
        ],
        "incident": [
            "Нам требуется помощь.",
            "Случилось происшествие.",
            "У нас беда.",
            "Хочу сообщить о проблеме.",
        ],
        "age": [
            "Ранен мужчина.",
            "Пострадала женщина.",
            "Рядом лежит ребенок.",
            "Помощь нужна пожилому человеку.",
        ],
    },
    "dev": {
        "victim_count": ["В салоне заперты пассажиры.", "Тут есть раненые."],
        "address": ["Дым идет из подъезда.", "Столкнулись автомобили."],
        "name": ["Я могу представиться.", "Я очевидец происшествия."],
        "phone": ["Если связь оборвется, звоните мне.", "Запишете мой контакт?"],
        "incident": ["Тут такое творится.", "Пожалуйста, помогите нам."],
        "age": ["Травму получил мальчик.", "Женщине стало плохо."],
    },
    "test": {
        "victim_count": [
            "После удара двое выбрались, остальные внутри.",
            "На лестнице люди, которым плохо.",
        ],
        "address": ["На парковке клубится дым.", "Это случилось у автобусной остановки."],
        "name": ["Хотите, скажу, как меня зовут.", "Да, со мной сейчас говорите."],
        "phone": [
            "Со мной можно будет связаться по этому номеру.",
            "Давайте дам номер для обратного звонка.",
        ],
        "incident": ["Нужна экстренная помощь, пожалуйста.", "У нас здесь чрезвычайная ситуация."],
        "age": ["Пострадал подросток.", "Пожилой прохожий упал."],
    },
}
FOLLOWUPS = {
    "train": {
        "victim_count": [
            "Сколько их?",
            "Сколько человек?",
            "А сколько всего?",
            "Назовите количество.",
        ],
        "address": ["Где именно?", "А где это?", "Точнее где?", "Уточните место."],
        "name": ["Как вас записать?", "Тогда представьтесь.", "Как к вам обращаться?", "Ваше имя?"],
        "phone": ["Продиктуйте его.", "Какой номер?", "Назовите его.", "Диктуйте."],
        "incident": [
            "Что именно?",
            "Расскажите подробнее.",
            "Что произошло?",
            "Что там случилось?",
        ],
        "age": [
            "Сколько ему лет?",
            "Какого возраста?",
            "Возраст пострадавшего?",
            "Сколько лет этому человеку?",
        ],
    },
    "dev": {
        "victim_count": ["Их много?", "Сколько осталось?"],
        "address": ["Можно точнее место?", "Где конкретно?"],
        "name": ["Назовитесь, пожалуйста.", "Скажите, как зовут."],
        "phone": ["Какой именно?", "Можете назвать номер?"],
        "incident": ["Поясните, что там.", "В чем дело?"],
        "age": ["Сколько лет?", "Примерно какого он возраста?"],
    },
    "test": {
        "victim_count": ["А сколько их там?", "Сколько людей осталось внутри?"],
        "address": ["А точный адрес?", "Уточните, где это находится."],
        "name": ["Какое у вас имя?", "Так как вас зовут?"],
        "phone": ["Тогда называйте.", "Да, запишу, говорите номер."],
        "incident": ["Объясните, что за ситуация.", "Какая именно беда?"],
        "age": ["А лет ему сколько?", "Скажите его примерный возраст."],
    },
}
CONTACT = {
    "train": [
        "Алло",
        "Вы меня слышите?",
        "Здравствуйте",
        "Добрый день",
        "Алло здравствуйте",
        "Проверка связи",
        "На связи?",
        "Слышно меня?",
        "Служба 112, слушаю.",
        "Я вас слушаю.",
        "Говорите, я слушаю.",
        "Вы на линии?",
    ],
    "dev": [
        "Алло, меня слышно?",
        "Здравствуйте, вы меня слышите?",
        "Мы на связи?",
        "Добрый вечер.",
    ],
    "test": [
        "Алло алло, слышите меня?",
        "Слышите, что я говорю?",
        "Прием, вы здесь?",
        "Приветствую, служба 112.",
    ],
}
REPAIR = {
    "train": [
        "Что?",
        "Повторите",
        "Не расслышал.",
        "Что вы сказали?",
        "Еще раз пожалуйста.",
        "Помехи, повторите.",
        "Скажите снова.",
        "Простите, что?",
        "Я не понял последнюю фразу.",
        "Повторите ответ.",
    ],
    "dev": ["Что-что?", "Не услышал, еще раз.", "Можете повторить?", "Повторите сказанное."],
    "test": [
        "Извините, последнюю фразу не разобрал.",
        "Можно это еще раз?",
        "Связь прервалась, повторите ответ.",
        "А, что вы сказали сейчас?",
    ],
}
# These have opposite consequences despite sharing words.
NEGATION = {
    "train": [
        ("Помощь еще не направлена.", "not_sent"),
        ("Я не отправлял бригаду.", "not_sent"),
        ("Никто пока не выехал.", "not_sent"),
        ("Не заканчивайте разговор.", "hold"),
        ("Не кладите трубку.", "hold"),
        ("Не отключайтесь от линии.", "hold"),
        ("Бригада уже выехала.", "help_sent"),
        ("Я направил помощь.", "help_sent"),
        ("Можете положить трубку.", "goodbye"),
        ("На этом закончим, до свидания.", "goodbye"),
    ],
    "dev": [
        ("Спасателей еще не отправили.", "not_sent"),
        ("Помощь пока не выезжала.", "not_sent"),
        ("Разговор не завершайте.", "hold"),
        ("Пока не прощаемся.", "hold"),
        ("Спасатели направлены.", "help_sent"),
        ("Теперь можно завершить разговор.", "goodbye"),
    ],
    "test": [
        ("Выезд бригады пока не подтвержден.", "not_sent"),
        ("Машину к вам еще не направляли.", "not_sent"),
        ("Подождите прощаться, останьтесь на связи.", "hold"),
        ("Трубку пока класть нельзя.", "hold"),
        ("Пожарный расчет к вам уже выдвинулся.", "help_sent"),
        ("Все записано, можете отключаться.", "goodbye"),
    ],
}
OTHER = {
    "train": [
        "Какая завтра погода?",
        "Реши пример два плюс два.",
        "Кто выиграл футбольный матч?",
        "Поставь музыку.",
        "Закажи пиццу.",
        "Как приготовить суп?",
        "Что лучше купить?",
        "Переведи текст на английский.",
        "Напиши стихотворение.",
        "Открой браузер.",
    ],
    "dev": [
        "Посоветуй фильм.",
        "Сколько стоит доллар?",
        "Расскажи анекдот.",
        "Какая столица Франции?",
    ],
    "test": [
        "Включи мне любимую песню.",
        "Докажи математическую теорему.",
        "Когда следующий поезд в Париж?",
        "Подбери рецепт блинов.",
    ],
}


def dataset(split):
    source = {"train": TRAIN, "dev": DEV, "test": TEST}[split]
    out = [row(text, [label]) for label, texts in source.items() for text in texts]
    out += [row(t, ["contact"], family="contact") for t in CONTACT[split]]
    out += [
        row(t, ["repeat"], ["Что произошло?", "В подъезде дым."], "repair") for t in REPAIR[split]
    ]
    out += [row(t, [label], family="negation") for t, label in NEGATION[split]]
    out += [row(t, ["other"], family="out_of_domain") for t in OTHER[split]]
    for label, contexts in CONTEXTS[split].items():
        for c in contexts:
            for q in FOLLOWUPS[split][label]:
                out.append(row(q, [label], ["Расскажите подробнее.", c], "context"))
    # Same ambiguous utterance, different history: essential causal context check.
    ambiguous = {
        "train": ["Скажите это.", "Можно подробнее?", "Уточните."],
        "dev": ["Поясните это.", "Что именно вы имеете в виду?"],
        "test": ["А можно это уточнить?", "Тогда сообщите подробнее."],
    }[split]
    for label in ("address", "name", "phone", "incident"):
        for _c in CONTEXTS[split][label]:
            for q in ambiguous:
                out.append(
                    row(
                        q,
                        [label],
                        [
                            {
                                "address": "Вы можете назвать адрес?",
                                "name": "Вы можете назвать свое имя?",
                                "phone": "Вы можете продиктовать телефон?",
                                "incident": "Можете описать происшествие?",
                            }[label],
                            {
                                "train": "Да, могу.",
                                "dev": "Да, сейчас скажу.",
                                "test": "Могу, записывайте.",
                            }[split],
                        ],
                        "counterfactual",
                    )
                )
    # Questions without a referent should be clarified, not assigned an invented referent.
    for q in ambiguous + FOLLOWUPS[split]["victim_count"][:1]:
        out.append(row(q, ["other"], ["Алло.", "Здравствуйте."], "ambiguous"))
    # Learn to ignore acknowledged/retracted requests and follow the current request.
    ack = {
        "train": [" уже записал", " понял", " больше не нужно повторять"],
        "dev": [" мне уже известен", " успел записать"],
        "test": [" мы уже выяснили", " повторять не требуется"],
    }[split]
    nouns = {
        "address": "Адрес",
        "name": "Имя",
        "phone": "Телефон",
        "incident": "Описание происшествия",
    }
    for old, noun in nouns.items():
        for new in nouns:
            if old == new:
                continue
            for suffix in ack:
                q = source[new][0]
                out.append(
                    row(
                        noun + suffix + ". " + q,
                        [new],
                        ["Уточните данные.", CONTEXTS[split][old][0]],
                        "correction",
                    )
                )
    # Independently authored questions combined only within their split.
    pairs = [
        ("address", "name"),
        ("victims", "address"),
        ("consciousness", "breathing"),
        ("age", "victim_count"),
        ("phone", "name"),
    ]
    joiners = {
        "train": [" И еще: ", " А также: ", " "],
        "dev": [" Затем уточните: "],
        "test": [" После этого скажите: "],
    }[split]
    for a, b in pairs:
        for j in joiners:
            for i in range(min(2, len(source[a]), len(source[b]))):
                out.append(row(source[a][i] + j + source[b][i], [a, b], family="compound"))
    # History is never itself an instruction: explicit current questions win.
    for label, texts in source.items():
        for i, t in enumerate(texts[:2]):
            out.append(
                row(
                    t,
                    [label],
                    ["Ваш адрес?", CONTEXTS[split]["address"][i % len(CONTEXTS[split]["address"])]],
                    "history_distractor",
                )
            )
    if split == "train":
        # Orthogonal augmentation: every explicit question is seen after unrelated topics.
        # No DEV/TEST phrase, context or answer is used by this construction.
        histories = [
            ["Где нужна помощь?", "Около жилого дома."],
            ["Что случилось?", "Человек лежит без движения."],
            ["Есть опасность?", "Рядом с нами огонь."],
            ["Как вас зовут?", "Меня зовут Иван."],
            ["Кто рядом?", "Я тут один."],
            ["Вы видели транспорт?", "Вижу две легковые машины."],
            ["Что происходит?", "В подъезде задымление."],
            ["Вам нужна помощь?", "Да, здесь столкновение машин."],
        ]
        for label, phrases in (("contact", CONTACT[split]), ("repeat", REPAIR[split])):
            for phrase in phrases:
                for history in [
                    [],
                    *histories,
                    ["Алло", "Да, я вас слышу."],
                    ["Назовите адрес.", "Улица Полевая, дом восемь."],
                ]:
                    out.append(row(phrase, [label], history, "control_invariance"))
        for label, texts in source.items():
            for text in texts:
                for history in histories:
                    out.append(row(text, [label], history, "history_invariance"))
                out.append(row("Здравствуйте. " + text, [label], family="greeting_question"))
        for old, noun in nouns.items():
            for new in nouns:
                if old == new:
                    continue
                for text in source[new]:
                    for prefix in (f"{noun} записан. ", f"Не повторяйте {noun.lower()}. "):
                        out.append(row(prefix + text, [new], family="correction_diversity"))
        for i in range(min(len(source["address"]), len(source["name"]), len(source["phone"]))):
            out.append(
                row(
                    " ".join(source[label][i] for label in ("address", "name", "phone")),
                    ["address", "name", "phone"],
                    family="triple_question",
                )
            )
        for first, second in pairs:
            for a in source[first]:
                for b in source[second]:
                    out.append(row(a + " " + b, [first, second], family="compound_diversity"))
                    out.append(row(b + " " + a, [second, first], family="compound_diversity"))
    unique = {(r["text"], tuple(r["history"]), tuple(r["labels"])): r for r in out}
    result = list(unique.values())
    if split != "train":
        train_keys = {(r["text"].lower().strip(), tuple(r["history"])) for r in dataset("train")}
        result = [
            r for r in result if (r["text"].lower().strip(), tuple(r["history"])) not in train_keys
        ]
    return result
