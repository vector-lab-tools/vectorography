"""Source formats, as against compiled ones.

An OTF is something a designer installs. A UFO is something they open, and it
is what every editor in the field reads: Glyphs, RoboFont, FontLab, FontForge.
Shipping only compiled fonts would mean a journey could be used but not worked
on, which for a design instrument is the wrong half.

A designspace with UFO masters is the standard source of a variable font, and
it is the shape this instrument already has: the journey is the axis, and each
stop is a master on it.
"""
from __future__ import annotations

import plistlib
import zipfile
from datetime import datetime, timezone

import numpy as np
from fontTools.ufoLib.filenames import userNameToFileName
from fontTools.ufoLib.glifLib import writeGlyphToString

from corpus.outlines import GLYPHS, decode_vector
from export.fontfile import (LICENCES, MIN_AREA, UPEM, _area, glyph_name)
from render import contour_path

CREATOR = "tools.vectorography"


class _Glyph:
    """The little the glif writer asks of a glyph: its width and its codepoint."""

    def __init__(self, width: float, unicodes: list[int]):
        self.width = width
        self.unicodes = unicodes


def _points_of(contours) -> list[list[tuple[float, float, str | None]]]:
    """Contours as glif points.

    The same Catmull-Rom construction the navigator draws with and the OTF
    compiles from, so the source and the binary describe one curve rather than
    two approximations of it. Each segment contributes two off-curve points and
    the on-curve point they arrive at.
    """
    out = []
    for c in contours:
        if _area(c) <= MIN_AREA:
            continue
        pts = np.asarray(c, dtype=np.float64) * UPEM
        n = len(pts)
        run: list[tuple[float, float, str | None]] = []
        for i in range(n):
            p0, p1 = pts[(i - 1) % n], pts[i]
            p2, p3 = pts[(i + 1) % n], pts[(i + 2) % n]
            c1 = p1 + (p2 - p0) / 6.0
            c2 = p2 - (p3 - p1) / 6.0
            # Python floats, not numpy scalars: the glif writer strings the
            # value it is given, and a numpy scalar strings as its repr.
            run.append((float(c1[0]), float(c1[1]), None))
            run.append((float(c2[0]), float(c2[1]), None))
            run.append((float(p2[0]), float(p2[1]), "curve"))
        out.append(run)
    return out


def _draw_points(contours):
    pts = _points_of(contours)

    def draw(pen):
        for run in pts:
            pen.beginPath()
            for x, y, seg in run:
                pen.addPoint((round(x, 2), round(y, 2)), segmentType=seg)
            pen.endPath()
    return draw


def _fontinfo(meta: dict, dec: dict, family: str, style: str,
              licence: str, author: str) -> dict:
    def height_of(ch: str) -> float:
        c = dec["contours"][GLYPHS.index(ch)]
        live = [x for x in c if _area(x) > MIN_AREA]
        return round(float(max((x[:, 1].max() for x in live), default=0)) * UPEM)

    name, url = LICENCES.get(licence, ("", ""))
    info = {
        "familyName": family,
        "styleName": style,
        "unitsPerEm": UPEM,
        "ascender": int(round(float(meta.get("ascender", 0.8)) * UPEM)),
        "descender": int(round(float(meta.get("descender", -0.2)) * UPEM)),
        "xHeight": int(height_of("x")),
        "capHeight": int(height_of("H")),
        "italicAngle": 0,
        "openTypeOS2Type": [],   # fsType 0: installable
        "note": "Produced by traversal of a fitted vector space in "
                "Vectorography. The outlines are resampled at uniform arc "
                "length, forty points per contour, which is what makes them "
                "interpolable; they are not drawn the way a hand would draw "
                "them and will want a curve fit before close editing.",
    }
    if author:
        info["copyright"] = f"Copyright {author}"
        info["openTypeNameDesigner"] = author
    if name:
        info["openTypeNameLicense"] = name
    if url:
        info["openTypeNameLicenseURL"] = url
    return info


def ufo_files(vec: np.ndarray, family: str, style: str = "Regular",
              meta: dict | None = None, licence: str = "none",
              author: str = "") -> dict[str, bytes]:
    """One location as the files of a UFO 3 package, keyed by relative path."""
    dec = decode_vector(np.asarray(vec, dtype=np.float32))
    meta = meta or {}
    files: dict[str, bytes] = {}
    contents: dict[str, str] = {}
    order: list[str] = []
    taken: set[str] = set()

    for i, ch in enumerate(GLYPHS):
        gname = glyph_name(ch)
        adv = max(int(round(float(dec["advances"][i]) * UPEM)), 1)
        glif = writeGlyphToString(
            gname, _Glyph(adv, [ord(ch)]),
            _draw_points(dec["contours"][i]), formatVersion=2)
        # UFO's own naming rule, not an approximation of it. Most filesystems
        # are case-insensitive, so eacute and Eacute are one file unless the
        # capitals are marked; written by hand the accented capitals landed on
        # top of their lowercase and the glyph came back wrong.
        fname = userNameToFileName(gname, taken, suffix=".glif")
        taken.add(fname.lower())
        contents[gname] = fname
        order.append(gname)
        files[f"glyphs/{fname}"] = glif.encode("utf-8")

    files["glyphs/contents.plist"] = plistlib.dumps(contents)
    files["metainfo.plist"] = plistlib.dumps(
        {"creator": CREATOR, "formatVersion": 3})
    files["fontinfo.plist"] = plistlib.dumps(
        _fontinfo(meta, dec, family, style, licence, author))
    files["lib.plist"] = plistlib.dumps({"public.glyphOrder": order})
    files["layercontents.plist"] = plistlib.dumps([["public.default", "glyphs"]])
    return files


def _designspace(family: str, masters: list[tuple[str, float]]) -> str:
    """The journey as one axis, with a source per stop.

    Written out rather than assembled through designspaceLib because the
    sources are UFOs that do not exist on disk yet.
    """
    lo, hi = 0, 1000
    src = "\n".join(
        f'    <source filename="{fn}" name="{family} Stop {i}" '
        f'familyname="{family}" stylename="Stop {i}">\n'
        f'      <location><dimension name="Journey" xvalue="{v:.1f}"/></location>\n'
        f'    </source>'
        for i, (fn, v) in enumerate(masters))
    inst = "\n".join(
        f'    <instance familyname="{family}" stylename="Stop {i}" '
        f'filename="instances/{family.replace(" ", "")}-Stop{i}.ufo">\n'
        f'      <location><dimension name="Journey" xvalue="{v:.1f}"/></location>\n'
        f'    </instance>'
        for i, (_, v) in enumerate(masters))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<designspace format="4.1">
  <axes>
    <axis tag="JRNY" name="Journey" minimum="{lo}" maximum="{hi}"
          default="{lo}"/>
  </axes>
  <sources>
{src}
  </sources>
  <instances>
{inst}
  </instances>
</designspace>
"""


def ufo_zip(vectors: list[np.ndarray], family: str,
            meta: dict | None = None, licence: str = "none",
            author: str = "", version: str = "0.01") -> bytes:
    """A zip: one UFO per stop, and the designspace that binds them.

    With one vector it is a single UFO and no designspace, since a journey of
    one place is not a journey.
    """
    safe = family.replace(" ", "") or "Vectorography"
    buf = __import__("io").BytesIO()
    masters: list[tuple[str, float]] = []

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, vec in enumerate(vectors):
            style = "Regular" if len(vectors) == 1 else f"Stop {i}"
            name = (f"{safe}.ufo" if len(vectors) == 1
                    else f"{safe}-Stop{i}.ufo")
            for path, data in ufo_files(
                    vec, family, style, meta, licence, author).items():
                zf.writestr(f"{name}/{path}", data)
            v = 0.0 if len(vectors) == 1 else 1000 * i / (len(vectors) - 1)
            masters.append((name, v))

        if len(vectors) > 1:
            zf.writestr(f"{safe}.designspace", _designspace(family, masters))

        lic_name, lic_url = LICENCES.get(licence, ("", ""))
        if lic_name:
            who = f"Copyright {author}\n\n" if author else ""
            zf.writestr("LICENSE.txt",
                        f"{family}\n\n{who}Released under the {lic_name}.\n"
                        + (f"{lic_url}\n" if lic_url else ""))
        zf.writestr("README.txt", _readme(family, safe, len(vectors), version))
    return buf.getvalue()


def _readme(family: str, safe: str, n: int, version: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if n == 1:
        what = (f"  {safe}.ufo        the source. Open it in Glyphs, RoboFont,\n"
                f"                    FontLab or FontForge.\n")
    else:
        what = (f"  {safe}.designspace  open this one. It declares a single\n"
                f"                    Journey axis and names every stop on it.\n"
                f"  {safe}-Stop*.ufo   one master per stop, in order.\n")
    return (
        f"{family}\n{'=' * len(family)}\n\n"
        f"Source for a journey through a fitted vector space, written by "
        f"Vectorography {version} on {stamp}.\n\n"
        f"{what}\n"
        "The outlines are resampled at uniform arc length, forty points per\n"
        "contour, in cyclic correspondence across every stop. That is what\n"
        "lets any two stops interpolate. It also means the points are not\n"
        "placed where a designer would have placed them: expect to run a\n"
        "curve fit before editing by hand.\n\n"
        "UFO 3 format. The outlines are a linear transformation of a fitted\n"
        "space rather than a copy of any face; the terms above are yours.\n")
