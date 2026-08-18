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

DATA = Path(__file__).resolve().parents[1] / "data"
MODEL = DATA / "space.npz"


class StyleSpace:
    def __init__(self, mean, components, scale, Z, names, metas, evr):
        self.mean = mean                  # (D,)
        self.components = components      # (k, D)
        self.scale = scale                # (k,)
        self.Z = Z                        # (n, k) corpus positions, whitened
        self.names = list(names)
        self.metas = list(metas)
        self.evr = evr
        self.dims = components.shape[0]

        self.centroid = self.Z.mean(axis=0)
        self._centroid_dists = np.linalg.norm(self.Z - self.centroid, axis=1)
        # Bandwidth by the median nearest-neighbour distance in the corpus.
        d = self._pairwise(self.Z)
        np.fill_diagonal(d, np.inf)
        self.h = float(np.median(np.sort(d, axis=1)[:, :8].mean(axis=1)))
        self._corpus_density = np.array([self.log_density(z) for z in self.Z])
        self._corpus_knn = np.sort(d, axis=1)[:, :5].mean(axis=1)

    # ---------------------------------------------------------------- fitting

    @classmethod
    def fit(cls, X, names, metas, dims=32):
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
        return cls(mean, components, scale, Z, names, metas, evr)

    def save(self, path=MODEL):
        np.savez_compressed(
            path, mean=self.mean, components=self.components, scale=self.scale,
            Z=self.Z, names=np.array(self.names), evr=np.array(self.evr),
            metas=np.array([json.dumps(m) for m in self.metas]))

    @classmethod
    def load(cls, path=MODEL):
        d = np.load(path, allow_pickle=False)
        metas = [json.loads(m) for m in d["metas"]]
        s = cls(d["mean"], d["components"], d["scale"], d["Z"],
                d["names"].tolist(), metas, d["evr"].tolist())
        return s

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
        d2 = np.sum((self.Z - np.asarray(z)) ** 2, axis=1)
        e = -d2 / (2 * self.h**2)
        m = float(e.max())
        w = np.exp(e - m)
        return w, m

    def log_density(self, z) -> float:
        w, m = self._weights(z)
        return float(m + np.log(w.sum() / len(self.Z)))

    def density_gradient(self, z):
        """grad of log p(z) under a Gaussian KDE. Points uphill, into the crowd."""
        w, _ = self._weights(z)
        s = w.sum()
        if s <= 0:
            return np.zeros_like(np.asarray(z, dtype=np.float64))
        return ((w[:, None] * (self.Z - np.asarray(z))).sum(axis=0)
                / s / self.h**2)

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

    def compass(self, z, radius=0.6, axis_a=0, axis_b=1, ride=None):
        u, v = self.heading_basis(axis_a, axis_b, ride)
        out = []
        for i in range(8):
            th = i * np.pi / 4
            out.append({
                "bearing": int(i * 45),
                "z": (np.asarray(z, dtype=np.float64)
                      + radius * (np.cos(th) * u + np.sin(th) * v)).tolist(),
            })
        return out

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
        d = rng.normal(size=self.dims)
        d /= np.linalg.norm(d) or 1.0
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
