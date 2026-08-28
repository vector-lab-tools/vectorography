"""
Named directions: measured axes to travel along.

The space's own axes are corpus eigendirections. They carry most of the
variance but they are not the things a designer asks for, and nobody wants to
be told that "axis 3" is what makes a letter heavier.

So each named direction here is built the other way round. A property is
*measured* directly off the outlines of every font in the corpus (ink coverage,
sidebearing, stem modulation at the ends of a stem, and so on), the corpus is
sorted by that measurement, and the direction is the vector from the mean
position of the bottom decile to the mean of the top. Travelling along it moves
you the way the corpus itself varies in that property.

This puts declared axes and learned axes side by side in one instrument, which
is the comparison worth having: the compass turns in a plane of eigendirections,
while these buttons move along properties somebody can name and measure.
"""

from __future__ import annotations

import numpy as np

from corpus.outlines import GLYPHS, N_CONTOURS, N_POINTS, GLYPH_DIM

LOWER = "abcdefghijklmnopqrstuvwxyz"


def _unpack(X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = X.shape[0]
    ng = len(GLYPHS)
    body = X[:, : ng * GLYPH_DIM].reshape(n, ng, N_CONTOURS, N_POINTS, 2)
    adv = X[:, ng * GLYPH_DIM:]
    return body, adv


def _signed_area(c: np.ndarray) -> np.ndarray:
    """Signed area per contour, vectorised over leading axes."""
    x, y = c[..., 0], c[..., 1]
    return 0.5 * np.sum(x * np.roll(y, -1, axis=-1)
                        - np.roll(x, -1, axis=-1) * y, axis=-1)


def _gi(ch: str) -> int:
    return GLYPHS.index(ch)


def _band(c: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Mask of points whose y lies in a band of the contour's own height."""
    ymin = c[..., 1].min(axis=-1, keepdims=True)
    ymax = c[..., 1].max(axis=-1, keepdims=True)
    t = (c[..., 1] - ymin) / np.maximum(ymax - ymin, 1e-6)
    return (t >= lo) & (t <= hi)


def _width_in_band(c: np.ndarray, lo: float, hi: float) -> np.ndarray:
    m = _band(c, lo, hi)
    hi_x = np.where(m, c[..., 0], -np.inf).max(axis=-1)
    lo_x = np.where(m, c[..., 0], np.inf).min(axis=-1)
    w = hi_x - lo_x
    return np.where(np.isfinite(w), w, 0.0)


def _robust(v: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Clip to a sane range and send anything degenerate to the median.

    These are ratios of small distances, and a collapsed counter or a hairline
    stem drives one to six figures. An outlier does not just look wrong, it
    decides which fonts land in the decile that defines the direction.
    """
    v = np.nan_to_num(v, nan=np.nan, posinf=np.nan, neginf=np.nan)
    ok = np.isfinite(v) & (v > lo) & (v < hi)
    if not ok.any():
        return np.zeros_like(v)
    med = float(np.median(v[ok]))
    out = np.where(ok, v, med)
    q1, q99 = np.percentile(out, [1, 99])
    return np.clip(out, q1, q99)


def measure(X: np.ndarray) -> dict[str, np.ndarray]:
    """Per-font scalars, measured off the outlines. One entry per named axis."""
    body, adv = _unpack(X)
    n = body.shape[0]
    lower = [_gi(c) for c in LOWER]
    out: dict[str, np.ndarray] = {}

    # Net ink: outer contours positive, counters negative, so the sum is area.
    ink = _signed_area(body[:, lower]).sum(axis=-1)          # (n, 26)
    xh = body[:, _gi("x"), 0][..., 1].max(axis=-1)           # x-height
    cap = body[:, _gi("H"), 0][..., 1].max(axis=-1)

    # weight: ink per unit of the box the letter occupies
    box = np.maximum(adv[:, lower] * xh[:, None], 1e-6)
    out["weight"] = (ink / box).mean(axis=1)

    # width: how wide the letters are set
    out["width"] = adv[:, lower].mean(axis=1)

    # tightness: whitespace either side of the ink, so higher means looser
    ink_w = (body[:, lower, 0][..., 0].max(axis=-1)
             - body[:, lower, 0][..., 0].min(axis=-1))
    out["tightness"] = -(adv[:, lower] - ink_w).mean(axis=1)

    # x-height relative to the capitals
    out["x-height"] = xh / np.maximum(cap, 1e-6)

    # contrast: thickness of the vertical stroke of o against its horizontal.
    # Only meaningful where o actually has a counter to measure against.
    o_out, o_in = body[:, _gi("o"), 0], body[:, _gi("o"), 1]
    left = o_in[..., 0].min(axis=-1) - o_out[..., 0].min(axis=-1)
    top = o_out[..., 1].max(axis=-1) - o_in[..., 1].max(axis=-1)
    counter = np.abs(_signed_area(o_in))
    ratio = np.where(counter > 1e-4, left / np.maximum(top, 1e-4), np.nan)
    out["contrast"] = _robust(ratio, 0.05, 20.0)

    # serif: an I flares at the ends of the stem and a sans does not
    I = body[:, _gi("I"), 0]
    ends = 0.5 * (_width_in_band(I, 0.0, 0.12) + _width_in_band(I, 0.88, 1.0))
    mid = _width_in_band(I, 0.4, 0.6)
    ratio = np.where(mid > 1e-3, ends / np.maximum(mid, 1e-3), np.nan)
    out["serif"] = _robust(ratio, 0.5, 8.0)

    # straightness: how much of the outline is actually straight. Every closed
    # contour turns through the same total angle, so the thing that separates a
    # square from a circle is not how much it turns but where: a square holds
    # still and then turns hard. This counts the fraction of the outline that
    # is holding still.
    sel = body[:, [_gi(c) for c in "onusOSCDG"], 0]
    d = np.roll(sel, -1, axis=-2) - sel
    ang = np.arctan2(d[..., 1], d[..., 0])
    turn = np.abs(np.angle(np.exp(1j * (np.roll(ang, -1, axis=-1) - ang))))
    flat = (turn < np.radians(4.0)).mean(axis=-1)
    out["straightness"] = flat.mean(axis=-1)

    # slant: how far the stem of l leans off vertical
    l = body[:, _gi("l"), 0]
    top_m, bot_m = _band(l, 0.85, 1.0), _band(l, 0.0, 0.15)
    xt = (np.where(top_m, l[..., 0], 0.0).sum(axis=-1)
          / np.maximum(top_m.sum(axis=-1), 1))
    xb = (np.where(bot_m, l[..., 0], 0.0).sum(axis=-1)
          / np.maximum(bot_m.sum(axis=-1), 1))
    h = np.maximum(l[..., 1].max(axis=-1) - l[..., 1].min(axis=-1), 1e-6)
    out["slant"] = (xt - xb) / h

    for k, v in out.items():
        out[k] = _robust(np.asarray(v, dtype=np.float64), -1e6, 1e6)
    assert all(v.shape == (n,) for v in out.values())
    return out


# Label, and what the two ends of the measurement are called in a designer's
# vocabulary rather than the measurement's.
LABELS: dict[str, tuple[str, str, str]] = {
    "weight":       ("Weight", "thinner", "fatter"),
    "width":        ("Width", "narrower", "wider"),
    "tightness":    ("Spacing", "tighter", "looser"),
    "x-height":     ("x-height", "smaller", "larger"),
    "contrast":     ("Contrast", "flatter", "sharper"),
    "serif":        ("Serif", "sans", "serif"),
    "straightness": ("Shape", "rounder", "straighter"),
    "slant":        ("Slant", "backslant", "italic"),
}


def percentiles(X: np.ndarray) -> dict[str, list[float]]:
    """Each font's rank on each measure, 0..1. Small enough to ship in the model,
    which is the point: colouring the map needs the measurements, and a clone
    only has the fitted space."""
    out = {}
    for key, v in measure(X).items():
        order = np.argsort(np.argsort(v))
        out[key] = (order / max(len(v) - 1, 1)).astype(float).tolist()
    return out


def build(Z: np.ndarray, X: np.ndarray, decile: float = 0.15) -> dict[str, dict]:
    """Direction per measurement: bottom decile mean to top decile mean."""
    scores = measure(X)
    n = Z.shape[0]
    k = max(int(n * decile), 5)
    dirs = {}
    for key, s in scores.items():
        order = np.argsort(s)
        lo, hi = Z[order[:k]].mean(axis=0), Z[order[-k:]].mean(axis=0)
        v = hi - lo
        norm = float(np.linalg.norm(v))
        if norm < 1e-9:
            continue
        label, minus, plus = LABELS[key]
        unit = v / norm
        # Where the corpus sits along this direction, so a control can show a
        # position on it rather than only offer a step along it.
        proj = Z @ unit
        dirs[key] = {
            "key": key, "label": label, "minus": minus, "plus": plus,
            "vector": unit.tolist(),
            "lo": float(np.quantile(proj, 0.02)),
            "hi": float(np.quantile(proj, 0.98)),
            "min": float(proj.min()), "max": float(proj.max()),
            # How much of this direction the whole corpus spans, in the same
            # whitened units the compass radius uses, so a step can be sized.
            "spread": float(np.linalg.norm(hi - lo)),
        }
    return dirs
