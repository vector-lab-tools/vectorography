"""
The latent space of letterforms.

A whitened principal subspace of the corpus style vectors. This is not chosen
for fidelity but for traversability: encoding and decoding are exact linear
maps, so every point in the space decodes to a well-formed set of contours and
every move is continuous. The axes are the corpus eigendirections, which is the
point worth noticing: they were *learned from the distribution*, not declared
by a designer, and the instrument shows you the distribution you are moving in.

DeepSVG was evaluated first, as intended, and rejected: it pins torch 1.4.0,
numpy 1.16.1, Python 3.7 and the withdrawn ``sklearn`` shim, and its font model
depends on a paid dataset. See README for the note.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

# Dimensions used for the density estimate. See the note in __init__.
DENSITY_DIMS = 8

DATA = Path(__file__).resolve().parents[1] / "data"

# The fitted space is a named, versioned artefact in its own right: it is what
# other people actually travel through, and it is what a journey's coordinates
# refer to. Its version is independent of the application's, because refitting
# the space invalidates saved coordinates even when no code has changed.
MODEL_NAME = "VectorModel"
MODEL_VERSION = "0.2"
MODEL = DATA / f"vectormodel-{MODEL_VERSION}.npz"


class StyleSpace:
    def __init__(self, mean, components, scale, Z, names, metas, evr,
                 directions=None, scores=None):
        self.mean = mean                  # (D,)
        self.components = components      # (k, D)
        self.scale = scale                # (k,)
        self.Z = Z                        # (n, k) corpus positions, whitened
        self.names = list(names)
        self.metas = list(metas)
        self.evr = evr
        self.dims = components.shape[0]
        # Measured named axes, computed at fit time and carried in the model,
        # because measuring them needs the raw corpus and a clone only has this.
        self.directions = directions or {}
        # Each font's rank on each measured property, for colouring the atlas.
        self.scores = scores or {}
        # Relative weight of each axis in the unwhitened corpus. Whitening makes
        # distance mean the same thing on every axis, which is what a compass
        # radius needs, but it also means a uniformly random direction in 128
        # dimensions is almost entirely fine detail. Drift is sampled against
        # this spectrum instead, so a random step moves the way a typeface
        # varies rather than the way noise does.
        self.spectrum = (self.scale / max(float(self.scale[0]), 1e-12)
                         if len(self.scale) else self.scale)

        self.centroid = self.Z.mean(axis=0)
        self._centroid_dists = np.linalg.norm(self.Z - self.centroid, axis=1)

        # Density is estimated in the dominant style directions, not in all 128.
        # In the full whitened space distances concentrate, the kernel goes flat,
        # the meter pins at the top wherever you stand, and the gradient REPEL
        # descends becomes noise. The crowding this instrument exists to show is
        # crowding in the directions along which typefaces actually vary, so the
        # estimate is taken there.
        self.dens_dims = min(DENSITY_DIMS, self.dims)
        Zd = self.Z[:, : self.dens_dims]
        d = self._pairwise(Zd)
        np.fill_diagonal(d, np.inf)
        self.h = float(np.median(np.sort(d, axis=1)[:, :8].mean(axis=1)))
        self._corpus_density = np.array([self.log_density(z) for z in self.Z])
        self._corpus_knn = np.sort(d, axis=1)[:, :5].mean(axis=1)

    # ---------------------------------------------------------------- fitting

    @classmethod
    def fit(cls, X, names, metas, dims=128):
        mean = X.mean(axis=0)
        Xc = X - mean
        U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
        k = min(dims, Vt.shape[0])
        components = Vt[:k]
        raw = Xc @ components.T
        scale = raw.std(axis=0)
        scale[scale <= 0] = 1.0
        Z = raw / scale
        evr = (S[:k] ** 2 / np.sum(S**2)).tolist()
        from space.directions import build as build_directions, percentiles
        return cls(mean, components, scale, Z, names, metas, evr,
                   directions=build_directions(Z, X), scores=percentiles(X))

    def save(self, path=MODEL):
        np.savez_compressed(
            path, mean=self.mean, components=self.components, scale=self.scale,
            Z=self.Z, names=np.array(self.names), evr=np.array(self.evr),
            metas=np.array([json.dumps(m) for m in self.metas]),
            directions=np.array(json.dumps(self.directions)),
            scores=np.array(json.dumps(self.scores)),
            model_name=np.array(MODEL_NAME), model_version=np.array(MODEL_VERSION))

    @property
    def model_id(self) -> str:
        return f"{MODEL_NAME} {MODEL_VERSION}"

    @classmethod
    def load(cls, path=MODEL):
        d = np.load(path, allow_pickle=False)
        metas = [json.loads(m) for m in d["metas"]]
        dirs = json.loads(str(d["directions"])) if "directions" in d else {}
        scores = json.loads(str(d["scores"])) if "scores" in d else {}
        return cls(d["mean"], d["components"], d["scale"], d["Z"],
                   d["names"].tolist(), metas, d["evr"].tolist(), dirs, scores)

    # --------------------------------------------------------------- geometry

    def decode(self, z) -> np.ndarray:
        z = np.asarray(z, dtype=np.float32).reshape(-1)
        return (z * self.scale) @ self.components + self.mean

    def encode(self, x) -> np.ndarray:
        return ((np.asarray(x, dtype=np.float32) - self.mean)
                @ self.components.T) / self.scale

    def font_position(self, name: str) -> np.ndarray:
        return self.Z[self.names.index(name)].copy()

    @staticmethod
    def _pairwise(Z):
        sq = np.sum(Z**2, axis=1)
        d2 = sq[:, None] + sq[None, :] - 2 * Z @ Z.T
        return np.sqrt(np.maximum(d2, 0))

    def neighbours(self, z, k=5):
        d = np.linalg.norm(self.Z - np.asarray(z), axis=1)
        idx = np.argsort(d)[:k]
        return [{"family": self.names[i], "distance": float(d[i]),
                 "index": int(i)} for i in idx]

    # ------------------------------------------------- density and its gradient

    def _weights(self, z):
        zd = np.asarray(z, dtype=np.float64)[: self.dens_dims]
        d2 = np.sum((self.Z[:, : self.dens_dims] - zd) ** 2, axis=1)
        e = -d2 / (2 * self.h**2)
        m = float(e.max())
        w = np.exp(e - m)
        return w, m

    def log_density(self, z) -> float:
        w, m = self._weights(z)
        return float(m + np.log(w.sum() / len(self.Z)))

    def density_gradient(self, z):
        """grad of log p(z) under a Gaussian KDE. Points uphill, into the crowd."""
        z = np.asarray(z, dtype=np.float64)
        w, _ = self._weights(z)
        s = w.sum()
        g = np.zeros(self.dims)
        if s <= 0:
            return g
        k = self.dens_dims
        g[:k] = ((w[:, None] * (self.Z[:, :k] - z[:k])).sum(axis=0) / s / self.h**2)
        return g

    def altitude(self, z) -> dict:
        z = np.asarray(z, dtype=np.float64)
        cd = float(np.linalg.norm(z - self.centroid))
        knn = np.sort(np.linalg.norm(self.Z - z, axis=1))[:5].mean()
        ld = self.log_density(z)
        return {
            "centroid_distance": cd,
            "centroid_percentile": float((self._centroid_dists < cd).mean() * 100),
            "knn_distance": float(knn),
            "isolation_percentile": float((self._corpus_knn < knn).mean() * 100),
            "log_density": ld,
            "density_percentile": float((self._corpus_density < ld).mean() * 100),
            "corpus_centroid_max": float(self._centroid_dists.max()),
        }

    # ------------------------------------------------------------------ travel

    def axis_vector(self, spec: str) -> np.ndarray:
        """A view axis named either as a latent index or a measured property.

        "axis:3" is the fourth eigendirection of the corpus. "dir:weight" is the
        direction measured from the outlines, running from the lightest fifteen
        per cent of the corpus to the heaviest. Both are directions in the same
        space; they differ in who chose them.
        """
        if spec.startswith("dir:"):
            d = self.directions.get(spec[4:])
            if d is None:
                raise KeyError(spec)
            return np.asarray(d["vector"], dtype=np.float64)
        i = int(spec.split(":")[-1])
        v = np.zeros(self.dims)
        v[min(max(i, 0), self.dims - 1)] = 1.0
        return v

    def basis3(self, ax="axis:0", ay="axis:1", az="axis:2", ride=None):
        """Three orthonormal view directions, and how much was taken off them.

        Measured properties are not orthogonal to one another: heavier type also
        tends to be less modulated, so weight and contrast share a component.
        Each axis after the first is therefore orthogonalised against the ones
        before it, or dragging along one would silently drag along another and
        the map would be lying about what it shows. The cosines say how much of
        each raw direction was removed, so the interface can say so too.
        """
        raw_u = (np.asarray(ride, dtype=np.float64) if ride is not None
                 else self.axis_vector(ax))
        raw_v = self.axis_vector(ay)
        raw_w = self.axis_vector(az)

        def unit(x):
            n = float(np.linalg.norm(x))
            return x / n if n > 1e-12 else x

        u = unit(raw_u)
        v = raw_v - (raw_v @ u) * u
        overlap_v = float(abs(unit(raw_v) @ u))
        if np.linalg.norm(v) < 1e-9:
            v = self._any_orthogonal([u])
        v = unit(v)
        w = raw_w - (raw_w @ u) * u - (raw_w @ v) * v
        overlap_w = float(max(abs(unit(raw_w) @ u), abs(unit(raw_w) @ v)))
        if np.linalg.norm(w) < 1e-9:
            w = self._any_orthogonal([u, v])
        w = unit(w)
        return u, v, w, {"y_on_x": overlap_v, "z_on_plane": overlap_w}

    def _any_orthogonal(self, against: list[np.ndarray]) -> np.ndarray:
        for i in range(self.dims):
            cand = np.zeros(self.dims)
            cand[i] = 1.0
            for a in against:
                cand = cand - (cand @ a) * a
            if np.linalg.norm(cand) > 1e-6:
                return cand
        return np.eye(self.dims)[0]

    def heading_basis(self, axis_a=0, axis_b=1, ride=None):
        """Two orthonormal vectors spanning the plane the compass turns in."""
        u = np.zeros(self.dims)
        v = np.zeros(self.dims)
        if ride is not None:
            u = np.asarray(ride, dtype=np.float64)
            n = np.linalg.norm(u)
            u = u / n if n > 0 else u
            v[axis_b] = 1.0
            v = v - (v @ u) * u
            n = np.linalg.norm(v)
            v = v / n if n > 0 else v
        else:
            u[axis_a] = 1.0
            v[axis_b] = 1.0
        return u, v

    def compass(self, z, radius=0.6, axis_a=0, axis_b=1, ride=None, basis=None):
        u, v = basis if basis is not None else self.heading_basis(axis_a, axis_b, ride)
        out = []
        for i in range(8):
            th = i * np.pi / 4
            out.append({
                "bearing": int(i * 45),
                "z": (np.asarray(z, dtype=np.float64)
                      + radius * (np.cos(th) * u + np.sin(th) * v)).tolist(),
            })
        return out

    def steer(self, z, key: str, sign: float, amount: float | None = None):
        """Travel along a measured named axis, from wherever you are."""
        d = self.directions.get(key)
        if d is None:
            raise KeyError(key)
        v = np.asarray(d["vector"], dtype=np.float64)
        step = amount if amount is not None else 0.15 * float(d["spread"])
        return (np.asarray(z, dtype=np.float64) + sign * step * v).tolist()

    def toward(self, z, tx: float, ty: float, u, v, amount: float | None = None):
        """Move to a point picked in the heading plane.

        A click on the map names two coordinates, not a position: the other 126
        are unspecified. They are left exactly as they are, so travelling to a
        spot on the map moves within the plane being steered in and changes
        nothing else. With an amount, the move is a step of that length along
        the way rather than a jump.
        """
        z = np.asarray(z, dtype=np.float64)
        u = np.asarray(u, dtype=np.float64)
        v = np.asarray(v, dtype=np.float64)
        target = z - (z @ u) * u - (z @ v) * v + tx * u + ty * v
        delta = target - z
        n = float(np.linalg.norm(delta))
        if amount is None or n <= amount or n < 1e-12:
            return target.tolist()
        return (z + amount * delta / n).tolist()

    def repel(self, z, step=0.5):
        g = self.density_gradient(z)
        n = np.linalg.norm(g)
        if n < 1e-9:
            # Flat here: any direction is downhill, so head straight out.
            g = np.asarray(z, dtype=np.float64) - self.centroid
            n = np.linalg.norm(g) or 1.0
            return (np.asarray(z) + step * g / n).tolist()
        return (np.asarray(z) - step * g / n).tolist()

    def drift(self, z, temperature=0.5, rng=None):
        rng = rng or np.random.default_rng()
        d = rng.normal(size=self.dims) * self.spectrum
        n = np.linalg.norm(d)
        d = d / n if n > 0 else d
        return (np.asarray(z) + temperature * d).tolist()

    def orbit(self, z, centre, angle_deg=20.0, axis_b=1):
        """Rotate z about `centre` in the plane spanned by the radius vector
        and one further axis, keeping the radius fixed."""
        z = np.asarray(z, dtype=np.float64)
        c = np.asarray(centre, dtype=np.float64)
        r = z - c
        rn = np.linalg.norm(r)
        if rn < 1e-9:
            r = np.zeros(self.dims)
            r[0] = 1.0
            rn = 1.0
        u = r / rn
        v = np.zeros(self.dims)
        v[axis_b] = 1.0
        v = v - (v @ u) * u
        nv = np.linalg.norm(v)
        if nv < 1e-9:
            v = np.zeros(self.dims)
            v[(axis_b + 1) % self.dims] = 1.0
            v = v - (v @ u) * u
            nv = np.linalg.norm(v) or 1.0
        v /= nv
        th = np.radians(angle_deg)
        return (c + rn * (np.cos(th) * u + np.sin(th) * v)).tolist()
