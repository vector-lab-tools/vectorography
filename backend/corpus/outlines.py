"""
Glyph outlines as fixed-length vectors.

Every font in the corpus is reduced to a single style vector of identical
length, so that any two fonts can be mixed by arithmetic. The representation is
deliberately crude: each glyph is a fixed number of closed contours, each
contour resampled to a fixed number of points at uniform arc length, phase
aligned and wound consistently so that point *i* of a contour means roughly the
same place on the letter in every font. That alignment is what makes the space
walkable. Without it, averaging two fonts produces noise rather than a letter.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
N_CONTOURS = 3          # contours kept per glyph, by descending area
N_POINTS = 40           # resampled points per contour
CURVE_STEPS = 16        # subdivisions when flattening a cubic

DATA = Path(__file__).resolve().parents[1] / "data"
CACHE = DATA / "corpus.npz"

GLYPH_DIM = N_CONTOURS * N_POINTS * 2
FONT_DIM = len(GLYPHS) * GLYPH_DIM + len(GLYPHS)   # + one advance per glyph


class FlattenPen(BasePen):
    """Collect contours as dense polylines. Curves are sampled, not preserved:
    the representation resamples by arc length immediately afterwards."""

    def __init__(self, glyphSet):
        super().__init__(glyphSet)
        self.contours: list[list[tuple[float, float]]] = []
        self._cur: list[tuple[float, float]] = []

    def _moveTo(self, pt):
        self._flush()
        self._cur = [pt]

    def _lineTo(self, pt):
        self._cur.append(pt)

    def _curveToOne(self, p1, p2, p3):
        p0 = self._cur[-1]
        for i in range(1, CURVE_STEPS + 1):
            t = i / CURVE_STEPS
            mt = 1 - t
            x = (mt**3 * p0[0] + 3 * mt**2 * t * p1[0]
                 + 3 * mt * t**2 * p2[0] + t**3 * p3[0])
            y = (mt**3 * p0[1] + 3 * mt**2 * t * p1[1]
                 + 3 * mt * t**2 * p2[1] + t**3 * p3[1])
            self._cur.append((x, y))

    def _closePath(self):
        self._flush()

    def _endPath(self):
        self._flush()

    def _flush(self):
        if len(self._cur) >= 3:
            self.contours.append(self._cur)
        self._cur = []

    def done(self):
        self._flush()
        return self.contours


def _signed_area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def _resample(pts: np.ndarray, n: int) -> np.ndarray:
    """Uniform arc-length resampling of a closed polyline to n points."""
    closed = np.vstack([pts, pts[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = cum[-1]
    if total <= 0:
        return np.repeat(pts[:1], n, axis=0)
    targets = np.linspace(0.0, total, n, endpoint=False)
    x = np.interp(targets, cum, closed[:, 0])
    y = np.interp(targets, cum, closed[:, 1])
    return np.stack([x, y], axis=1)


def _align_phase(pts: np.ndarray) -> np.ndarray:
    """Rotate the sequence so index 0 is the topmost point (leftmost on ties).
    Gives point i the same approximate meaning across different fonts."""
    order = np.lexsort((pts[:, 0], -pts[:, 1]))
    return np.roll(pts, -int(order[0]), axis=0)


def _canonical(pts: np.ndarray, outer: bool) -> np.ndarray:
    """Consistent winding: outer contour positive, counters negative."""
    a = _signed_area(pts)
    if (a < 0) if outer else (a > 0):
        pts = pts[::-1]
    return _align_phase(pts)


def encode_font(path: Path) -> tuple[np.ndarray, dict] | None:
    """Return (style vector, metadata) or None if the font is unusable."""
    try:
        font = TTFont(str(path), lazy=True)
        upem = font["head"].unitsPerEm or 1000
        cmap = font.getBestCmap()
        glyphset = font.getGlyphSet()
        hmtx = font["hmtx"]
    except Exception:  # noqa: BLE001
        return None

    glyph_block = np.zeros((len(GLYPHS), N_CONTOURS, N_POINTS, 2), dtype=np.float32)
    advances = np.zeros(len(GLYPHS), dtype=np.float32)

    for gi, ch in enumerate(GLYPHS):
        name = cmap.get(ord(ch))
        if name is None:
            return None
        try:
            pen = FlattenPen(glyphset)
            glyphset[name].draw(pen)
            contours = [np.asarray(c, dtype=np.float64) for c in pen.done()]
            advances[gi] = hmtx[name][0] / upem
        except Exception:  # noqa: BLE001
            return None
        if not contours:
            return None

        contours.sort(key=lambda c: abs(_signed_area(c)), reverse=True)
        contours = contours[:N_CONTOURS]
        kept = [_canonical(_resample(c, N_POINTS), outer=(i == 0))
                for i, c in enumerate(contours)]

        # Pad missing contours with a degenerate point at the glyph's centre, so
        # that a one-counter letter can still interpolate against a two-counter
        # one. The pad opens into a small blob mid-interpolation, which is the
        # honest visual signal that the two letters are not the same shape.
        centre = kept[0].mean(axis=0)
        while len(kept) < N_CONTOURS:
            kept.append(np.repeat(centre[None, :], N_POINTS, axis=0))

        glyph_block[gi] = np.stack(kept) / upem

    vec = np.concatenate([glyph_block.reshape(-1), advances]).astype(np.float32)
    if not np.all(np.isfinite(vec)):
        return None

    meta = {
        "upem": int(upem),
        "ascender": float(font["hhea"].ascender) / upem,
        "descender": float(font["hhea"].descender) / upem,
    }
    font.close()
    return vec, meta


def decode_vector(vec: np.ndarray) -> dict:
    """Inverse of encode_font's layout: back to per-glyph contours."""
    n = len(GLYPHS)
    body = vec[: n * GLYPH_DIM].reshape(n, N_CONTOURS, N_POINTS, 2)
    advances = vec[n * GLYPH_DIM:]
    return {"contours": body, "advances": advances}


def align_corpus(X: np.ndarray, iters: int = 3) -> np.ndarray:
    """Put the points of every contour into correspondence across the corpus.

    Starting each contour at its topmost point is not enough. On a flat-topped
    letter like H the topmost point is ambiguous and lands somewhere different
    in every font, so the same outline arrives at the model under an arbitrary
    cyclic rotation and averaging smears it. Here each contour is instead
    rotated to whichever of its P offsets best matches a running mean, two or
    three passes, which is a cyclic Procrustes fit. This is the single change
    that decides whether the space is walkable.
    """
    n = X.shape[0]
    ng = len(GLYPHS)
    body = X[:, : ng * GLYPH_DIM].reshape(n, ng, N_CONTOURS, N_POINTS, 2).copy()

    for _ in range(iters):
        ref = body.mean(axis=0)                       # (ng, K, P, 2)
        for g in range(ng):
            for k in range(N_CONTOURS):
                block = body[:, g, k]                 # (n, P, 2)
                # Degenerate pads carry no phase; leave them alone.
                live = np.ptp(block.reshape(n, -1), axis=1) > 1e-6
                if not live.any():
                    continue
                rots = np.stack([np.roll(block, -r, axis=1)
                                 for r in range(N_POINTS)])       # (P, n, P, 2)
                d = ((rots - ref[g, k]) ** 2).sum(axis=(2, 3))    # (P, n)
                best = np.argmin(d, axis=0)                       # (n,)
                best[~live] = 0
                body[:, g, k] = rots[best, np.arange(n)]

    out = X.copy()
    out[:, : ng * GLYPH_DIM] = body.reshape(n, -1)
    return out


def build_corpus(font_dir: Path | None = None, limit: int | None = None) -> dict:
    font_dir = font_dir or (DATA / "fonts")
    paths = sorted(font_dir.glob("*.ttf"))
    if limit:
        paths = paths[:limit]

    vecs, names, metas = [], [], []
    for i, p in enumerate(paths):
        res = encode_font(p)
        if res is None:
            continue
        vec, meta = res
        vecs.append(vec)
        names.append(p.stem)
        metas.append(meta)
        if (i + 1) % 50 == 0:
            print(f"  encoded {len(vecs)}/{i + 1}")

    X = np.stack(vecs)
    print("  aligning contours across the corpus")
    X = align_corpus(X)
    np.savez_compressed(CACHE, X=X, names=np.array(names),
                        metas=np.array([json.dumps(m) for m in metas]))
    print(f"corpus: {X.shape[0]} fonts x {X.shape[1]} dims -> {CACHE}")
    return {"X": X, "names": names, "metas": metas}


if __name__ == "__main__":
    build_corpus()
