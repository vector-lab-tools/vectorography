"""
Compile positions in the space into real font binaries.

Every master is built from the same fixed structure: the same glyphs, the same
number of contours, the same number of points per contour, in the same order.
That is a property of the representation rather than something repaired
afterwards, so any set of sampled locations is interpolation compatible and
varLib can build a variable font from them without further work.

Contours are emitted as closed all-off-curve quadratic B-splines, the standard
TrueType idiom. It keeps the point count identical across masters while still
producing a curve rather than a polygon.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
from fontTools.designspaceLib import (AxisDescriptor, DesignSpaceDocument,
                                      SourceDescriptor)
from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
from fontTools.ttLib.tables import ttProgram
from fontTools.varLib import build as varlib_build

from corpus.outlines import GLYPHS, decode_vector

UPEM = 2048
AXIS_TAG = "JRNY"

DIGIT_NAMES = ["zero", "one", "two", "three", "four",
               "five", "six", "seven", "eight", "nine"]


def glyph_name(ch: str) -> str:
    if ch.isdigit():
        return DIGIT_NAMES[int(ch)]
    return ch


def _glyph(contours: np.ndarray) -> Glyph:
    """Build the glyf entry directly rather than through a pen.

    A pen drops duplicate consecutive points, and after rounding to integer
    units adjacent resampled points collide in one master and not in another,
    so masters that should have matched point for point come out with different
    counts and varLib drops the glyph. Writing the contours here keeps every
    master at exactly N_CONTOURS x N_POINTS, including collapsed pads, which is
    what makes any set of sampled locations interpolation compatible.

    All points are off-curve: TrueType then implies the on-curve midpoints, so
    a fixed point count still yields a curve rather than a polygon.
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
    g.flags = np.zeros(len(pts), dtype=np.uint8)   # 0 = off-curve
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


def build_master(vec: np.ndarray, family: str, style: str,
                 meta: dict | None = None) -> "FontBuilder":
    dec = decode_vector(np.asarray(vec, dtype=np.float32))
    meta = meta or {}
    asc = int(round(meta.get("ascender", 0.8) * UPEM))
    desc = int(round(meta.get("descender", -0.2) * UPEM))

    names = [".notdef", "space"] + [glyph_name(c) for c in GLYPHS]
    fb = FontBuilder(UPEM, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({0x20: "space",
                          **{ord(c): glyph_name(c) for c in GLYPHS}})

    glyphs, metrics = {}, {}
    glyphs[".notdef"] = _empty_glyph()
    metrics[".notdef"] = (UPEM // 2, 0)
    glyphs["space"] = _empty_glyph()
    metrics["space"] = (int(0.3 * UPEM), 0)

    for i, ch in enumerate(GLYPHS):
        contours = dec["contours"][i]
        glyphs[glyph_name(ch)] = _glyph(contours)
        adv = max(int(round(float(dec["advances"][i]) * UPEM)), 1)
        lsb = int(round(float(contours[..., 0].min()) * UPEM))
        metrics[glyph_name(ch)] = (adv, lsb)

    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=asc, descent=desc)
    fb.setupNameTable({
        "familyName": family,
        "styleName": style,
        "psName": f"{family.replace(' ', '')}-{style.replace(' ', '')}",
        "copyright": ("Outlines derived from OFL-1.1 licensed Google Fonts "
                      "families by traversal in Vectorography."),
    })
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, usWinAscent=asc,
                usWinDescent=abs(desc))
    fb.setupPost()
    return fb


def build_static(vec, family, style, meta=None) -> bytes:
    fb = build_master(vec, family, style, meta)
    import io
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue()


def build_variable(vectors: list[np.ndarray], family: str,
                   meta: dict | None = None) -> tuple[bytes, str, list[tuple[str, bytes]]]:
    """Compile a recorded path into a variable font with a single Journey axis.

    Returns (variable font bytes, designspace XML, [(master name, bytes)]).
    """
    n = len(vectors)
    if n < 2:
        raise ValueError("a journey needs at least two locations")

    tmp = Path(tempfile.mkdtemp(prefix="vectorography-"))
    doc = DesignSpaceDocument()
    axis = AxisDescriptor()
    axis.name = "Journey"
    axis.tag = AXIS_TAG
    axis.minimum, axis.default, axis.maximum = 0, 0, 1000
    axis.map = []
    doc.addAxis(axis)

    masters = []
    for i, vec in enumerate(vectors):
        loc = round(i * 1000 / (n - 1))
        style = f"Stop {i}"
        data = build_static(vec, family, style, meta)
        name = f"master-{i:02d}.ttf"
        (tmp / name).write_bytes(data)
        masters.append((name, data))

        src = SourceDescriptor()
        src.path = str(tmp / name)
        src.name = f"master.{i}"
        src.familyName = family
        src.styleName = style
        src.location = {"Journey": loc}
        if i == 0:
            src.copyLib = src.copyInfo = src.copyGroups = src.copyFeatures = True
        doc.addSource(src)

    ds_path = tmp / "journey.designspace"
    doc.write(str(ds_path))
    vf, _, _ = varlib_build(str(ds_path))

    import io
    buf = io.BytesIO()
    vf.save(buf)
    return buf.getvalue(), ds_path.read_text(), masters
