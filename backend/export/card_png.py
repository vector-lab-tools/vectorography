"""
The share card as a PNG, drawn here rather than in a browser.

A link pasted into WhatsApp or Messages is unfurled by a scraper that fetches
the page and then the image named in its metadata. Nothing in that chain runs
JavaScript or reads an SVG, so the card has to exist as a picture the server
can hand over on request.

Rather than add a rasteriser and its system libraries, the outlines are drawn
directly: they are already decoded to points, and a filled polygon is a filled
polygon. Counters are painted back in the ground colour, which is what the
even-odd rule amounts to for shapes wound this way.
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SUPER = 2                    # drawn at twice the size, then reduced
GROUND = (250, 248, 244)
INK = (26, 26, 26)
QUIET = (138, 131, 120)
ACCENT = (124, 45, 54)
RULE = (230, 224, 212)

FONTS = Path(__file__).resolve().parents[1] / "data" / "fonts"


def _font(size: int, families: tuple[str, ...]) -> ImageFont.FreeTypeFont:
    """A face from the corpus, since the corpus is what this machine has."""
    for name in families:
        path = FONTS / f"{name}.ttf"
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                pass
    return ImageFont.load_default(size)


def _mono(size: int) -> ImageFont.FreeTypeFont:
    return _font(size, ("robotomono", "spacemono", "inconsolata", "cousine"))


def _serif(size: int) -> ImageFont.FreeTypeFont:
    return _font(size, ("librebaskerville", "eblgaramond", "ptserif", "lora"))


def card_png(glyphs: list[dict], text: str, location: dict, model: str,
             family: str = "") -> bytes:
    img = Image.new("RGB", (W * SUPER, H * SUPER), GROUND)
    d = ImageDraw.Draw(img)
    s = SUPER

    d.rectangle([0, 0, W * s, 6 * s], fill=ACCENT)

    title = family or text
    d.text((80 * s, 66 * s), title, font=_serif(26 * s), fill=INK)
    d.text((80 * s, 104 * s), f"a location in {model}", font=_mono(14 * s),
           fill=QUIET)

    by = {g["char"]: g for g in glyphs}
    advance = sum(by[c]["advance"] for c in text if c in by) or 1
    size = min(210.0, (W - 200) / advance)
    x = (W - advance * size) / 2
    baseline = 340.0

    for ch in text:
        g = by.get(ch)
        if g is None:
            x += 0.3 * size
            continue
        for i, contour in enumerate(g.get("contours") or []):
            pts = [((x + px * size) * s, (baseline - py * size) * s)
                   for px, py in contour]
            if len(pts) > 2:
                # The outer shape is ink; everything inside it is ground again.
                d.polygon(pts, fill=INK if i == 0 else GROUND)
        x += g["advance"] * size

    d.line([(80 * s, 412 * s), ((W - 80) * s, 412 * s)], fill=RULE, width=s)

    alt = location.get("altitude", {})
    readings = [
        ("FROM THE CENTROID", f"{alt.get('centroid_distance', 0):.2f}"),
        ("DENSITY PERCENTILE", f"{alt.get('density_percentile', 0):.0f}"),
        ("NEAREST FIVE, MEAN", f"{alt.get('knn_distance', 0):.2f}"),
    ]
    for i, (k, v) in enumerate(readings):
        cx = (80 + i * 260) * s
        d.text((cx, 440 * s), k, font=_mono(14 * s), fill=QUIET)
        d.text((cx, 466 * s), v, font=_serif(34 * s), fill=INK)

    d.text((80 * s, 580 * s),
           f"vectorography · type design by traversal · {model}",
           font=_mono(13 * s), fill=QUIET)

    img = img.resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
