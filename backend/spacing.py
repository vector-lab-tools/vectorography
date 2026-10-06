"""Sidebearings, set by formula, after Glyphs' metrics keys.

The instrument has one slider called tightness, which moves every advance in
the alphabet together. That is a reading of the corpus. Spacing is per glyph,
done by eye against strings the craft has used for a century, and it is where a
face stops being a set of drawings and starts being something that sets text.

**A sidebearing is a formula rather than a number.** Typing `=n` on the left of
`m` means *mine equals n's*, and it stays true when `n` moves. That is how
Glyphs does it, and the reason it is right is that a designer is not choosing a
number, they are declaring that two letters begin the same way. The number is a
consequence. Spacing groups, which this module tried first, invert that: they
have a machine guess the relationship and hand the designer a median to
disagree with.

What the space adds is the half nobody wants to do. A key has to be chosen,
and the corpus has an opinion: across a sample of real families, `m` and `n`
agree on their left sidebearing to within a unit or two, while `m` and `o` do
not. So the instrument can propose `=n`, say how steadily that held, and let
the designer accept it or write their own.

**Spacing is an override rather than a move.** An advance is one of the 65,764
coordinates, so in principle this is a direction in the space; in practice
nudging one letter is not a journey and should not drag the other hundred and
sixty three along with it. It is kept beside the location, the way
straightening is, and applied when the outlines are drawn and when the font is
compiled.

Values are in units of a thousandth of an em, which is what a designer types.
"""

from __future__ import annotations

import re

import numpy as np

# A contour smaller than this is a collapsed pad rather than part of the
# letter, and counting it would put the ink edge at the glyph's centre.
MIN_AREA = 0.0006

UNIT = 0.001            # one unit, in ems
MAX_DEPTH = 8           # a chain of keys longer than this is a mistake

# =n  =|n  =|  =n+10  =|n-5  and a bare number.
KEY = re.compile(r"^=\s*(\|?)\s*([^+\-\s]*)\s*([+-]\s*\d+(?:\.\d+)?)?$")


def _area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return abs(0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))


def ink_bounds(contours) -> tuple[float, float] | None:
    """Where a glyph's ink starts and stops across the line."""
    xs = [c[:, 0] for c in contours if _area(c) > MIN_AREA]
    if not xs:
        return None
    flat = np.concatenate(xs)
    return float(flat.min()), float(flat.max())


def natural(dec: dict, glyphs) -> dict[str, tuple[float, float, float]]:
    """Every glyph's own sidebearings before anything is set on it.

    (left, right, advance), in ems, as the location decodes them.
    """
    out: dict[str, tuple[float, float, float]] = {}
    for i, ch in enumerate(glyphs):
        b = ink_bounds(dec["contours"][i])
        adv = float(dec["advances"][i])
        if b is None:
            out[ch] = (0.0, 0.0, adv)
        else:
            out[ch] = (b[0], adv - b[1], adv)
    return out


def parse(value) -> tuple[str, str | None, bool, float] | None:
    """A written sidebearing as (kind, reference, mirrored, offset).

    kind is "set" for a plain number, in which case the rest is the value, or
    "key" for a formula. Anything unreadable comes back None, so a half-typed
    key leaves the glyph alone instead of moving it somewhere arbitrary.
    """
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return ("set", None, False, float(value))
    text = str(value).strip()
    if not text:
        return None
    if not text.startswith("="):
        try:
            return ("set", None, False, float(text))
        except ValueError:
            return None
    m = KEY.match(text)
    if not m:
        return None
    mirror, ref, offset = m.group(1) == "|", m.group(2), m.group(3)
    off = float(offset.replace(" ", "")) if offset else 0.0
    # `=|` on its own is the opposite side of this same glyph.
    return ("key", ref or None, mirror, off)


def resolve(dec: dict, glyphs, keys: dict | None) -> dict[str, tuple[float, float]]:
    """Each glyph's sidebearings after its keys are followed, in ems.

    A key may point at a glyph that has a key of its own, which is what makes
    the relationship hold through a change rather than at the moment it was
    typed. A cycle, or a chain too long to be meant, falls back to the glyph's
    own sidebearing instead of failing: a spacing table is edited by hand and
    will be wrong halfway through being right.
    """
    base = natural(dec, glyphs)
    keys = keys or {}
    solved: dict[tuple[str, str], float] = {}

    def side(ch: str, which: str, depth: int) -> float:
        hit = solved.get((ch, which))
        if hit is not None:
            return hit
        own = base.get(ch, (0.0, 0.0, 0.0))
        fallback = own[0] if which == "left" else own[1]
        if depth > MAX_DEPTH or ch not in base:
            return fallback
        spec = (keys.get(ch) or {}).get(which)
        p = parse(spec)
        if p is None:
            solved[(ch, which)] = fallback
            return fallback
        kind, ref, mirror, off = p
        if kind == "set":
            val = off * UNIT
        else:
            other = "right" if which == "left" else "left"
            # Mark it before recursing, so a cycle resolves to the glyph's own
            # sidebearing rather than running until the stack gives out.
            solved[(ch, which)] = fallback
            val = side(ref or ch, other if mirror else which, depth + 1) \
                + off * UNIT
        solved[(ch, which)] = val
        return val

    return {ch: (side(ch, "left", 0), side(ch, "right", 0)) for ch in base}


def apply(dec: dict, glyphs, keys: dict | None) -> dict:
    """Shift and widen the decoded glyphs onto their resolved sidebearings.

    The ink is moved, never restretched: spacing is not drawing.
    """
    if not keys:
        return dec
    base = natural(dec, glyphs)
    want = resolve(dec, glyphs, keys)
    contours = [np.asarray(g, dtype=np.float64).copy() for g in dec["contours"]]
    advances = np.asarray(dec["advances"], dtype=np.float64).copy()
    for i, ch in enumerate(glyphs):
        if ch not in keys:
            continue
        l0, r0, _ = base[ch]
        l1, r1 = want[ch]
        dl, dr = l1 - l0, r1 - r0
        if dl:
            contours[i][..., 0] += dl
        advances[i] = max(0.0, advances[i] + dl + dr)
    return {"contours": contours, "advances": advances}


def report(dec: dict, glyphs, want, keys=None) -> list[dict]:
    """What each wanted glyph is set to, and what it was written as."""
    base = natural(dec, glyphs)
    solved = resolve(dec, glyphs, keys)
    rows = []
    for ch in want:
        if ch not in base:
            continue
        l, r = solved[ch]
        l0, r0, adv0 = base[ch]
        written = (keys or {}).get(ch, {})
        rows.append({
            "char": ch,
            "left": round(l / UNIT),
            "right": round(r / UNIT),
            "advance": round((adv0 + (l - l0) + (r - r0)) / UNIT),
            "natural_left": round(l0 / UNIT),
            "natural_right": round(r0 / UNIT),
            "written_left": written.get("left", ""),
            "written_right": written.get("right", ""),
        })
    return rows


# How many real families to read when proposing a key. Each one is a full
# decode, so this is the cost; sixty is enough to tell a pair that agrees from
# a pair that does not, and is paid once.
SAMPLE = 60

_suggest_cache: dict[tuple, list] = {}


def suggest(s, chars, candidates=None, sample: int = SAMPLE) -> dict:
    """Which glyph each one should take its sidebearing from, by what real
    families do.

    A key has to be chosen, and the corpus has an opinion. Across a sample of
    families, `m` and `n` agree on their left sidebearing to within a unit or
    two whatever else changes, while `m` and `o` do not. Agreement is measured
    as the spread of the difference rather than its size: a pair that sits
    eight units apart in every family is a better key, written `=n+8`, than a
    pair that happens to coincide here and parts company two steps away.
    """
    from corpus.outlines import GLYPHS, decode_vector

    key = (s.model_id, tuple(sorted(chars)), sample)
    hit = _suggest_cache.get(key)
    if hit is not None:
        return hit

    # The families nearest the centroid, which is where the text faces are.
    # Spacing conventions are a property of text type and do not survive a
    # corpus that also holds blackletter, brush scripts and inline display.
    # Measured over a random sixty of the 441, `m` and `n` agree on their left
    # sidebearing to within 17.8 units; over the sixty nearest the middle, to
    # within 9.7, and `o` and `c` to within 4.1. The pair that should not hold,
    # `m` against `o`, stays the worst either way and keeps its 21-unit offset.
    far = np.linalg.norm(s.Z - s.centroid, axis=1)
    pick = np.argsort(far)[:min(sample, len(s.Z))]
    cands = list(candidates or "abcdefghijklmnopqrstuvwxyz"
                               "ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    wanted = sorted(set(list(chars) + cands))
    seen: dict[str, list[tuple[float, float]]] = {c: [] for c in wanted}
    for i in pick:
        dec = decode_vector(s.decode(s.Z[int(i)]))
        nat = natural(dec, GLYPHS)
        for c in wanted:
            if c in nat:
                seen[c].append((nat[c][0], nat[c][1]))

    out: dict[str, dict] = {}
    for ch in chars:
        mine = np.asarray(seen.get(ch) or [])
        if not len(mine):
            continue
        row: dict[str, list] = {}
        # A lowercase letter takes its key from another lowercase letter. The
        # spread does not know that `=D` on the right of `o` is not something
        # anybody would write, and the arithmetic will offer it.
        same_case = [c for c in cands
                     if c.isupper() == ch.isupper()] if ch.isalpha() else cands
        for which, col in (("left", 0), ("right", 1)):
            found = []
            for other in same_case:
                if other == ch:
                    continue
                theirs = np.asarray(seen.get(other) or [])
                if len(theirs) != len(mine):
                    continue
                d = (mine[:, col] - theirs[:, col]) / UNIT
                found.append((float(d.std()), float(np.median(d)), other))
            if not found:
                continue
            found.sort()
            # Three rather than one. Several letters often track a glyph about
            # equally well, and which of them a designer wants to name is a
            # judgement about what the letters have in common rather than
            # about which number came out a tenth of a unit lower.
            row[which] = [_offer(spread, offset, other)
                          for spread, offset, other in found[:3]]
        if row:
            out[ch] = row
    _suggest_cache[key] = out
    return out


def _offer(spread: float, offset: float, other: str) -> dict:
    off = round(offset)
    return {
        "key": f"={other}" + (f"{off:+d}" if off else ""),
        # How steadily the pair held across the sample, in units. The tight
        # pairs of the craft land near five, a working pair near ten, and a
        # pair that only coincides at this location is past twenty.
        "spread": round(spread, 1),
    }
