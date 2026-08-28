# Proposal: a component-based representation

**Status:** proposal, for review. Nothing here is built.
**Against:** VectorModel 0.2, the whole-glyph representation described in
[`../DESIGN.md`](../DESIGN.md) §Style vector and [`../MODEL.md`](../MODEL.md).

This note writes up a critique of the current representation and a possible
answer to it. It is meant to be read alongside the design of record, not to
replace any decision already taken.

## The critique

The instrument travels by averaging. Every font is one fixed-length vector —
164 glyphs, five contours each, forty points per contour in cyclic
correspondence, plus advances ([`../backend/corpus/outlines.py`](../backend/corpus/outlines.py)) —
and a new location decodes to a weighted average of those point positions.
Averaging is only meaningful where the things being averaged correspond: point
*i* of a contour has to mean the same place on the letter in every font, or the
mix is noise rather than a letter. The design says this plainly and builds a
Procrustes alignment to enforce it.

The objection is that whole-glyph correspondence is the wrong unit. Two
typefaces can look alike and be drawn with very different numbers of nodes, in
different order, with different contour structure. Forcing both into one fixed
skeleton and averaging node against node distorts exactly where the structures
disagree. The instrument already meets this at its edges and says so:

- a letter with one counter, interpolated against a letter with two, is padded
  with **a degenerate contour at the glyph centre** that "opens into a small
  blob during interpolation" (`outlines.py`, `_order`; DESIGN.md §Style vector);
- the Limitations section concedes: *"Interpolating across structural change
  produces blobs. This is shown rather than hidden."*

So the diagnosis is not in dispute. The representation is honest about its
failure, but it is still a failure: large regions of the space produce
letterforms no designer would accept, and the blob is a structural artefact of
whole-glyph averaging rather than a bug that can be tuned away.

## The proposal

Fit the space over **base components** — the parts letters are built from: a
stem, a bowl, a serif, a spur, a crossbar, a terminal — rather than over whole
glyphs. Correspondence is then established part-to-part: serif against serif,
bowl against bowl, and never a serif against a counter. A location decodes to a
set of components, and letters are **composed** from them.

This is not an exotic idea imported into type design; it is how a great deal of
type design is already done. In a font a composite glyph references other
glyphs; in editors like Glyphs a "smart component" is drawn once and reused;
the working practice is to draw one serif, apply it at several locations, and
change it in one place to change every instance. A representation in that
vocabulary would produce output a designer can use directly — edit the shared
serif, propagate everywhere — instead of 164 outlines that each wandered on
their own.

Two things follow that the current representation cannot offer:

1. **Interpolation only ever runs between like parts.** The blob comes from
   averaging structurally incompatible contours. If the unit of correspondence
   is the component, the incompatible case does not arise inside a component;
   it moves to the *composition* — which components a letter has and where they
   attach — where it can be handled discretely rather than smeared.
2. **The output is compositional.** A journey would carry not just outlines but
   the parts and their placements, which is the form the rest of a designer's
   tools already speak.

## What it would cost

This is a research programme, not a patch, and the note should say so as plainly
as the design says everything else.

- **Segmentation.** Deciding what a "serif" or a "bowl" *is*, as geometry, and
  finding it consistently across 441 families drawn to different logics. This is
  the hard part, and it is unsolved in general. Slab serifs, unbracketed
  serifs, half-serifs and sans terminals do not fall into one clean taxonomy.
- **Component correspondence.** The same alignment problem the project already
  solved for whole contours, now per part, plus the harder problem of matching
  *sets* of parts across fonts that disagree about how many parts a letter has.
- **Composition as data.** A grammar for how parts attach — a stem takes a
  serif at each end, a bowl joins a stem at a junction — and a decode that
  places components without them colliding or leaving gaps at the joins.
- **A discrete layer in a continuous instrument.** Which components a letter has
  is categorical. The current space is smooth everywhere, which is what makes a
  compass radius a real quantity and every move continuous. A component model
  reintroduces discrete structure, and the navigator would need an honest answer
  for what happens at the boundary where a part appears or disappears — the same
  place the current model draws a blob.

## Where it sits against the project's thesis

Worth flagging, because it is not a free upgrade.

- **It reintroduces designer-declared structure.** The instrument's stated
  stance is anti-normalisation and traversal of a *fitted* distribution: "the
  axes were learned from the distribution rather than declared by a designer."
  Naming components — this is a serif, that is a bowl — puts a designer's
  ontology back into the representation. That may well be worth it. It is a
  change of thesis, not only a change of features, and should be argued as one.
- **It trades away a property the current design values.** Today the distortion
  is treated as epistemically honest: the blob *shows you* where averaging
  breaks. A component model would make more of the space produce clean letters
  and, in doing so, would hide the seam the current instrument deliberately
  exposes. Cleaner output, less visible about its own limits.
- **It aligns with the README's own "next problem."** The Limitations section
  already names a different *representation* as the interesting next step (there,
  for cursive and contextual scripts). Component fitting is the same category of
  answer, reached from the Latin case.

## If it were tried, the smallest first cut

Not a full build — a probe to see whether the idea survives contact with the
corpus.

1. Pick one part with a relatively clean definition — the serif — and one
   letter family that carries it consistently (e.g. `I`, `H`, `E`, `L`, `T`).
2. Segment the serif region from the stem on those glyphs across the corpus,
   by hand-checked heuristic, and measure how cleanly it separates. If it does
   not separate cleanly on the easy case, the general case is worse.
3. Fit a small space over *just* the serif geometry and test whether
   interpolating two serifs stays a serif across the whole path — the same
   honesty test the whole-glyph space passes for outlines.
4. Only then ask about composition. Segmentation is the gate; everything
   downstream depends on it working.

The point of the cut is to fail cheaply if it is going to fail.

## For review

Open questions for whoever picks this up:

- Is the segmentation problem tractable on *this* corpus (OFL Google Fonts,
  neo-grotesque-heavy), or does the density of the core make parts hard to
  separate precisely where the fonts are most alike?
- Can composition stay continuous enough to keep the navigator's core promise —
  every move a real distance, every location a well-formed letter — or does the
  discrete layer break that promise in a way the instrument would have to own?
- Is the honest-blob property worth keeping? A component model could be built to
  still *show* where composition fails, rather than papering over it.
- Does this belong as a second, opt-in representation beside VectorModel 0.2,
  rather than a replacement — a different model version a journey records itself
  against, the way the space is already versioned independently of the code?

## Note on the mechanism (added when this was moved onto main)

The critique above, following the comment it came from, attributes the
distortion to differing **node counts**. That part is not right, and it matters
because it points effort at a problem already solved.

Node count cannot be the fault. Every contour is resampled to forty points at
uniform arc length before anything is fitted
([`../backend/corpus/outlines.py`](../backend/corpus/outlines.py)), so a letter
drawn with twelve nodes and the same letter drawn with sixty arrive as
identically shaped vectors. Matching the counts is what the representation does
first.

Two things do go wrong, and both are one level up from node count:

- **Topology.** A letter with one counter padded against a letter with two is
  the blob, and no amount of resampling reconciles a different number of
  contours.
- **Feature alignment.** Uniform arc-length sampling puts point 17 on a serif
  in one face and on a bare terminal in another. Averaging then mixes parts
  that are not the same part, which is the smearing that shows up as softness
  well before it shows up as a blob.

The proposal survives the correction, and is arguably strengthened by it:
components address feature alignment directly, since a serif can only ever be
averaged against a serif. But two cheaper things attack the same fault without
a segmentation problem, and should be measured before anyone starts on parts:

1. **Quantify the topological damage.** Count, per glyph across the 441
   families, how many are structurally compatible. `a`, `e`, `g` and `£` are
   the expected offenders. This turns a conceded limitation into a number, and
   says what fraction of the space is genuinely interpolable.
2. **Curvature-weighted resampling with anchored extrema.** Put sample points
   where the curvature is, and pin the extreme points to fixed indices across
   every font, so features land on the same indices by construction. This is a
   refit rather than a research programme.
