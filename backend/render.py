"""Contours to SVG. Font coordinates are y-up; the SVG wraps them in a flip."""

from __future__ import annotations

import numpy as np

from corpus.outlines import GLYPHS

MIN_AREA = 0.0006   # em^2; below this a contour is a collapsed pad, not a counter


def _area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return abs(0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))


def contour_path(pts: np.ndarray) -> str:
    """Closed Catmull-Rom through the resampled points, as cubic Beziers."""
    n = len(pts)
    d = [f"M{pts[0][0]:.4f},{pts[0][1]:.4f}"]
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f"C{c1[0]:.4f},{c1[1]:.4f} {c2[0]:.4f},{c2[1]:.4f} "
                 f"{p2[0]:.4f},{p2[1]:.4f}")
    d.append("Z")
    return "".join(d)


def glyph_path(contours: np.ndarray) -> str:
    """All contours of a glyph as subpaths of ONE path.

    They have to share a path element: fill-rule applies within a path, not
    across siblings, so a counter emitted as its own element paints a filled
    blob over the letter instead of cutting a hole in it.
    """
    return "".join(contour_path(c) for c in contours if _area(c) > MIN_AREA)


def decode_to_glyphs(vec: np.ndarray) -> list[dict]:
    from corpus.outlines import decode_vector
    dec = decode_vector(vec)
    out = []
    for i, ch in enumerate(GLYPHS):
        out.append({
            "char": ch,
            "path": glyph_path(dec["contours"][i]),
            "advance": float(dec["advances"][i]),
        })
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


def specimen_sheet_svg(glyphs: list[dict], location: dict) -> str:
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
        f'vectorography  ·  corpus: Google Fonts, OFL-1.1</text>'
        f'</svg>'
    )
