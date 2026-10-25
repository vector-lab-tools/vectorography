import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, held, type AtlasData, type CorpusInfo,
         type Freedom, type Glyph, type Location,
         type LearnedAxis, type NamedDirection, type Projection,
         type SpacingRow, type SpacingSuggestion,
         type Sheet } from "./api"
import { About } from "./components/About"
import { ProjectionReport } from "./components/Projection"
import { LearnAxis } from "./components/LearnAxis"
import { slide } from "./components/probes"
import { ProofSheet } from "./components/ProofSheet"
import { SpaceCenter } from "./components/SpaceCenter"
import { Atlas, type Waypoint } from "./components/Atlas"
import { CharacterSet } from "./components/CharacterSet"
import { GlyphEdit } from "./components/GlyphEdit"
import { Inspector, Section } from "./components/Inspector"
import { Divergence } from "./components/Divergence"
import { FamilyPicker } from "./components/FamilyPicker"
import { GlyphMetrics } from "./components/GlyphMetrics"
import { Tabs, type Doc } from "./components/Tabs"
import { TrailPalette } from "./components/TrailPalette"
import { Doors } from "./components/Doors"
import { ExportPanel, type ExportKind } from "./components/Export"
import { Help, type HelpTopic } from "./components/Help"
import { Settings, GUIDE_KEY, GUIDE_STYLE_KEY, INK_KEY, THEME_KEY, TEXT_KEY,
         type GuideStyle, type Theme } from "./components/Settings"
import { LicencePicker, LICENCE_KEY, AUTHOR_KEY, type Licence }
  from "./components/Licence"
import { download, NO_WORK, parse, pickFile, pickFont, projectFilename,
         serialise }
  from "./components/project"
import { ShareCard } from "./components/ShareCard"
import { DirectionPad } from "./components/DirectionPad"
import { JourneyTester } from "./components/JourneyTester"
import { MenuBar, type Menu } from "./components/MenuBar"
import { SpecimenStage, type Depth, type DragReport }
  from "./components/SpecimenStage"
import type { HandleKind } from "./components/handles"
import { type Crumb } from "./components/Trail"
import { useIsMobile } from "./hooks/useIsMobile"
import { useKept } from "./kept"

const DEFAULT_TEXT = "Hamburgefonstiv"

/**
 * Proofs, not pangrams. Hamburgefonstiv is the standard control string because
 * it gathers the shape-defining forms in one glance: straight stems, round
 * bowls, arches, junctions, a diagonal. adhesion is the classic lowercase
 * spacing test. The pangram is for reading running text, which is a different
 * judgement from reading a shape.
 */
const dot = (a: number[], c: number[]) =>
  a.reduce((t, ai, i) => t + ai * c[i], 0)

export default function App() {
  const [corpus, setCorpus] = useState<CorpusInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Light by default, which is where this started and where it should have
  // stayed. Type is judged against paper, and every font editor worth the
  // name opens on a white canvas with black letters on it and keeps its own
  // chrome quiet. Dark remains in View and in Settings, and System follows
  // the machine.
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme | null) ?? "light")
  // Seeded from what the inline script in index.html already decided, so the
  // first paint and the first render agree.
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark"))

  const [trail, setTrail] = useState<Crumb[]>([])
  const [cursor, setCursor] = useState(0)
  const [defaultText, setDefaultText] = useState(
    () => localStorage.getItem(TEXT_KEY) || DEFAULT_TEXT)
  /*
    What the window is showing, as tabs.

    One Font tab holding the character set, a tab per string being worked on,
    and the Map. Five separate surfaces used to show the same typeface at once
    with no way to keep two strings open, which is how every font editor has
    worked since Fontographer.
  */
  const [docs, setDocs] = useKept<Doc[]>("vg.docs", [
    { kind: "font" },
    { kind: "text", id: 1, text: "nnoonn" },
    { kind: "text", id: 2, text: DEFAULT_TEXT },
    { kind: "map" },
  ], (v) => Array.isArray(v) && v.length > 0
            && v.some((d) => d && d.kind === "text"))
  const [docAt, setDocAt] = useKept("vg.docat", 1,
    (v) => typeof v === "number" && v >= 0)
  /*
    Text mode sets the string; edit mode draws on one letter of it.

    Edit is the default, because a font editor opens on a glyph. Glyphs,
    FontLab and RoboFont all put one letter at drawing size in front of you
    and keep the string as the thing you check it in. This opened on a word,
    which is the proof rather than the work.
  */
  const [mode, setMode] = useKept<"text" | "edit">("vg.mode", "edit",
    (v) => v === "text" || v === "edit")
  /** The size the canvas sets at, in points. Proof is this, small. */
  const [size, setSize] = useKept("vg.size", 180,
    (v) => typeof v === "number" && v >= 9 && v <= 400)
  /** The trail, open over the work rather than held open beside it. */
  const [trailOpen, setTrailOpen] = useState(false)
  /** What the canvas managed, which is the size asked for unless the string
   *  is too long to fit the box at it. */
  const [drawnAt, setDrawnAt] = useState<number | null>(null)
  /** Both were buttons on the stage toolbar the two canvas modes replaced. */
  const [points, setPoints] = useKept<"on" | "minimal" | "off">(
    "vg.points.v2", "on",
    (v) => v === "on" || v === "minimal" || v === "off")
  const [guides, setGuides] = useKept("vg.guides.v2", true,
    (v) => typeof v === "boolean")
  const [priority, setPriority] = useKept<HandleKind | "all">(
    "vg.handle.v2", "all", (v) => typeof v === "string")
  const at = Math.min(docAt, docs.length - 1)
  const doc = docs[at]
  // The string belongs to a tab. When the Font or Map tab is in front there
  // is still a string to set the map's sample and the proof in, so it is the
  // nearest text tab's rather than nothing.
  const textAt = doc?.kind === "text"
    ? at : docs.findIndex((d) => d.kind === "text")
  const text = (docs[textAt] as { text?: string } | undefined)?.text
    ?? DEFAULT_TEXT
  const setText = useCallback((t: string) => {
    setDocs(docs.map((d, i) =>
      i === textAt && d.kind === "text" ? { ...d, text: t } : d))
  }, [docs, setDocs, textAt])
  const [radius, setRadius] = useKept("vg.radius", 0.6, ((v) => typeof v === "number"))
  const [temperature, setTemperature] = useKept("vg.temp", 0.5, ((v) => typeof v === "number"))
  const [step, setStep] = useKept("vg.step", 0.5, ((v) => typeof v === "number"))
  // View axes, named either as a corpus index ("axis:0") or as a measured
  // property ("dir:weight"). Both are directions in the same space; they differ
  // in who chose them, which is the comparison the instrument exists to make.
  const [axX, setAxX] = useKept("vg.axX", "axis:0", ((v) => typeof v === "string"))
  const [axY, setAxY] = useKept("vg.axY", "axis:1", ((v) => typeof v === "string"))
  const [axZ, setAxZ] = useKept("vg.axZ", "axis:2", ((v) => typeof v === "string"))
  const [family, setFamily] = useState("Unnamed")
  const [testing, setTesting] = useState(false)
  const [about, setAbout] = useState(false)
  const [help, setHelp] = useState<HelpTopic | null>(null)
  /** The name the journey was last saved under, for Save to reuse. */
  const [file, setFile] = useState<string | null>(null)
  const [licensing, setLicensing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** True while the open file is still exactly as it came off disk. */
  const opened = useRef(false)
  const [licence, setLicence] = useState<Licence>(() => ({
    id: localStorage.getItem(LICENCE_KEY) ?? "none",
    author: localStorage.getItem(AUTHOR_KEY) ?? "",
  }))
  // What is being worked on, as opposed to how it is being looked at. Travel
  // is the whole typeface at once; the rest are the scales of work this will
  // grow into, and they are listed now so the shape of the tool is visible
  // before the parts exist.
  const [sharing, setSharing] = useState(false)
  const [directions, setDirections] = useState<NamedDirection[]>([])
  const [atlas, setAtlas] = useState<AtlasData | null>(null)
  const [atlasHeight, setAtlasHeight] = useKept<"density" | "centroid" | "axis">(
    "vg.height", "density",
    (v) => v === "density" || v === "centroid" || v === "axis")
  const [colourBy, setColourBy] = useKept("vg.colour", "serif",
    (v) => typeof v === "string")
  const [waypoint, setWaypoint] = useState<Waypoint | null>(null)
  // The sphere is a way of looking at the space, and it needs the height to be
  // a real axis. Both are held here rather than negotiated between components,
  // which left the ball switched on and invisible.
  const [ballOn, setBallOn] = useState(
    () => localStorage.getItem("vg.ball") !== "0")
  // The vectors spanning the view. With these the client can work out where a
  // dragged specimen has landed without asking the server, which is the
  // difference between moving something and waiting for it to move.
  const basis = useRef<{ u: number[]; v: number[]; w: number[] } | null>(null)
  const dragZ = useRef<number[] | null>(null)
  const dragPending = useRef(false)
  const [liveSelf, setLiveSelf] = useState<
    { x: number; y: number; h: number } | null>(null)

  // Direct manipulation of the specimen.
  const [depth, setDepth] = useKept<Depth>("vg.depth", "handles",
    (v) => v === "handles" || v === "modifier" || v === "perspective")
  const [props3, setProps3] = useKept<[HandleKind, HandleKind, HandleKind]>(
    "vg.props", ["weight", "x-height", "width"],
    (v) => Array.isArray(v) && v.length === 3
           && v.every((k) => typeof k === "string"))
  // Every position passed through, not just where the hand stopped: a drag
  // from thin to fat is a weight axis drawn by hand, and the export should be
  // able to use it.
  const strokePath = useRef<number[][]>([])

  // Undo and redo walk the trail rather than keeping a second history. A stop
  // is already a record of a move, so undo steps back to the parent and redo
  // returns to the stop that was left; nothing is deleted, and a step taken
  // after an undo simply branches, which is what the trail already does.
  const [redoStack, setRedoStack] = useState<number[]>([])
  // A place kept by hand. Shaping runs ahead of the trail: a designer tries
  // twenty things in a row and wants the good one back, not the twentieth.
  // Stops the traveller has marked, by id. Several, because a session worth
  // recording has more than one place worth returning to.
  // How hard decoded outlines are pulled onto the straights they nearly are.
  // A drawing decision rather than a place, so it is kept with the desk.
  const [straight, setStraight] = useKept("vg.straight", 0,
    (v) => typeof v === "number" && v >= 0 && v <= 0.05)
  // Letters the designer has decided. Every move is projected onto the
  // directions these barely feel, so the rest of the alphabet goes on moving
  // while they stay put. Kept, because a decision outlasts a session.
  const [settled, setSettled] = useKept<string[]>("vg.settled", [],
    (v) => Array.isArray(v) && v.every((c) => typeof c === "string"))
  const [settleTol] = useKept("vg.settletol", 0.01,
    (v) => typeof v === "number" && v > 0 && v <= 0.5)
  const [freedom, setFreedom] = useState<Freedom | null>(null)
  // A drawing somebody already made, and where the space puts it.
  const [projected, setProjected] =
    useState<{ result: Projection; file: string } | null>(null)
  // What a step either way along each axis looks like, set as text under the
  // canvas. This is the preview belonging to Diverge > Step rather than a
  // view of its own: the rows are the candidates that item would take.
  const [stepOn, setStepOn] = useKept("vg.step.on", false,
    (v) => typeof v === "boolean")
  const [proofH] = useKept("vg.proofh", 190,
    (v) => typeof v === "number" && v >= 96 && v <= 900)
  // The letter being drawn on, and the drawings. An edited glyph has left the
  // space: it stops following the location, which is what the edit is for.
  const [editChar, setEditChar] = useKept("vg.editchar", "n",
    (v) => typeof v === "string" && v.length === 1)
  const [outlines, setOutlines] = useKept<Record<string, number[][][]>>(
    "vg.outlines", {}, (v) => !!v && typeof v === "object")
  const [editGlyph, setEditGlyph] = useState<Glyph | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pulled, setPulled] = useState<
    { explained: number; residual: number; moved: number } | null>(null)
  const [gridGlyphs, setGridGlyphs] = useState<Glyph[]>([])
  const [gridBusy, setGridBusy] = useState(false)
  // Sidebearings set by hand or by key. An override on the drawing rather
  // than a place, so it is kept with the desk and carried on every request.
  const [spacing, setSpacing] = useKept<Record<string,
    { left?: string; right?: string }>>("vg.spacing", {},
    (v) => !!v && typeof v === "object")
  const [spaceRows, setSpaceRows] = useState<SpacingRow[]>([])
  const [spaceGlyphs, setSpaceGlyphs] = useState<Glyph[]>([])
  const [suggestions, setSuggestions] =
    useState<Record<string, SpacingSuggestion> | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [sheetRadius, setSheetRadius] = useKept("vg.sheetr", 1,
    (v) => typeof v === "number" && v >= 0.2 && v <= 3)
  const [sheetProps, setSheetProps] = useKept<string[]>("vg.sheetprops", [],
    (v) => Array.isArray(v))
  const [sheetBusy, setSheetBusy] = useState(false)
  // Axes the designer named by pointing at faces. They belong to the project
  // rather than to the model, which is why they are kept here and travelled
  // as vectors rather than looked up by a key on the server.
  const [axes, setAxes] = useKept<LearnedAxis[]>("vg.axes", [],
    (v) => Array.isArray(v))
  const [learning, setLearning] = useState(false)
  // Properties held while another is moved. The eight measured directions are
  // not orthogonal, so a step along one drags the others: measured at cardo, a
  // step of 1.5 along slant moves width by -0.96, tightness by +0.96 and
  // x-height by -0.95. Holding the rest is what makes a slider a control.
  const [locks, setLocks] = useKept<string[]>("vg.locks", [],
    (v) => Array.isArray(v))
  // With this on, touching a slider holds every other property for the length
  // of the gesture, which is lock-one-and-twist without having to say so each
  // time. The padlocks are for holding a few while the rest stay free.
  const [isolate, setIsolate] = useKept("vg.isolate", true,
    (v) => typeof v === "boolean")
  // Whether a way in has been chosen. Kept, so the doors are the start of a
  // project rather than a toll gate on every visit; File > New opens them
  // again, which is the moment a project actually begins.
  const [entered, setEntered] = useKept("vg.entered", false,
    (v) => typeof v === "boolean")

  /**
   * The eight measured properties and the designer's own, as one list.
   *
   * A learned axis carries a vector, which is the only thing the steer list
   * and the dragged specimen actually need: both work out where a move lands
   * from the direction itself rather than from a key the server knows. So
   * these sit beside the measured eight instead of in a rail of their own,
   * and everything that steers already steers along them.
   */
  const allDirections = useMemo<NamedDirection[]>(() => [
    ...directions,
    ...axes.map((a, i) => ({
      key: `learned:${i}`,
      label: a.label || `axis ${i + 1}`,
      minus: a.against.slice(0, 2).join(", ") || "away",
      plus: a.liked.slice(0, 2).join(", ") || "toward",
      spread: a.spread,
      vector: a.vector,
      lo: a.lo, hi: a.hi, min: a.min, max: a.max,
    })),
  ], [directions, axes])
  const [guideStyle, setGuideStyle] = useState<GuideStyle>(() => {
    const kept = localStorage.getItem(GUIDE_STYLE_KEY)
    return kept === "dashed" || kept === "dotted" || kept === "hair"
      || kept === "solid" ? kept : "solid"
  })
  const changeGuideStyle = useCallback((v: GuideStyle) => {
    setGuideStyle(v)
    localStorage.setItem(GUIDE_STYLE_KEY, v)
  }, [])
  const [ink, setInk] = useState(
    () => localStorage.getItem(INK_KEY) || "auto")
  const changeInk = useCallback((v: string) => {
    setInk(v)
    localStorage.setItem(INK_KEY, v)
  }, [])
  const [guideInk, setGuideInk] = useState(() => {
    const kept = Number(localStorage.getItem(GUIDE_KEY))
    return kept > 0 ? kept : 0.35
  })
  const changeGuideInk = useCallback((v: number) => {
    setGuideInk(v)
    localStorage.setItem(GUIDE_KEY, String(v))
  }, [])
  const [waypoints, setWaypoints] = useState<number[]>([])
  const flagStop = useCallback((id: number) => {
    setWaypoints((w) => w.includes(id) ? w.filter((x) => x !== id) : [...w, id])
  }, [])
  // The divider that shared the window between the map and a row of panels
  // along the bottom went when the panels did: there is nothing under the
  // canvas any more to take height from. The specimen's own handle stays.
  // Below lg the instruments share one region and swap by tab; the specimen
  // and the atlas stay on screen throughout, because they are the work.
  const isMobile = useIsMobile()
  // How the phone's window is shared between the specimen and whatever tab
  // is showing. Kept, because it is a decision about the desk, and a
  // designer who wants a big map wants it on every visit.
  const [phoneSplit, setPhoneSplit] = useState(() => {
    const kept = Number(localStorage.getItem("vg.split"))
    return kept >= 0.18 && kept <= 0.82 ? kept : 0.4
  })

  // The api module carries these on every request, so a control added later
  // honours what has been settled without having to remember to.
  useEffect(() => {
    held.settled = settled
    held.tol = settleTol
    held.spacing = spacing
    held.outlines = outlines
    if (!settled.length) { setFreedom(null); return }
    let live = true
    api.freedom(settled)
      .then((f) => { if (live) setFreedom(f) })
      .catch(() => { if (live) setFreedom(null) })
    return () => { live = false }
  }, [settled, settleTol, spacing, outlines])

  const toggleSettled = useCallback((ch: string) => {
    setSettled(settled.includes(ch)
      ? settled.filter((c) => c !== ch) : [...settled, ch])
  }, [settled, setSettled])

  // What has been decided, and how much room is left after it.
  const settledNote = useMemo(() => {
    if (!settled.length) return null
    const letters = settled.slice(0, 8).join("")
      + (settled.length > 8 ? `+${settled.length - 8}` : "")
    return `decided \u00b7 ${letters}`
  }, [settled])


  const [location, setLocation] = useState<Location | null>(null)
  const [busy, setBusy] = useState(false)


  const here = trail.find((c) => c.id === cursor) ?? null
  const z = here?.z ?? null
  const seq = useRef(0)
  // Outlines follow the specimen rather than holding it up. Nothing waits on
  // this: until it lands the type is drawn and read, and only the grab points
  // are missing.
  useEffect(() => {
    if (!z) return
    let dead = false
    const t = setTimeout(() => {
      api.location(z, text, false, true, 1, straight)
        .then((loc) => { if (!dead) setGeometry(loc.glyphs) })
        .catch(() => {})
    }, 90)
    return () => { dead = true; clearTimeout(t) }
  }, [z, text, straight])

  const ancestry = useMemo(() => {
    const byId = new Map(trail.map((c) => [c.id, c]))
    const out: Crumb[] = []
    let c = byId.get(cursor)
    while (c) { out.unshift(c); c = c.parent != null ? byId.get(c.parent) : undefined }
    return out
  }, [trail, cursor])

  // The route from the origin to where the cursor now is, which is what the
  // atlas draws. Read from a ref updated by a later effect, it was always one
  // move behind: stepping back left the longer path still on the map.
  const ancestryZ = useMemo(() => ancestry.map((c) => c.z), [ancestry])

  // Every journey begins at the centroid: the average of every font in the
  // corpus. Getting away from it is the work.
  useEffect(() => {
    api.corpus().then((c) => {
      setCorpus(c)
      nextId.current = 1
      setTrail([{ id: 0, z: new Array(c.dims).fill(0), mode: "origin",
                  label: "origin · the centroid", parent: null, depth: 0 }])
      setCursor(0)
      // The empty journey is the baseline, so work done before anything is
      // saved still reports itself as unsaved work.
      armSaved.current = true
    }).catch((e) => setError(String(e)))
    api.directions().then((d) => {
      setDirections(d.directions)
      setCorpus((c) => (c ? { ...c, directions: d.directions } : c))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.basis(axX, axY, axZ, null)
      .then((b) => { basis.current = b })
      .catch(() => { basis.current = null })
  }, [axX, axY, axZ])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  // The theme is a preference, so it is kept; "system" means it is not ours
  // to decide and we follow the machine, including when it changes under us.
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    if (theme !== "system") { setDark(theme === "dark"); return }
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => setDark(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [theme])

  // The atlas draws the first three letters of the specimen per font: enough
  // of a word to judge a face by, and few enough that the map stays a map.
  const atlasChar = useMemo(() => {
    const t = [...text].filter((c) => /[A-Za-z0-9]/.test(c)).slice(0, 3).join("")
    return t || "Ham"
  }, [text])


  // What the sheet sets. The specimen's own text is usually one word, and a
  // word at three hundred pixels says nothing about how a face reads.
  const [proofText, setProofText] = useKept<string>("vg.prooftext",
    "Handgloves and quartz jigs. The quick brown fox jumps over the lazy dog.",
    (v) => typeof v === "string")

  // Location and neighbourhood follow the position. Nothing is fetched that
  // was not asked for by a move.
  useEffect(() => {
    if (!z) return
    const n = ++seq.current
    setBusy(true)
    Promise.all([
      api.location(z, text, false, false, 24, straight),
      // The map is drawn from the families' own font files, so the server
      // only has to decode the traveller's own specimen.
      api.atlas({ z, text: atlasChar, ax: axX, ay: axY, az: axZ,
                  height: ballOn ? "axis" : atlasHeight,
                  sprites: 0, colour_by: colourBy, trail: ancestryZ }),
    ]).then(([loc, atl]) => {
      if (n !== seq.current) return
      setLocation(loc)
      setAtlas(atl)
      // The locally computed position is let go only now, when the server's
      // own answer is in hand. Dropped at the end of the gesture instead, the
      // mark fell back to the previous location for as long as the request
      // took and the map jumped back before jumping forward.
      if (dragZ.current === null) {
        setLiveSelf(null)
      }
    }).catch((e) => { if (n === seq.current) setError(String(e)) })
      .finally(() => { if (n === seq.current) setBusy(false) })
  }, [z, text, atlasChar, axX, axY, axZ,
      atlasHeight, colourBy, ballOn, ancestryZ, straight])

  // The sheet is fetched only while it is being looked at. It is the largest
  // response the server gives, a paragraph decoded for every candidate, and
  // keeping it current behind the atlas would cost that on every move for
  // nothing.
  useEffect(() => {
    if (!z || !stepOn) return
    let live = true
    setSheetBusy(true)
    api.sheet({ z, text: proofText, radius: sheetRadius,
                properties: sheetProps, straight })
      .then((r) => { if (live) setSheet(r) })
      .catch((e) => { if (live) setError(String(e)) })
      .finally(() => { if (live) setSheetBusy(false) })
    return () => { live = false }
  }, [z, stepOn, proofText, sheetRadius, sheetProps, straight])

  // The sidebearings under the letters, and in the inspector for whichever
  // letter is selected. A decode and a measure per glyph, which is cheap.
  useEffect(() => {
    if (!z) return
    let live = true
    api.spacing({ z, text, straight })
      .then((r) => { if (live) setSpaceRows(r.rows) })
      .catch(() => { if (live) setSpaceRows([]) })
    api.location(z, text, false, false, 1, straight)
      .then((l) => { if (live) setSpaceGlyphs(l.glyphs) })
      .catch(() => { if (live) setSpaceGlyphs([]) })
    return () => { live = false }
  }, [z, text, straight, spacing])

  // The letter being drawn on, with its points. Asked for with geometry,
  // which the specimen does not need and the editor cannot work without.
  useEffect(() => {
    if (!z || doc?.kind !== "text" || mode !== "edit") return
    let live = true
    api.location(z, editChar, false, true, 1, straight)
      .then((l) => { if (live) setEditGlyph(l.glyphs[0] ?? null) })
      .catch(() => { if (live) setEditGlyph(null) })
    return () => { live = false }
  }, [z, doc?.kind, mode, editChar, straight, spacing, outlines])

  // All 164 glyphs, fetched only while the grid is showing. It is the largest
  // thing a location can be asked for, 336 kB before compression, and drawing
  // a specimen does not need it.
  useEffect(() => {
    if (!z || doc?.kind !== "font") return
    let live = true
    setGridBusy(true)
    api.location(z, "", true, false, 1, straight)
      .then((l) => { if (live) setGridGlyphs(l.glyphs) })
      .catch(() => { if (live) setGridGlyphs([]) })
      .finally(() => { if (live) setGridBusy(false) })
    return () => { live = false }
  }, [z, doc?.kind, straight, spacing])

  // Ids come from a counter rather than from the trail's length, and the
  // updater stays pure. Setting the cursor inside it made the update a side
  // effect, which React is free to run twice, and it duplicated crumbs.
  const nextId = useRef(1)

  const push = useCallback((nz: number[], mode: string, label: string,
                            path?: number[][]) => {
    const id = nextId.current++
    setTrail((prev) => {
      const parent = prev.find((c) => c.id === cursor)
      const isTip = prev.length > 0 && prev[prev.length - 1].id === cursor
      const d = parent ? (isTip ? parent.depth : parent.depth + 1) : 0
      return [...prev, { id, z: nz, mode, label, parent: cursor, depth: d,
                         path: path && path.length > 2 ? path : undefined }]
    })
    setCursor(id)
    setRedoStack([])
  }, [cursor])

  /** Cheap signature of everything a project file holds. Comparing it against
   *  the last save is how the panel knows the work has moved on. */
  const signature = useMemo(() => JSON.stringify([
    trail.map((c) => c.id), cursor, text, family, waypoints,
    axX, axY, axZ, colourBy, atlasHeight, ballOn, depth,
    radius, temperature, step,
    // Settling a letter, spacing one, straightening the outlines or naming an
    // axis are all changes to the work, and a file that calls itself saved
    // after any of them is lying about what is on disk.
    settled, settleTol, straight, spacing, Object.keys(outlines),
    axes.map((a) => a.label),
  ]), [trail, cursor, text, family, waypoints, axX, axY, axZ, colourBy,
       atlasHeight, ballOn, depth, radius, temperature, step,
       settled, settleTol, straight, spacing, outlines, axes, docs])
  /** The signature as it was when the journey was last written or opened.
   *  Taken during render rather than in an effect: an effect on mount runs
   *  twice in development, and the second run took its reading after the first
   *  move had already been made, so the first move never registered. */
  const savedSig = useRef<string | null>(null)
  const armSaved = useRef(true)
  const [, setMark] = useState(0)

  if (corpus && armSaved.current) {
    armSaved.current = false
    savedSig.current = signature
  }

  const fileState: "new" | "loaded" | "edited" | "saved" =
    signature !== savedSig.current ? "edited"
      : file ? (opened.current ? "loaded" : "saved")
      : "new"

  /** Start again at the centroid, keeping the settings but not the journey. */
  const newProject = useCallback(() => {
    if (!corpus) return
    if (trail.length > 1 &&
        !window.confirm("Start a new journey? The current one is not saved."))
      return
    nextId.current = 1
    setTrail([{ id: 0, z: new Array(corpus.dims).fill(0), mode: "origin",
                label: "origin \u00b7 the centroid", parent: null, depth: 0 }])
    setCursor(0)
    setRedoStack([])
    setWaypoints([])
    setFile(null)
    setSettled([])
    setSpacing({})
    setOutlines({})
    setStraight(0)
    setEntered(false)
    armSaved.current = true
    opened.current = false
    setMark((m) => m + 1)
  }, [corpus, trail.length])

  const saveAs = useCallback(() => {
    const name = window.prompt("Save the journey as", file ?? projectFilename(family))
    if (!name) return
    const full = name.endsWith(".vgy") ? name : name + ".vgy"
    download(full, serialise({
      model: corpus?.model ?? null,
      family, text, trail, cursor, waypoints,
      view: { axX, axY, axZ, colourBy, atlasHeight, ballOn, depth },
      travel: { radius, temperature, step },
      work: { settled, settleTol, straight, spacing, outlines, axes,
              docs },
    }))
    setFile(full)
    savedSig.current = signature
    opened.current = false
    setMark((m) => m + 1)
  }, [signature, atlasHeight, axX, axY, axZ, ballOn, colourBy, corpus, cursor, depth,
      family, file, radius, waypoints, step, temperature, text, trail,
      settled, settleTol, straight, spacing, outlines, axes])

  /** The browser gives a page no way to write back to a file it was handed,
   *  so Save is Save As with the name already filled in. */
  const save = useCallback(() => {
    if (!file) return saveAs()
    download(file, serialise({
      model: corpus?.model ?? null,
      family, text, trail, cursor, waypoints,
      view: { axX, axY, axZ, colourBy, atlasHeight, ballOn, depth },
      travel: { radius, temperature, step },
      work: { settled, settleTol, straight, spacing, outlines, axes,
              docs },
    }))
    savedSig.current = signature
    opened.current = false
    setMark((m) => m + 1)
  }, [signature, atlasHeight, axX, axY, axZ, ballOn, colourBy, corpus, cursor, depth,
      family, file, radius, saveAs, waypoints, step, temperature, text, trail,
      settled, settleTol, straight, spacing, outlines, axes, docs])

  /**
   * Run the space backwards: take a drawing somebody already made and ask
   * where it sits. Everything else here begins at a location and produces
   * letters, which is the direction a designer does not work in.
   */
  const projectFont = useCallback(async () => {
    const f = await pickFont()
    if (!f) return
    setBusy(true)
    try {
      const result = await api.project(f)
      setProjected({ result, file: f.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not project that font")
    } finally {
      setBusy(false)
    }
  }, [])

  const openProject = useCallback(async () => {
    if (!corpus) return
    if (trail.length > 1 &&
        !window.confirm("Open a project? The current journey is not saved."))
      return
    const picked = await pickFile()
    if (picked == null) return
    try {
      const doc = parse(picked.text, corpus.dims)
      nextId.current = Math.max(...doc.trail.map((c) => c.id)) + 1
      setTrail(doc.trail)
      setCursor(doc.cursor)
      setFamily(doc.family)
      setText(doc.text)
      setWaypoints(doc.waypoints ?? [])
      setAxX(doc.view.axX); setAxY(doc.view.axY); setAxZ(doc.view.axZ)
      setColourBy(doc.view.colourBy)
      setAtlasHeight(doc.view.atlasHeight as typeof atlasHeight)
      setBallOn(doc.view.ballOn)
      setDepth(doc.view.depth)
      setRadius(doc.travel.radius)
      setTemperature(doc.travel.temperature)
      setStep(doc.travel.step)
      // What was decided about the typeface, as against where it stands. A
      // version 1 file has none of this and parse fills the defaults, so
      // opening an old journey settles nothing and spaces nothing rather
      // than leaving whatever the last project left behind.
      const w = doc.work ?? { ...NO_WORK }
      setSettled(w.settled)
      setStraight(w.straight)
      setSpacing(w.spacing)
      setOutlines(w.outlines ?? {})
      setAxes(w.axes as LearnedAxis[])
      if (Array.isArray(w.docs) && w.docs.length) {
        setDocs(w.docs as Doc[])
        setDocAt(0)
      }
      setRedoStack([])
      setFile(picked.name)
      // The reading is taken once the state above has landed, not here.
      armSaved.current = true
      opened.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [corpus, trail.length])

  // Sane means inside the corpus: the space is centred, so a position's
  // distance from the origin is its distance from the average of every font,
  // and past the furthest real family the decoded outlines are guesses.
  const hull = corpus?.centroid_max ?? Infinity
  const isSane = useCallback((p: number[]) =>
    Math.hypot(...p) <= hull, [hull])

  /** Back to the last place that was still in the corpus. */
  const resetToSane = useCallback(() => {
    const byId = new Map(trail.map((c) => [c.id, c]))
    let c = byId.get(cursor)
    while (c) {
      if (isSane(c.z)) { setCursor(c.id); return }
      c = c.parent != null ? byId.get(c.parent) : undefined
    }
    setCursor(trail[0]?.id ?? 0)
  }, [trail, cursor, isSane])

  /** Half the way to the nearest real family, and again on the next press. */
  const rigidify = useCallback(async () => {
    const near = location?.neighbours?.[0]
    if (!z || !near) return
    setBusy(true)
    try {
      const r = await api.fontPosition(near.family)
      push(z.map((v, i) => v + (r.z[i] - v) * 0.5), "rigidify",
           `half toward ${near.family}`)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [location, push, z])

  const undo = useCallback(() => {
    const cur = trail.find((c) => c.id === cursor)
    if (!cur || cur.parent == null) return
    setRedoStack((r) => [...r, cur.id])
    setCursor(cur.parent)
  }, [trail, cursor])

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (!r.length) return r
      const id = r[r.length - 1]
      if (trail.some((c) => c.id === id)) setCursor(id)
      return r.slice(0, -1)
    })
  }, [trail])

  const travel = useCallback(async (body: Record<string, unknown>,
                                    mode: string, label: string) => {
    if (!z) return
    setBusy(true)
    try {
      const r = await api.travel({ z, radius, ax: axX, ay: axY, az: axZ,
                                   ride: null, temperature, step,
                                   ...body })
      push(r.z, mode, label)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, radius, axX, axY, axZ, temperature, step, push])

  const walk = useCallback((bearing: number) =>
    travel({ mode: "walk", bearing }, "walk",
           `walk ${String(bearing).padStart(3, "0")}° r${radius.toFixed(2)}`),
    [travel, radius])

  /** Where a position sits in the atlas's own coordinates, so the mark can be
   *  moved before the server has been asked anything. */
  // Outlines for hit-testing, fetched apart from the specimen. Asked for in the
  // same breath, the letters waited on a payload twenty times their size and
  // the panel sat empty saying so.
  const [geometry, setGeometry] = useState<Glyph[] | null>(null)
  /** Bumped by a slider so the readings recompute under the finger. */
  const [slideTick, setSlideTick] = useState(0)

  const atlasPoint = useCallback((p: number[]) => {
    const b = basis.current
    if (!b) return null
    const rng = atlas?.range
    const h = rng && atlas?.axes.height === "axis"
      ? (dot(p, b.w) - rng.h_min) / Math.max(rng.h_max - rng.h_min, 1e-6)
      : (liveSelf?.h ?? atlas?.self.h ?? 0)
    // Radius in the three directions on screen, the same quantity the server
    // reports, so the reading and the mark cannot disagree.
    const x = dot(p, b.u), y = dot(p, b.v)
    return { x, y, h }
  }, [atlas, liveSelf])

  const dragStart = useCallback((_aiming: HandleKind[]) => {
    strokePath.current = z ? [z] : []
  }, [z])

  /** One step of a gesture on the letterform. */
  const dragMove = useCallback((r: DragReport) => {
    const from = dragZ.current ?? z
    if (!from) return
    // Movement is per property, in whitened units. The scale is set so that
    // pulling a stem across its own width is a step, not a leap.
    const GAIN = 5.2
    let nz = [...from]
    for (const m of r.moves) {
      const d = directions.find((x) => x.key === m.key)
      if (!d?.vector) continue
      const k = m.amount * GAIN * (d.spread || 1) * 0.1
      for (let i = 0; i < nz.length; i++) nz[i] += k * d.vector[i]
    }
    if (nz.every((v, i) => v === from[i])) return

    // Sanity, in the space rather than on the screen. Nothing legitimate moves
    // you a long way in one step, and past the corpus the outlines are guesses,
    // so a single step is bounded and the total is not allowed to run off to
    // somewhere no font has ever been.
    const STEP_MAX = 0.6
    const step = Math.hypot(...nz.map((v, i) => v - from[i]))
    if (step > STEP_MAX) {
      const k = STEP_MAX / step
      nz = from.map((v, i) => v + (nz[i] - v) * k)
    }
    const OUT_MAX = (corpus?.centroid_max ?? 22) * 1.35
    const out = Math.hypot(...nz)
    if (out > OUT_MAX) {
      const k = OUT_MAX / out
      nz = nz.map((v) => v * k)
    }

    dragZ.current = nz
    strokePath.current.push(nz)

    setLiveSelf(atlasPoint(nz))
    if (dragPending.current) return
    dragPending.current = true
    api.location(nz, text, false, false, 24, straight)
      .then((loc) => setLocation(loc))
      .catch(() => {})
      .finally(() => { dragPending.current = false })
  }, [z, text, directions, corpus, atlasPoint])

  const dragEnd = useCallback(() => {
    const path = strokePath.current
    const nz = dragZ.current
    dragZ.current = null
    strokePath.current = []
    // The whole gesture goes on the trail as one stop, with the path it took
    // kept alongside so it can be compiled as an axis of its own.
    if (nz) push(nz, "shape", "shaped by hand", path)
  }, [push])

  const goToward = useCallback((w: Waypoint, amount: number | null) =>
    travel({ mode: "toward", target_x: w.x, target_y: w.y, amount },
           "toward", amount === null
             ? `to ${w.x.toFixed(1)}, ${w.y.toFixed(1)}`
             : `toward ${w.x.toFixed(1)}, ${w.y.toFixed(1)}`),
    [travel])

  // Where the current location stands on each measured property: its
  // projection onto that direction, which is what a slider can show.
  // Recomputed while a slider is under the finger, not when the server
  // answers. Keyed on the location alone, the thumb moved at the rate of a
  // round trip: on a phone the track lagged a finger by a visible margin, and
  // the control felt like it was arguing rather than responding. Eight dot
  // products against 128 numbers is nothing to do on a render.
  const standing = useMemo(() => {
    const src = dragZ.current ?? z
    const out: Record<string, number> = {}
    if (!src) return out
    for (const d of directions) {
      if (d.vector) out[d.key] = dot(src, d.vector)
    }
    return out
  }, [z, directions, location, slideTick])

  /** Travel along one property until its projection reads the asked-for value. */
  const slideTo = useCallback((key: string, value: number) => {
    setSlideTick((t) => t + 1)
    const d = allDirections.find((x) => x.key === key)
    if (!d?.vector) return
    const from = dragZ.current ?? z
    if (!from) return
    // Everything held for this gesture: the padlocked properties, and with
    // isolate on, every other property too. The reading stays the projection
    // onto the direction as written, so the slider means the same thing
    // whether anything is held or not.
    const heldKeys = isolate
      ? allDirections.filter((x) => x.key !== key).map((x) => x.key)
      : locks.filter((k) => k !== key)
    const held = heldKeys
      .map((k) => allDirections.find((x) => x.key === k)?.vector)
      .filter((v): v is number[] => !!v)
    const nz = slide(from, d.vector, held, value)
    if (!nz) return
    dragZ.current = nz
    if (!strokePath.current.length) strokePath.current = [from]
    strokePath.current.push(nz)
    // The map moves with the slider: the position is computed here, so the
    // mark does not wait for the server to say where it went.
    setLiveSelf(atlasPoint(nz))

    if (dragPending.current) return
    dragPending.current = true
    // No geometry and few neighbours: the grab points are refreshed by their
    // own effect when the slide ends, and asking for them on every frame of a
    // drag was the server's work, the wire's work, and the wait.
    api.location(nz, text, false, false, 3, straight)
      .then((loc) => setLocation(loc))
      .catch(() => {})
      .finally(() => { dragPending.current = false })
  }, [directions, z, text, atlasPoint])

  /** The slider was let go: the move becomes one stop. */
  const slideCommit = useCallback(() => {
    const nz = dragZ.current
    dragZ.current = null
    strokePath.current = []
    if (nz) push(nz, "steer", "set by slider")
  }, [push])

  const goToFamily = useCallback(async (name: string) => {
    try {
      const { z: fz } = await api.fontPosition(name)
      push(fz, "jump", `at ${name}`)
    } catch (e) { setError(String(e)) }
  }, [push])

  /** Bring a text tab to the front, since both canvas modes work on one. */
  const goToText = useCallback(() => {
    if (doc?.kind !== "text") {
      const i = docs.findIndex((d) => d.kind === "text")
      if (i >= 0) setDocAt(i)
    }
  }, [doc, docs, setDocAt])

  // Arrow keys move. The instrument should feel like a vehicle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const map: Record<string, number> = {
        ArrowRight: 0, ArrowUp: 90, ArrowLeft: 180, ArrowDown: 270 }
      if (e.key in map) { e.preventDefault(); walk(map[e.key]); return }
      if (e.key === "d") travel({ mode: "drift" }, "drift",
                                `drift t${temperature.toFixed(2)}`)
      if (e.key === "r") travel({ mode: "repel" }, "repel",
                                `repel s${step.toFixed(2)}`)
      if (e.key === "Backspace" && here?.parent != null) {
        e.preventDefault(); undo()
      }
      if (e.key === "Escape") { e.preventDefault(); resetToSane(); return }
      if (e.key === "t" || e.key === "T") { goToText(); setMode("text") }
      if (e.key === "e" || e.key === "E") { goToText(); setMode("edit") }
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      }
      // The File menu names these, so they have to exist.
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault()
        e.shiftKey ? saveAs() : save()
      }
      if (meta && e.key.toLowerCase() === "o") { e.preventDefault(); openProject() }
      if (meta && e.key.toLowerCase() === "n") { e.preventDefault(); newProject() }
      if (meta && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault(); setExporting(true)
      }
      if (meta && e.key === ",") { e.preventDefault(); setSettingsOpen(true) }
      if (meta && e.key === "1") {
        e.preventDefault()
        const i = docs.findIndex((d) => d.kind === "font")
        if (i >= 0) setDocAt(i)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [walk, travel, temperature, step, here, undo, redo, resetToSane,
      save, saveAs, openProject, newProject, goToText, setMode, docs, setDocAt])

  // The journey exported is the path actually taken to get here, root to
  // cursor, so a branch exports its own line rather than the whole tree.

  const exportJourney = useCallback(async () => {
    if (ancestry.length < 2) return
    setBusy(true)
    try {
      await api.download("/api/export/journey",
        { trail: ancestry.map((c) => c.z), family,
          masters: Math.min(Math.max(ancestry.length, 2), 12),
          licence: licence.id, author: licence.author,
          straight, spacing },
        `${family}-journey.zip`)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [ancestry, family, licence, straight, spacing])

  const exportSvg = useCallback(async () => {
    if (!z) return
    try { await api.download("/api/export/svg", { z, text }, "specimen.svg") }
    catch (e) { setError(String(e)) }
  }, [z, text])

  const exportFamily = useCallback(async () => {
    if (!z) return
    setBusy(true)
    try {
      await api.exportFamily(z, family, licence.id, licence.author, straight)
    }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, family, licence])

  const exportFont = useCallback(async (format: "otf" | "ttf") => {
    if (!z) return
    setBusy(true)
    try {
      const near = location?.neighbours?.[0]?.family
      // Always Regular. The stop number belongs to the journey, not to the
      // name of a face, and it was ending up in font menus as Henrik Stop 7.
      const style = "Regular"
      await api.exportFont(z, family, style, format,
                           licence.id, licence.author, straight)
      void near
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, family, location, here, licence])

  const exportUfo = useCallback(async () => {
    if (!z) return
    setBusy(true)
    try { await api.exportUfo(z, family, licence.id, licence.author) }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, family, licence])

  const exportUfoJourney = useCallback(async () => {
    if (ancestry.length < 2) return
    setBusy(true)
    try {
      await api.download("/api/export/ufo-journey",
        { trail: ancestry.map((c) => c.z), family,
          masters: Math.min(Math.max(ancestry.length, 2), 12),
          licence: licence.id, author: licence.author },
        `${family}-source.zip`)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [ancestry, family, licence])

  const exportGlyphSvg = useCallback(async () => {
    if (!z) return
    setBusy(true)
    try { await api.exportGlyphSvg(z, family) }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, family])

  const runExport = useCallback((kind: ExportKind) => {
    switch (kind) {
      case "otf": return void exportFont("otf")
      case "ttf": return void exportFont("ttf")
      case "family": return void exportFamily()
      case "variable": return void exportJourney()
      case "ufo": return void exportUfo()
      case "ufo-journey": return void exportUfoJourney()
      case "glyph-svg": return void exportGlyphSvg()
      case "specimen": return void exportSvg()
      case "test": return setTesting(true)
    }
  }, [exportFont, exportJourney, exportUfo, exportUfoJourney, exportGlyphSvg,
      exportSvg])

  const changeBall = useCallback((v: boolean) => {
    setBallOn(v)
    localStorage.setItem("vg.ball", v ? "1" : "0")
  }, [])

  const changeLicence = useCallback((v: { id: string; author: string }) => {
    setLicence(v)
    localStorage.setItem(LICENCE_KEY, v.id)
    localStorage.setItem(AUTHOR_KEY, v.author)
  }, [])

  const changeDefaultText = useCallback((t: string) => {
    setDefaultText(t)
    localStorage.setItem(TEXT_KEY, t)
  }, [])

  const forgetAll = useCallback(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("vg.")) localStorage.removeItem(k)
    setTheme("system")
    setDefaultText(DEFAULT_TEXT)
    setLicence({ id: "none", author: "" })
    setBallOn(true)
  }, [])

  /*
    What the corpus would write for each sidebearing, and how steadily.

    Restricted to the sixty families nearest the centroid, not all 441.
    Across the whole corpus m and n agree to only +/-17.8 units, which is no
    use; in the text core m~n holds to +/-9.7 and o~c to +/-4.1.
  */
  const suggest = useCallback(async () => {
    if (!z) return
    setSuggesting(true)
    try {
      const r = await api.spacing({ z, text, straight, suggest: true })
      setSuggestions(r.suggested ?? null)
      setSpaceRows(r.rows)
    } catch (e) { setError(String(e)) }
    finally { setSuggesting(false) }
  }, [z, text, straight])

  /*
    Move the typeface to a drawing, as far as the space can reach it.

    A hand-drawn contour is not a point in the space: it is 401 coordinates
    against 128 dimensions, so the fit is a least squares with the corpus
    prior as its ridge term. Measured: a stretched contour pulls to 47.6 per
    cent of the way, a single moved point to 6. The drawing is then let go,
    because the point of travelling there is that the letter has become
    something the space can say.
  */
  const pullToDrawing = useCallback(async () => {
    if (!z) return
    setPulling(true)
    try {
      const r = await api.pull({ z, glyphs: [editChar] })
      setPulled({ explained: r.explained, residual: r.residual_overall,
                  moved: r.moved })
      const next = { ...outlines }
      delete next[editChar]
      setOutlines(next)
      push(r.z, "jump", `pulled to ${editChar}`)
    } catch (e) { setError(String(e)) }
    finally { setPulling(false) }
  }, [z, editChar, outlines, setOutlines, push])

  /*
    Six menus, twenty-four items, each named in a word or two.

    There were thirty-three, several of them a sentence long, and six of them
    did the same work as something else: "Project a font" and opening from a
    face, "Draw" and entering edit mode, a Mode menu of views, waypoints in
    two places. An item that has to explain itself cannot be scanned, and the
    sentence that explained it is a tooltip, which is where it is now.

    The division is by what an item acts on. File is the document. Glyph is
    the letter or letters selected, and nothing else, which is also what
    network bending needs: a group chosen, then one deterministic transform on
    it. Diverge moves the typeface through the space. View changes what is on
    the screen and never the work.
  */
  const menus: Menu[] = useMemo(() => [
    {
      label: "File",
      items: [
        { kind: "item", label: "New", hint: "\u2318N", onSelect: newProject,
          title: "Back to the doors with an empty trail" },
        { kind: "item", label: "Open", hint: "\u2318O", onSelect: openProject,
          title: "A saved project, its branches and its decisions" },
        { kind: "item", label: "Save", hint: "\u2318S", disabled: !z,
          onSelect: save,
          title: file ? `Save over ${file}` : "Save the project" },
        { kind: "item", label: "Save As", hint: "\u21e7\u2318S", disabled: !z,
          onSelect: saveAs, title: "Save under a new name" },
        { kind: "sep" },
        { kind: "item", label: "Import font", disabled: busy,
          onSelect: projectFont,
          title: "Where a typeface you already have sits in the space, and "
                 + "what the space cannot say about it" },
        { kind: "sep" },
        { kind: "item", label: "Export", hint: "\u21e7\u2318E", disabled: !z,
          onSelect: () => setExporting(true),
          title: "Fonts to install, source to keep working on, or outlines "
                 + "to draw with" },
        { kind: "item", label: "Share", disabled: !z,
          onSelect: () => setSharing(true),
          title: "This face as a card, to send, copy or save" },
      ],
    },
    {
      label: "Edit",
      items: [
        { kind: "item", label: "Undo", hint: "\u2318Z",
          disabled: here?.parent == null, onSelect: undo,
          title: "Step back to where you came from. Nothing is deleted: a "
                 + "step taken after an undo branches the trail." },
        { kind: "item", label: "Redo", hint: "\u21e7\u2318Z",
          disabled: !redoStack.length, onSelect: redo,
          title: "Return to the stop you stepped back from" },
        { kind: "sep" },
        { kind: "item", label: "Settings", hint: "\u2318,",
          onSelect: () => setSettingsOpen(true),
          title: "Theme, guides, how the hand drives the letters, and the "
                 + "licence exports carry" },
      ],
    },
    {
      label: "Glyph",
      items: [
        { kind: "item",
          label: settled.includes(editChar) ? "Undecide" : "Decide",
          hint: editChar, disabled: !z,
          on: settled.includes(editChar),
          onSelect: () => toggleSettled(editChar),
          title: `Hold ${editChar} while everything else moves. Moves are `
                 + "then projected onto the directions the decided letters "
                 + "barely feel, so the rest of the alphabet goes on moving." },
        { kind: "item", label: "Reset", hint: editChar,
          disabled: !outlines[editChar] && !spacing[editChar],
          onSelect: () => {
            const o = { ...outlines }; delete o[editChar]; setOutlines(o)
            const sp = { ...spacing }; delete sp[editChar]; setSpacing(sp)
            setPulled(null)
          },
          title: `Drop the drawing and the sidebearings on ${editChar} and `
                 + "let it follow the space again" },
        { kind: "sep" },
        { kind: "item",
          label: straight === 0 ? "Straighten"
            : straight < 0.01 ? "Straighten harder" : "Straighten off",
          disabled: !z,
          onSelect: () => setStraight(straight === 0 ? 0.006
            : straight < 0.01 ? 0.014 : 0),
          title: "Pull the runs between corners onto the straights they "
                 + "nearly are. Changes the drawing, not the location. This "
                 + "one is still the whole alphabet rather than the "
                 + "selection." },
      ],
    },
    {
      label: "Diverge",
      items: [
        { kind: "item", label: "Step", on: stepOn,
          disabled: !z, onSelect: () => setStepOn(!stepOn),
          title: "A step either way along each axis, set as text under the "
                 + "canvas. Every row moves the letters the same distance, "
                 + "0.04 em, so the rows can be read against each other." },
        { kind: "item", label: "Drift", disabled: !z || busy,
          onSelect: () => travel({ mode: "drift" }, "drift",
                                 `drift t${temperature.toFixed(2)}`),
          title: "Somewhere nearby that the corpus thinks is plausible. The "
                 + "amount is in Settings." },
        { kind: "item", label: "Repel", disabled: !z || busy,
          onSelect: () => travel({ mode: "repel" }, "repel",
                                 `repel s${step.toFixed(2)}`),
          title: "Away from the nearest real families, into the gaps between "
                 + "what exists" },
        { kind: "item", label: "Rigidify",
          hint: location?.neighbours?.[0]?.family,
          disabled: !z || busy || !location?.neighbours?.length,
          onSelect: rigidify,
          title: "Half the way to the nearest real family, and half again on "
                 + "the next press" },
        { kind: "sep" },
        { kind: "item", label: "Pull here", hint: editChar,
          disabled: !z || pulling || !outlines[editChar],
          onSelect: pullToDrawing,
          title: `Move the typeface to the drawing on ${editChar}, as far as `
                 + "the space can reach it, and say how far that was" },
        { kind: "sep" },
        { kind: "item", label: "Name axis",
          hint: axes.length ? `${axes.length}` : undefined,
          onSelect: () => setLearning(true),
          title: "Mark faces as this and not this. The direction between "
                 + "them joins the axes, and is tested on faces it was not "
                 + "shown." },
      ],
    },
    {
      label: "View",
      items: [
        { kind: "item", label: "Font view", hint: "\u23181",
          on: doc?.kind === "font",
          onSelect: () => setDocAt(docs.findIndex((d) => d.kind === "font")),
          title: "Every glyph in the character set, with the decided ones "
                 + "marked" },
        { kind: "item", label: "Text mode", hint: "T",
          on: doc?.kind === "text" && mode === "text",
          onSelect: () => { goToText(); setMode("text") },
          title: "The string, at the size it will be set at" },
        { kind: "item", label: "Edit mode", hint: "E",
          on: doc?.kind === "text" && mode === "edit",
          onSelect: () => { goToText(); setMode("edit") },
          title: `Draw on ${editChar} point by point` },
        { kind: "sep" },
        { kind: "item", label: "Map", on: doc?.kind === "map",
          onSelect: () => setDocAt(docs.findIndex((d) => d.kind === "map")),
          title: "Where this face sits among the 441 families" },
        { kind: "item", label: "Trail", on: trailOpen,
          onSelect: () => setTrailOpen(!trailOpen),
          title: "Every stop this project has made. The stops are the "
                 + "weights an export compiles and the route between them is "
                 + "the axis." },
        { kind: "sep" },
        { kind: "item", label: "Dark mode", on: dark,
          onSelect: () => setTheme(dark ? "light" : "dark"),
          title: "Remembered. Settings has a System option that follows the "
                 + "machine." },
      ],
    },
    {
      label: "Help",
      items: [
        { kind: "item", label: "Guide", onSelect: () => setHelp("what"),
          title: "What the instrument is, what the readings mean, and the "
                 + "three things it will not do" },
        { kind: "item", label: "Shortcuts", onSelect: () => setHelp("keys"),
          title: "Every key and gesture, and what it moves" },
        { kind: "sep" },
        { kind: "item", label: "About", onSelect: () => setAbout(true) },
      ],
    },
  ], [z, busy, dark, stepOn, setStepOn, exportFont, here, redoStack.length,
      undo, redo, newProject, openProject, projectFont, save, saveAs, file,
      theme, settled, toggleSettled, editChar, outlines, setOutlines, spacing,
      setSpacing, straight, setStraight, location, rigidify, axes.length,
      travel, temperature, step, pulling, pullToDrawing, doc, docs, setDocAt,
      mode, setMode, goToText, trailOpen, setTheme])

  if (error && !corpus) return <Fatal message={error} />
  /**
   * The two doors, and the state each leaves behind it.
   *
   * A door sets where the work starts and what is on screen when it does.
   * None of them shuts anything off: settling, projection, the map and the
   * sheet are all reachable from either entrance afterwards.
   */
  const enterByDrawing = () => {
    setText("no")                 // the letters that set the system
    setProofText("nnoonn")        // and the string they are spaced against
    setEditChar("n")
    setMode("edit")               // a letter to draw on, which is where a
    setEntered(true)              // face starts
    const i = docs.findIndex((d) => d.kind === "text")
    if (i >= 0) setDocAt(i)
  }
  const enterByReference = (name: string) => {
    setEntered(true)
    goToFamily(name)
  }

  if (!corpus || !here) return (
    <Booting onRetry={() => window.location.reload()} />
  )

  // Before the instrument, the way in. Shown on a first visit and whenever a
  // new project is started, and never again in between.
  if (!entered) {
    return (
      <Doors
        families={corpus.families}
        onControlCharacters={enterByDrawing}
        onFamily={enterByReference}
        onFont={() => { setEntered(true); projectFont() }}
        onCentroid={() => setEntered(true)}
      />
    )
  }

  const decided = settled.includes(editChar)
  const row = spaceRows.find((r) => r.char === editChar) ?? null

  return (
    <div className="h-full flex flex-col">
      {/* Not a scroll container: overflow-x on the bar forces overflow-y with
          it, and the menus, which hang below the bar, were clipped away. */}
      <header className="flex items-stretch gap-1 sm:gap-3 pl-2 sm:pl-4 pr-2
                         sm:pr-3 h-11 border-b border-border bg-card/60
                         shrink-0 px-safe">
        <h1 className="font-display text-[13px] sm:text-base tracking-tight
                       self-center whitespace-nowrap min-w-0 truncate">
          Vectorography
          <span className="ml-2 font-mono text-[10px] text-muted-foreground
                           hidden sm:inline">
            {__APP_VERSION__}
          </span>
        </h1>
        <MenuBar menus={menus} />
        <div className="flex-1" />
        {/*
            Typeface, not master.

            A master is one of several authored points you interpolate
            between. What is on screen is a single face at a coordinate, so
            the word promised a family that is not there.
         */}
        {/* Below the phone's width six menus and a name field do not both
            fit, and the header cannot scroll: the menus hang out of it. The
            name is also in the Export panel, which is where it is needed. */}
        <label className="self-center hidden sm:flex items-baseline gap-1.5
                          min-w-0 shrink"
               title={"The name this typeface carries. It goes into every "
                 + "font you compile, the filenames, and the share card."}>
          <span className="rail-label !text-[8px]">typeface</span>
          <input
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            spellCheck={false}
            placeholder="Unnamed"
            className="font-display text-[13px] w-24 sm:w-44 min-w-0 shrink
                       bg-background border border-border rounded-sm px-2 py-1
                       shadow-[inset_0_1px_2px_hsl(var(--ink)/0.08)]
                       focus:outline-none focus:border-burgundy
                       focus:ring-1 focus:ring-burgundy/30"
          />
        </label>
      </header>

      <Tabs docs={docs} at={at} pick={setDocAt}
            add={() => {
              const id = Math.max(0, ...docs.map((d) =>
                d.kind === "text" ? d.id : 0)) + 1
              const last = docs.map((d) => d.kind).lastIndexOf("text")
              const next = [...docs]
              next.splice(last + 1, 0, { kind: "text", id, text: "adhesion" })
              setDocs(next)
              setDocAt(last + 1)
            }}
            close={(i) => {
              setDocs(docs.filter((_, j) => j !== i))
              if (at >= i) setDocAt(Math.max(0, at - 1))
            }}
            rename={(i, t) => setDocs(docs.map((d, j) =>
              j === i && d.kind === "text" ? { ...d, text: t } : d))} />

      {/*
          One canvas and one inspector, after Glyphs, FontLab and RoboFont.

          This had the same material down three edges at once: compass and
          sliders in a column on the right, travel controls and the trail in a
          row along the bottom, the map filling what was left. Six panels of
          equal weight and none of them the work. Every one of those editors
          gives the window to the thing being made and collects the rest into
          a single sidebar, so that is what this does now.

          The phone gets the same two, stacked, with the handle between them
          deciding the share. It used to get four instruments on a tab rail of
          its own, which meant two interfaces to keep true to each other.
       */}
      <main className="flex-1 min-h-0 flex max-lg:flex-col relative">

        <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-card/30
                            lg:border-r border-border"
                 style={isMobile
                   ? { flex: `0 0 ${(phoneSplit * 100).toFixed(1)}%` }
                   : undefined}>

          {doc?.kind === "text" && (
            <div className="flex items-center gap-3 px-3 py-1.5 shrink-0
                            border-b border-border/60 flex-wrap">
              <div className="flex rounded-sm border border-border
                              overflow-hidden">
                {(["text", "edit"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                          title={m === "text"
                            ? "The string, at the size it will be set at"
                            : `Draw on ${editChar} point by point`}
                          className={`text-[11px] px-2.5 py-0.5
                                      transition-colors ${mode === m
                                        ? "bg-burgundy text-ivory"
                                        : "text-muted-foreground"
                                          + " hover:text-foreground"}`}>
                    {m === "text" ? "Text" : "Edit"}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground
                               hidden sm:inline">
                {mode === "text"
                  ? "Drag a letter to move the typeface. Click one to select it."
                  : `Drag the points of ${editChar}. Diverge ▸ Pull here `
                    + "moves the space to what you drew."}
              </span>
              {mode === "text" && (
                <label className="ml-auto flex items-center gap-2
                                  shrink-0">
                  <span className="rail-label !text-[8px]">size</span>
                  <input type="range" min={9} max={400} value={size}
                         onChange={(e) => setSize(Number(e.target.value))}
                         className="w-[110px] accent-burgundy"
                         title="How large the canvas sets the string" />
                  <span className="font-mono text-[10px] text-muted-foreground
                                   tabular-nums whitespace-nowrap"
                        title={drawnAt != null && Math.abs(drawnAt - size) > 1
                          ? "The string is too long to set at that size in "
                            + "this window, so it is drawn as large as fits"
                          : "The size the canvas is setting at"}>
                    {drawnAt != null && Math.abs(drawnAt - size) > 1
                      ? `${size} → ${Math.round(drawnAt)} pt`
                      : `${size} pt`}
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col p-2 lg:p-3 gap-2">
            {doc?.kind === "font" ? (
              <CharacterSet
                glyphs={gridGlyphs} settled={settled} spacing={spacing}
                busy={gridBusy}
                onPick={(ch) => { setEditChar(ch); goToText() }}
                onToggleSettled={toggleSettled}
              />
            ) : doc?.kind === "map" ? (
              <Atlas data={atlas} busy={busy} onPick={goToFamily}
                     directions={allDirections}
                     colourBy={colourBy} setColourBy={setColourBy}
                     waypoint={waypoint} setWaypoint={setWaypoint}
                     onToward={goToward} radius={radius} sample={atlasChar}
                     liveGlyphs={location?.glyphs ?? null}
                     liveSelf={liveSelf}
                     ballOn={ballOn} setBallOn={setBallOn}
                     altitude={location?.altitude ?? null} corpus={corpus}
                     axX={axX} axY={axY} axZ={axZ}
                     setAxes={(x, y, zz) => {
                       setAxX(x); setAxY(y); setAxZ(zz)
                     }} />
            ) : mode === "edit" ? (
              <GlyphEdit
                char={editChar} setChar={setEditChar}
                glyph={editGlyph}
                edited={outlines[editChar] ?? null}
                alphabet={corpus.glyphs}
                busy={pulling}
                pulled={pulled}
                onEdit={(c) => {
                  setOutlines({ ...outlines, [editChar]: c })
                  setPulled(null)
                }}
                onClear={() => {
                  const next = { ...outlines }
                  delete next[editChar]
                  setOutlines(next)
                  setPulled(null)
                }}
                onPull={pullToDrawing}
              />
            ) : (
              <>
                {/* The letters take their colour from here, so everything
                    drawn with currentColor inside follows. */}
                <div className="flex-1 min-h-0 text-ink"
                     style={ink === "auto" ? undefined : { color: ink }}>
                  <SpecimenStage
                    glyphs={location?.glyphs ?? []}
                    geometry={geometry}
                    text={text}
                    hullRadius={atlas?.ball?.max ?? null}
                    radius={atlas?.ball?.self ?? null}
                    depth={depth}
                    xProp={props3[0]} yProp={props3[1]} zProp={props3[2]}
                    setProps={(x, y, zz) => setProps3([x, y, zz])}
                    onDragStart={dragStart}
                    onDrag={dragMove}
                    onDragEnd={dragEnd}
                    lost={!!z && !isSane(z)}
                    onReset={resetToSane}
                    guideInk={guideInk} guideStyle={guideStyle}
                    points={points} guides={guides} priority={priority}
                    size={size} onDrawnAt={setDrawnAt}
                    settled={settled}
                    settledNote={settledNote}
                    busy={false}
                  />
                </div>

                {/* The sidebearings, under the letters they belong to, which
                    is where the Space Center puts them in RoboFont. Clicking
                    one selects that letter for the inspector and for edit
                    mode. */}
                <div className="shrink-0">
                  <SpaceCenter
                    text={text} setText={setText}
                    glyphs={spaceGlyphs} rows={spaceRows}
                    suggestions={suggestions}
                    spacing={spacing} setSpacing={setSpacing}
                    busy={suggesting}
                    showString={false}
                    selected={editChar} onSelect={setEditChar}
                    onSuggest={suggest}
                  />
                </div>
              </>
            )}

            {/* What a step either way looks like, as text. Diverge > Step. */}
            {stepOn && doc?.kind !== "font" && (
              <div className="shrink-0 min-h-0 flex flex-col"
                   style={{ height: proofH }}>
                <ProofSheet
                  sheet={sheet} text={proofText} busy={sheetBusy}
                  radius={sheetRadius} setRadius={setSheetRadius}
                  properties={sheetProps} setProperties={setSheetProps}
                  onClose={() => setStepOn(false)}
                  onTravel={(cz, closeIn) => {
                    // A shift closes in rather than going somewhere else: the
                    // answer to "a bit heavier" is usually another, smaller
                    // "a bit heavier".
                    if (closeIn) setSheetRadius(Math.max(0.2, sheetRadius / 2))
                    push(cz, "jump", "proof")
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {isMobile && (
          <div
            className="h-4 shrink-0 mx-2 flex items-center justify-center
                       touch-none group"
            style={{ touchAction: "none" }}
            title="Drag to give the canvas or the inspector more room"
            onDoubleClick={() => {
              setPhoneSplit(0.55)
              localStorage.setItem("vg.split", "0.55")
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no capture */ }
              const host = e.currentTarget.parentElement as HTMLElement
              const total = host.clientHeight
              const startY = e.clientY
              const start = phoneSplit
              let latest = start
              const move = (ev: PointerEvent) => {
                latest = Math.max(0.18, Math.min(0.82,
                  start + (ev.clientY - startY) / Math.max(total, 1)))
                setPhoneSplit(latest)
              }
              const up = () => {
                localStorage.setItem("vg.split", String(latest))
                window.removeEventListener("pointermove", move)
                window.removeEventListener("pointerup", up)
                window.removeEventListener("pointercancel", up)
              }
              window.addEventListener("pointermove", move)
              window.addEventListener("pointerup", up)
              window.addEventListener("pointercancel", up)
            }}
          >
            <div className="h-1 w-12 rounded-full bg-border
                            group-active:bg-burgundy transition-colors" />
          </div>
        )}

        {/*
            One inspector, and its sections follow what is selected, the way
            the Palette does in Glyphs and the sidebar does in RoboFont.
            Nothing in it is new work: every reading already existed and is
            already measured. What changed is that only the ones bearing on
            the present selection are open.
         */}
        <Inspector>
          <Section id="divergence" title="Divergence" defaultOpen
                   note={`of ${corpus.count}`}>
            <Divergence altitude={location?.altitude ?? null}
                        freedom={freedom} tol={settleTol}
                        settled={settled} dims={corpus.dims} />
          </Section>

          <Section id="axes" title="Axes" defaultOpen={mode !== "edit"}
                   note={`${allDirections.length}`}>
            {allDirections.length ? (
              <DirectionPad directions={allDirections} at={standing}
                            onSlide={slideTo} onCommit={slideCommit}
                            locks={locks} setLocks={setLocks}
                            isolate={isolate} setIsolate={setIsolate}
                            busy={busy} />
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground">
                No measured directions in this model.
              </p>
            )}
          </Section>

          {mode === "edit" && doc?.kind === "text" ? (
            <Section id="drawing" title={`Drawing on ${editChar}`} defaultOpen
                     note={outlines[editChar] ? "off the space" : "none"}>
              {outlines[editChar] ? (
                <div className="space-y-2">
                  <p className="text-[11px] leading-snug">
                    This letter has left the space: it no longer follows the
                    typeface. Pull the typeface to it, or drop the drawing.
                  </p>
                  <div className="flex gap-2">
                    <button className="btn !text-[11px]" disabled={pulling}
                            onClick={pullToDrawing}>
                      {pulling ? "pulling…" : "Pull here"}
                    </button>
                    <button className="btn !text-[11px]"
                            onClick={() => {
                              const next = { ...outlines }
                              delete next[editChar]
                              setOutlines(next)
                              setPulled(null)
                            }}>
                      Drop it
                    </button>
                  </div>
                  {pulled && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {`reached ${(pulled.explained * 100).toFixed(1)}% · `
                        + `${pulled.residual.toFixed(4)} em it could not · `
                        + `${pulled.moved.toFixed(2)} moved`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Drag a point to draw. The points are forty to a contour at
                  uniform arc length, so this is drawing on the
                  representation.
                </p>
              )}
              {Object.keys(outlines).length > 0 && (
                <p className="mt-2 font-mono text-[10px]
                              text-muted-foreground">
                  {`drawn by hand: ${Object.keys(outlines).join(" ")}`}
                </p>
              )}
            </Section>
          ) : (
            <Section id="glyph" title={`Glyph ${editChar}`} defaultOpen
                     note={decided ? "decided" : undefined}>
              <GlyphMetrics
                char={editChar} row={row}
                suggestion={suggestions?.[editChar] ?? null}
                spacing={spacing} setSpacing={setSpacing}
                decided={decided} busy={suggesting}
                onSuggest={suggest} />
            </Section>
          )}

          <Section id="near" title="Nearest families"
                   note={`${location?.neighbours?.length ?? 0}`}>
            {location?.neighbours?.length ? (
              <FamilyPicker neighbours={location.neighbours}
                            onPick={goToFamily}
                            inline
                            sample={[...text]
                              .filter((c) => /[A-Za-z]/.test(c))
                              .slice(0, 3).join("") || "Ham"} />
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground">
                nothing measured yet
              </p>
            )}
          </Section>
        </Inspector>

        {trailOpen && (
          <TrailPalette trail={trail} cursor={cursor} onGo={setCursor}
                        waypoints={waypoints} onFlag={flagStop}
                        onClearFlags={() => setWaypoints([])}
                        onClose={() => setTrailOpen(false)} />
        )}

        {error && isMobile && (
          <button
            className="fixed left-2 right-2 bottom-2 z-40 panel px-3 py-2
                       font-mono text-[10px] text-burgundy text-left truncate"
            onClick={() => setError(null)}>
            {error}
          </button>
        )}
      </main>

      {sharing && z && (
        <ShareCard z={z} text={text} family={family}
                   onClose={() => setSharing(false)} />
      )}

      {help && <Help topic={help} onClose={() => setHelp(null)} />}

      {settingsOpen && (
        <Settings
          theme={theme} setTheme={setTheme}
          defaultText={defaultText} setDefaultText={changeDefaultText}
          ballOn={ballOn} setBallOn={changeBall}
          licence={licence} setLicence={changeLicence}
          xProp={props3[0]} yProp={props3[1]} zProp={props3[2]}
          setProps={(x, y, zz) => setProps3([x, y, zz])}
          guideInk={guideInk} setGuideInk={changeGuideInk}
          ink={ink} setInk={changeInk}
          guideStyle={guideStyle} setGuideStyle={changeGuideStyle}
          depth={depth} setDepth={setDepth}
          points={points} setPoints={setPoints}
          guides={guides} setGuides={setGuides}
          priority={priority} setPriority={setPriority}
          temperature={temperature} setTemperature={setTemperature}
          step={step} setStep={setStep}
          onForget={forgetAll}
          onClose={() => setSettingsOpen(false)} />
      )}

      {exporting && (
        <ExportPanel
          stops={ancestry.length}
          busy={busy}
          licence={LICENCE_LABEL[licence.id] ?? licence.id}
          family={family} setFamily={setFamily}
          onLicence={() => { setExporting(false); setLicensing(true) }}
          onRun={runExport}
          onClose={() => setExporting(false)} />
      )}

      {licensing && (
        <LicencePicker
          value={licence}
          onSave={(v) => {
            setLicence(v)
            localStorage.setItem(LICENCE_KEY, v.id)
            localStorage.setItem(AUTHOR_KEY, v.author)
          }}
          onClose={() => setLicensing(false)} />
      )}

      {learning && (
        <LearnAxis
          families={corpus.families}
          onSave={(a) => { setAxes([...axes, a]); setLearning(false) }}
          onClose={() => setLearning(false)}
        />
      )}

      {projected && (
        <ProjectionReport
          result={projected.result}
          file={projected.file}
          onTravel={() => {
            push(projected.result.z, "jump",
                 `projected from ${projected.file}`)
            setProjected(null)
          }}
          onClose={() => setProjected(null)}
        />
      )}

      {about && (
        <About
          version={__APP_VERSION__}
          model={corpus.model?.id ?? "VectorModel"}
          dims={corpus.dims}
          onClose={() => setAbout(false)}
        />
      )}

      {testing && ancestry.length >= 2 && (
        <JourneyTester
          trail={ancestry.map((c) => c.z)}
          family={family}
          stops={Math.min(Math.max(ancestry.length, 2), 12)}
          onClose={() => setTesting(false)}
        />
      )}

      <footer className="h-8 shrink-0 px-4 hidden sm:flex items-center gap-4 border-t
                         border-border bg-card/60">
        <span className="font-mono text-[10px] text-muted-foreground"
              title={file ? `Saved as ${file}`
                          : "This journey has never been saved"}>
          {file ?? "untitled"}
        </span>
        <span data-state={fileState}
              className={`font-mono text-[9px] uppercase tracking-wider
                          -ml-2.5 ${fileState === "edited"
                            ? "text-burgundy/75" : "text-muted-foreground/60"}`}
              title={fileState === "edited"
                ? "Changed since it was last saved"
                : fileState === "saved" ? "Written to disk"
                : fileState === "loaded" ? "Opened from disk, unchanged"
                : "Not saved anywhere yet"}>
          {fileState === "new" ? "unsaved" : fileState}
        </span>
        <div className="flex-1" />
        {error && (
          <button className="font-mono text-[10px] text-burgundy truncate max-w-md"
                  onClick={() => setError(null)} title={error}>
            {error}
          </button>
        )}
        <span className="font-mono text-[10px] text-muted-foreground"
              title={`${corpus.count} families · ${corpus.dims} dimensions`}>
          corpus: {corpus.model?.id ?? "VectorModel"}
        </span>
      </footer>
    </div>
  )
}

/** What the File menu shows beside the licence item. */
const LICENCE_LABEL: Record<string, string> = {
  ofl: "OFL 1.1", mit: "MIT", "cc-by": "CC BY 4.0", cc0: "CC0",
  arr: "reserved", none: "unset",
}

/**
 * What the instrument says while it has nothing to show yet.
 *
 * It used to say "fitting the space to the corpus", which was untrue and
 * silent. Nothing is fitted at startup; the space ships fitted. The real wait
 * is the host: the free tier sleeps after fifteen idle minutes, and the first
 * visit after that waits for a container to start and read thirty megabytes,
 * which is about a minute of a line of text that never changes.
 *
 * So this counts, says what it is waiting for, and after a few seconds says
 * why. A wait someone understands is a different thing from the same wait
 * unexplained.
 */
function Booting({ onRetry }: { onRetry: () => void }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const stuck = secs >= 90
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="text-center max-w-sm">
        <div className="font-display text-2xl mb-2">Vectorography</div>

        <div className="font-mono text-[11px] text-muted-foreground">
          {stuck ? "the space has not answered"
            : secs < 4 ? "reading the space…"
              : "waking the server…"}
          {!stuck && secs >= 2 && (
            <span className="tabular-nums"> {secs}s</span>
          )}
        </div>

        {/* A bar that moves, because a line of text that does not is what
            makes a wait feel like a hang. */}
        {!stuck && (
          <div className="mt-3 h-[2px] w-48 mx-auto overflow-hidden bg-border">
            <div className="h-full w-1/3 bg-burgundy
                            animate-[boot_1.4s_ease-in-out_infinite]" />
          </div>
        )}

        {secs >= 6 && !stuck && (
          <p className="mt-4 font-mono text-[9px] leading-relaxed
                        text-muted-foreground">
            The host sleeps after fifteen idle minutes. The first visit wakes
            it, which takes about a minute; every visit after that answers
            straight away.
          </p>
        )}

        {stuck && (
          <>
            <p className="mt-3 font-mono text-[9px] leading-relaxed
                          text-muted-foreground">
              Ninety seconds is longer than a cold start should take.
            </p>
            <button
              onClick={onRetry}
              className="mt-4 px-3 py-1.5 rounded-sm bg-burgundy text-ivory
                         font-mono text-[11px] hover:opacity-90
                         transition-opacity">
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Fatal({ message }: { message: string }) {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="panel p-6 max-w-lg">
        <div className="font-display text-lg mb-2">The space is not up.</div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Start the backend, or build the corpus if this is a first run.
        </p>
        <pre className="font-mono text-[10px] bg-muted p-3 rounded-sm
                        overflow-x-auto whitespace-pre-wrap">{message}</pre>
      </div>
    </div>
  )
}
