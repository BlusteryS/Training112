"""Extract operator survey cards from the supplied v046 classifier workbook."""

import json
import sys
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile


NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAIN_SERVICES = {
    "MCHS": "101", "Police": "102", "AMBULANCE": "103", "MOSGAZ": "104",
    "GORMOST": "Гормост", "MOSGORTRANS": "Мосгортранс",
    "MOSVODOCANAL": "Мосводоканал", "MOSLIFT": "Мослифт",
    "METRO": "Метрополитен", "ZODD": "ЦОДД", "MOSVODOSTOK": "Мосводосток",
    "MOSCOLLECTOR": "Москоллектор", "MOEK": "МОЭК", "MOESK": "Россети",
    "OEK": "ОЭК", "AUTOROADS": "Автомобильные дороги", "GKH": "Городское хозяйство",
    "MGTS": "МГТС", "MZD": "РЖД", "MSPPN": "МСППН",
    "Dep.tszn": "ДДС департамента труда и социальной защиты",
    "DepEco": "ДДС департамента природопользования",
    "ZEMP": "ЦЭМП", "МСР": "МСР",
}
OTHER_SERVICES = {
    "AL": "Мосгортранс", "AO": "Городское хозяйство", "AP": "Гормост",
    "AX": "Мосводоканал", "AY": "МОЭК", "AZ": "Россети", "BA": "ОЭК",
    "BB": "Мослифт", "BC": "ЦОДД", "BJ": "ДДС департамента образования",
    "BH": "Москоллектор", "BI": "РЖД", "BN": "Мосводосток",
}


def cells(row, strings):
    result = {}
    for cell in row:
        ref = cell.attrib.get("r", "")
        column = "".join(char for char in ref if char.isalpha())
        value = cell.find("x:v", NS)
        if value is not None:
            result[column] = strings[int(value.text)] if cell.get("t") == "s" else value.text or ""
        elif cell.get("t") == "inlineStr":
            result[column] = "".join(part.text or "" for part in cell.findall(".//x:t", NS))
    return {key: value.strip() for key, value in result.items()}


def unique(values):
    return list(dict.fromkeys(value for value in values if value))


def convert(source):
    with ZipFile(source) as workbook:
        strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            strings = ["".join(part.text or "" for part in item.findall(".//x:t", NS))
                       for item in shared.findall("x:si", NS)]
        sheet = ElementTree.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        entries = []
        for element in sheet.findall(".//x:sheetData/x:row", NS):
            row = cells(element, strings)
            code = row.get("E", "")
            first = row.get("G", "")
            if not code.isdigit() or len(code) < 6 or not first or first == "Не отображается оператору 112":
                continue
            main = [MAIN_SERVICES.get(part.strip(), part.strip()) for part in row.get("M", "").split(",")]
            base = main + [service for column, service in OTHER_SERVICES.items() if row.get(column)]
            if any(row.get(column) for column in ("N", "P", "T")):
                base.append("101")
            if row.get("U"):
                base.append("102")
            if row.get("X"):
                base.append("103")
            if row.get("AA"):
                base.append("104")
            victims = [service for column, service in (("W", "102"), ("Y", "103"))
                       if row.get(column)]
            law = ["102"] if row.get("V") else []
            entries.append({
                "code": code,
                "type": first,
                "sign2": row.get("H", ""),
                "sign3": row.get("I", ""),
                "result": row.get("K", "") or first,
                "services": unique(base),
                "victim_services": unique(victims),
                "law_services": law,
                "district_dds": bool(row.get("BW")),
                "okrug_dds": bool(row.get("BW")),
                "tinao_dds": bool(row.get("BX")),
            })
    return entries


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python3 tools/import_classifier.py SOURCE.xlsx OUTPUT.json")
    Path(sys.argv[2]).write_text(json.dumps(convert(sys.argv[1]), ensure_ascii=False, separators=(",", ":")))
