#!/usr/bin/env bash
set -euo pipefail

frontend="$(cd "$(dirname "$0")/.." && pwd)"
sources="$(mktemp -d)"
trap 'rm -rf "$sources"' EXIT

fetch() {
  local url="$1" sha256="$2" target="$3"
  curl -sSfL --retry 3 -o "$sources/$target" "$url"
  echo "$sha256  $sources/$target" | sha256sum --check --quiet
}

fetch https://registry.npmjs.org/@fontsource-variable/inter/-/inter-5.3.0.tgz \
  d26710dd38e7217484a1d47ee76c024977ec550548876f26d06ed1844af09a14 inter.tgz
fetch https://registry.npmjs.org/@fontsource-variable/playfair-display/-/playfair-display-5.3.0.tgz \
  5d9a6609ccc3c3bcba68c5b66981cce7d731bf5bb6e64a2ca6045ab05e527788 playfair-display.tgz
fetch https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2 \
  fa9ca4d13871dd122f61258a80d01751d603b4d3ee14095d65453b4e846e17d7 dejavu.tar.bz2
mkdir "$sources/inter" "$sources/playfair-display" "$sources/dejavu"
tar -xzf "$sources/inter.tgz" -C "$sources/inter" --strip-components=1
tar -xzf "$sources/playfair-display.tgz" -C "$sources/playfair-display" --strip-components=1
tar -xjf "$sources/dejavu.tar.bz2" -C "$sources/dejavu" --strip-components=1

node --no-warnings --input-type=module -e "
const { RECEIPT_PRINTABLE_RANGES } = await import('$frontend/src/app/features/donations/receipt-pdf/receipt-characters.ts');
console.log(JSON.stringify(RECEIPT_PRINTABLE_RANGES));
" > "$sources/printable.json"

python3 - "$frontend" "$sources" <<'PYTHON'
import hashlib
import json
import re
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.varLib import instancer
from fontTools.merge import Merger
from fontTools import subset
from fontTools.misc.timeTools import timestampFromString

frontend = Path(sys.argv[1])
sources = Path(sys.argv[2])
themes = frontend / "src" / "themes"
work = sources / "work"
work.mkdir()

PRINTABLE = [
    code_point
    for first, last in json.loads((sources / "printable.json").read_text())
    for code_point in range(first, last + 1)
]
INTER_PARTS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"]
PLAYFAIR_PARTS = ["latin", "latin-ext", "cyrillic", "vietnamese"]
FIXED_TIME = timestampFromString("Thu Jan  1 00:00:00 2026")


def saved(font, path):
    font.recalcTimestamp = False
    font["head"].created = FIXED_TIME
    font["head"].modified = FIXED_TIME
    font.save(path)


def static_instance(source, weight, target):
    font = TTFont(source)
    if font["OS/2"].fsType != 0:
        sys.exit(f"{source} restricts embedding (OS/2 fsType {font['OS/2'].fsType}); the receipt cannot use it")
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": weight})
    font.flavor = None
    saved(font, target)
    return target


def merged(parts, target):
    saved(Merger().merge([str(part) for part in parts]), target)
    return target


def subset_to(path, code_points):
    options = subset.Options()
    options.layout_features = ["kern", "liga", "calt", "tnum"]
    options.hinting = False
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    font = TTFont(path)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=code_points)
    subsetter.subset(font)
    saved(font, path)
    return path


def missing(path, code_points):
    covered = TTFont(path).getBestCmap()
    return [code_point for code_point in code_points if code_point not in covered]


def with_fallback(primary, fallback, target):
    lacking = missing(primary, PRINTABLE)
    if not lacking:
        return primary
    part = subset_to(fallback, lacking)
    font = TTFont(part)
    scale_upem(font, TTFont(primary)["head"].unitsPerEm)
    saved(font, part)
    return merged([primary, part], target)


def named(path, family, style, notice):
    font = TTFont(path)
    table = font["name"]
    table.names = [record for record in table.names if record.nameID not in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25)]
    postscript = f"{family.replace(' ', '')}-{style}"
    for name_id, value in ((1, family), (2, style), (3, postscript), (4, f"{family} {style}"), (6, postscript)):
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)
    if notice:
        copyright = table.getDebugName(0) or ""
        table.setName(f"{copyright} {notice}".strip(), 0, 3, 1, 0x409)
        table.setName(f"{copyright} {notice}".strip(), 0, 1, 0, 0)
    font["OS/2"].usWeightClass = 700 if style == "Bold" else 400
    if font["OS/2"].fsType != 0:
        sys.exit(f"{path} lost its installable embedding (OS/2 fsType {font['OS/2'].fsType})")
    saved(font, path)


def placed(path, theme, role):
    lacking = missing(path, PRINTABLE)
    if lacking:
        sys.exit(f"{theme} {role} lacks {', '.join(f'U+{code_point:04X}' for code_point in lacking[:20])}")
    content = path.read_bytes()
    name = f"{role}.{hashlib.sha256(content).hexdigest()[:16]}.ttf"
    (themes / theme / "receipt" / name).write_bytes(content)
    return name


def inter(weight, label):
    parts = [
        static_instance(sources / "inter" / "files" / f"inter-{part}-wght-normal.woff2", weight, work / f"inter-{label}-{part}.ttf")
        for part in INTER_PARTS
    ]
    return merged(parts, work / f"inter-{label}.ttf")


def playfair_bold():
    parts = [
        static_instance(
            sources / "playfair-display" / "files" / f"playfair-display-{part}-wght-normal.woff2", 700, work / f"playfair-{part}.ttf"
        )
        for part in PLAYFAIR_PARTS
    ]
    return merged(parts, work / "playfair.ttf")


def dejavu(file, label):
    return static_instance(sources / "dejavu" / "ttf" / file, 400, work / f"dejavu-{label}.ttf")


def receipt_fonts(theme, fonts):
    folder = themes / theme / "receipt"
    folder.mkdir(exist_ok=True)
    for old in folder.glob("*.ttf"):
        old.unlink()
    names = {}
    for role, (path, family, style, notice) in fonts.items():
        subset_to(path, PRINTABLE)
        named(path, family, style, notice)
        names[role] = placed(path, theme, role)
    theme_file = themes / theme / "_theme.scss"
    text = theme_file.read_text()
    for role, token in (("body", "body"), ("body-bold", "bold"), ("heading", "heading")):
        text, count = re.subn(
            rf"(--receipt-font-{token}: )'[^']*';", rf"\g<1>'{names[role]}';", text
        )
        if count != 1:
            sys.exit(f"{theme_file} sets --receipt-font-{token} {count} times, not once")
    theme_file.write_text(text)


inter_regular = inter(400, "regular")
inter_bold = inter(700, "bold")
heading = with_fallback(playfair_bold(), inter(700, "fallback"), work / "heading.ttf")
receipt_fonts(
    "nova-nadeje",
    {
        "body": (inter_regular, "NFNN Receipt Sans", "Regular", ""),
        "body-bold": (inter_bold, "NFNN Receipt Sans", "Bold", ""),
        "heading": (heading, "NFNN Receipt Serif", "Bold", "Glyphs Playfair Display lacks: Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)."),
    },
)
receipt_fonts(
    "control",
    {
        "body": (dejavu("DejaVuSans.ttf", "regular"), "NFNN Receipt Control Sans", "Regular", ""),
        "body-bold": (dejavu("DejaVuSans-Bold.ttf", "bold"), "NFNN Receipt Control Sans", "Bold", ""),
        "heading": (dejavu("DejaVuSans-Bold.ttf", "heading"), "NFNN Receipt Control Sans", "Bold", ""),
    },
)
PYTHON

cp "$frontend/src/themes/nova-nadeje/fonts/OFL-inter.txt" "$frontend/src/themes/nova-nadeje/receipt/"
cp "$frontend/src/themes/nova-nadeje/fonts/OFL-playfair-display.txt" "$frontend/src/themes/nova-nadeje/receipt/"
cp "$sources/dejavu/LICENSE" "$frontend/src/themes/control/receipt/DejaVu-LICENSE.txt"
ls -l "$frontend/src/themes/nova-nadeje/receipt" "$frontend/src/themes/control/receipt"
