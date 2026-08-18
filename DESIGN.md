# Vectorography: design

**Status:** design of record for the prototype. Written after the corpus and
space layers were working, before the navigator was built.

## 1. The principle the software has to enforce

The instrument is a vehicle, not a factory. A user arrives somewhere, looks
around, and decides where to go next. Three consequences bind the whole design:

- **No generate button, and no prompt field.** There is no control anywhere in
  the interface that produces a new artefact from a description. Every control
  is a *movement*: a direction, a distance, a heading, a return.
- **Location is always readable.** The user can always see where they are in the
  corpus distribution and whose neighbourhood they are standing in. This is the
  provenance instrument, and it is not optional or hidden behind a panel.
- **The pull towards the centre is shown and resistible.** A latent space fitted
  to Google Fonts has a dense neo-grotesque core. The altitude meter makes that
  gravity visible; REPEL is the control that works directly against it.

## 2. Layers

```
  OFL corpus  ->  style vectors  ->  latent space  ->  navigator  ->  export
  (fontTools)     (fixed-length)     (whitened PCA)    (browser)      (varLib)
```

### Corpus (built, verified)
Google Fonts `ofl/` tree only, static `-Regular.ttf` files, 500 families.
Provenance is a design decision: no other source is permitted, and a manifest
records every family used.

### Style vector (built, verified)
Each font is one vector of 14,942 floats: 62 glyphs (A-Z a-z 0-9), 3 contours
each, 40 points per contour resampled at uniform arc length, plus 62 advance
widths. Contours are sorted by area, wound consistently, and phase-aligned so
that point *i* means roughly the same place on the letter in every font. That
alignment is the thing that makes the space walkable; without it, the average of
two fonts is noise rather than a letter. Missing counters are padded with a
degenerate contour at the glyph centre, which opens into a small blob during
interpolation rather than silently deforming the letter.

### Latent space (built)
DeepSVG was tried first and rejected: it pins torch 1.4.0, numpy 1.16.1, Python
3.7 and the withdrawn `sklearn` shim, and its font model needs a paid dataset.

In its place, a **whitened principal subspace** of the corpus, 32 dimensions.
Chosen for traversability rather than fidelity: encode and decode are exact
linear maps, so every point decodes to well-formed contours and every move is
continuous. Whitening makes one unit of distance mean the same thing on every
axis, so a compass radius is a meaningful quantity.

The axes are corpus eigendirections. They were learned from the distribution
rather than declared by a designer, and the instrument says so.

Derived quantities, all exact and cheap at this corpus size:
- distance from corpus centroid, and its percentile against the corpus
- Gaussian KDE log-density and its **analytic gradient** (this is what REPEL
  descends)
- k-NN distance as an isolation measure
- 5 nearest real families by name

### Export (built, not yet wired)
Masters are compiled with `fontTools.fontBuilder`, contours emitted as closed
all-off-curve quadratic B-splines. Because every master has identical glyphs,
contour counts and point counts by construction, any set of sampled locations is
interpolation compatible, and `varLib` builds a variable font from them without
repair. The recorded path becomes a single `JRNY` (Journey) axis, 0 to 1000.

## 3. The navigator

One screen. No tabs, no routing, no modal dialogs.

```
+----------------------------------------------------------------------+
|  VECTOROGRAPHY            corpus: 500 OFL families      [?] [export]  |
+--------------+-----------------------------------------+-------------+
|              |                                         |             |
|  ALTITUDE    |            NW    N    NE                |  NEAREST    |
|              |                                         |  Inter 0.41 |
|  [vertical   |            W  [ SPECIMEN ]  E           |  Roboto 0.52|
|   meter,     |               Hamburge                  |  ...        |
|   corpus     |                                         |             |
|   histogram, |            SW    S    SE                 |  TRAIL      |
|   you-are-   |                                         |  o- 00 origin
|   here mark] |     radius [-------o----]  0.60         |  |          |
|              |                                         |  o- 01 walk |
|  centroid    |  [ WALK ] [ DRIFT ] [ REPEL ] [ RIDE ]   |  |          |
|  0.83  62nd  |  [ ORBIT ]                temp [--o---]  |  o- 02 repel|
|  density     |                                         |  *  03 here |
|  31st        |                                         |             |
+--------------+-----------------------------------------+-------------+
```

**Centre.** The current location decoded and rendered large as live SVG. This is
the only large thing on screen. Specimen text is editable, since reading a
letterform is how you decide where to go.

**Compass rose.** Eight neighbouring positions at the current radius, each
rendered as a small live specimen of the same word. This is the main ideation
surface: the user is choosing between eight *visible* places, not eight
abstract directions. Clicking one travels there and the rose recomputes.

The eight bearings are 45-degree steps in a **heading plane** spanned by two
basis vectors. By default those are latent axes 1 and 2; a plane selector
changes them; RIDE replaces the first with a difference vector between two
chosen families, so a semantic direction becomes a compass heading that works
from anywhere.

**Altitude meter.** Persistent, left rail, never collapsed. Shows the corpus
distribution as a histogram with a you-are-here marker, for both distance from
centroid and local density percentile. Answers one question at a glance: how
close am I to the average font?

**Nearest neighbours.** Five named families with distances, live. The traveller
always knows whose neighbourhood they are standing in.

**Trail.** Every move appends a breadcrumb with its mode. Any crumb is
clickable to return. The trail is the object that gets exported.

### Travel modes
| Mode | Movement |
|---|---|
| WALK | one radius-sized step along a chosen compass bearing |
| DRIFT | random unit direction scaled by temperature |
| REPEL | step along the negative KDE log-density gradient |
| RIDE | travel along B-minus-A, applied from the current position |
| ORBIT | rotate about a chosen family at fixed radius |

## 4. API

Small, stateless, JSON. The server owns the space; the client owns the journey.

| Route | Purpose |
|---|---|
| `GET /api/corpus` | families, dims, explained variance, axis labels |
| `POST /api/location` | decode + altitude + neighbours for one z |
| `POST /api/compass` | eight bearings, each decoded to a small specimen |
| `POST /api/travel` | one move: `{mode, z, ...}` returns the new z |
| `POST /api/export/svg` | specimen sheet for the current location |
| `POST /api/export/journey` | zip: variable font, masters, designspace, JSON |

Client state (position, trail, modes) lives in the browser. The server keeps no
session, no accounts, no telemetry. Fully local.

## 5. Non-goals for the prototype

Kerning, hinting, non-Latin scripts, outline quality good enough to ship a
retail typeface, and any form of text-conditioned generation.

## 6. Design review amendments (pre-build)

1. **The default compass plane is a normalisation trap.** Axes 1-2 are the
   corpus's highest-variance directions, so the default rose is aligned with the
   distribution's own principal structure. The plane selector therefore prints
   each axis's explained-variance share, making plane choice a reading of the
   distribution; REPEL uses the full 32-D density gradient and is not confined
   to the plane, so it remains the true escape from any chosen plane.
2. **Edge saturation.** KDE density pins to the 0th percentile just outside the
   corpus hull and stops discriminating exactly where the traveller most needs
   it. The altitude meter therefore reads both density percentile and centroid
   distance expressed against the corpus maximum ("1.4x further out than any
   real font"), the latter never saturating.
3. **Trail forks.** Returning to an old crumb and moving again creates a branch.
   Crumbs store a parent index; the trail is a tree flattened for display, and
   no history is ever overwritten.
4. **Instability is shown, not hidden.** Interpolation across contour-count or
   structure changes passes through blob states. Prototype policy: allow it,
   name it in the README limitations; a specimen-level unstable-region marker is
   stretch work.
5. **Compass payload.** The compass endpoint decodes only the glyphs of the
   current specimen text, not the full glyph set, per thumbnail.

Stack decision: Vite + React + TS + Tailwind. Space decision: whitened PCA now,
VAE later behind the same interface as a switchable second space.
