"""Extract Moscow address points from https://download.bbbike.org/osm/bbbike/Moscow/."""

import gzip
import json
import lzma
import sys
from pathlib import Path


def points(value):
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            yield value[0], value[1]
        else:
            for item in value:
                yield from points(item)


def main(source: Path, target: Path):
    count = 0
    with lzma.open(source, "rt", encoding="utf-8") as data, gzip.open(
        target, "wt", encoding="utf-8", compresslevel=9
    ) as output:
        for line in data:
            if '"addr:housenumber"' not in line:
                continue
            feature = json.loads(line.rstrip().rstrip(","))
            tags = feature.get("properties", {})
            street = tags.get("addr:street") or tags.get("addr:place")
            house = tags.get("addr:housenumber")
            if not isinstance(street, str) or not isinstance(house, str):
                continue
            if not street or not house or any(c in street + house for c in "\t\r\n"):
                continue
            locations = list(points(feature["geometry"]["coordinates"]))
            if not locations:
                continue
            longitude = sum(point[0] for point in locations) / len(locations)
            latitude = sum(point[1] for point in locations) / len(locations)
            if not 36.6 <= longitude <= 38.1 or not 55.1 <= latitude <= 56.05:
                continue
            output.write(f"{latitude:.6f}\t{longitude:.6f}\t{street}\t{house}\n")
            count += 1
    print(f"Записано адресов: {count}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
