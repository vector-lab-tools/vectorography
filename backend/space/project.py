"""Running the space backwards: where is this drawing, and what is left over.

Everything else in the instrument starts from a location and produces letters.
This starts from letters somebody drew and produces a location, which is the
direction a designer actually works in. Two things come back from it.

The **location** is the best account the space can give of the drawing, and
from it the other glyphs follow: a designer who has drawn `n` and `o` gets the
remaining 162 as a proposal, which is the laborious part of the job and the
part where consistency matters.

The **residual** is the part of the drawing the space cannot reach, reported
per glyph in ems. It is the more interesting half. The altitude meter says how
far a traveller has gone from the average of the corpus; this says what the
corpus has no vocabulary for in something drawn outside it. A large residual on
a careful drawing is the component critique made into a number rather than
conceded in prose.

The fit is ordinary least squares, because the decode is linear and nothing
more is warranted: x = mean + (z * scale) @ components, so asking which z best
explains a set of coordinates is asking lstsq for the answer.
"""

from __future__ import annotations

import numpy as np

from corpus.outlines import (GLYPH_DIM, GLYPHS, N_CONTOURS, N_POINTS,
                             decode_vector)
from .settle import columns

# How heavily the corpus is believed when the drawing is quiet. Chosen by
# held-out measurement rather than by taste: across Georgia, Verdana, Courier
# New and Apple Chancery, fitting on eight letters and predicting ten others,
# 0.01 was the best or equal-best of eight values spanning four orders of
# magnitude.
PRIOR = 0.01


def align_to(vec: np.ndarray, mean: np.ndarray) -> np.ndarray:
    """Rotate each contour onto the corpus's correspondence.

    `align_corpus` puts the corpus into cyclic correspondence against a running
    mean of itself. A font arriving later cannot join that fit without changing
    it, and must not: the model's coordinates are fixed, and refitting the
    correspondence would move every family already in it. So the new drawing is
    rotated against the fitted mean, which is the same procedure with the
    reference held still.

    Without this a flat-topped letter arrives under an arbitrary rotation, its
    points land on the wrong parts of the reference, and the residual measures
    the phase error rather than the drawing.
    """
    ng = len(GLYPHS)
    body = vec[: ng * GLYPH_DIM].reshape(ng, N_CONTOURS, N_POINTS, 2).copy()
    ref = mean[: ng * GLYPH_DIM].reshape(ng, N_CONTOURS, N_POINTS, 2)

    for g in range(ng):
        for k in range(N_CONTOURS):
            c = body[g, k]
            # A degenerate pad carries no phase, so there is nothing to rotate.
            if float(np.ptp(c)) <= 1e-6:
                continue
            rots = np.stack([np.roll(c, -r, axis=0) for r in range(N_POINTS)])
            d = ((rots - ref[g, k]) ** 2).sum(axis=(1, 2))
            body[g, k] = rots[int(np.argmin(d))]

    out = vec.copy()
    out[: ng * GLYPH_DIM] = body.reshape(-1)
    return out


def fit(s, vec: np.ndarray, glyphs=None, align: bool = True,
        prior: float = PRIOR) -> dict:
    """The location that best explains `vec`, and what it fails to explain.

    `glyphs` narrows the fit to the letters actually drawn, which is the usual
    case: a designer has `n` and `o` and wants the rest proposed.

    **Plain least squares does not work here, and the reason is the same fact
    settling rests on.** Two glyphs pin 802 coordinates against 128 unknowns,
    which looks over-determined and is not: most of those directions barely
    touch `n` and `o` at all, so the fit is free to send them anywhere, and it
    does. Measured against held-out letters, an unregularised fit on `n` and
    `o` predicts the rest of the alphabet *worse* than assuming the corpus
    average, by 41% for Georgia and by 228% for Courier New.

    So the corpus is used as a prior. Whitening already made it the unit
    Gaussian, which is what makes the ridge term exactly a prior rather than a
    fudge: minimising the drawing's error plus `prior` times the squared
    distance from the centroid is the maximum a posteriori location given the
    corpus and the drawing.

    The dial is worth having rather than hiding. A small prior is faithful to
    what was drawn and wild about everything else; a large one pulls the answer
    to the average of Google Fonts. The pull toward the mean that the rest of
    the instrument exists to resist is here as a number the designer sets.
    """
    vec = np.asarray(vec, dtype=np.float64).reshape(-1)
    if vec.shape[0] != s.mean.shape[0]:
        raise ValueError(f"expected {s.mean.shape[0]} coordinates, "
                         f"got {vec.shape[0]}")
    if align:
        vec = align_to(vec, np.asarray(s.mean, dtype=np.float64))

    chars = tuple(glyphs) if glyphs else tuple(GLYPHS)
    cols = columns(chars)
    mean = np.asarray(s.mean, dtype=np.float64)

    A = (s.scale[:, None] * s.components)[:, cols].astype(np.float64)   # (k, m)
    b = vec[cols] - mean[cols]                                          # (m,)

    # Through the decomposition rather than through a solve, because the
    # singular values are also the answer to "how much did the drawing
    # actually constrain", which is reported below.
    U, sv, Vt = np.linalg.svd(A.T, full_matrices=False)
    z = Vt.T @ ((sv / (sv ** 2 + prior)) * (U.T @ b))
    resid = A.T @ z - b

    base = float(np.linalg.norm(b))
    left = float(np.linalg.norm(resid))

    # How many directions the drawing had anything to say about. The rest were
    # answered by the prior, which is to say by the corpus.
    constrained = int((sv ** 2 / (sv ** 2 + prior) > 0.5).sum())

    return {
        "z": z.tolist(),
        "glyphs": list(chars),
        "prior": prior,
        "explained": 1.0 - (left / base if base > 0 else 0.0),
        "residual": _per_glyph(resid, cols, chars),
        "residual_overall": _rms_em(resid),
        "constrained": constrained,
        "dims": int(s.dims),
        "distance": float(np.linalg.norm(z)),
    }


def skill(s, vec: np.ndarray, fitted, against, prior: float = PRIOR) -> dict:
    """Whether fitting on `fitted` beats assuming the corpus average.

    The question a completion has to answer. Predicting the letters that were
    drawn is no achievement; predicting the ones that were not is the whole
    claim, and it is measured against the one baseline that cannot be argued
    with, which is the centroid.
    """
    vec = np.asarray(vec, dtype=np.float64).reshape(-1)
    cols = columns(against)
    f = fit(s, vec, fitted, align=False, prior=prior)
    got = s.decode(np.asarray(f["z"])).astype(np.float64)[cols]
    flat = s.decode(np.zeros(s.dims)).astype(np.float64)[cols]
    err = _rms_em(got - vec[cols])
    nil = _rms_em(flat - vec[cols])
    return {"error": err, "baseline": nil,
            "skill": 1.0 - (err / nil if nil > 0 else 0.0)}


def _rms_em(r: np.ndarray) -> float:
    return float(np.sqrt(float((r ** 2).mean()))) if len(r) else 0.0


def _per_glyph(resid: np.ndarray, cols: np.ndarray, chars) -> dict:
    """Residual per letter, in ems, so the offenders can be named.

    Reported as a root mean square over the glyph's own coordinates, which is a
    distance on the page rather than a share of anything.
    """
    ng = len(GLYPHS)
    out: dict[str, float] = {}
    for ch in chars:
        g = GLYPHS.index(ch)
        lo, hi = g * GLYPH_DIM, (g + 1) * GLYPH_DIM
        sel = (cols >= lo) & (cols < hi)
        out[ch] = round(_rms_em(resid[sel]), 6)
    return out


def drawn_glyphs(vec: np.ndarray, floor: float = 1e-4) -> list[str]:
    """Which letters a drawing actually contains.

    A work in progress has most of the character set missing, and encoding
    leaves those flat. Fitting on a flat letter would drag the location toward
    whatever the space makes of nothing.
    """
    got = decode_vector(np.asarray(vec, dtype=np.float32))
    body = got["contours"]
    out = []
    for i, ch in enumerate(GLYPHS):
        if float(np.ptp(body[i, 0])) > floor:
            out.append(ch)
    return out
