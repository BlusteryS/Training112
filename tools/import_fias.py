"""Build Moscow address suggestions from the FNS GAR XML archive using HTTP ranges.

Usage: python3 tools/import_fias.py FNS_ZIP_URL OUTPUT.tsv.gz
The archive stays on the FNS server; only the Moscow address objects, houses and
administrative hierarchy are read. No network access is needed by the trainer.
"""

import gzip
import io
import re
import struct
import sys
import zlib
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zipfile import ZipFile


def request_range(url, start, end):
    response = urlopen(Request(url, headers={"Range": f"bytes={start}-{end}"}))
    if response.status != 206:
        response.close()
        raise ValueError("Source does not support HTTP byte ranges")
    return response


class RemoteArchive(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        with urlopen(Request(url, method="HEAD")) as response:
            self.size = int(response.headers["Content-Length"])
        self.position = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        return self.position

    def read(self, size=-1):
        if size < 0:
            size = self.size - self.position
        if size == 0:
            return b""
        with request_range(self.url, self.position, self.position + size - 1) as response:
            data = response.read()
        self.position += len(data)
        return data


class MemberStream:
    def __init__(self, archive, info):
        archive.seek(info.header_offset)
        header = archive.read(30)
        if header[:4] != b"PK\x03\x04":
            raise ValueError("Invalid ZIP member header")
        name_length, extra_length = struct.unpack_from("<HH", header, 26)
        start = info.header_offset + 30 + name_length + extra_length
        self.response = request_range(archive.url, start, start + info.compress_size - 1)
        self.decoder = zlib.decompressobj(-15)
        self.buffer = b""
        self.finished = False

    def read(self, size=-1):
        if size < 0:
            size = 65536
        while len(self.buffer) < size and not self.finished:
            chunk = self.response.read(65536)
            if chunk:
                self.buffer += self.decoder.decompress(chunk)
            else:
                self.buffer += self.decoder.flush()
                self.finished = True
        result, self.buffer = self.buffer[:size], self.buffer[size:]
        return result

    def close(self):
        self.response.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def records(archive, info, tag):
    with MemberStream(archive, info) as stream:
        events = ElementTree.iterparse(stream, events=("start", "end"))
        _, root = next(events)
        for event, element in events:
            if event == "end" and element.tag == tag:
                yield element.attrib
                element.clear()
                root.clear()


def member(zipfile, prefix):
    return next(info for info in zipfile.infolist() if info.filename.startswith(prefix))


def clean(value):
    return re.sub(r"[\t\r\n]+", " ", value).strip()


def house_number(row):
    number = row.get("HOUSENUM", "")
    if not number:
        return ""
    additions = {"1": "к.", "2": "стр.", "3": "соор.", "4": "литера"}
    for suffix in ("1", "2"):
        extra = row.get("ADDNUM" + suffix)
        if extra:
            number += " " + additions.get(row.get("ADDTYPE" + suffix), "") + " " + extra
    return " ".join(number.split())


def district_name(name):
    return re.sub(r"^(?:муниципальный округ|городской округ|поселение)\s+", "", name, flags=re.I)


def build(url, destination):
    archive = RemoteArchive(url)
    with ZipFile(archive) as source:
        objects = {}
        for row in records(archive, member(source, "77/AS_ADDR_OBJ_"), "OBJECT"):
            if row.get("ISACTUAL") == "1" and row.get("ISACTIVE") == "1":
                objects[row["OBJECTID"]] = (clean(row["NAME"]), clean(row["TYPENAME"]), row["LEVEL"])
        houses = {}
        for row in records(archive, member(source, "77/AS_HOUSES_"), "HOUSE"):
            if row.get("ISACTUAL") == "1" and row.get("ISACTIVE") == "1":
                number = house_number(row)
                if number:
                    houses[row["OBJECTID"]] = (row["OBJECTGUID"], number)
        districts = {}
        for row in records(archive, member(source, "77/AS_MUN_HIERARCHY_"), "ITEM"):
            if row.get("ISACTIVE") != "1" or row.get("OBJECTID") not in houses:
                continue
            for item in reversed(row.get("PATH", "").split(".")):
                obj = objects.get(item)
                if obj and obj[2] == "3":
                    districts[row["OBJECTID"]] = district_name(obj[0])
                    break
        with gzip.open(destination, "wt", encoding="utf-8", newline="") as output:
            count = 0
            for row in records(archive, member(source, "77/AS_ADM_HIERARCHY_"), "ITEM"):
                if row.get("ISACTIVE") != "1" or row.get("OBJECTID") not in houses:
                    continue
                guid, number = houses[row["OBJECTID"]]
                ancestors = [objects[item] for item in row.get("PATH", "").split(".") if item in objects]
                street = next((f"{kind} {name}" for name, kind, level in reversed(ancestors) if level == "8"), "")
                district = districts.get(row["OBJECTID"], "") or next((district_name(name) for name, _, level in reversed(ancestors)
                                 if level in ("2", "3")), "")
                place = next((name for name, _, level in reversed(ancestors) if level in ("5", "6")), "")
                parts = ["Москва"]
                if place and place != "Москва":
                    parts.append(place)
                if street:
                    parts.append(street)
                elif district:
                    parts.append(district)
                parts.append("д. " + number)
                label = ", ".join(parts)
                output.write("\t".join(map(clean, (guid, label, district, street, number))) + "\n")
                count += 1
    if not count:
        raise ValueError("No active Moscow houses found in source")
    print(f"Wrote {count} Moscow addresses to {destination}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python3 tools/import_fias.py FNS_ZIP_URL OUTPUT.tsv.gz")
    build(sys.argv[1], sys.argv[2])
