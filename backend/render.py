"""Contours to SVG. Font coordinates are y-up; the SVG wraps them in a flip."""

from __future__ import annotations

import numpy as np

from corpus.outlines import GLYPHS

MIN_AREA = 0.0006   # em^2; below this a contour is a collapsed pad, not a counter


def _area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return abs(0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))


def _n(v: float) -> str:
    """A coordinate, in as few characters as it can be written.

    Three decimals of an em is one unit at 1000upem, finer than the outlines
    were resampled to and far finer than a screen resolves. The fourth decimal
    that used to be sent was paid for on every point of every glyph of every
    request.
    """
    t = f"{v:.3f}".rstrip("0").rstrip(".")
    if t in ("", "-0"):
        return "0"
    return t[1:] if t.startswith("0.") else (
        "-" + t[2:] if t.startswith("-0.") else t)


def contour_path(pts: np.ndarray) -> str:
    """Closed Catmull-Rom through the resampled points, as cubic Beziers."""
    n = len(pts)
    d = [f"M{_n(pts[0][0])},{_n(pts[0][1])}"]
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f"C{_n(c1[0])},{_n(c1[1])} {_n(c2[0])},{_n(c2[1])} "
                 f"{_n(p2[0])},{_n(p2[1])}")
    d.append("Z")
    return "".join(d)


def glyph_path(contours: np.ndarray) -> str:
    """All contours of a glyph as subpaths of ONE path.

    They have to share a path element: fill-rule applies within a path, not
    across siblings, so a counter emitted as its own element paints a filled
    blob over the letter instead of cutting a hole in it.
    """
    return "".join(contour_path(c) for c in contours if _area(c) > MIN_AREA)


def decode_to_glyphs(vec: np.ndarray, geometry: bool = False,
                     only: set[str] | None = None) -> list[dict]:
    """Glyphs as drawable paths, and optionally as the points behind them.

    The points are what makes the specimen touchable: deciding whether a
    pointer is on the side of a stem or the shoulder of a bowl needs the
    outline itself, not a path string to re-parse.

    `only` is the set of characters actually wanted. Building all of them and
    keeping fifteen is most of what a drag was waiting on: the compass alone
    asks for eight positions, and the character set is a hundred and sixty
    four.
    """
    from corpus.outlines import decode_vector
    dec = decode_vector(vec)
    out = []
    for i, ch in enumerate(GLYPHS):
        if only is not None and ch not in only:
            continue
        entry = {
            "char": ch,
            "path": glyph_path(dec["contours"][i]),
            "advance": float(dec["advances"][i]),
        }
        if geometry:
            # Three decimals of an em is a third of a unit at 1000upem, well
            # under what any hit test cares about, and it takes a fifth off the
            # payload that the specimen would otherwise wait behind.
            entry["contours"] = [
                [[round(float(x), 3), round(float(y), 3)] for x, y in c]
                for c in dec["contours"][i] if _area(c) > MIN_AREA
            ]
        out.append(entry)
    return out


def specimen_svg(glyphs: list[dict], text: str, size: float = 1.0,
                 asc: float = 0.88, colour: str = "#1a1a1a") -> str:
    """One line of specimen. Font coordinates are y-up, so the group flips;
    the viewBox must therefore cover -asc .. +0.28, not 0 .. asc."""
    by = {g["char"]: g for g in glyphs}
    x = 0.0
    body = []
    for ch in text:
        if ch == " ":
            x += 0.3
            continue
        g = by.get(ch)
        if not g:
            continue
        body.append(f'<path transform="translate({x:.4f},0)" d="{g["path"]}"/>')
        x += g["advance"]
    w = max(x, 0.001)
    h = asc + 0.28
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {-asc:.4f} {w:.4f} '
        f'{h:.4f}" width="{w * 100 * size:.1f}">'
        f'<g transform="scale(1,-1)" fill="{colour}" fill-rule="evenodd">'
        f'{"".join(body)}</g></svg>'
    )


def _line(glyphs_by: dict, text: str, size: float, baseline: float) -> tuple[str, float]:
    """A line of text set at `size` em, its baseline at y=`baseline` (y-down)."""
    x = 0.0
    parts = []
    for ch in text:
        g = glyphs_by.get(ch)
        if ch == " " or not g:
            x += 0.3
            continue
        parts.append(f'<path transform="translate({x:.4f},0)" d="{g["path"]}"/>')
        x += g["advance"]
    body = (f'<g transform="translate(0,{baseline:.4f}) scale({size:.5f},{-size:.5f})">'
            f'{"".join(parts)}</g>')
    return body, x * size


def specimen_sheet_svg(glyphs: list[dict], location: dict,
                       model: str = "VectorModel") -> str:
    """A specimen sheet for the current location: a waterfall, plus the map
    reading that produced it. The reading travels with the artefact."""
    lines = [("Hamburgefonstiv", 0.20),
             ("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0.072),
             ("abcdefghijklmnopqrstuvwxyz", 0.072),
             ("0123456789", 0.072)]
    by = {g["char"]: g for g in glyphs}

    parts, y, width = [], 0.10, 0.0
    for text, size in lines:
        y += size * 0.92
        body, w = _line(by, text, size, y)
        parts.append(body)
        width = max(width, w)
        y += size * 0.42

    W = max(width, 1.9) + 0.20
    H = y + 0.30
    alt = location.get("altitude", {})
    prov = "  ".join(f"{n['family']} {n['distance']:.2f}"
                     for n in location.get("neighbours", [])[:5])
    reading = (f"centroid {alt.get('centroid_distance', 0):.2f} "
               f"({alt.get('centroid_percentile', 0):.0f}th pct)   "
               f"density {alt.get('density_percentile', 0):.0f}th   "
               f"isolation {alt.get('knn_distance', 0):.2f}")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.3f} {H:.3f}" '
        f'width="{W * 640:.0f}" height="{H * 640:.0f}">'
        f'<rect width="{W:.3f}" height="{H:.3f}" fill="#faf8f4"/>'
        f'<g transform="translate(0.10,0)" fill="#1a1a1a" fill-rule="evenodd">'
        f'{"".join(parts)}</g>'
        f'<line x1="0.10" x2="{W - 0.10:.3f}" y1="{H - 0.21:.3f}" '
        f'y2="{H - 0.21:.3f}" stroke="#ddd8cc" stroke-width="0.004"/>'
        f'<text x="0.10" y="{H - 0.15:.3f}" font-family="monospace" '
        f'font-size="0.032" fill="#7c2d36">{reading}</text>'
        f'<text x="0.10" y="{H - 0.095:.3f}" font-family="monospace" '
        f'font-size="0.028" fill="#666">neighbours  {prov}</text>'
        f'<text x="0.10" y="{H - 0.04:.3f}" font-family="monospace" '
        f'font-size="0.028" fill="#999">'
        f'vectorography  ·  corpus: {model}</text>'
        f'</svg>'
    )


def share_card_svg(glyphs: list[dict], text: str, location: dict,
                   model: str, family: str = "") -> str:
    """A location as a card worth showing someone.

    Everything on it is a reading rather than a caption: where this sits in the
    distribution, and which model it came out of. A specimen without its
    provenance is just a picture of some letters.
    """
    W, H = 1200, 630
    by = {g["char"]: g for g in glyphs}

    # The word, scaled to the width it is given.
    adv = sum(by[c]["advance"] for c in text if c in by) or 1
    size = min(210.0, (W - 200) / adv)
    x = (W - adv * size) / 2
    baseline = 348.0
    body = []
    for ch in text:
        g = by.get(ch)
        if not g:
            x += 0.3 * size
            continue
        body.append(f'<g transform="translate({x:.2f},{baseline:.2f}) '
                    f'scale({size:.3f},{-size:.3f})"><path d="{g["path"]}"/></g>')
        x += g["advance"] * size

    alt = location.get("altitude", {})
    readings = [
        ("from the centroid", f"{alt.get('centroid_distance', 0):.2f}"),
        ("density percentile", f"{alt.get('density_percentile', 0):.0f}"),
        ("nearest five, mean", f"{alt.get('knn_distance', 0):.2f}"),
    ]
    # Three readings on one row. Family names sat beside them once and ran
    # straight through the numbers, a family name being as long as it likes.
    cols = "".join(
        f'<text x="{80 + i * 260}" y="452" font-family="ui-monospace,monospace" '
        f'font-size="14" fill="#8a8378" letter-spacing="1.4">{k.upper()}</text>'
        f'<text x="{80 + i * 260}" y="494" font-family="Georgia,serif" '
        f'font-size="38" fill="#1a1a1a">{v}</text>'
        for i, (k, v) in enumerate(readings))

    title = family or text

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}">'
        f'<rect width="{W}" height="{H}" fill="#faf8f4"/>'
        f'<rect x="0" y="0" width="{W}" height="6" fill="#7c2d36"/>'
        f'<text x="80" y="92" font-family="Georgia,serif" font-size="26" '
        f'fill="#1a1a1a">{title}</text>'
        f'<text x="80" y="120" font-family="ui-monospace,monospace" '
        f'font-size="14" fill="#8a8378">a location in {model}</text>'
        f'<g fill="#1a1a1a" fill-rule="evenodd">{"".join(body)}</g>'
        f'<line x1="80" y1="412" x2="{W - 80}" y2="412" stroke="#e6e0d4"/>'
        f'{cols}'
        f'<text x="80" y="592" font-family="ui-monospace,monospace" '
        f'font-size="13" fill="#8a8378">vectorography · type design by '
        f'traversal · {model}</text>'
        f'</svg>'
    )


def glyph_svg(contours, advance: float, ch: str, family: str) -> str:
    """One glyph as its own SVG, sized to the em.

    For Illustrator, Figma, or a laser cutter. It is drawing rather than type:
    there is no metric here beyond the advance the viewBox is cut to, and
    nothing downstream knows the shape is a letter.
    """
    d = glyph_path(contours)
    w = max(float(advance), 0.01)
    # SVG's y runs down and a font's runs up, so the whole thing is flipped
    # once rather than every coordinate being negated.
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 {w:.4f} 1.4" '
        f'width="{w * 100:.1f}" height="140">\n'
        f'  <title>{ch} · {family}</title>\n'
        f'  <g transform="scale(1,-1)">\n'
        f'    <path d="{d}" fill="currentColor" fill-rule="evenodd"/>\n'
        f'  </g>\n'
        f'</svg>\n')
