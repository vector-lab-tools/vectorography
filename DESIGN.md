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
- **The pull towards the centre is shown and resistible.** A space fitted
  to Google Fonts has a dense neo-grotesque core. The altitude meter makes that
  gravity visible; REPEL is the control that works directly against it.

## 2. Layers

```
  corpus      ->  style vectors  ->  vector space  ->  navigator  ->  export
  (fontTools)     (fixed-length)     (whitened PCA)    (browser)      (varLib)
```

### Corpus (built, verified)
Google Fonts `ofl/` tree only, static `-Regular.ttf` files, 500 families.
Provenance is a design decision: no other source is permitted, and a manifest
records every family used.

### Style vector (built, verified)
Each font is one vector of 65,764 floats: 164 glyphs, up to 5 contours each, 40
points per contour resampled at uniform arc length, plus one advance width per
glyph. The character set is ASCII printable, the typographic marks a page needs,
and the Latin-1 letters; every font in the corpus must carry all of it or it
cannot be encoded at all, which is what bounds the set.

Contours are ordered so that the same slot means the same part of a letter in
every font. Marks are kept apart from the shapes they sit over: the acute on an
e is about the size of the e's counter, so ordering by area alone let the two
swap between fonts and the space would interpolate a counter into an accent. Contours are sorted by area, wound consistently, and phase-aligned so
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
|  VECTOROGRAPHY            corpus: VectorModel 0.1       [?] [export]  |
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
basis vectors. By default those are corpus axes 1 and 2; a plane selector
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

## 7. Direct manipulation: what the hand wants

Written after building it, before it has met a type designer. Everything below
that is a claim about use rather than about code is marked as untested, because
which of these survives contact with Marcus is the question the build exists to
answer.

### The gap it closes

Until now every change to the type was made at one remove from the type: a mark
on a map, a row of plus and minus buttons, a compass tile. The designer read the
letters in one place and changed them in another. The specimen is now the
instrument: the hand goes on the letters, and approaching a part of a letter
says what that part controls.

The important consequence is not the gesture, it is the vocabulary. Choosing
"which axis do I want" is a question about the tool. Grabbing a stem because it
is too thin is a question about the type. The handles let the second question be
asked directly, and the axis is inferred from where the hand went.

### What the outline is asked

Handles are not drawn on the letter, they are found in it. Given the decoded
contours of the specimen actually on screen and a pointer position, the nearest
outline point is found and classified by what part of a letter it is:

| Where the hand is | What it controls |
|---|---|
| the side of a stroke, inside the letter | weight, and modulation across |
| the outermost edge of a letter | width, and shape across |
| the top of a lowercase letter | x-height |
| the space between two letters | spacing |
| along the baseline | slant |
| the end of a stroke | serif |
| a thin stroke where it meets a thick one | contrast |
| the shoulder of a curve | shape |

Two rules earned their keep during the build. The outline wins over the gap
when the hand is within about a twentieth of an em of ink, or reaching for a
stem from slightly the wrong side adjusts the spacing instead of the weight. And
the baseline test is made on where the *pointer* is, not on where the nearest
outline point is: an outline point near the baseline is often the closest thing
to a pointer halfway up a letter, and reading that as "the hand is on the
baseline" was wrong in about a third of the specimen.

### The three depth schemes

All three are built and switchable from under the specimen, because which one a
designer can use is not something the code can settle.

1. **Handles.** No depth gesture at all. A handle gives its own property along
   its natural direction and a second across it, so a stem thickens under a
   sideways pull and its modulation changes under a vertical one. Two properties
   per gesture, and the third is reached by letting go and grabbing somewhere
   else.
2. **Modifier.** Drag for two properties, wheel during the drag for the third.
   Cheapest to build and, as expected, the most awkward: it needs a second
   input device mid-gesture, and on a trackpad the wheel is itself a drag.
3. **Perspective.** The specimen is set in a shallow three-dimensional
   presentation, and pushing into the picture moves the third property. The
   letters stay flat and readable; the depth is in how the specimen sits in its
   box, not in extruded type.

**Untested prediction, to be checked rather than believed:** handles will make
the other two unnecessary for shaping, and the third dimension will turn out not
to be wanted during a gesture at all. The reason is that a designer's question
is serial rather than simultaneous. "What does this look like a bit heavier" is
asked forty times in a row, not once alongside two other questions. If that
holds, depth is a solution to a problem the hand does not have, and the modifier
and perspective schemes should be deleted rather than kept as options.

### Answers to the four questions

**Which depth scheme survives.** Provisionally, handles, for the reason above.
Modifier is built but is already unpleasant on a trackpad. Perspective is the
one worth watching: it is the only one that makes the third property visible
rather than modal, and if a designer does want three at once it is the one that
will be usable.

**Hover or pinned handles.** Built as hover-only, and the letterform stays a
letterform until the hand approaches. A permanent cage of handles over the type
is a diagram of the tool rather than a specimen, and the specimen is the thing
being judged. The counter-argument is discoverability: nothing announces that
the type can be touched. The compromise, if hover proves too hidden, is to
reveal all handles briefly on first entry into the panel and then let them fade,
rather than to pin them.

**What happens to the steer list.** It should stay, and it has been re-cast
rather than duplicated. The chips are now what the drag moves along, so a
gesture on a handle lights that property for the duration and restores the
previous selection afterwards: the two systems agree instead of competing. The
plus and minus buttons remain the route for a repeatable, countable step, which
a gesture is bad at. A designer who wants "one notch heavier, again, again" is
better served by a button than by a hand.

**One gesture or a held state.** Built as one gesture per stop, which keeps the
trail honest: a drag is one move that can be undone in one step. But the serial
question above argues for a held state, and the cheap version of it is already
there: the chips persist, so the properties stay aimed between gestures and the
hand can go back to the same stem forty times without re-choosing anything.

### The atlas stopped doing two jobs

The atlas could also be dragged to move the specimen. That is now removed: it
turns the model, names a family on hover, and travels there on a click. Shaping
happens on the type, in the specimen, where the hand can see what it is doing.
A map that both shows you where you are and reshapes what you are holding is
ambiguous to click, and the ambiguity fell on the one gesture, a plain drag,
that both jobs wanted.

### Keeping a place

Shaping runs ahead of the trail. A designer tries twenty things in a row and
wants the good one back, not the twentieth, and undo walks back one step at a
time through all twenty. So the specimen carries two small controls: keep this
place, and return to the place kept. The trail still records everything; the
snapshot is a bookmark into it rather than a second history.

### What was constrained, and why

- **The letters move at pointer speed.** Position is computed from the basis in
  the browser; the server is asked only for outlines, and the last answer wins.
  Nothing in a gesture waits on a round trip.
- **A drag is a path.** Every position passed through is kept, not just where
  the hand stopped, so a pull from thin to fat is a weight axis drawn by hand
  and can be compiled as one.
- **Departure stays visible.** The altitude and density reading is shown in the
  specimen panel during a gesture, where the eye already is. Direct manipulation
  is exactly when a designer stops watching the meters across the screen.
- **Resistance rather than a fence.** Past the corpus the drag is damped to
  under half speed and the degradation is not hidden. The edge of the data is
  something the hand meets.
- **Sanity, in the space rather than on the screen.** A single step is capped in
  em and again in the space, and the position is bounded to a little beyond the
  furthest real family. Before this, a slip could send the specimen to four
  million units from the centroid, where the decode is meaningless. There is
  also a reset to the last stop that was still inside the corpus.


## 8. Modes, and why they are not View

The menu bar now carries **Mode** as well as View, and the difference is worth
holding on to as the tool grows.

**View** is how you look at what you already have: the theme, the guides behind
the specimen, what the atlas puts on its vertical axis, whether the shell is
drawn. Turning any of it on or off changes nothing about the artefact.

**Mode** is what you are working on. Travel, the mode that exists, works on a
whole typeface at once: a location in the space *is* an alphabet, and every
glyph moves together because that is what a position means. The modes that
follow each break that in a specific way, which is why each needs its own
answer rather than a checkbox:

- **Edit a glyph** takes one letter off the shared location. That is a
  departure from traversal, not an extension of it, and it needs a rule for
  what the journey compiles to once a glyph is no longer where the rest are.
- **The whole character set** is the same location shown as sixty-two glyphs
  rather than a word. The decode already produces them; the work is a grid that
  stays readable and redraws fast enough to follow a drag.
- **Compare two locations** needs a second held position, which the keep
  control already provides, and a difference read out in the measured
  properties, which is the arithmetic the ride heading already does.

All three are stubbed in the Mode menu and open a note saying what they are for
and what they need first. A stub that says "coming soon" and nothing else tells
the reader less than an empty menu would.
