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
|  VECTOROGRAPHY            corpus: VectorModel 0.2       [?] [export]  |
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

## 9. Settling, and what it does to the instrument

Until this existed, Vectorography's atomic operation was *move the whole
typeface*. A type designer's atomic operation is *change this letter, and work
out what that implies for the rest*. Both are the same linear algebra run in
opposite directions, and the instrument only ran it one way. The consequence
was that nothing could be settled: twenty minutes in, the traveller had seen a
great deal and decided nothing.

**Holding a glyph exactly still is not available.** One glyph occupies 401
coordinates, five contours of forty points in two axes plus its advance, and
the space has 128 dimensions to move in. A move that leaves 401 numbers exactly
where they are generically leaves no move at all. The approximation is not a
shortcut around a hard problem; it is what the shape of the problem allows.

So a settled glyph is held by projection. `space/settle.py` assembles the rows
of the decode belonging to the settled coordinates, takes the SVD, and keeps
the directions with the smallest singular values: the moves those letters least
feel. Every control passes through one choke point, `settle.hold`, so walk,
drift, repel, steer, orbit, the compass bearings and a dragged specimen are all
constrained by construction rather than each remembering to be.

Measured on VectorModel 0.2, counting directions that disturb the settled
glyphs by under one per cent of the worst direction's:

| Settled | Dimensions still free |
|---|---|
| `n` | 83 of 128 |
| `n` `o` | 68 |
| nine glyphs | 20 |
| the whole lowercase | 1 |

That count is on screen beside the handle reading and stays there. It is the
altitude meter's counterpart: altitude says how far the traveller has gone from
the average, and this says how much freedom is left after what has been
decided. In the running app, settling `n` and `o` and then taking one compass
step moves those two letters 7.4 times less than their neighbours.

Three things follow for the rest of the instrument.

**Tolerance is a control rather than a constant.** At three per cent the whole
lowercase still leaves 48 dimensions free, so the designer trades how firmly a
letter is held against how much room is left to work in. It is kept at one per
cent and is not yet exposed.

**Settling is a decision and belongs on the trail.** It is not there yet. A
journey currently replays as a walk, and once settling is recorded it replays
as a piece of work.

**The drift is reported rather than asserted.** `/api/travel` returns how far
each settled glyph actually moved, in ems, because the instrument should be
willing to say what the approximation cost.

## 10. Projection: running the space backwards

Everything else in the instrument starts from a location and produces letters.
This starts from letters somebody drew and produces a location, which is the
direction a designer actually works in. **File → Project a font** takes an OTF
or TTF and answers two questions: where the drawing sits, and what the space
cannot say about it.

### Plain least squares does not work, and the reason is instructive

Two glyphs pin 802 coordinates against 128 unknowns. That looks
over-determined and is not, for exactly the reason settling rests on: most of
those 128 directions barely touch `n` and `o`, so the fit is free to send them
anywhere, and it does. Measured against held-out letters, an unregularised fit
on `n` and `o` predicts the rest of the alphabet **worse than assuming the
corpus average**, by 41% for Georgia and by 228% for Courier New.

So the corpus is used as a prior. Whitening already made it the unit Gaussian,
which is what makes a ridge term exactly a prior here rather than a fudge:
minimising the drawing's error plus `prior` times the squared distance from the
centroid is the maximum a posteriori location given the corpus and the drawing.
The weight was chosen by held-out measurement across four faces and eight
values spanning four orders of magnitude, not by taste.

The dial is worth exposing rather than hiding. A small prior is faithful to what
was drawn and wild about everything else; a large one pulls the answer to the
average of Google Fonts. **The pull toward the mean that the rest of the
instrument exists to resist is here as a number the designer sets.**

### What it reports

Skill on withheld letters is the only one of these that is a claim. Every fifth
drawn letter is held back from the fit and predicted, so the number means the
same thing for a finished face and for two letters on a Tuesday.

| Face | Fitted on | Skill against the corpus average |
|---|---|---|
| Georgia | `n` `o` | +26% |
| Georgia | 8 letters | +40% |
| Georgia | 16 letters | +51% |
| Verdana | `n` `o` | +38% |
| Courier New | `n` `o` | −1% |
| Courier New | 16 letters | +35% |
| Apple Chancery | 16 letters | +23% |

Across the whole 164-glyph set, including punctuation, digits and accented
capitals, skill settles at +15 to +18%. The letters the space reaches worst are
currency symbols and the wider capitals.

`constrained` is the mirror of the settling count: how many of the 128
directions the drawing had anything to say about, the rest having been answered
by the corpus. Settling asks how much freedom is left after a decision;
projection asks how much a drawing used.

### What it says about the corpus

Projected whole, the space reaches 48 to 69% of a real face's departure from the
corpus average, leaving 0.017 to 0.040 em. The nearest-neighbour results say
the remainder is not noise: Courier New lands beside `courierprime` and Comic
Sans beside `comicrelief`, so the space finds the right neighbourhood and then
cannot draw what it found. Apple Chancery, a script face, has the largest
residual, which is where the representation's assumptions are furthest from
the drawing.

That number is the component critique turned into a measurement.

## 11. Proof sheets, and why a unit had to be redefined

The atlas answers "where am I" and answers it well. It does not answer "what
does this look like a bit heavier", which a type designer asks forty times in a
row, and which wants candidates beside one another rather than a map. So the
lower panel now switches between the two. Each row of a sheet is one measured
property running from less to more, with the current setting standing in the
middle of every row, and the text set as a paragraph at reading size rather
than as a word at three hundred pixels.

**The first version was useless for the one thing a sheet is for.** Steps were
scaled by the corpus spread of each property, which is what the steer list
does and what the compass radius means. Measured end to end, a weight row moved
the outline 0.0127 em per point while a width row moved it 0.0410. The rows
were not on a common scale, so comparing them said nothing, and a comparison is
the whole object.

Whitening makes a unit mean the same thing to the distribution, which is what a
compass radius wants. A sheet wants a unit to mean the same thing to the eye.
Those are different normalisations and the instrument needed both.

Since the decode is linear, the second one is exact and free: moving by `v`
changes the outline by `(v * scale) @ components` wherever the move starts
from, so the ink moved per whitened unit is a constant per direction. A step is
now `INK_STEP / ink_per_unit`, and every row of a sheet moves the letters by
0.0400 em root mean square from one end to the other, whatever property it is
drawn along. The figures that fall out say how unequal the old unit was: weight
needs 1.73 whitened units for a step that width gets from 0.58.

Clicking a cell travels to it. Shift-clicking travels and halves the step,
because the answer to "a bit heavier" is usually another, smaller "a bit
heavier".

The sheet is fetched only while it is being looked at. It is the largest
response the server gives, a paragraph decoded for every candidate, 861 kB
before compression and 327 kB after.

## 12. The reorganisation, first pass

Three features went in as additions that disturbed nothing, which was right
while they were unproven: two of the three changed shape once they were
measured. Having survived that, they change what the instrument is for, and
the arrangement had to follow.

**The sheet opens, not the map.** The atlas answers "where am I", which is a
question asked a few times a session. The sheet answers "what does this look
like a bit either way", which is asked all day. The toggle stays, and the map
is a press away.

**Settling is on the stage toolbar.** It was two levels into the Edit menu,
which is where a thing goes when nobody is sure it is wanted. It belongs beside
the modes that say what a press on a letter does, because that is exactly what
it changes. The menu items stay for the keyboard route and for unsettling
everything at once.

**The readings cannot go dark.** Altitude and density were drawn inside the
atlas. Switching to the sheet took them off the screen, so the two instruments
that exist to show the pull toward the average went out at the moment a
designer starts shaping, which is the moment they are for. They are a property
of where the work stands rather than of one way of looking at it, so they sit
on the stage with the letters: distance from the centroid, density percentile,
and the directions still free after what has been settled. Each turns gold at
the point it is worth reading twice.

Still to do: the compass rose overlaps the sheet's job and has not been
reconsidered; the projection prior is not exposed; settling is not recorded on
the trail or carried in a `.vgy`.

## 13. The menus, after the Spacewar! research bench

The thing worth taking from that interface is not its colours. It is that
every item in a menu says what it does, in a dimmed line under its own name,
instead of hiding it in a tooltip.

Every item here already had that sentence written. It sat in the `title`
attribute, where it took a hover and a wait to read with a mouse and could not
be read at all with a finger, which is most of the reason the Edit menu had
grown into a list of names nobody could act on without trying them. The same
words moved up into the menu, and the menu stopped needing to be learned.

Group headings replace most of the bare rules, for the same reason: a divider
says two things are different and a heading says what they are. The Edit menu
now reads as *going back*, *places worth returning to*, *the drawing, not the
place*, *deciding letters*, and then Settings, which is roughly the order a
session moves through.

Also taken: the caret that turns over while its menu is down, and a panel wide
enough for a sentence to set on two lines rather than six.

Not taken: the dark navy ground and the teal beam. This instrument's light
editorial ground and burgundy are doing work the dark would undo, and a theme
is a larger question than a menu.

## 14. Dark, done properly

The theme this replaces was the light one with its lightnesses inverted, which
is how a dark mode goes wrong. Three faults followed from it.

**Burgundy lightened enough to read on a dark ground stops being burgundy.** It
arrives at salmon, which the eye reads as a warning rather than as the accent,
and it was being used for the current stop on the trail. So the accent changes
with the ground: a cyan beam is what reads on navy, and it is the colour a
vector display actually made. The token keeps the name `--burgundy` because
every component refers to it; the token is the accent, and burgundy is what the
accent is in daylight.

**A bright accent is right for a mark and wrong for a slab.** At full strength
the beam filling a row made the trail's current stop the brightest thing on
screen. Filled accents in dark become a wash at fourteen per cent with the
accent as the writing and a two-pixel edge, which is what a beam is for.

**Panels sat two per cent off the background**, so nothing separated from
anything. The ground is now three steps (page, panel, menu), a menu or modal
is lighter again, and shadows on dark do so little that panels also carry a
hairline of light along the top edge.

Two smaller things that were louder than anything they described. The ranges
came with the browser's white rails: telling the page `color-scheme: dark`
fixes most of them, since the native widget then draws its own dark track.
The eight steer sliders are four pixels high, where the track is all a range
really shows, and Chrome's dark track is a mid grey that against this navy was
the lightest thing in the panel. Those draw their own rail, filled to the value
in the property's colour.

Light is untouched.

### Dark is the default

A specimen is judged against its ground, and this instrument is a dark room
with letters lit in it. Light is the theme to choose rather than the one to be
given, and Settings still offers System for anyone who wants the machine to
decide.

The theme is now settled before anything else runs. React decides it in an
effect, which is one paint too late: the page showed white and then turned
navy, and on a phone the browser's own chrome stayed wrong until it did. A
short script in `index.html` reads the same key, sets the class and the
background together, and writes a `theme-color` meta so the chrome agrees. The
`dark` state in App is seeded from what that script decided, so the first paint
and the first render do not disagree.

## 15. Axes learned from taste

The eight measured properties are the vocabulary of the craft and are not the
whole of what a designer sees. "More like that one" is the commonest thing said
in front of a rack of proofs, and the instrument had no way to hear it.

**Edit ▸ Learn an axis from faces** takes two handfuls of families, marked
*this* and *not this*, and makes the direction between their means into a
heading. The space is whitened, so that difference is already in the units the
compass travels in. A learned axis joins the steer list beside the measured
eight, because the slider and the dragged specimen both work from a vector
rather than from a key the server knows, so everything that steers already
steers along it.

### It works, and it does not always work

Fitting on four examples against forty others and holding four back:

| Marked | Held-out ranks, of 441 | In the top 20 | Not explained by the eight |
|---|---|---|---|
| monospaced | 6, 10, 11, 7 | 4 of 4 | 91% |
| script | 285, 233, 23, 269 | 0 of 4 | 93% |
| slab | 143, 190, 206, 232, 318, 318, 441 | 0 of 7 | 72% |

Monospaced generalises from four examples and surfaces families nobody marked.
Script does not: the top of that axis is the four training faces and a sibling
of one of them, and the other end is more scripts. Slab learned "plain and
heavy against decorative", which is a real direction and not the one asked for.

**Monospaced names a geometric regularity. Script names a cultural category**,
and brush, copperplate and casual scripts share a word rather than a shape. A
taste axis learns the first and memorises the second, and the two are
indistinguishable until some faces are held back.

So nothing returns an axis without that test beside it. The panel reports how
many of the withheld faces the axis puts near its own top, and how much of the
direction the eight measured properties can already reproduce, since an axis
that is mostly weight is weight and deserves to be named as such rather than
given a second slider. An axis that fails is still usable, and is labelled as
what it is: a direction toward the faces that were marked.

## 16. The two doors

The instrument opened at the centroid, which is the average of 441 families and
a place none of them occupies. It is the one location in the space nobody would
choose, and for three versions it was the only one on offer.

A type designer starts a face at the control characters: `n` and `o` set the
system and the rest is derived from them. Someone choosing a face for a job
starts at a reference: this one, but narrower. Those are two entrances to the
same work.

**Doors rather than modes.** A mode splits an instrument in half and hides each
half from the other, so whoever came in through a reference would have to leave
to settle a letter. A door sets where the work starts and what is on screen
when it does, and shuts nothing off: settling, projection, the map and the
sheet are all reachable from either entrance afterwards.

- **Draw the control characters** sets the specimen to `n o` at 380 pixels,
  turns settling on, and sets the sheet in `nnoonn`, which is the string the
  craft spaces against. Four racks of `nnoonn` along weight, width, spacing and
  x-height, with `n` and `o` large above them.
- **Start from a face you know** lists the corpus set in its own faces, or
  takes a font brought in through projection, and travels there. The readings
  then run from a place rather than from the average: standing on `cardo`
  reads `nearest: cardo · 0.00`, and every step is a departure from something
  real.

Under both, in small type, the old behaviour: begin at the centroid.

The doors are shown on a first visit and whenever a new project is started,
and not in between. `File ▸ New` opens them again, which is the moment a
project actually begins.

### The proof as a strip

The proof used to be an alternative to the map, so looking at candidates meant
losing sight of where they were, and the two competed for the same half of the
window. FontLab runs a waterfall along the bottom of its canvas and RoboFont
runs the Space Center there: a preview is something glanced down at while
working on the thing above it.

So the map keeps the canvas, since it is the one thing here that is a picture
of something rather than a control, and the proof runs along the bottom at a
height that can be dragged. Pulled tall it is the comparison view it was
before; left short it is a glance. `View ▸ Show the proof strip` puts it back
after the × closes it.

The trail stopped truncating at the same time. In a 290px sidebar the row read
`00 origin · the cen…` with `current loc` taking the space the label needed,
and where you are standing is already said by the fill and the edge. Those
words are gone and the label wraps.

## 17. Spacing, by metrics key

The instrument had one slider called tightness, which moves every advance in
the alphabet together. That is a reading of the corpus. Spacing is per glyph,
done by eye against strings the craft has used for a century, and it is where a
face stops being a set of drawings and starts being something that sets text.

**A sidebearing is a formula rather than a number**, after Glyphs' metrics
keys. `=n` on the left of `m` means *mine equals n's*, and it stays true when
`n` moves. `=|n` takes n's other side, `=n+8` adds, `=|` mirrors within the
glyph, and a plain number sets a value. A key may point at a glyph that has a
key of its own; a cycle resolves to the glyph's own sidebearing rather than
running until the stack gives out, because a spacing table is edited by hand
and will be wrong halfway through being right.

The first attempt at this was spacing *groups*: the letters that begin with a
stem should agree, so measure the group and flag the outlier. That inverts the
relationship. A designer is not choosing a number, they are saying that two
letters begin the same way, and the number is a consequence. A group has a
machine guess what the designer would have declared.

### What the corpus adds

A key has to be chosen, and the corpus has an opinion. The instrument reads
sixty families and reports, per side, the three letters whose sidebearing this
one tracks most steadily, with how steadily it held.

**Measured over sixty families drawn at random from the 441**, `m` and `n`
agree on their left sidebearing to within 17.8 units, which is not an opinion
worth having. **Over the sixty nearest the centroid** the same pair holds to
9.7, `o` and `c` to 4.1, `d` and `o` to 7.5, and the pair that should not hold,
`m` against `o`, stays worst at 11.4 and keeps a 21-unit offset.

Spacing conventions are a property of text type. They do not survive a corpus
that also holds blackletter, brush scripts and inline display, so the sample is
the dense middle rather than the whole.

Two corrections the measurement forced. The candidates are restricted to the
same case, since the arithmetic will happily offer `=D` on the right of `o`.
And three keys are offered rather than one: for `m`'s left, `=c+22`, `=r+3` and
`=n-2` sit within two tenths of a unit of each other, and which of them to
write is a judgement about what the letters have in common rather than about
which number came out lowest.

### Where it lives

The Spacing tab of the strip under the canvas, after RoboFont's Space Center:
the string set large, a card per letter with its sidebearings and advance, and
the offered keys as chips under each field. Spacing rides on every request that
draws, so the specimen, the rose, the proof and the compiled font all show the
same thing. Verified in the compiled OTF: `o` with `=n+20` on both sides goes
from advance 1094 and left 92 to 1243 and 180, and n's left is 139, which is
exactly 20 units away at 2048 upem.

## 18. What a project file holds

A `.vgy` recorded the journey and how it was being looked at, and none of what
had been decided about the typeface. Settling a letter, straightening the
outlines, spacing a glyph and naming an axis are the work, and not one of them
could be recovered from the coordinates, so a project that reopened was a walk
with the decisions stripped out of it.

Version 2 adds a `work` block beside `view` and `travel`: the settled letters
and their tolerance, the straighten amount, the sidebearings with their keys,
and the learned axes whole, which means the faces each was fitted from and the
held-out test that said whether it generalised. A vector on its own would make
an axis unusable and unexaminable.

Version 1 files still open. They have no `work`, and the defaults stand in, so
an old journey settles nothing and spaces nothing rather than inheriting
whatever the last project left in the browser.

A learned axis is checked the way the trail is. It is a direction in this space
and nothing at all in another one, so a file carrying an axis of the wrong
length is refused with the two numbers rather than loaded and left to
misbehave.

The unsaved marker counts these too. A file that called itself saved after a
letter had been settled was lying about what was on disk.

The journey export carries the same decisions: every master is compiled with
the same spacing, so sidebearings hold along the axis instead of drifting
between the stops, and `journey.json` records what was set. Verified in the
zip: `o` with `=n+20` on both sides reads 1243/180 against n's 139 in the
static instances and in the variable font alike.

## 19. The character set

Every font editor opens on one. Glyphs calls it Font View and makes it the
first tab of every window; RoboFont runs it down the left of the canvas. It is
where a designer finds out what they have, which letters have been decided and
which have not, and where the work is uneven. This instrument had a specimen of
whatever word was typed and no way to see the other hundred and fifty glyphs
at all.

It sits where the map sits, as the other half of the canvas tab, because it
answers the same kind of question: not what to do next, but what is here.

**Every cell is drawn in one vertical frame**, ascender to descender, rather
than fitted to its own ink. Cells sized to their own ink each look correct and
the set looks like nothing in particular: the point of a grid is that the
baselines line up and the x-heights and cap-heights can be read down a column.

The glyphs are grouped the way a character set is spoken about, lowercase
before capitals before the accented ranges, and the numbers, currency and
punctuation after. A settled letter is tinted, and a letter whose spacing has
been set carries a dot, since nothing in the drawing shows either and the grid
is where a gap in the work is supposed to become visible.

Clicking a glyph sets the specimen in it, which is how a letter is looked at
here. Shift-clicking settles it, so the set is also the fastest way to decide
a group of letters at once.

All 164 are fetched only while the grid is showing: it is the largest thing a
location can be asked for, 336 kB before compression and 117 kB after, and
drawing a word does not need it.
