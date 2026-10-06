"""Directions a designer names by pointing, rather than ones the corpus measures.

The eight named properties were measured off the outlines: weight, width,
contrast and the rest. They are the vocabulary of the craft, and they are not
the whole of what a designer sees. "More like that one" is the commonest thing
said in front of a rack of proofs, and until this existed the instrument had no
way to hear it.

The arithmetic is the simplest thing that can work, which is also the only
thing the data supports: the difference between the mean of the faces marked
*this* and the mean of the faces marked *not this*, normalised. The space is
whitened, so that difference is already in the units the compass travels in.

**It works, and it does not always work.** Fitting on four examples against
forty others and holding four back, measured on VectorModel 0.2:

    monospaced   held-out ranks 6, 10, 11, 7      of 441
    script       held-out ranks 285, 233, 23, 269 of 441

Monospaced generalises from four examples and surfaces families nobody marked.
Script does not: the top of that axis is the four training faces and a sibling
of one of them. Monospaced names a geometric regularity; script names a
cultural category, and brush, copperplate and casual scripts share a word
rather than a shape. A taste axis learns the first and memorises the second.

So nothing here returns an axis without the test that produced it. An axis that
fails the test is still usable and is a direction toward five particular faces,
which is a different thing from a property, and the caller is told which it has.
"""

from __future__ import annotations

import numpy as np

# Below this many marks on either side there is nothing to hold back, so the
# axis is returned unvalidated and labelled as such.
MIN_FOR_TEST = 6


def _mean_of(Z, idx) -> np.ndarray:
    return Z[idx].mean(axis=0)


def _direction(Z, liked, against) -> np.ndarray:
    d = _mean_of(Z, liked) - _mean_of(Z, against)
    n = float(np.linalg.norm(d))
    return d / n if n > 1e-12 else d


def fit(s, liked: list[int], against: list[int], folds: int = 3) -> dict:
    """An axis from faces pointed at, with the evidence for it.

    `liked` and `against` are indices into the corpus. The axis points from the
    second group toward the first, so travelling along it positively moves
    toward what was marked.
    """
    Z = np.asarray(s.Z, dtype=np.float64)
    liked = [i for i in dict.fromkeys(liked) if 0 <= i < len(Z)]
    against = [i for i in dict.fromkeys(against) if 0 <= i < len(Z)]
    if len(liked) < 2 or len(against) < 2:
        raise ValueError("mark at least two faces on each side")

    d = _direction(Z, liked, against)

    # How well the eight measured properties already account for it. A taste
    # axis that is mostly weight is weight, and the designer should be told
    # rather than given a second slider for it.
    named = list(s.directions.items())
    M = np.stack([np.asarray(v["vector"], dtype=np.float64)
                  / np.linalg.norm(v["vector"]) for _, v in named])
    coef, *_ = np.linalg.lstsq(M.T, d, rcond=None)
    explained = float(np.linalg.norm(M.T @ coef))
    closest = sorted(
        ((abs(float(d @ (np.asarray(v["vector"], dtype=np.float64)
                         / np.linalg.norm(v["vector"])))), k)
         for k, v in named), reverse=True)[:3]

    return {
        "vector": d.tolist(),
        "liked": liked,
        "against": against,
        # 0 when the axis is unlike anything already measured, 1 when the
        # eight can reproduce it exactly.
        "explained_by_named": round(explained, 3),
        "closest_named": [{"key": k, "cos": round(c, 3)} for c, k in closest],
        **held_out(s, liked, against, folds),
    }


def held_out(s, liked: list[int], against: list[int], folds: int = 3) -> dict:
    """Does the axis find faces it was not shown?

    The only question that separates a property from a list of favourites. A
    third of the marked faces are kept back, the axis is fitted on the rest,
    and the kept-back faces are looked for near the top of it. Repeated over
    every fold so one unlucky split does not decide it.
    """
    Z = np.asarray(s.Z, dtype=np.float64)
    n = len(Z)
    if len(liked) < MIN_FOR_TEST:
        return {"tested": False, "score": None, "folds": 0,
                "ranks": [], "top": max(10, len(liked) * 2)}

    top_n = max(10, len(liked) * 2)
    ranks: list[int] = []
    for f in range(folds):
        test = liked[f::folds]
        train = [i for i in liked if i not in set(test)]
        if len(train) < 2 or not test:
            continue
        d = _direction(Z, train, against)
        order = np.argsort(-(Z @ d))
        place = {int(v): r + 1 for r, v in enumerate(order)}
        ranks.extend(place[i] for i in test)

    if not ranks:
        return {"tested": False, "score": None, "folds": 0,
                "ranks": [], "top": top_n}

    found = sum(1 for r in ranks if r <= top_n)
    return {
        "tested": True,
        # The share of held-back faces the axis puts near its own top.
        "score": round(found / len(ranks), 3),
        "found": found,
        "of": len(ranks),
        "top": top_n,
        "ranks": sorted(ranks),
        "folds": folds,
        "corpus": n,
    }


def ranked(s, vector, k: int = 8) -> dict:
    """The faces at each end, which is how a designer checks an axis.

    A name is an argument about what the axis is. The faces are the evidence,
    and reading them is faster than reading the number.
    """
    Z = np.asarray(s.Z, dtype=np.float64)
    d = np.asarray(vector, dtype=np.float64)
    nrm = float(np.linalg.norm(d))
    if nrm > 1e-12:
        d = d / nrm
    proj = Z @ d
    order = np.argsort(proj)
    return {
        "minus": [{"family": s.names[int(i)], "at": round(float(proj[i]), 2)}
                  for i in order[:k]],
        "plus": [{"family": s.names[int(i)], "at": round(float(proj[i]), 2)}
                 for i in order[-k:][::-1]],
        "spread": round(float(proj.max() - proj.min()), 2),
    }
