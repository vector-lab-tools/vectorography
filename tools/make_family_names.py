"""
Map each corpus directory name to the family's own name.

    .venv/bin/python tools/make_family_names.py

The space knows families as the directory they came from, "averialibre"; Google
Fonts serves them under the name the font gives itself, "Averia Libre". The map
is written to frontend/public/families.json so the browser can ask a CDN for a
face rather than asking this server for three hundred megabytes of font files
it does not ship.

Run it after changing the corpus. It needs the fonts present locally, which is
the point: the mapping is committed so that a deploy without them still works.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from fontTools.ttLib import TTFont            # noqa: E402

FONTS = ROOT / "backend" / "data" / "fonts"
OUT = ROOT / "frontend" / "public" / "families.json"


def family_name(path: Path) -> str | None:
    try:
        font = TTFont(str(path), lazy=True)
        names = {r.nameID: str(r) for r in font["name"].names
                 if r.platformID == 3 and r.platEncID == 1}
        font.close()
        # 16 is the typographic family where a font has one; 1 otherwise.
        return names.get(16) or names.get(1)
    except Exception:                          # noqa: BLE001
        return None


def main() -> None:
    if not FONTS.is_dir():
        raise SystemExit(f"no corpus at {FONTS}; run backend/corpus/fetch.py")
    out = {}
    for p in sorted(FONTS.glob("*.ttf")):
        name = family_name(p)
        if name:
            out[p.stem] = name
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True))
    print(f"{OUT.relative_to(ROOT)}  {len(out)} families  "
          f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
