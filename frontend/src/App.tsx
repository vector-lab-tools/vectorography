import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, type AtlasData, type CompassPoint, type CorpusInfo, type Glyph,
         type Location, type NamedDirection } from "./api"
import { About } from "./components/About"
import { Atlas, type Waypoint } from "./components/Atlas"
import { ComingSoon, type Planned } from "./components/ComingSoon"
import { ExportPanel, type ExportKind } from "./components/Export"
import { Help, type HelpTopic } from "./components/Help"
import { Settings, THEME_KEY, TEXT_KEY, type Theme }
  from "./components/Settings"
import { LicencePicker, LICENCE_KEY, AUTHOR_KEY, type Licence }
  from "./components/Licence"
import { download, parse, pickFile, projectFilename, serialise }
  from "./components/project"
import { ShareCard } from "./components/ShareCard"
import { cardPng, cardSvg, sendCard } from "./components/cardImage"
import { CompassRose } from "./components/CompassRose"
import { DirectionPad } from "./components/DirectionPad"
import { JourneyTester } from "./components/JourneyTester"
import { MenuBar, type Menu } from "./components/MenuBar"
import { SpecimenStage, type Depth, type DragReport }
  from "./components/SpecimenStage"
import type { HandleKind } from "./components/handles"
import { Trail, type Crumb } from "./components/Trail"
import { TravelBar, type Orbit, type Ride } from "./components/TravelBar"
import { useIsMobile } from "./hooks/useIsMobile"

const DEFAULT_TEXT = "Hamburgefonstiv"

/**
 * Proofs, not pangrams. Hamburgefonstiv is the standard control string because
 * it gathers the shape-defining forms in one glance: straight stems, round
 * bowls, arches, junctions, a diagonal. adhesion is the classic lowercase
 * spacing test. The pangram is for reading running text, which is a different
 * judgement from reading a shape.
 */
/**
 * The scales of work this instrument will grow into. A mode is what you are
 * working on, which is why these are not in the View menu: view is how you
 * look at what you already have.
 */
const PLANNED: Record<"glyph" | "set" | "compare" | "licence", Planned> = {
  glyph: {
    title: "Edit a glyph",
    blurb: "Work on one letter rather than the whole typeface. Travelling "
      + "moves every glyph together, because a location in the space is a "
      + "whole alphabet; a designer who wants this g and not that one needs to "
      + "leave the space for a moment and come back with the change.",
    needs: [
      "A per-glyph position, so one letter can sit away from the location the "
        + "rest share, and a rule for what that means when the journey is "
        + "compiled.",
      "Outline editing that survives the round trip: points moved by hand have "
        + "to keep the point count the masters interpolate on.",
      "A way to show that a glyph has been taken off the location, since the "
        + "specimen would otherwise be quietly lying about where it is.",
    ],
  },
  set: {
    title: "The whole character set",
    blurb: "Every glyph the model carries, laid out at once, so a location can "
      + "be judged as an alphabet rather than as a word. The decode already "
      + "produces all sixty-two.",
    needs: [
      "A grid that stays readable at sixty-two glyphs and redraws fast enough "
        + "to keep up with a drag.",
      "Somewhere to say which glyphs the space handles badly, since the pads "
        + "for missing counters show up here first.",
    ],
  },
  licence: {
    title: "Choose a licence for the export",
    blurb: "Pick the terms a compiled typeface goes out under, and have them "
      + "written into the font itself rather than added by hand afterwards. A "
      + "typeface that leaves here carries a name table, and the licence "
      + "belongs in it.",
    needs: [
      "A choice at export time, remembered per journey rather than per "
        + "session, since the licence belongs to the typeface and not to the "
        + "afternoon it was made in.",
      "The name table fields that carry it: licence description and licence "
        + "URL, which fontTools writes but nothing currently fills.",
      "The same text in the bundle README, so the zip and the binary do not "
        + "disagree.",
    ],
  },
  compare: {
    title: "Compare two locations",
    blurb: "Two positions side by side, or overlaid, with the difference "
      + "between them named in measured properties. The instrument can say "
      + "where you are; it cannot yet say how here differs from there.",
    needs: [
      "A second held position, which the keep control already provides.",
      "A difference read out in the eight measured properties, which is the "
        + "same arithmetic the ride heading uses.",
    ],
  },
}

const dot = (a: number[], c: number[]) =>
  a.reduce((t, ai, i) => t + ai * c[i], 0)

const PROOFS = [
  "Hamburgefonstiv",
  "Vectorography",
  "adhesion",
  "HHOOHO nnoonn",
  "Sphinx of black quartz, judge my vow",
]

export default function App() {
  const [corpus, setCorpus] = useState<CorpusInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system")
  const [dark, setDark] = useState(false)

  const [trail, setTrail] = useState<Crumb[]>([])
  const [cursor, setCursor] = useState(0)
  const [defaultText, setDefaultText] = useState(
    () => localStorage.getItem(TEXT_KEY) || DEFAULT_TEXT)
  const [text, setText] = useState(
    () => localStorage.getItem(TEXT_KEY) || DEFAULT_TEXT)
  const [radius, setRadius] = useState(0.6)
  const [temperature, setTemperature] = useState(0.5)
  const [step, setStep] = useState(0.5)
  // View axes, named either as a corpus index ("axis:0") or as a measured
  // property ("dir:weight"). Both are directions in the same space; they differ
  // in who chose them, which is the comparison the instrument exists to make.
  const [axX, setAxX] = useState("axis:0")
  const [axY, setAxY] = useState("axis:1")
  const [axZ, setAxZ] = useState("axis:2")
  const [ride, setRide] = useState<Ride>(null)
  const [orbit, setOrbit] = useState<Orbit>(null)
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
  const [planned, setPlanned] = useState<Planned | null>(null)
  const [sharing, setSharing] = useState(false)
  const [directions, setDirections] = useState<NamedDirection[]>([])
  const [atlas, setAtlas] = useState<AtlasData | null>(null)
  const [atlasHeight, setAtlasHeight] =
    useState<"density" | "centroid" | "axis">("density")
  const [colourBy, setColourBy] = useState("serif")
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
  const [depth, setDepth] = useState<Depth>("handles")
  const [props3, setProps3] = useState<[HandleKind, HandleKind, HandleKind]>(
    ["weight", "x-height", "width"])
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
  const [snapshot, setSnapshot] = useState<number[] | null>(null)
  const [split, setSplit] = useState(0.7)
  // Below lg the instruments share one region and swap by tab; the specimen
  // and the atlas stay on screen throughout, because they are the work.
  const isMobile = useIsMobile()
  const TABS = ["atlas", "steer", "trail", "walk"]
  const [tab, setTab] = useState(() => {
    const kept = localStorage.getItem("vg.tab")
    return kept && TABS.includes(kept) ? kept : "atlas"
  })
  const pickTab = (t: string) => {
    setTab(t); localStorage.setItem("vg.tab", t)
  }

  const [location, setLocation] = useState<Location | null>(null)
  const [compass, setCompass] = useState<CompassPoint[]>([])
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
      api.location(z, text, false, true, 1)
        .then((loc) => { if (!dead) setGeometry(loc.glyphs) })
        .catch(() => {})
    }, 90)
    return () => { dead = true; clearTimeout(t) }
  }, [z, text])

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
    api.basis(axX, axY, axZ, ride?.vec ?? null)
      .then((b) => { basis.current = b })
      .catch(() => { basis.current = null })
  }, [axX, axY, axZ, ride])

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

  const compassText = useMemo(() => {
    const t = [...text].filter((c) => c !== " ").slice(0, 3).join("")
    return t || "ag"
  }, [text])

  // Location and neighbourhood follow the position. Nothing is fetched that
  // was not asked for by a move.
  useEffect(() => {
    if (!z) return
    const n = ++seq.current
    setBusy(true)
    Promise.all([
      api.location(z, text, false, false, 24),
      api.compass(z, compassText, radius, axX, axY, ride?.vec ?? null),
      // The map is drawn from the families' own font files, so the server
      // only has to decode the traveller's own specimen.
      api.atlas({ z, text: atlasChar, ax: axX, ay: axY, az: axZ,
                  ride: ride?.vec ?? null,
                  height: ballOn ? "axis" : atlasHeight,
                  sprites: 0, colour_by: colourBy, trail: ancestryZ }),
    ]).then(([loc, comp, atl]) => {
      if (n !== seq.current) return
      setLocation(loc)
      setCompass(comp.points)
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
  }, [z, text, compassText, atlasChar, radius, axX, axY, axZ, ride,
      atlasHeight, colourBy, ballOn, ancestryZ])

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
    trail.map((c) => c.id), cursor, text, family, snapshot != null,
    axX, axY, axZ, colourBy, atlasHeight, ballOn, depth,
    radius, temperature, step,
  ]), [trail, cursor, text, family, snapshot, axX, axY, axZ, colourBy,
       atlasHeight, ballOn, depth, radius, temperature, step])
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
    setSnapshot(null)
    setFile(null)
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
      family, text, trail, cursor, snapshot,
      view: { axX, axY, axZ, colourBy, atlasHeight, ballOn, depth },
      travel: { radius, temperature, step },
    }))
    setFile(full)
    savedSig.current = signature
    opened.current = false
    setMark((m) => m + 1)
  }, [signature, atlasHeight, axX, axY, axZ, ballOn, colourBy, corpus, cursor, depth,
      family, file, radius, snapshot, step, temperature, text, trail])

  /** The browser gives a page no way to write back to a file it was handed,
   *  so Save is Save As with the name already filled in. */
  const save = useCallback(() => {
    if (!file) return saveAs()
    download(file, serialise({
      model: corpus?.model ?? null,
      family, text, trail, cursor, snapshot,
      view: { axX, axY, axZ, colourBy, atlasHeight, ballOn, depth },
      travel: { radius, temperature, step },
    }))
    savedSig.current = signature
    opened.current = false
    setMark((m) => m + 1)
  }, [signature, atlasHeight, axX, axY, axZ, ballOn, colourBy, corpus, cursor, depth,
      family, file, radius, saveAs, snapshot, step, temperature, text, trail])

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
      setSnapshot(doc.snapshot ?? null)
      setAxX(doc.view.axX); setAxY(doc.view.axY); setAxZ(doc.view.axZ)
      setColourBy(doc.view.colourBy)
      setAtlasHeight(doc.view.atlasHeight as typeof atlasHeight)
      setBallOn(doc.view.ballOn)
      setDepth(doc.view.depth)
      setRadius(doc.travel.radius)
      setTemperature(doc.travel.temperature)
      setStep(doc.travel.step)
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
                                   ride: ride?.vec ?? null, temperature, step,
                                   ...body })
      push(r.z, mode, label)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, radius, axX, axY, axZ, ride, temperature, step, push])

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
    api.location(nz, text, false, false, 24)
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
  const standing = useMemo(() => {
    const src = dragZ.current ?? z
    const out: Record<string, number> = {}
    if (!src) return out
    for (const d of directions) {
      if (d.vector) out[d.key] = dot(src, d.vector)
    }
    return out
  }, [z, directions, location])

  /** Travel along one property until its projection reads the asked-for value. */
  const slideTo = useCallback((key: string, value: number) => {
    const d = directions.find((x) => x.key === key)
    if (!d?.vector) return
    const from = dragZ.current ?? z
    if (!from) return
    const delta = value - dot(from, d.vector)
    if (Math.abs(delta) < 1e-6) return
    const nz = from.map((c, i) => c + delta * d.vector![i])
    dragZ.current = nz
    if (!strokePath.current.length) strokePath.current = [from]
    strokePath.current.push(nz)
    // The map moves with the slider: the position is computed here, so the
    // mark does not wait for the server to say where it went.
    setLiveSelf(atlasPoint(nz))

    if (dragPending.current) return
    dragPending.current = true
    api.location(nz, text, false, true)
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
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [walk, travel, temperature, step, here, undo, redo, resetToSane,
      save, saveAs, openProject, newProject])

  // The journey exported is the path actually taken to get here, root to
  // cursor, so a branch exports its own line rather than the whole tree.

  const exportJourney = useCallback(async () => {
    if (ancestry.length < 2) return
    setBusy(true)
    try {
      await api.download("/api/export/journey",
        { trail: ancestry.map((c) => c.z), family,
          masters: Math.min(Math.max(ancestry.length, 2), 12),
          licence: licence.id, author: licence.author },
        `${family}-journey.zip`)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [ancestry, family, licence])

  const exportSvg = useCallback(async () => {
    if (!z) return
    try { await api.download("/api/export/svg", { z, text }, "specimen.svg") }
    catch (e) { setError(String(e)) }
  }, [z, text])

  /** Straight to the share sheet, without stopping to look at it. */
  const shareNow = useCallback(async () => {
    if (!z) return
    setBusy(true)
    try {
      const svg = await cardSvg({ z, text, family })
      const png = await cardPng(svg)
      const how = await sendCard(png, (family || text).replace(/ /g, ""),
                                 family || text)
      if (how !== "shared" && how !== "cancelled") setError(`Share card ${how}`)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, text, family])

  const exportFont = useCallback(async (format: "otf" | "ttf") => {
    if (!z) return
    setBusy(true)
    try {
      const near = location?.neighbours?.[0]?.family
      const style = here ? `Stop ${here.id}` : "Regular"
      await api.exportFont(z, family, style, format,
                           licence.id, licence.author)
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

  const menus: Menu[] = useMemo(() => [
    {
      label: "File",
      items: [
        { kind: "item", label: "New Project", hint: "\u2318N",
          onSelect: newProject,
          title: "Back to the centroid with an empty trail" },
        { kind: "item", label: "Open\u2026", hint: "\u2318O",
          onSelect: openProject,
          title: "Open a saved journey, its branches and its settings" },
        { kind: "sep" },
        { kind: "item", label: "Save", hint: file ? file : "\u2318S",
          disabled: !z, onSelect: save,
          title: file ? `Save over ${file}`
                      : "Save the journey, its branches and its settings" },
        { kind: "item", label: "Save As\u2026", hint: "\u21e7\u2318S",
          disabled: !z, onSelect: saveAs,
          title: "Save the journey under a new name" },
        { kind: "sep" },
        { kind: "item", label: "Export\u2026", hint: "\u21e7\u2318E",
          disabled: !z, onSelect: () => setExporting(true),
          title: "Fonts to install, source to keep working on, or outlines to "
                 + "draw with" },
        { kind: "sep" },
        { kind: "item", label: "Share image", hint: "here",
          disabled: !z || busy, onSelect: shareNow,
          title: "Send this location straight to the share sheet as a PNG, "
                 + "which is what WhatsApp and Messages take" },
        { kind: "item", label: "Share card\u2026",
          disabled: !z, onSelect: () => setSharing(true),
          title: "Look at the card first, then send, copy or save it" },
      ],
    },
    {
      label: "Edit",
      items: [
        { kind: "item", label: "Undo", hint: "\u2318Z",
          disabled: here?.parent == null, onSelect: undo,
          title: "Step back to where you came from" },
        { kind: "item", label: "Redo", hint: "\u21e7\u2318Z",
          disabled: !redoStack.length, onSelect: redo,
          title: "Return to the stop you stepped back from" },
        { kind: "sep" },
        { kind: "item", label: "Back to the last sane position", hint: "esc",
          disabled: !z || isSane(z), onSelect: resetToSane,
          title: "Walk back up the trail to the last stop still inside the "
                 + "corpus, where the outlines are still readings rather than "
                 + "guesses" },
        { kind: "item", label: "Back to the centroid",
          onSelect: () => setCursor(trail[0]?.id ?? 0),
          title: "The average of every font in the corpus" },
        { kind: "sep" },
        { kind: "item", label: "Settings\u2026", hint: "\u2318,",
          onSelect: () => setSettingsOpen(true),
          title: "Theme, opening text, and the licence exports carry" },
      ],
    },
    {
      label: "Mode",
      items: [
        { kind: "item", label: "Travel the space", hint: "\u2713",
          onSelect: () => {},
          title: "The whole typeface at once: a location in the space, read as "
                 + "a specimen. This is the mode that works." },
        { kind: "sep" },
        { kind: "item", label: "Edit a glyph\u2026",
          onSelect: () => setPlanned(PLANNED.glyph) },
        { kind: "item", label: "The whole character set\u2026",
          onSelect: () => setPlanned(PLANNED.set) },
        { kind: "item", label: "Compare two locations\u2026",
          onSelect: () => setPlanned(PLANNED.compare) },
      ],
    },
    {
      label: "View",
      items: [
        { kind: "item", label: dark ? "Light theme" : "Dark theme",
          onSelect: () => setTheme(dark ? "light" : "dark"),
          title: "Remembered. Settings has a System option that follows the "
                 + "machine" },
        { kind: "sep" },
        { kind: "item",
          label: `Atlas height: ${
            atlasHeight === "density" ? "crowding"
              : atlasHeight === "centroid" ? "distance from centroid"
              : "third axis"}`,
          hint: "cycle",
          onSelect: () => setAtlasHeight((h) =>
            h === "density" ? "centroid" : h === "centroid" ? "axis" : "density"),
          title: "What the vertical axis measures. On a corpus axis it becomes "
                 + "a direction you can drag along." },
      ],
    },
    {
      label: "Help",
      items: [
        { kind: "item", label: "What is Vectorography\u2026",
          onSelect: () => setHelp("what"),
          title: "What the instrument is, and the two things it will not do" },
        { kind: "sep" },
        { kind: "item", label: "What the readings mean",
          onSelect: () => setHelp("readings"),
          title: "altitude, density, the shell, the route and the axes" },
        { kind: "item", label: "Keyboard and pointer",
          onSelect: () => setHelp("keys"),
          title: "every key and gesture, and what it moves" },
        { kind: "sep" },
        { kind: "item", label: "Source on GitHub",
          onSelect: () => window.open(
            "https://github.com/vector-lab-tools/vectorography", "_blank",
            "noopener") },
        { kind: "sep" },
        { kind: "item", label: "About Vectorography\u2026",
          onSelect: () => setAbout(true) },
      ],
    },
  ], [z, busy, dark, atlasHeight, ancestry.length, exportFont,
      exportJourney, exportSvg, here, redoStack.length, undo, redo,
      isSane, resetToSane, trail, shareNow,
      newProject, openProject, save, saveAs, file, licence, theme])

  if (error && !corpus) return <Fatal message={error} />
  if (!corpus || !here) return <Booting />

  return (
    <div className="h-full flex flex-col">
      {/* Not a scroll container: overflow-x on the bar forces overflow-y with
          it, and the menus, which hang below the bar, were clipped away. */}
      <header className="flex items-stretch gap-2 sm:gap-3 pl-2 sm:pl-4 pr-2
                         sm:pr-3 h-11 border-b border-border bg-card/60
                         shrink-0 px-safe">
        <h1 className="font-display text-base tracking-tight self-center
                       whitespace-nowrap shrink-0">
          Vectorography
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {__APP_VERSION__}
          </span>
        </h1>
        <MenuBar menus={menus} />
        <div className="flex-1" />
        <label className="self-center flex items-baseline gap-1.5 min-w-0
                          shrink"
               title={"The name this typeface carries. It goes into every font "
                 + "you compile, the filenames, and the share card."}>
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
        <span className="self-center font-mono text-[10px] text-muted-foreground
                         hidden lg:inline whitespace-nowrap">
          {corpus.model?.name} {corpus.model?.version} · {corpus.dims}d
        </span>
      </header>

      {/* The work area scrolls as a whole. The footer is a sibling of this,
          not a child, so it stays where it is however far down you go. */}
      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto
                       max-lg:overflow-hidden">
        {/* Top: the type itself, at a size the hand can work on, with the
            space it sits in below and beside it. */}
        <section className="shrink-0 overflow-hidden flex flex-col gap-2
                            lg:gap-3 px-2 lg:px-3 pt-2 lg:pt-3
                            max-lg:flex-1 max-lg:min-h-0"
                 style={isMobile ? { flex: "0 0 40%" }
                   : { flex: `0 0 calc((100dvh - 96px) * ${split})` }}>
          <div className="panel max-lg:flex-1 max-lg:min-h-0 lg:shrink-0
                          lg:h-[168px] px-2 sm:px-3 py-2 text-ink">
            <SpecimenStage
              glyphs={location?.glyphs ?? []}
              geometry={geometry}
              text={text}
              altitude={location?.altitude ?? null}
              hullRadius={atlas?.ball?.max ?? null}
              radius={atlas?.ball?.self ?? null}
              depth={depth}
              setDepth={setDepth}
              xProp={props3[0]} yProp={props3[1]} zProp={props3[2]}
              setProps={(x, y, zz) => setProps3([x, y, zz])}
              onDragStart={dragStart}
              onDrag={dragMove}
              onDragEnd={dragEnd}
              lost={!!z && !isSane(z)}
              onReset={resetToSane}
              setText={setText}
              proofs={PROOFS}
              neighbours={location?.neighbours ?? []}
              onGoToFamily={goToFamily}
              onSnapshot={() => { if (z) setSnapshot([...z]) }}
              onRecall={() => {
                // With nothing kept, back means the centroid: the average of
                // every font is the one place always worth returning to, and a
                // dead control teaches nothing.
                if (snapshot) push(snapshot, "recall", "kept place")
                else setCursor(trail[0]?.id ?? 0)
              }}
              hasSnapshot={!!snapshot}
              busy={false}
            />
          </div>

          {!isMobile && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
            <div className="flex-1 min-w-0 min-h-[150px] lg:min-h-[180px]">
              <Atlas data={atlas} busy={busy} onPick={goToFamily}
                     directions={directions}
                     colourBy={colourBy} setColourBy={setColourBy}
                     waypoint={waypoint} setWaypoint={setWaypoint}
                     onToward={goToward} radius={radius} sample={atlasChar}
                     liveGlyphs={location?.glyphs ?? null}
                     liveSelf={liveSelf}
                     ballOn={ballOn} setBallOn={setBallOn}
                     altitude={location?.altitude ?? null} corpus={corpus}
                     />
            </div>

            {!isMobile && (
            <div className="w-full lg:w-[240px] shrink-0 min-h-0
                            flex flex-col gap-2 overflow-hidden">
              <div className="flex-1 min-h-[96px] shrink">
                <CompassRose
                  points={compass}
                  compassText={compassText}
                  radius={radius}
                  onTravel={(p) => walk(p.bearing)}
                  busy={busy}
                />
              </div>
              {/* Steer asks for the height it needs and takes no more than
                  half the column; the rose lives on what is left. Given the
                  surplus the other way round, the rose ate it and two sliders
                  spent their lives behind a scrollbar. */}
              {directions.length > 0 && (
                <div className="shrink-0 max-h-[58%] overflow-y-auto border-t
                                border-border pt-2">
                  <DirectionPad directions={directions} at={standing}
                                onSlide={slideTo} onCommit={slideCommit}
                                busy={busy} />
                </div>
              )}
            </div>
            )}
          </div>
          )}
        </section>

        {/* The divider is draggable: how much room the space gets against how
            much the instruments get is the user's call, not ours. */}
        <div
          className="hidden lg:flex h-3 shrink-0 mx-3 my-1 cursor-row-resize
                     group items-center justify-center"
          style={{ touchAction: "none" }}
          title="Drag to give either half more room. Double-click to even it up."
          onDoubleClick={() => setSplit(0.7)}
          onPointerDown={(e) => {
            // Without this the drag sweeps a text selection across the page.
            e.preventDefault()
            // Capture, so the release reaches us even when the button comes
            // up outside the window; a missed release left the move listener
            // alive, silently eating every gesture until the next click.
            try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
            const startY = e.clientY
            const start = split
            const host = (e.currentTarget.parentElement as HTMLElement)
            const total = host.clientHeight
            const move = (ev: PointerEvent) => {
              const d = (ev.clientY - startY) / Math.max(total, 1)
              // All the way in either direction: either half can be taken
              // down to a sliver, so the space or the instruments can have the
              // whole window when that is what the work needs. A hair is left
              // at the top so the divider itself stays grabbable, and the
              // bottom end runs to twice the window, since the page scrolls
              // below and a map worth studying is often taller than the
              // screen. Past the window a single gesture runs out of pointer,
              // so the range is covered by dragging twice.
              setSplit(Math.max(0.02, Math.min(1.96, start + d)))
            }
            const up = () => {
              window.removeEventListener("pointermove", move)
              window.removeEventListener("pointerup", up)
              window.removeEventListener("pointercancel", up)
              window.removeEventListener("blur", up)
            }
            window.addEventListener("pointermove", move)
            window.addEventListener("pointerup", up)
            window.addEventListener("pointercancel", up)
            window.addEventListener("blur", up)
          }}
        >
          <div className="h-px flex-1 bg-border group-hover:bg-burgundy
                          transition-colors" />
          {/* The bar alone read as a border; a grip says it can be held. */}
          <div className="mx-2 h-1.5 w-10 shrink-0 rounded-full bg-border
                          group-hover:bg-burgundy transition-colors" />
          <div className="h-px flex-1 bg-border group-hover:bg-burgundy
                          transition-colors" />
        </div>

        {/* Bottom: readings and controls. */}
        {!isMobile && (
        <section className="px-3 pb-3 grid gap-3 grid-cols-1 md:grid-cols-2"
                 style={{ flex: "1 0 auto" }}>
          {/* Two panels, side by side: what moves you, and where you have
              been. */}
          <div className="min-w-0 flex flex-col gap-1.5">
            <span className="rail-label"
                  title={"Ways of moving that are not a step on the compass "
                    + "or a property on a slider"}>
              Controls
            </span>
            <TravelBar
              corpus={corpus}
              radius={radius} setRadius={setRadius}
              temperature={temperature} setTemperature={setTemperature}
              step={step} setStep={setStep}
              axX={axX} axY={axY} axZ={axZ}
              setAxes={(x, y, zz) => { setAxX(x); setAxY(y); setAxZ(zz) }}
              overlap={atlas?.axes.overlap ?? null}
              ride={ride} orbit={orbit}
              onDrift={() => travel({ mode: "drift" }, "drift",
                                    `drift t${temperature.toFixed(2)}`)}
              onRepel={() => travel({ mode: "repel" }, "repel",
                                    `repel s${step.toFixed(2)}`)}
              onOrbit={() => orbit && travel(
                { mode: "orbit", centre: orbit.z, angle: 20 }, "orbit",
                `orbit ${orbit.name} +20°`)}
              onSetRide={async (a, b) => {
                try {
                  const [za, zb] = await Promise.all(
                    [api.fontPosition(a), api.fontPosition(b)])
                  setRide({ a, b, vec: zb.z.map((v, i) => v - za.z[i]) })
                } catch (e) { setError(String(e)) }
              }}
              onClearRide={() => setRide(null)}
              onSetOrbit={async (name) => {
                try {
                  const r = await api.fontPosition(name)
                  setOrbit({ name, z: r.z })
                } catch (e) { setError(String(e)) }
              }}
              onClearOrbit={() => setOrbit(null)}
              busy={busy}
            />
          </div>

          <div className="min-w-0 min-h-[260px] flex flex-col gap-1.5">
            <span className="rail-label"
                  title={"Every stop on this journey, and the name it "
                    + "exports under"}>
              Traversal
            </span>
            <div className="flex-1 min-h-0 flex flex-col rounded-md border
                            border-border/60 bg-muted/25 px-2.5 py-2">
              <Trail trail={trail} cursor={cursor} onGo={setCursor} />
            </div>
          </div>
        </section>
        )}

        {isMobile && (<>
          {/* The lower half of a phone: one instrument at a time, all of
              them mounted so a slider keeps its place across a swap. */}
          <div className="flex-1 min-h-0 px-2 pb-1 overflow-hidden">
            <div className={`h-full ${tab === "atlas" ? "" : "hidden"}`}>
              <Atlas data={atlas} busy={busy} onPick={goToFamily}
                     directions={directions}
                     colourBy={colourBy} setColourBy={setColourBy}
                     waypoint={waypoint} setWaypoint={setWaypoint}
                     onToward={goToward} radius={radius} sample={atlasChar}
                     liveGlyphs={location?.glyphs ?? null}
                     liveSelf={liveSelf}
                     ballOn={ballOn} setBallOn={setBallOn}
                     altitude={location?.altitude ?? null} corpus={corpus}
                     />
            </div>
            <div className={`h-full overflow-y-auto pt-1
                             ${tab === "steer" ? "" : "hidden"}`}>
              {directions.length > 0 ? (
                <DirectionPad directions={directions} at={standing}
                              onSlide={slideTo} onCommit={slideCommit}
                              busy={busy} />
              ) : (
                <p className="font-mono text-[10px] text-muted-foreground p-2">
                  No measured directions in this model.
                </p>
              )}

              {/* Ways of moving that are not a property on a slider, on the
                  same sheet as the sliders: a phone has one pane, and making
                  the traveller change tabs to drift was a tab too many. */}
              <div className="mt-4 pt-3 border-t border-border">
                <span className="rail-label">Controls</span>
                <div className="mt-2">
                  <TravelBar
                    corpus={corpus}
                    radius={radius} setRadius={setRadius}
                    temperature={temperature} setTemperature={setTemperature}
                    step={step} setStep={setStep}
                    axX={axX} axY={axY} axZ={axZ}
                    setAxes={(x, y, zz) => { setAxX(x); setAxY(y); setAxZ(zz) }}
                    overlap={atlas?.axes.overlap ?? null}
                    ride={ride} orbit={orbit}
                    onDrift={() => travel({ mode: "drift" }, "drift",
                                          `drift t${temperature.toFixed(2)}`)}
                    onRepel={() => travel({ mode: "repel" }, "repel",
                                          `repel s${step.toFixed(2)}`)}
                    onOrbit={() => orbit && travel(
                      { mode: "orbit", centre: orbit.z, angle: 20 }, "orbit",
                      `orbit ${orbit.name} +20°`)}
                    onSetRide={async (a, b) => {
                      try {
                        const [za, zb] = await Promise.all(
                          [api.fontPosition(a), api.fontPosition(b)])
                        setRide({ a, b,
                                  vec: zb.z.map((v, i) => v - za.z[i]) })
                      } catch (e) { setError(String(e)) }
                    }}
                    onClearRide={() => setRide(null)}
                    onSetOrbit={async (name) => {
                      try {
                        const r = await api.fontPosition(name)
                        setOrbit({ name, z: r.z })
                      } catch (e) { setError(String(e)) }
                    }}
                    onClearOrbit={() => setOrbit(null)}
                    busy={busy}
                  />
                </div>
              </div>
            </div>
            <div className={`h-full min-h-0 flex-col rounded-md border
                             border-border/60 bg-muted/25 px-2.5 py-2
                             overflow-y-auto
                             ${tab === "trail" ? "flex" : "hidden"}`}>
              <Trail trail={trail} cursor={cursor} onGo={setCursor} />
            </div>
            <div className={`h-full pt-1
                             ${tab === "walk" ? "" : "hidden"}`}>
              <CompassRose
                points={compass}
                compassText={compassText}
                radius={radius}
                onTravel={(p) => walk(p.bearing)}
                busy={busy}
              />
            </div>
          </div>

          <nav className="shrink-0 h-12 flex items-stretch border-t
                          border-border bg-card/60 pb-safe px-safe">
            {([["atlas", "Map"], ["steer", "Steer"],
               ["trail", "Trail"], ["walk", "Traverse"]] as const)
              .map(([key, label]) => (
              <button key={key}
                      aria-selected={tab === key}
                      onClick={() => pickTab(key)}
                      className={`flex-1 rail-label !text-[9px] border-t-2
                                  -mt-px transition-colors
                                  ${tab === key
                                    ? "border-burgundy text-burgundy"
                                    : "border-transparent"}`}>
                {label}
              </button>
            ))}
            <button onClick={undo}
                    disabled={trail.find((c) => c.id === cursor)?.parent == null}
                    className="w-14 rail-label !text-[13px] border-l
                               border-border disabled:opacity-30"
                    title="Step back along the trail">
              ↩
            </button>
          </nav>

          {error && (
            <button
              className="fixed left-2 right-2 z-40 panel px-3 py-2 font-mono
                         text-[10px] text-burgundy text-left truncate"
              style={{ bottom: "calc(3.25rem + env(safe-area-inset-bottom))" }}
              onClick={() => setError(null)}>
              {error}
            </button>
          )}
        </>)}
      </main>

      {sharing && z && (
        <ShareCard z={z} text={text} family={family}
                   onClose={() => setSharing(false)} />
      )}

      {planned && (
        <ComingSoon item={planned} onClose={() => setPlanned(null)} />
      )}

      {help && <Help topic={help} onClose={() => setHelp(null)} />}

      {settingsOpen && (
        <Settings
          theme={theme} setTheme={setTheme}
          defaultText={defaultText} setDefaultText={changeDefaultText}
          ballOn={ballOn} setBallOn={changeBall}
          licence={licence} setLicence={changeLicence}
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

      {about && (
        <About
          version={__APP_VERSION__}
          model={corpus.model?.id ?? "VectorModel"}
          families={corpus.count}
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

function Booting() {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center">
        <div className="font-display text-2xl mb-2">Vectorography</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          fitting the space to the corpus…
        </div>
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
