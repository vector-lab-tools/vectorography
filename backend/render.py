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


def glyph_paths(contours: np.ndarray) -> list[str]:
    return [contour_path(c) for c in contours if _area(c) > MIN_AREA]


def decode_to_glyphs(vec: np.ndarray) -> list[dict]:
    from corpus.outlines import decode_vector
    dec = decode_vector(vec)
    out = []
    for i, ch in enumerate(GLYPHS):
        out.append({
            "char": ch,
            "paths": glyph_paths(dec["contours"][i]),
            "advance": float(dec["advances"][i]),
        })
    return out


def specimen_svg(glyphs: list[dict], text: str, size: float = 1.0,
                 asc: float = 0.8, colour: str = "#1a1a1a") -> str:
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
        inner = "".join(f'<path d="{p}"/>' for p in g["paths"])
        body.append(f'<g transform="translate({x:.4f},0)">{inner}</g>')
        x += g["advance"]
    w = max(x, 0.001)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {-0.25:g} {w:.4f} '
        f'{asc + 0.25:.4f}" width="{w * 100 * size:.1f}">'
        f'<g transform="scale(1,-1)" fill="{colour}" fill-rule="evenodd">'
        f'{"".join(body)}</g></svg>'
    )


def specimen_sheet_svg(glyphs: list[dict], location: dict) -> str:
    """A full specimen sheet for the current location: waterfall plus the map
    reading that produced it."""
    lines = ["Hamburgefonstiv", "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
             "abcdefghijklmnopqrstuvwxyz", "0123456789"]
    sizes = [0.16, 0.075, 0.075, 0.075]
    by = {g["char"]: g for g in glyphs}
    parts, y = [], 0.0
    width = 0.0
    for text, s in zip(lines, sizes):
        x = 0.0
        row = []
        for ch in text:
            g = by.get(ch)
            if not g:
                x += 0.3 * s
                continue
            inner = "".join(f'<path d="{p}"/>' for p in g["paths"])
            row.append(f'<g transform="translate({x:.4f},0)">{inner}</g>')
            x += g["advance"] * s
        width = max(width, x)
        y += s * 1.05
        parts.append(
            f'<g transform="translate(0,{y:.4f}) scale({s:.4f},{-s:.4f})">'
            f'{"".join(f'<g transform="scale({1 / s:.6f},{1 / s:.6f})">{r}</g>' for r in row)}</g>')
        y += s * 0.45
    W, H = max(width + 0.1, 1.2), y + 0.35
    prov = " · ".join(f"{n['family']} {n['distance']:.2f}"
                      for n in location.get("neighbours", [])[:5])
    alt = location.get("altitude", {})
    caption = (f"centroid {alt.get('centroid_distance', 0):.2f} "
               f"({alt.get('centroid_percentile', 0):.0f}th) · "
               f"density {alt.get('density_percentile', 0):.0f}th percentile")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.3f} {H:.3f}" '
        f'width="{W * 700:.0f}">'
        f'<rect width="{W:.3f}" height="{H:.3f}" fill="#faf8f4"/>'
        f'<g transform="translate(0.05,0.02)" fill="#1a1a1a" fill-rule="evenodd">'
        f'{"".join(parts)}</g>'
        f'<text x="0.05" y="{H - 0.16:.3f}" font-family="monospace" '
        f'font-size="0.030" fill="#7c2d36">{caption}</text>'
        f'<text x="0.05" y="{H - 0.10:.3f}" font-family="monospace" '
        f'font-size="0.026" fill="#666">neighbours: {prov}</text>'
        f'<text x="0.05" y="{H - 0.04:.3f}" font-family="monospace" '
        f'font-size="0.026" fill="#999">vectorography · corpus: Google Fonts, OFL-1.1</text>'
        f'</svg>'
    )
