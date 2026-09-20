"""Russian pronunciation normalization, isolated from dialogue history."""

import re
from collections.abc import Iterator
from datetime import date

from num2words import num2words

_LATIN_TEXT = re.compile(r"[A-Za-z]")
_MONTHS = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
_ABBREVIATIONS = {
    "ул.": "улица",
    "д.": "дом",
    "кв.": "квартира",
    "корп.": "корпус",
    "стр.": "строение",
    "под.": "подъезд",
    "пр-т": "проспект",
    "пер.": "переулок",
    "ш.": "шоссе",
    "обл.": "область",
    "мин.": "минут",
    "сек.": "секунд",
    "тел.": "телефон",
}
_ABBREVIATION = re.compile(
    r"(?<!\w)(?:" + "|".join(map(re.escape, _ABBREVIATIONS)) + r")(?=\s|\d|$)",
    re.IGNORECASE,
)
_UNITS = {
    "км": (("километр", "километра", "километров"), "m"),
    "м": (("метр", "метра", "метров"), "m"),
    "см": (("сантиметр", "сантиметра", "сантиметров"), "m"),
    "мм": (("миллиметр", "миллиметра", "миллиметров"), "m"),
    "кг": (("килограмм", "килограмма", "килограммов"), "m"),
    "мг": (("миллиграмм", "миллиграмма", "миллиграммов"), "m"),
    "мл": (("миллилитр", "миллилитра", "миллилитров"), "m"),
    "%": (("процент", "процента", "процентов"), "m"),
    "°С": (("градус", "градуса", "градусов"), "m"),
    "₽": (("рубль", "рубля", "рублей"), "m"),
    "мин": (("минута", "минуты", "минут"), "f"),
    "сек": (("секунда", "секунды", "секунд"), "f"),
    "ч": (("час", "часа", "часов"), "m"),
}
_MEASURE = re.compile(
    r"(?<!\w)(-?\d+(?:[.,]\d+)?)\s*("
    + "|".join(map(re.escape, _UNITS))
    + r")(?!\w)(?:\.(?=\s+\S))?"
)
_NUMBER = re.compile(r"(?<!\d)[−-]?\d+(?:[.,]\d+)?")
_DATE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")
_TIME = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_PHONE = re.compile(r"(?<!\w)(?:\+7|8)[ (\-]*\d{3}[ )\-]*\d{3}[ \-]*\d{2}[ \-]*\d{2}(?!\d)")
_ORDINAL = re.compile(r"\b(\d+)-(й|я|е|го|му|м|ю|х)\b")
_ORDINAL_FORMS = {
    "й": ("m", "n"),
    "я": ("f", "n"),
    "е": ("n", "n"),
    "го": ("m", "g"),
    "му": ("m", "d"),
    "м": ("m", "p"),
    "ю": ("f", "a"),
    "х": ("p", "g"),
}


def validate_speech_text(text: str) -> None:
    if _LATIN_TEXT.search(text):
        raise ValueError("Ответ звонящего содержит текст не на русском языке")
    if any(char in text for char in "[]<>"):
        raise ValueError("Озвучка принимает только обычный текст без разметки")


def _words(value: str, **kwargs) -> str:
    value = value.replace("−", "-").replace(",", ".")
    negative = value.startswith("-")
    result = num2words(value.removeprefix("-"), lang="ru", **kwargs)
    return f"минус {result}" if negative else result


def _quantity(value: str, forms: tuple[str, str, str], gender: str = "m") -> str:
    if "." in value or "," in value:
        form = forms[1]
    else:
        number = abs(int(value))
        index = 2 if 11 <= number % 100 <= 14 else {1: 0, 2: 1, 3: 1, 4: 1}.get(number % 10, 2)
        form = forms[index]
    return f"{_words(value, gender=gender)} {form}"


def _date(match: re.Match) -> str:
    day, month, year = map(int, match.groups())
    date(year, month, day)  # Invalid dates are explicit input errors, not reinterpreted numbers.
    return (
        f"{_words(str(day), to='ordinal', gender='n')} {_MONTHS[month - 1]} "
        f"{_words(str(year), to='ordinal', case='g')} года"
    )


def _time(match: re.Match) -> str:
    hour, minute = match.groups()
    return (
        f"{_quantity(hour, ('час', 'часа', 'часов'))} "
        f"{_quantity(minute, ('минута', 'минуты', 'минут'), 'f')}"
    )


def _digits(value: str) -> str:
    return " ".join(_words(char) for char in value if char.isdigit())


def _number(match: re.Match) -> str:
    value = match.group()
    if value.isdigit() and len(value) > 1 and value.startswith("0"):
        return _digits(value)
    return _words(value)


def _ordinal(match: re.Match) -> str:
    number, ending = match.groups()
    gender, case = _ORDINAL_FORMS[ending]
    return _words(number, to="ordinal", gender=gender, case=case)


def _normalize_plain(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\u202f", " ")
    text = _PHONE.sub(lambda m: ("плюс " if m[0].startswith("+") else "") + _digits(m[0]), text)
    text = _DATE.sub(_date, text)
    text = _TIME.sub(_time, text)
    text = re.sub(r"\b\d{1,3}(?: \d{3})+\b", lambda m: m[0].replace(" ", ""), text)
    text = _ORDINAL.sub(_ordinal, text)
    text = _MEASURE.sub(lambda m: _quantity(m[1], *_UNITS[m[2]]), text)
    text = re.sub(r"(?<=\d)[–—-](?=\d)", " тире ", text)
    text = re.sub(r"(?<=\d)/(?=\d)", " дробь ", text)
    text = _ABBREVIATION.sub(lambda m: _ABBREVIATIONS[m[0].lower()] + " ", text)
    text = _NUMBER.sub(_number, text)
    text = text.replace("№", "номер ").replace("+", " плюс ")
    return text


def normalize_for_tts(text: str) -> str:
    """Normalize pronunciation without altering dialogue history."""
    validate_speech_text(text)
    return _normalize_plain(text)


def sentence_boundaries(text: str) -> Iterator[re.Match[str]]:
    """Do not split address abbreviations between TTS calls."""
    abbreviation_ends = {match.end() for match in _ABBREVIATION.finditer(text)}
    for match in re.finditer(r"(?<=[.!?…])\s+", text):
        if match.start() in abbreviation_ends:
            continue
        yield match
