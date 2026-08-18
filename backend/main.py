"""Vectorography backend: the server owns the space, the client owns the journey."""

from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from corpus.outlines import CACHE, GLYPHS, build_corpus
from render import decode_to_glyphs, specimen_sheet_svg
from space.style_space import (MODEL, MODEL_NAME, MODEL_VERSION,
                               StyleSpace)

# One source of version, at the repository root. Everything else inherits it.
VERSION = (Path(__file__).resolve().parents[1] / "VERSION").read_text().strip()

app = FastAPI(title="Vectorography", version=VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

_space: StyleSpace | None = None


def space() -> StyleSpace:
    global _space
    if _space is None:
        if not MODEL.exists():
            if os.environ.get("VERCEL"):
                raise HTTPException(500, "no fitted space in the deployment: "
                                    "commit backend/data/vectormodel-*.npz")
            if not CACHE.exists():
                build_corpus()
            d = np.load(CACHE, allow_pickle=False)
            s = StyleSpace.fit(d["X"], d["names"].tolist(),
                               [json.loads(m) for m in d["metas"]])
            s.save()
            _space = s
        else:
            _space = StyleSpace.load()
    return _space


def _glyph_subset(vec: np.ndarray, text: str) -> list[dict]:
    want = {c for c in text if c in set(GLYPHS)}
    return [g for g in decode_to_glyphs(vec) if g["char"] in want]


class Z(BaseModel):
    z: list[float]


class LocationReq(Z):
    text: str = "Hamburgefonstiv"
    full: bool = False


class CompassReq(Z):
    text: str = "ag"
    radius: float = 0.6
    axis_a: int = 0
    axis_b: int = 1
    ride: list[float] | None = None


class TravelReq(Z):
    mode: str
    bearing: float | None = None
    radius: float = 0.6
    axis_a: int = 0
    axis_b: int = 1
    ride: list[float] | None = None
    temperature: float = 0.5
    step: float = 0.5
    direction: str | None = None
    sign: float = 1.0
    amount: float | None = None
    target_x: float | None = None
    target_y: float | None = None
    centre: list[float] | None = None
    angle: float = 20.0
    seed: int | None = None


class JourneyReq(BaseModel):
    trail: list[list[float]]
    family: str = "Journey"
    masters: int = Field(5, ge=2, le=12)


def _height_of(s, t, mode: str) -> float:
    if mode == "centroid":
        top = float(np.linalg.norm(s.Z - s.centroid, axis=1).max()) or 1.0
        return float(np.linalg.norm(t - s.centroid)) / top
    ref = np.sort(s._corpus_density)
    return float(np.searchsorted(ref, s.log_density(t))) / max(len(ref) - 1, 1)


def _sample_trail(trail: list[list[float]], n: int) -> np.ndarray:
    """Sample the recorded path at uniform arc length."""
    t = np.asarray(trail, dtype=np.float64)
    seg = np.linalg.norm(np.diff(t, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    if cum[-1] <= 0:
        raise HTTPException(400, "journey has zero length")
    targets = np.linspace(0, cum[-1], n)
    return np.stack([np.interp(targets, cum, t[:, d])
                     for d in range(t.shape[1])], axis=1)


class FontReq(Z):
    family: str = "Vectorography"
    style: str = "Regular"
    format: str = "otf"


@app.get("/api/corpus")
def corpus_info():
    s = space()
    return {
        "families": s.names,
        "count": len(s.names),
        "dims": s.dims,
        "explained_variance": s.evr,
        "glyphs": GLYPHS,
        "version": VERSION,
        "model": {"name": MODEL_NAME, "version": MODEL_VERSION,
                  "kind": "whitened principal subspace",
                  "id": f"{MODEL_NAME} {MODEL_VERSION}"},
        "licence": "OFL-1.1 (Google Fonts, ofl/ tree only)",
        "centroid_distances": s._centroid_dists.tolist(),
        "centroid_max": float(s._centroid_dists.max()),
    }


@app.get("/api/fontfile/{name}")
def font_file(name: str):
    """The corpus family's own file, for setting its name in its own typeface.

    Deliberately the real font rather than the space's reconstruction: a label
    naming a family should show that family, not this instrument's lossy
    account of it. Absent in a fresh clone, where the corpus was never
    downloaded, so callers fall back to a plain face.
    """
    if not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "bad name")
    path = Path(__file__).parent / "data" / "fonts" / f"{name}.ttf"
    if not path.exists():
        raise HTTPException(404, "not in the local corpus cache")
    return Response(path.read_bytes(), media_type="font/ttf",
                    headers={"Cache-Control": "public, max-age=604800"})


@app.get("/api/directions")
def directions():
    """Measured named axes: properties read off the outlines, not eigendirections."""
    s = space()
    return {"directions": [
        {k: v for k, v in d.items() if k != "vector"}
        for d in s.directions.values()]}


@app.post("/api/location")
def location(req: LocationReq):
    s = space()
    vec = s.decode(req.z)
    glyphs = decode_to_glyphs(vec) if req.full else _glyph_subset(vec, req.text)
    return {
        "glyphs": glyphs,
        "altitude": s.altitude(req.z),
        "neighbours": s.neighbours(req.z, k=5),
    }


@app.post("/api/compass")
def compass(req: CompassReq):
    s = space()
    pts = s.compass(req.z, req.radius, req.axis_a, req.axis_b, req.ride)
    for p in pts:
        p["glyphs"] = _glyph_subset(s.decode(p["z"]), req.text)
        p["altitude"] = {"density_percentile":
                         s.altitude(p["z"])["density_percentile"]}
    return {"points": pts}


class AtlasReq(Z):
    text: str = "a"
    axis_a: int = 0
    axis_b: int = 1
    ride: list[float] | None = None
    sprites: int = Field(14, ge=0, le=40)
    height: str = "density"
    colour_by: str = "serif"
    trail: list[list[float]] = []


@app.post("/api/atlas")
def atlas(req: AtlasReq):
    """The corpus as a chart you can stand in.

    Both horizontal axes are the plane the compass turns in, so what is drawn
    is the surface actually being steered on rather than some other projection
    of the space. Coordinates are absolute, with the corpus centroid at the
    origin, so the map stays still while you move across it.
    """
    s = space()
    u, v = s.heading_basis(req.axis_a, req.axis_b,
                           np.asarray(req.ride) if req.ride else None)
    z = np.asarray(req.z, dtype=np.float64)

    xs = s.Z @ u
    ys = s.Z @ v
    # Height arrives already normalised to 0..1. Raw log density has a long
    # tail, so plotting it directly makes the corpus a spike with everything
    # bunched at the bottom; the percentile spreads the same ordering evenly.
    if req.height == "centroid":
        raw = np.linalg.norm(s.Z - s.centroid, axis=1)
        top = float(raw.max()) or 1.0
        hs = raw / top
        self_h = float(np.linalg.norm(z - s.centroid)) / top
    else:
        ref = np.sort(s._corpus_density)
        hs = np.searchsorted(ref, s._corpus_density) / max(len(ref) - 1, 1)
        self_h = float(np.searchsorted(ref, s.log_density(z))) / max(len(ref) - 1, 1)

    d = np.linalg.norm(s.Z - z, axis=1)

    # Which fonts get drawn as letterforms rather than dots. Picking the
    # nearest in the full space piles them all on one spot: near the centroid
    # the closest neighbours share almost the same plane coordinates, and
    # fourteen typefaces stack into one smudge. So the plane is divided into
    # cells and each contributes its closest font, which spreads the labels
    # across the map the way a map wants them, nearest cells first.
    sprites = {}
    if req.sprites:
        span = max(float(np.ptp(xs)), float(np.ptp(ys)), 1e-6)
        cell = span / 7.0
        gx = np.floor((xs - xs.min()) / cell).astype(int)
        gy = np.floor((ys - ys.min()) / cell).astype(int)
        best: dict[tuple[int, int], int] = {}
        for i in range(len(s.names)):
            key = (int(gx[i]), int(gy[i]))
            if key not in best or d[i] < d[best[key]]:
                best[key] = i
        chosen = sorted(best.values(), key=lambda i: d[i])[: req.sprites]
        for i in chosen:
            sprites[int(i)] = _glyph_subset(s.decode(s.Z[i]), req.text)

    from space.directions import LABELS
    cs = s.scores.get(req.colour_by)
    legend = LABELS.get(req.colour_by)

    return {
        "colour": ({"key": req.colour_by, "label": legend[0],
                    "low": legend[1], "high": legend[2]} if legend else None),
        "axes": {"x": req.axis_a + 1, "y": req.axis_b + 1,
                 "x_evr": s.evr[req.axis_a], "y_evr": s.evr[req.axis_b],
                 "height": req.height,
                 "ride": req.ride is not None},
        "points": [{"i": i, "name": s.names[i], "x": float(xs[i]),
                    "y": float(ys[i]), "h": float(hs[i]), "d": float(d[i]),
                    "c": (float(cs[i]) if cs else 0.5)}
                   for i in range(len(s.names))],
        "sprites": sprites,
        "self": {"x": float(z @ u), "y": float(z @ v), "h": self_h,
                 "glyphs": _glyph_subset(s.decode(z), req.text)},
        "trail": [{"x": float(np.asarray(t) @ u), "y": float(np.asarray(t) @ v),
                   "h": _height_of(s, np.asarray(t), req.height)}
                  for t in req.trail],
        "range": {"h_min": float(min(hs.min(), self_h)),
                  "h_max": float(max(hs.max(), self_h))},
    }


@app.post("/api/travel")
def travel(req: TravelReq):
    s = space()
    z = np.asarray(req.z, dtype=np.float64)
    if req.mode == "walk":
        if req.bearing is None:
            raise HTTPException(400, "walk needs a bearing")
        u, v = s.heading_basis(req.axis_a, req.axis_b,
                               np.asarray(req.ride) if req.ride else None)
        th = np.radians(req.bearing)
        nz = z + req.radius * (np.cos(th) * u + np.sin(th) * v)
    elif req.mode == "drift":
        rng = np.random.default_rng(req.seed)
        nz = np.asarray(s.drift(z, req.temperature, rng))
    elif req.mode == "repel":
        nz = np.asarray(s.repel(z, req.step))
    elif req.mode == "toward":
        if req.target_x is None or req.target_y is None:
            raise HTTPException(400, "toward needs a target")
        u, v = s.heading_basis(req.axis_a, req.axis_b,
                               np.asarray(req.ride) if req.ride else None)
        nz = np.asarray(s.toward(z, req.target_x, req.target_y, u, v, req.amount))
    elif req.mode == "steer":
        if not req.direction:
            raise HTTPException(400, "steer needs a direction")
        try:
            nz = np.asarray(s.steer(z, req.direction, req.sign, req.amount))
        except KeyError:
            raise HTTPException(404, f"no direction {req.direction!r}") from None
    elif req.mode == "orbit":
        if req.centre is None:
            raise HTTPException(400, "orbit needs a centre")
        nz = np.asarray(s.orbit(z, req.centre, req.angle, req.axis_b))
    else:
        raise HTTPException(400, f"unknown mode {req.mode!r}")
    return {"z": nz.tolist(), "altitude": s.altitude(nz)}


@app.get("/api/font/{name}")
def font_position(name: str):
    s = space()
    if name not in s.names:
        raise HTTPException(404, f"{name} not in corpus")
    return {"z": s.font_position(name).tolist()}


@app.post("/api/export/svg")
def export_svg(req: LocationReq):
    s = space()
    vec = s.decode(req.z)
    svg = specimen_sheet_svg(decode_to_glyphs(vec), {
        "altitude": s.altitude(req.z),
        "neighbours": s.neighbours(req.z, k=5),
    })
    return Response(svg, media_type="image/svg+xml", headers={
        "Content-Disposition": "attachment; filename=vectorography-specimen.svg"})


@app.post("/api/export/font")
def export_font(req: FontReq):
    """The current location as one installable typeface."""
    from export.fontfile import build_otf, build_ttf

    s = space()
    vec = s.decode(req.z)
    fmt = req.format.lower()
    if fmt not in ("otf", "ttf"):
        raise HTTPException(400, "format must be otf or ttf")
    build = build_otf if fmt == "otf" else build_ttf
    data = build(vec, req.family, req.style, s.metas[0], VERSION)
    safe = req.family.replace(" ", "") or "Vectorography"
    return Response(data, media_type="font/" + fmt, headers={
        "Content-Disposition": f"attachment; filename={safe}-{req.style}.{fmt}"})


@app.post("/api/preview/journey")
def preview_journey(req: JourneyReq):
    """The journey compiled to a variable font, returned bare.

    The same compilation the export runs, so what is tested in the app is the
    artefact that leaves it, not a rendering that resembles it.
    """
    from export.fontfile import build_variable

    s = space()
    if len(req.trail) < 2:
        raise HTTPException(400, "a journey needs at least two locations")
    zs = _sample_trail(req.trail, req.masters)
    try:
        vf, _, _ = build_variable([s.decode(z) for z in zs], req.family,
                                  s.metas[0], VERSION)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"font build failed: {exc}") from exc
    return Response(vf, media_type="font/ttf")


def _specimen_html(family: str, stops: list[str]) -> str:
    """A tester that opens straight from the unzipped folder, no setup."""
    faces = "\n".join(
        f'@font-face{{font-family:"VGStop{i}";'
        f'src:url("instances/{n}") format("opentype");}}'
        for i, n in enumerate(stops))
    blocks = "\n".join(
        f'<div class="l">Stop {i}</div>'
        f'<div class="s" style=\'font-family:"VGStop{i}"\'>'
        f'Hamburgefonstiv 0123456789</div>'
        f'<div class="p" style=\'font-family:"VGStop{i}"\'>'
        f'The quick brown fox jumps over the lazy dog. '
        f'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz</div>'
        for i in range(len(stops)))
    return f"""<!doctype html>
<meta charset="utf-8"><title>{family} \u00b7 specimen</title>
<style>
{faces}
@font-face{{font-family:"VGVar";src:url("{family.replace(' ', '')}-VF.ttf")
  format("truetype-variations");font-weight:1 1000;}}
body{{background:#faf8f4;color:#1a1a1a;margin:0;padding:40px;
  font-family:ui-monospace,Menlo,monospace;}}
h1{{font:400 22px Georgia,serif;margin:0 0 4px}}
.sub{{font-size:11px;color:#777;margin-bottom:28px}}
.l{{font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:#7c2d36;margin:26px 0 6px}}
.s{{font-size:54px;line-height:1.2}}
.p{{font-size:17px;line-height:1.5;margin-top:8px;color:#333}}
.slider{{width:100%;max-width:640px;accent-color:#7c2d36}}
hr{{border:0;border-top:1px solid #e6e0d4;margin:34px 0}}
</style>
<h1>{family}</h1>
<div class="sub">A journey through VectorModel, compiled. Corpus: Google Fonts,
OFL-1.1. Open this file in a browser; nothing needs installing.</div>

<div class="l">The variable font, across its journey axis</div>
<input class="slider" type="range" min="0" max="1000" value="0"
  oninput="v.style.fontVariationSettings=`'JRNY' ${{this.value}}`;
           out.textContent=this.value">
<span id="out" style="font-size:11px;color:#777">0</span>
<div id="v" class="s" style="font-family:VGVar">Hamburgefonstiv 0123456789</div>
<hr>
<div class="l">The stops, as static OTFs</div>
{blocks}
"""


@app.post("/api/export/journey")
def export_journey(req: JourneyReq):
    from export.fontfile import build_otf, build_variable

    s = space()
    if len(req.trail) < 2:
        raise HTTPException(400, "journey needs at least two locations")

    zs = _sample_trail(req.trail, req.masters)
    meta = s.metas[0]
    vectors = [s.decode(z) for z in zs]
    try:
        vf, ds_xml, masters = build_variable(vectors, req.family, meta, VERSION)
        instances = [
            (f"{req.family.replace(' ', '')}-Stop{i}.otf",
             build_otf(v, req.family, f"Stop {i}", meta, VERSION))
            for i, v in enumerate(vectors)]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"font build failed: {exc}") from exc

    journey = {
        "format": "vectorography-journey/1",
        "family": req.family,
        "vectorography_version": VERSION,
        "space": {"model": MODEL_NAME, "model_version": MODEL_VERSION,
                  "kind": "whitened principal subspace", "dims": s.dims,
                  "corpus": "google-fonts-ofl", "corpus_size": len(s.names)},
        "trail": req.trail,
        "masters": [{"file": n, "t": i / (len(masters) - 1)}
                    for i, (n, _) in enumerate(masters)],
        "licence_note": ("Derived from OFL-1.1 Google Fonts families; "
                         "see corpus-manifest.json"),
    }

    safe = req.family.replace(" ", "") or "Journey"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{safe}-VF.ttf", vf)
        for name, data in instances:
            zf.writestr(f"instances/{name}", data)
        for name, data in masters:
            zf.writestr(f"masters/{name}", data)
        zf.writestr("specimen.html",
                    _specimen_html(req.family, [n for n, _ in instances]))
        zf.writestr("journey.designspace", ds_xml)
        zf.writestr("journey.json", json.dumps(journey, indent=2))
        zf.writestr("README.txt", (
            f"{req.family}\n"
            f"{'=' * len(req.family)}\n\n"
            f"A journey through {MODEL_NAME} {MODEL_VERSION}, compiled by "
            f"Vectorography {VERSION}.\n\n"
            f"  specimen.html    open this first. Tests everything in a "
            f"browser, no install.\n"
            f"  {safe}-VF.ttf    the variable font. One axis, JRNY, running "
            f"from the start\n"
            f"                   of the journey to its end, with a named "
            f"instance per stop.\n"
            f"  instances/       each stop as a static OTF. Install these to "
            f"set text.\n"
            f"  masters/         the TrueType masters the variable font was "
            f"interpolated from.\n"
            f"  journey.json     the full path in latent coordinates, and the "
            f"model it belongs to.\n"
            f"  corpus-manifest.json   every family the space was fitted "
            f"from.\n\n"
            f"Outlines are derived from OFL-1.1 licensed Google Fonts "
            f"families. Check the\n"
            f"OFL terms before distributing a typeface built with this.\n"))
        man = Path(__file__).parent / "data" / "corpus-manifest.json"
        if man.exists():
            zf.writestr("corpus-manifest.json", man.read_text())
    return Response(buf.getvalue(), media_type="application/zip", headers={
        "Content-Disposition":
            f"attachment; filename={req.family}-journey.zip"})
