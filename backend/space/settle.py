"""Holding letters still while the rest of the alphabet moves.

A designer settles the `n` and the `o` first and works outward from them, and
until this existed the instrument had no way to express that: every control
moved all 164 glyphs at once, so twenty minutes in the traveller had seen a
great deal and decided nothing.

Holding a glyph *exactly* still is not available, and the reason is worth
stating before the approximation is introduced. One glyph occupies 401
coordinates, five contours of forty points in two axes plus its advance, and
the space has 128 dimensions to move in. A move that leaves 401 numbers exactly
where they are generically leaves no move at all.

So a settled glyph is held by projection rather than by decree. Assemble the
rows of the decode belonging to the settled coordinates, take the singular
value decomposition, and keep the directions whose singular values are small:
those are the moves that disturb the settled letters least. Each one has a
disturbance attached, measured against the worst direction, so the tolerance is
a dial the designer turns rather than a constant somebody picked.

What falls out is a number worth watching. Settling `n` leaves 83 of 128
dimensions moving it by under one per cent of the worst case; settling nine
glyphs leaves 20; settling the whole lowercase leaves 1. The count falling
over a session is the design narrowing, reported as it happens.
"""

from __future__ import annotations

import numpy as np

from corpus.outlines import GLYPHS, GLYPH_DIM

# How many settled sets to keep the decomposition for. The set changes when a
# designer settles a letter, which is a handful of times in a session, and the
# decomposition of a 128 by m matrix is not free.
CACHE = 24

# Tolerances the readout reports at. A direction counts as free at a tolerance
# when it disturbs the settled glyphs by less than that fraction of what the
# worst direction would.
TOLERANCES = (0.10, 0.03, 0.01)

_cache: dict[tuple, tuple] = {}


def columns(glyphs) -> np.ndarray:
    """The coordinates belonging to these glyphs: outlines, then advances."""
    n = len(GLYPHS)
    idx: list[int] = []
    for ch in glyphs:
        g = GLYPHS.index(ch)
        idx.extend(range(g * GLYPH_DIM, (g + 1) * GLYPH_DIM))
        idx.append(n * GLYPH_DIM + g)
    return np.asarray(idx, dtype=np.int64)


def _decompose(s, glyphs: tuple[str, ...]):
    """Directions in the space, ordered by how much they disturb `glyphs`.

    Returns the right-singular directions as rows, most disturbing first, and
    their disturbances relative to the worst.
    """
    key = (s.model_id, glyphs)
    hit = _cache.get(key)
    if hit is not None:
        return hit

    # A step of delta in the whitened coordinates the instrument travels in
    # changes the outline vector by (delta * scale) @ components, so the scale
    # belongs inside the map rather than beside it.
    A = (s.scale[:, None] * s.components)[:, columns(glyphs)]
    U, sv, _ = np.linalg.svd(A, full_matrices=False)
    worst = float(sv[0]) if len(sv) else 1.0
    rel = sv / worst if worst > 0 else np.zeros_like(sv)

    # U's columns are the directions in the space; rows are wanted.
    out = (np.ascontiguousarray(U.T), rel.astype(np.float64))
    if len(_cache) >= CACHE:
        _cache.pop(next(iter(_cache)))
    _cache[key] = out
    return out


def free_basis(s, glyphs, tol: float = 0.01) -> np.ndarray | None:
    """An orthonormal basis, as rows, of the moves `glyphs` barely feel.

    None when nothing is settled, which the callers read as "no constraint"
    rather than as "no freedom".
    """
    glyphs = tuple(sorted(set(glyphs)))
    if not glyphs:
        return None
    dirs, rel = _decompose(s, glyphs)
    keep = dirs[rel < tol]
    # A basis of nothing is a real answer: everything has been decided, and the
    # caller should report that rather than move anyway.
    return np.ascontiguousarray(keep)


def project(s, d: np.ndarray, glyphs, tol: float = 0.01) -> np.ndarray:
    """`d` with the part that would move the settled glyphs taken out.

    The length of the result says how much of the wanted direction survived,
    which is what makes resistance near a fully settled alphabet something the
    hand meets rather than something a label reports.
    """
    B = free_basis(s, glyphs, tol)
    if B is None:
        return d
    if not len(B):
        return np.zeros_like(d)
    return (d @ B.T) @ B


def freedom(s, glyphs, tolerances=TOLERANCES) -> dict:
    """How much room is left after what has been settled."""
    glyphs = tuple(sorted(set(glyphs)))
    dims = int(s.dims)
    if not glyphs:
        return {"settled": [], "dims": dims,
                "free": {f"{t}": dims for t in tolerances}}
    _, rel = _decompose(s, glyphs)
    return {
        "settled": list(glyphs),
        "dims": dims,
        "free": {f"{t}": int((rel < t).sum()) for t in tolerances},
    }


def drift_of(s, z0, z1, glyphs) -> dict:
    """How far the settled glyphs actually moved, in ems.

    Settling is an approximation and the instrument should be willing to say
    by how much rather than assert that nothing happened.
    """
    glyphs = tuple(sorted(set(glyphs)))
    if not glyphs:
        return {}
    cols = columns(glyphs)
    a = s.decode(z0)[cols]
    b = s.decode(z1)[cols]
    out = {}
    n = len(GLYPHS)
    for i, ch in enumerate(glyphs):
        g = GLYPHS.index(ch)
        lo, hi = g * GLYPH_DIM, (g + 1) * GLYPH_DIM
        sel = (cols >= lo) & (cols < hi)
        d = (b[sel] - a[sel]).reshape(-1, 2)
        out[ch] = float(np.abs(np.hypot(d[:, 0], d[:, 1])).max())
    return out


def hold(s, z0, z1, glyphs, tol: float = 0.01) -> np.ndarray:
    """`z1` pulled back onto the moves the settled glyphs barely feel.

    Every control the instrument has ends by proposing somewhere to be, so the
    constraint is applied to the step rather than to each primitive: walk,
    drift, repel, steer, orbit and a dragged specimen all arrive here.
    """
    z0 = np.asarray(z0, dtype=np.float64)
    z1 = np.asarray(z1, dtype=np.float64)
    glyphs = tuple(sorted(set(glyphs)))
    if not glyphs:
        return z1
    return z0 + project(s, z1 - z0, glyphs, tol)
