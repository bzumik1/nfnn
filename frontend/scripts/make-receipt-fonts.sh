#!/usr/bin/env bash
set -euo pipefail

frontend="$(cd "$(dirname "$0")/.." && pwd)"
dejavu="$frontend/../backend/src/main/resources/fonts"

python3 - "$frontend" "$dejavu" <<'PYTHON'
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger
from fontTools import subset
from fontTools.misc.timeTools import timestampFromString

frontend = Path(sys.argv[1])
dejavu = Path(sys.argv[2])
themes = frontend / "src" / "themes"

CHARACTERS = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + list(range(0x2010, 0x2028))
    + list(range(0x2030, 0x203B))
    + [0x20AC, 0x2122, 0x2212]
)


FIXED_TIME = timestampFromString("Thu Jan  1 00:00:00 2026")


def saved(font, path):
    font.recalcTimestamp = False
    font["head"].created = FIXED_TIME
    font["head"].modified = FIXED_TIME
    font.save(path)


def static_instance(source, weight, target):
    font = TTFont(source)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": weight})
    font.flavor = None
    saved(font, target)


def merged(parts, target):
    saved(Merger().merge([str(part) for part in parts]), target)
    for part in parts:
        part.unlink()


def subset_to_receipt(path):
    options = subset.Options()
    options.layout_features = ["kern", "liga", "calt", "tnum"]
    options.hinting = False
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    font = TTFont(path)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=CHARACTERS)
    subsetter.subset(font)
    saved(font, path)


def named(path, family, style):
    font = TTFont(path)
    table = font["name"]
    table.names = [record for record in table.names if record.nameID not in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25)]
    postscript = f"{family.replace(' ', '')}-{style}"
    for name_id, value in ((1, family), (2, style), (3, postscript), (4, f"{family} {style}"), (6, postscript)):
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)
    font["OS/2"].usWeightClass = 700 if style == "Bold" else 400
    font["OS/2"].fsType = 0
    saved(font, path)


def from_variable(theme, prefix, weight, family, style, target_name):
    fonts = themes / theme / "fonts"
    receipt = themes / theme / "receipt"
    receipt.mkdir(exist_ok=True)
    parts = []
    for part in ("latin", "latin-ext"):
        target = receipt / f"{target_name}.{part}.ttf"
        static_instance(fonts / f"{prefix}-{part}-wght-normal.woff2", weight, target)
        parts.append(target)
    target = receipt / f"{target_name}.ttf"
    merged(parts, target)
    subset_to_receipt(target)
    named(target, family, style)


def from_static(theme, source, family, style, target_name):
    receipt = themes / theme / "receipt"
    receipt.mkdir(exist_ok=True)
    target = receipt / f"{target_name}.ttf"
    static_instance(source, 400, target)
    subset_to_receipt(target)
    named(target, family, style)


from_variable("nova-nadeje", "inter", 400, "Inter", "Regular", "body")
from_variable("nova-nadeje", "inter", 700, "Inter", "Bold", "body-bold")
from_variable("nova-nadeje", "playfair-display", 700, "Playfair Display", "Bold", "heading")
from_static("control", dejavu / "DejaVuSans.ttf", "DejaVu Sans", "Regular", "body")
from_static("control", dejavu / "DejaVuSans-Bold.ttf", "DejaVu Sans", "Bold", "body-bold")
from_static("control", dejavu / "DejaVuSans-Bold.ttf", "DejaVu Sans", "Bold", "heading")
PYTHON

cp "$frontend/src/themes/nova-nadeje/fonts/OFL-inter.txt" "$frontend/src/themes/nova-nadeje/receipt/"
cp "$frontend/src/themes/nova-nadeje/fonts/OFL-playfair-display.txt" "$frontend/src/themes/nova-nadeje/receipt/"
cp "$dejavu/DejaVu-LICENSE.txt" "$frontend/src/themes/control/receipt/"
ls -l "$frontend/src/themes/nova-nadeje/receipt" "$frontend/src/themes/control/receipt"
