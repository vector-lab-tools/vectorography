"""Turning a resampled outline back into something that looks drawn.

A contour arrives here as forty points at uniform arc length, and the obvious
thing to do with them, a closed Catmull-Rom through every one, was what the
navigator and the compiler both did. It has one fault, and it is the fault
that made traversed type look soft: every point is treated as a smooth point,
so a stem end, a serif bracket and the flat side of an I are all drawn as
curves. Nothing in the decoded outline is ever allowed to be a corner.

The turn angle at each point says which is which, and at this sampling it says
it clearly. Forty points around a circle turn nine degrees each, so anything
turning much more than that is a corner in the letter rather than the
curvature of a bowl, and anything turning almost nothing is a straight run.
Corners get their handles along the segments either side instead of across the
join, which is what keeps them sharp; straight runs are emitted as lines,
which is what stops a stem wobbling where the averaging left the points a
fraction off true.
"""

from __future__ import annotations

import numpy as np

# Measured off the corpus rather than guessed. Around a decoded O every point
# turns between six and sixteen degrees; around an H the corners turn sixty to
# ninety-nine and the stems turn under three. So a corner is anything past
# twenty-six degrees, which no bowl reaches, and a straight is anything under
# four and a half, which no bowl goes below.
CORNER = 0.45       # radians, about 26 degrees
STRAIGHT = 0.078    # radians, about 4.5 degrees


def _turns(pts: np.ndarray) -> np.ndarray:
    """The angle the outline turns through at each point."""
    prev = np.roll(pts, 1, axis=0)
    nxt = np.roll(pts, -1, axis=0)
    a = pts - prev
    b = nxt - pts
    na = np.hypot(a[:, 0], a[:, 1])
    nb = np.hypot(b[:, 0], b[:, 1])
    ok = (na > 1e-9) & (nb > 1e-9)
    cross = a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]
    dot = a[:, 0] * b[:, 0] + a[:, 1] * b[:, 1]
    out = np.zeros(len(pts))
    out[ok] = np.abs(np.arctan2(cross[ok], dot[ok]))
    return out


def segments(pts: np.ndarray):
    """The contour as a sequence of ("line", p) and ("curve", c1, c2, p).

    Emitted in drawing order, starting from the point after pts[0]; the caller
    does the initial move and the close.
    """
    n = len(pts)
    if n < 3:
        return []
    turn = _turns(pts)
    corner = turn > CORNER
    flat = turn < STRAIGHT

    out = []
    for i in range(n):
        p0, p1 = pts[(i - 1) % n], pts[i]
        p2, p3 = pts[(i + 1) % n], pts[(i + 2) % n]

        # A straight run between two points that are not turning: a line, which
        # is both what the letter does and what a designer would have drawn.
        if flat[i] and flat[(i + 1) % n]:
            out.append(("line", p2))
            continue

        # At a corner the handle runs along its own segment rather than across
        # the join, so the corner survives instead of being rounded away.
        c1 = p1 + (p2 - p1) / 3.0 if corner[i] else p1 + (p2 - p0) / 6.0
        c2 = p2 - (p2 - p1) / 3.0 if corner[(i + 1) % n] else p2 - (p3 - p1) / 6.0
        out.append(("curve", c1, c2, p2))
    return out


def straighten(pts: np.ndarray, amount: float) -> np.ndarray:
    """Pull the runs between corners onto the straight lines they nearly are.

    Corner detection sharpened the joins, but the stems between them still
    wander: the averaging that produced this outline leaves each point a
    fraction off true, and forty of those fractions read as softness. A run
    that deviates from its own chord by less than a hair was a straight line
    in every face that went into it, so it is made one.

    Amount is a distance in ems, and it is the whole of the control: a stem
    that wobbles by less than this is straightened, a bowl that departs from
    its chord by much more than this is left alone. At zero nothing happens.
    """
    if amount <= 0:
        return pts
    n = len(pts)
    if n < 6:
        return pts
    corner = _turns(pts) > CORNER
    marks = [i for i in range(n) if corner[i]]
    # No corners at all: a bowl, an o, a c. Nothing here is a straight run.
    if len(marks) < 2:
        return pts

    out = pts.copy()
    for k, a in enumerate(marks):
        b = marks[(k + 1) % len(marks)]
        span = (b - a) % n
        if span < 3:
            continue
        p, q = pts[a], pts[b]
        v = q - p
        L = float(np.hypot(v[0], v[1]))
        if L < 1e-9:
            continue
        run = [(a + j) % n for j in range(1, span)]
        dev = max(abs(float((pts[i][0] - p[0]) * v[1]
                            - (pts[i][1] - p[1]) * v[0])) / L for i in run)
        if dev > amount:
            continue
        # Evenly along the chord, which is where the points would have been
        # had the arc-length sampling had a straight line to walk along.
        for j, i in enumerate(run, start=1):
            out[i] = p + v * (j / span)
    return out
