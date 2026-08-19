# VectorModel 0.2

The fitted vector space that Vectorography travels through. It is a named,
versioned artefact in its own right, and its version moves independently of the
application's: refitting the space invalidates every saved journey coordinate
even when no line of code has changed.

| | |
|---|---|
| **Name** | VectorModel |
| **Version** | 0.2 |
| **File** | `backend/data/vectormodel-0.2.npz` (30 MB), float32 |
| **Kind** | whitened principal subspace (exact linear encode and decode) |
| **Dimensions** | 128, retaining 95.6% of corpus variance |
| **Corpus** | 441 families, Google Fonts `ofl/` tree |
| **Glyph set** | ASCII printable, typographic punctuation, and Latin-1 accented forms: 164 glyphs |
| **Representation** | 5 contours per glyph, 40 arc-length points per contour, plus 164 advance widths (65,764 dimensions before projection) |
| **Density estimate** | Gaussian KDE over the 8 dominant style directions |

## What is in the file

| Array | Shape | Meaning |
|---|---|---|
| `mean` | (65764,) | corpus mean style vector |
| `components` | (128, 65764) | principal directions |
| `scale` | (128,) | per-axis standard deviation, for whitening |
| `Z` | (441, 128) | every corpus family's position |
| `names` | (441,) | family identifiers, matching `corpus-manifest.json` |
| `evr` | (128,) | explained variance ratio per axis |
| `metas` | (441,) | per-family vertical metrics |
| `model_name`, `model_version` | scalar | identity, written into every journey export |

## Coordinates

Positions are whitened, so one unit of distance means the same thing on every
axis and a compass radius is a real quantity. The corpus centroid is the origin.
The furthest real family sits about 21 units out. A journey exported by the
instrument records its coordinates in this space, and `journey.json` names the
model and version they belong to, so a trail can be replayed only against the
model that produced it.

## Provenance

Built only from the `ofl/` tree of [google/fonts](https://github.com/google/fonts).
`backend/data/corpus-manifest.json` lists every family, and travels inside every
journey export.

## Rebuilding

Rebuilding produces a different space, so bump the model version and keep the
old file if any journeys refer to it. See the README for the commands.

## Known limitations

- Latin only, and a fixed glyph set with stable contour counts.
- The axes are corpus eigendirections, not designer-declared axes. They were
  learned from the distribution, which is the thing the instrument is built to
  let you notice.
- Reconstruction is lossy: 96% of variance, so a real family decodes recognisably
  but not exactly. Fine detail, especially serif bracketing and high stroke
  contrast, is softened.
