"""
Regenerate the static link-preview card.

    .venv/bin/python tools/make_og.py

Writes frontend/public/og.png, the picture a scraper fetches when the URL is
pasted into WhatsApp, Messages or anything else that unfurls links. It is
static on purpose: a scraper reads the page's metadata and then one image, and
neither step runs the app, so there is nothing for a per-location card to hook
into. Run this again when the model or the card design changes.
"""

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from export.card_png import card_png            # noqa: E402
from render import decode_to_glyphs             # noqa: E402
from space.style_space import StyleSpace        # noqa: E402

WORD = "Vectorography"


def main() -> None:
    s = StyleSpace.load()
    z = np.zeros(s.dims)                        # the centroid: the corpus itself
    glyphs = [g for g in decode_to_glyphs(s.decode(z), geometry=True)
              if g["char"] in set(WORD)]
    png = card_png(
        glyphs, WORD,
        {"altitude": s.altitude(z), "neighbours": s.neighbours(z, k=3)},
        model=f"{s.model_name} {s.model_version}"
        if hasattr(s, "model_name") else "VectorModel",
        family=WORD)
    out = ROOT / "frontend" / "public" / "og.png"
    out.write_bytes(png)
    print(f"{out.relative_to(ROOT)}  {len(png) // 1024} KB")


if __name__ == "__main__":
    main()
