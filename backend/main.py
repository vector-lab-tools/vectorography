"""Vectorography backend: the server owns the space, the client owns the journey."""

from __future__ import annotations

import io
import json
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
    centre: list[float] | None = None
    angle: float = 20.0
    seed: int | None = None


class JourneyReq(BaseModel):
    trail: list[list[float]]
    family: str = "Journey"
    masters: int = Field(5, ge=2, le=12)


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


@app.post("/api/export/journey")
def export_journey(req: JourneyReq):
    from export.fontfile import build_variable

    s = space()
    if len(req.trail) < 2:
        raise HTTPException(400, "journey needs at least two locations")

    # Sample uniformly by arc length along the trail.
    trail = np.asarray(req.trail, dtype=np.float64)
    seg = np.linalg.norm(np.diff(trail, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    if cum[-1] <= 0:
        raise HTTPException(400, "journey has zero length")
    targets = np.linspace(0, cum[-1], req.masters)
    zs = np.stack([np.interp(targets, cum, trail[:, d])
                   for d in range(trail.shape[1])], axis=1)

    meta = s.metas[0]
    vectors = [s.decode(z) for z in zs]
    try:
        vf, ds_xml, masters = build_variable(vectors, req.family, meta)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"variable font build failed: {exc}") from exc

    journey = {
        "format": "vectorography-journey/1",
        "family": req.family,
        "space": {"model": MODEL_NAME, "model_version": MODEL_VERSION,
                  "kind": "whitened principal subspace", "dims": s.dims,
                  "corpus": "google-fonts-ofl", "corpus_size": len(s.names)},
        "trail": req.trail,
        "masters": [{"file": n, "t": float(t / cum[-1])}
                    for (n, _), t in zip(masters, targets)],
        "licence_note": ("Derived from OFL-1.1 Google Fonts families; "
                         "see corpus-manifest.json"),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{req.family}-VF.ttf", vf)
        zf.writestr("journey.designspace", ds_xml)
        zf.writestr("journey.json", json.dumps(journey, indent=2))
        for name, data in masters:
            zf.writestr(f"masters/{name}", data)
        man = Path(__file__).parent / "data" / "corpus-manifest.json"
        if man.exists():
            zf.writestr("corpus-manifest.json", man.read_text())
    return Response(buf.getvalue(), media_type="application/zip", headers={
        "Content-Disposition":
            f"attachment; filename={req.family}-journey.zip"})
