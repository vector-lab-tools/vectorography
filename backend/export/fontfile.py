"""
Compile positions in the space into real, installable font binaries.

Two flavours, for two jobs.

A **static OTF** is built for a single location, with cubic Bezier outlines
converted straight from the same Catmull-Rom construction the navigator draws on
screen. What you looked at is what you install: no requantisation, no second
approximation. This is the one to put in Font Book and set text in.

A **variable TTF** is built for a journey. Its masters must interpolate, so the
outlines are quadratic and every master carries the same glyphs, the same
contour counts and the same point counts, written directly into ``glyf`` rather
than through a pen. A pen drops duplicate consecutive points, and after rounding
adjacent resampled points collide in one master and not in another, which leaves
varLib with structurally incompatible masters and makes it silently drop glyphs.
"""

from __future__ import annotations

import io
import tempfile
from pathlib import Path

import numpy as np
from fontTools.designspaceLib import (AxisDescriptor, DesignSpaceDocument,
                                      InstanceDescriptor, SourceDescriptor)
from fontTools.fontBuilder import FontBuilder
from fontTools.otlLib.builder import buildStatTable
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib.tables import ttProgram
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
from fontTools.varLib import build as varlib_build

from corpus.outlines import GLYPHS, decode_vector

UPEM = 2048
AXIS_TAG = "JRNY"
AXIS_NAME = "Journey"
VENDOR = "VGPH"
# Named on every font that leaves: a location means nothing without the space
# it is a location in.
MODEL_ID = "VectorModel 0.1"
MIN_AREA = 0.0006          # em^2; below this a contour is a collapsed pad

DIGIT_NAMES = ["zero", "one", "two", "three", "four",
               "five", "six", "seven", "eight", "nine"]


def glyph_name(ch: str) -> str:
    return DIGIT_NAMES[int(ch)] if ch.isdigit() else ch


def _order() -> list[str]:
    return [".notdef", "space"] + [glyph_name(c) for c in GLYPHS]


def _area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return abs(0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)))


# --------------------------------------------------------------------- naming

def _names(family: str, style: str, version: str) -> dict:
    ps = f"{family.replace(' ', '')}-{style.replace(' ', '')}"
    return {
        "familyName": family,
        "styleName": style,
        "uniqueFontIdentifier": f"{family} {style}; Vectorography {version}",
        "fullName": f"{family} {style}",
        "psName": ps,
        "version": version,
        "copyright": (f"Outlines produced by traversal of {MODEL_ID} in "
                      "Vectorography. See corpus-manifest.json for the "
                      "families the space was fitted from."),
        "designer": "Traversed in Vectorography",
        "vendorURL": "https://github.com/vector-lab-tools/vectorography",
    }


def _setup_common(fb: FontBuilder, dec: dict, metrics: dict,
                  meta: dict, family: str, style: str, version: str) -> None:
    asc = int(round(meta.get("ascender", 0.8) * UPEM))
    desc = int(round(meta.get("descender", -0.2) * UPEM))

    def height_of(ch: str) -> int:
        c = dec["contours"][GLYPHS.index(ch)]
        live = [x for x in c if _area(x) > MIN_AREA]
        return int(round(float(max((x[:, 1].max() for x in live), default=0)) * UPEM))

    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=asc, descent=desc, lineGap=0)
    fb.setupNameTable(_names(family, style, version))
    fb.setupOS2(
        version=4,
        sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0,
        usWinAscent=asc, usWinDescent=abs(desc),
        sxHeight=height_of("x"), sCapHeight=height_of("H"),
        usWeightClass=400, usWidthClass=5,
        achVendID=VENDOR,
        fsType=0,                      # installable embedding
        fsSelection=(1 << 6),          # REGULAR
    )
    fb.setupPost(isFixedPitch=0)


# ----------------------------------------------------------------- static OTF

def build_otf(vec: np.ndarray, family: str, style: str = "Regular",
              meta: dict | None = None, version: str = "0.01") -> bytes:
    """One location as a static OTF, cubic outlines, matching the screen."""
    dec = decode_vector(np.asarray(vec, dtype=np.float32))
    meta = meta or {}

    fb = FontBuilder(UPEM, isTTF=False)
    fb.setupGlyphOrder(_order())
    fb.setupCharacterMap({0x20: "space",
                          **{ord(c): glyph_name(c) for c in GLYPHS}})

    charstrings, metrics = {}, {}
    pen = T2CharStringPen(UPEM // 2, None)
    pen.moveTo((0, 0)); pen.closePath()
    charstrings[".notdef"] = pen.getCharString()
    metrics[".notdef"] = (UPEM // 2, 0)

    sp = T2CharStringPen(int(0.3 * UPEM), None)
    charstrings["space"] = sp.getCharString()
    metrics["space"] = (int(0.3 * UPEM), 0)

    for i, ch in enumerate(GLYPHS):
        adv = max(int(round(float(dec["advances"][i]) * UPEM)), 1)
        pen = T2CharStringPen(adv, None)
        drawn = False
        for c in dec["contours"][i]:
            if _area(c) <= MIN_AREA:
                continue
            pts = c * UPEM
            n = len(pts)
            pen.moveTo(tuple(pts[0]))
            # Same Catmull-Rom construction the navigator renders with.
            for j in range(n):
                p0, p1 = pts[(j - 1) % n], pts[j]
                p2, p3 = pts[(j + 1) % n], pts[(j + 2) % n]
                pen.curveTo(tuple(p1 + (p2 - p0) / 6.0),
                            tuple(p2 - (p3 - p1) / 6.0), tuple(p2))
            pen.closePath()
            drawn = True
        if not drawn:
            pen.moveTo((0, 0)); pen.closePath()
        charstrings[glyph_name(ch)] = pen.getCharString()
        lsb = int(round(float(dec["contours"][i][..., 0].min()) * UPEM))
        metrics[glyph_name(ch)] = (adv, lsb)

    fb.setupCFF(_names(family, style, version)["psName"],
                {"FullName": f"{family} {style}"}, charstrings, {})
    _setup_common(fb, dec, metrics, meta, family, style, version)

    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


# ------------------------------------------------------ masters and variables

def _glyf_glyph(contours: np.ndarray) -> Glyph:
    """All contours, including collapsed pads, at a fixed point count.

    Every point is off-curve: TrueType then implies the on-curve midpoints, so a
    fixed count still yields a curve rather than a polygon, and every master has
    an identical structure.
    """
    pts, ends = [], []
    for c in contours:
        for x, y in c:
            pts.append((int(round(float(x) * UPEM)), int(round(float(y) * UPEM))))
        ends.append(len(pts) - 1)
    g = Glyph()
    g.numberOfContours = len(ends)
    g.coordinates = GlyphCoordinates(pts)
    g.endPtsOfContours = ends
    g.flags = np.zeros(len(pts), dtype=np.uint8)
    g.program = ttProgram.Program()
    g.program.fromBytecode(b"")
    return g


def _empty_glyph() -> Glyph:
    g = Glyph()
    g.numberOfContours = 0
    g.coordinates = GlyphCoordinates([])
    g.endPtsOfContours = []
    g.flags = np.zeros(0, dtype=np.uint8)
    g.program = ttProgram.Program()
    g.program.fromBytecode(b"")
    return g


def build_ttf(vec: np.ndarray, family: str, style: str = "Regular",
              meta: dict | None = None, version: str = "0.01") -> bytes:
    dec = decode_vector(np.asarray(vec, dtype=np.float32))
    meta = meta or {}

    fb = FontBuilder(UPEM, isTTF=True)
    fb.setupGlyphOrder(_order())
    fb.setupCharacterMap({0x20: "space",
                          **{ord(c): glyph_name(c) for c in GLYPHS}})

    glyphs, metrics = {}, {}
    glyphs[".notdef"] = _empty_glyph()
    metrics[".notdef"] = (UPEM // 2, 0)
    glyphs["space"] = _empty_glyph()
    metrics["space"] = (int(0.3 * UPEM), 0)

    for i, ch in enumerate(GLYPHS):
        contours = dec["contours"][i]
        glyphs[glyph_name(ch)] = _glyf_glyph(contours)
        adv = max(int(round(float(dec["advances"][i]) * UPEM)), 1)
        lsb = int(round(float(contours[..., 0].min()) * UPEM))
        metrics[glyph_name(ch)] = (adv, lsb)

    fb.setupGlyf(glyphs)
    _setup_common(fb, dec, metrics, meta, family, style, version)
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


def build_variable(vectors: list[np.ndarray], family: str,
                   meta: dict | None = None, version: str = "0.01"
                   ) -> tuple[bytes, str, list[tuple[str, bytes]]]:
    """A recorded path compiled into a variable font with one Journey axis.

    Named instances are declared for every stop so that the journey shows up as
    selectable styles rather than as a bare slider.
    """
    n = len(vectors)
    if n < 2:
        raise ValueError("a journey needs at least two locations")

    tmp = Path(tempfile.mkdtemp(prefix="vectorography-"))
    doc = DesignSpaceDocument()
    axis = AxisDescriptor()
    axis.name, axis.tag = AXIS_NAME, AXIS_TAG
    axis.minimum, axis.default, axis.maximum = 0, 0, 1000
    axis.map = []
    doc.addAxis(axis)

    masters, stops = [], []
    for i, vec in enumerate(vectors):
        loc = round(i * 1000 / (n - 1))
        style = f"Stop {i}"
        stops.append((loc, style))
        data = build_ttf(vec, family, style, meta, version)
        name = f"master-{i:02d}.ttf"
        (tmp / name).write_bytes(data)
        masters.append((name, data))

        src = SourceDescriptor()
        src.path = str(tmp / name)
        src.name = f"master.{i}"
        src.familyName, src.styleName = family, style
        src.location = {AXIS_NAME: loc}
        if i == 0:
            src.copyLib = src.copyInfo = src.copyGroups = src.copyFeatures = True
        doc.addSource(src)

        inst = InstanceDescriptor()
        inst.familyName, inst.styleName = family, style
        inst.postScriptFontName = f"{family.replace(' ', '')}-Stop{i}"
        inst.location = {AXIS_NAME: loc}
        doc.addInstance(inst)

    ds_path = tmp / "journey.designspace"
    doc.write(str(ds_path))
    vf, _, _ = varlib_build(str(ds_path))

    # A STAT with real axis values, so the stops are presented as styles.
    buildStatTable(vf, [{
        "tag": AXIS_TAG, "name": AXIS_NAME,
        "values": [{"value": loc, "name": style,
                    "flags": 0} for loc, style in stops],
    }])

    buf = io.BytesIO()
    vf.save(buf)
    return buf.getvalue(), ds_path.read_text(), masters
