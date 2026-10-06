"""Sidebearings: the part of spacing the space cannot do for you.

The instrument has one slider called tightness, which moves every advance in
the alphabet together. That is a reading of the corpus and it is not spacing.
Spacing is per glyph, it is done by eye against strings the craft has used for
a century, and it is where a face stops being a set of drawings and starts
being something that sets text.

**It is an override rather than a move.** A glyph's advance is one of the
65,764 coordinates, so in principle spacing is a direction in the space; in
practice nudging one letter's sidebearing is not a journey and should not drag
the other hundred and sixty three along with it. So spacing is kept beside the
location, the way straightening is, and applied when the outlines are drawn and
when the font is compiled. The location stays a location.

What the space *can* do is check the work. Letters that begin with a stem
should carry the same left sidebearing as each other, and so should letters
that begin with a bowl; that is what the groups below are, and it is what a
designer is looking for when they set `nnoonn`. The instrument knows every
glyph's outline, so it can measure the group and say which letter is the odd
one, which is the tedious half of spacing and the half a machine should do.
"""

from __future__ import annotations

import numpy as np

# Which letters ought to agree with each other, by what their edge does.
# A subset rather than a scheme: these are the groups a Latin text face is
# spaced on, and a glyph in none of them is reported without a group rather
# than forced into one.
LEFT_GROUPS: dict[str, str] = {
    "stem": "bhiklmnpru",
    "round": "cdeoqg",
    "diagonal": "vwxyz",
    "cap stem": "BDEFHIKLMNPR",
    "cap round": "CGOQ",
    "cap diagonal": "AVWXYZ",
}
RIGHT_GROUPS: dict[str, str] = {
    "stem": "dhilmnu",
    "round": "bceopq",
    "diagonal": "vwxyz",
    "cap stem": "BDEHIKLMNOPR",
    "cap round": "CGOQ",
    "cap diagonal": "AVWXY",
}

# Below this a contour is a collapsed pad rather than part of the letter, and
# including it would put the ink edge at the glyph's centre.
MIN_AREA = 0.0006


def _area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return abs(0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))


def ink_bounds(contours) -> tuple[float, float] | None:
    """Where the ink of a glyph starts and stops across the line."""
    xs = [c[:, 0] for c in contours if _area(c) > MIN_AREA]
    if not xs:
        return None
    flat = np.concatenate(xs)
    return float(flat.min()), float(flat.max())


def group_of(ch: str, side: str) -> str | None:
    table = LEFT_GROUPS if side == "left" else RIGHT_GROUPS
    for name, members in table.items():
        if ch in members:
            return name
    return None


def apply(dec: dict, spacing: dict[str, list[float]] | None, glyphs) -> dict:
    """Shift and widen the decoded glyphs by the designer's sidebearings.

    `spacing` maps a character to [left, right] in ems, added to whatever the
    location already gives. A positive left moves the ink to the right and
    widens the glyph by the same amount, which is what adding a sidebearing
    means; the ink is not restretched, because spacing is not drawing.
    """
    if not spacing:
        return dec
    contours = [np.asarray(g, dtype=np.float64).copy() for g in dec["contours"]]
    advances = np.asarray(dec["advances"], dtype=np.float64).copy()
    for i, ch in enumerate(glyphs):
        pair = spacing.get(ch)
        if not pair:
            continue
        left = float(pair[0])
        right = float(pair[1]) if len(pair) > 1 else 0.0
        if left:
            contours[i][..., 0] += left
        advances[i] = max(0.0, advances[i] + left + right)
    return {"contours": contours, "advances": advances}


def report(dec: dict, glyphs, want, spacing=None) -> list[dict]:
    """Every wanted glyph's sidebearings, and what its group does.

    The group median is the whole of the check. A left sidebearing is not right
    or wrong on its own; it is right when it matches the other letters that
    begin the same way, and the distance from the group is the number a
    designer is actually hunting for in `nnoonn`.
    """
    idx = {ch: i for i, ch in enumerate(glyphs)}
    rows: list[dict] = []
    for ch in want:
        i = idx.get(ch)
        if i is None:
            continue
        b = ink_bounds(dec["contours"][i])
        adv = float(dec["advances"][i])
        if b is None:
            rows.append({"char": ch, "advance": round(adv, 4),
                         "left": None, "right": None, "blank": True})
            continue
        rows.append({
            "char": ch,
            "advance": round(adv, 4),
            "left": round(b[0], 4),
            "right": round(adv - b[1], 4),
            "set": list((spacing or {}).get(ch, [0.0, 0.0])),
            "left_group": group_of(ch, "left"),
            "right_group": group_of(ch, "right"),
        })

    # The medians are taken over every glyph in the group that the model draws,
    # not only over the ones on screen, so a short control string still gets
    # the whole group's opinion.
    for side, table in (("left", LEFT_GROUPS), ("right", RIGHT_GROUPS)):
        for name, members in table.items():
            vals = []
            for ch in members:
                i = idx.get(ch)
                if i is None:
                    continue
                b = ink_bounds(dec["contours"][i])
                if b is None:
                    continue
                vals.append(b[0] if side == "left"
                            else float(dec["advances"][i]) - b[1])
            if not vals:
                continue
            med = float(np.median(vals))
            for r in rows:
                if r.get(f"{side}_group") == name and r.get(side) is not None:
                    r[f"{side}_median"] = round(med, 4)
                    r[f"{side}_off"] = round(r[side] - med, 4)
    return rows
