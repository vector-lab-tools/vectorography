import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, type AtlasData, type CompassPoint, type CorpusInfo,
         type Location, type NamedDirection } from "./api"
import { AltitudeMeter } from "./components/AltitudeMeter"
import { About } from "./components/About"
import { Atlas, type Waypoint } from "./components/Atlas"
import { CompassRose } from "./components/CompassRose"
import { DirectionPad } from "./components/DirectionPad"
import { JourneyTester } from "./components/JourneyTester"
import { MenuBar, type Menu } from "./components/MenuBar"
import { SpecimenStage, type Depth, type DragReport }
  from "./components/SpecimenStage"
import type { HandleKind } from "./components/handles"
import { Trail, type Crumb } from "./components/Trail"
import { TravelBar, type Orbit, type Ride } from "./components/TravelBar"

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
  const [dark, setDark] = useState(false)

  const [trail, setTrail] = useState<Crumb[]>([])
  const [cursor, setCursor] = useState(0)
  const [text, setText] = useState(DEFAULT_TEXT)
  const [radius, setRadius] = useState(0.6)
  const [temperature, setTemperature] = useState(0.5)
  const [step, setStep] = useState(0.5)
  // View axes, named either as a latent index ("axis:0") or as a measured
  // property ("dir:weight"). Both are directions in the same space; they differ
  // in who chose them, which is the comparison the instrument exists to make.
  const [axX, setAxX] = useState("axis:0")
  const [axY, setAxY] = useState("axis:1")
  const [axZ, setAxZ] = useState("axis:2")
  const [ride, setRide] = useState<Ride>(null)
  const [orbit, setOrbit] = useState<Orbit>(null)
  const [family, setFamily] = useState("Journey")
  const [testing, setTesting] = useState(false)
  const [about, setAbout] = useState(false)
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

  const [location, setLocation] = useState<Location | null>(null)
  const [compass, setCompass] = useState<CompassPoint[]>([])
  const [busy, setBusy] = useState(false)

  const here = trail.find((c) => c.id === cursor) ?? null
  const z = here?.z ?? null
  const seq = useRef(0)
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
      api.location(z, text, false, true, 24),
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
  const [liveRadius, setLiveRadius] = useState<number | null>(null)

  const atlasPoint = useCallback((p: number[]) => {
    const b = basis.current
    if (!b) return null
    const rng = atlas?.range
    const h = rng && atlas?.axes.height === "axis"
      ? (dot(p, b.w) - rng.h_min) / Math.max(rng.h_max - rng.h_min, 1e-6)
      : (liveSelf?.h ?? atlas?.self.h ?? 0)
    // Radius in the three directions on screen, the same quantity the server
    // reports, so the reading and the mark cannot disagree.
    const x = dot(p, b.u), y = dot(p, b.v), zz = dot(p, b.w)
    setLiveRadius(Math.hypot(x, y, zz))
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
    setLiveSelf(null)
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
    setLiveSelf(null)
    setLiveRadius(null)
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
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [walk, travel, temperature, step, here, undo, redo, resetToSane])

  // The journey exported is the path actually taken to get here, root to
  // cursor, so a branch exports its own line rather than the whole tree.

  const exportJourney = useCallback(async () => {
    if (ancestry.length < 2) return
    setBusy(true)
    try {
      await api.download("/api/export/journey",
        { trail: ancestry.map((c) => c.z), family,
          masters: Math.min(Math.max(ancestry.length, 2), 12) },
        `${family}-journey.zip`)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [ancestry, family])

  const exportSvg = useCallback(async () => {
    if (!z) return
    try { await api.download("/api/export/svg", { z, text }, "specimen.svg") }
    catch (e) { setError(String(e)) }
  }, [z, text])

  const exportFont = useCallback(async (format: "otf" | "ttf") => {
    if (!z) return
    setBusy(true)
    try {
      const near = location?.neighbours?.[0]?.family
      const style = here ? `Stop ${here.id}` : "Regular"
      await api.exportFont(z, family, style, format)
      void near
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, family, location, here])

  const menus: Menu[] = useMemo(() => [
    {
      label: "File",
      items: [
        { kind: "item", label: "Export Typeface (OTF)", hint: "here",
          disabled: !z || busy, onSelect: () => exportFont("otf"),
          title: "This location as an installable static OTF, cubic outlines" },
        { kind: "item", label: "Export Typeface (TTF)", hint: "here",
          disabled: !z || busy, onSelect: () => exportFont("ttf"),
          title: "This location as a static TrueType font" },
        { kind: "sep" },
        { kind: "item", label: "Compile Journey to Variable Font\u2026",
          hint: `${ancestry.length} stops`,
          disabled: ancestry.length < 2 || busy, onSelect: exportJourney,
          title: ancestry.length < 2
            ? "Travel somewhere first: a journey needs at least two stops"
            : "The whole path as a variable font, plus every stop as an OTF" },
        { kind: "sep" },
        { kind: "item", label: "Test Journey\u2026", hint: "compiled",
          disabled: ancestry.length < 2 || busy,
          onSelect: () => setTesting(true),
          title: ancestry.length < 2
            ? "Travel somewhere first: a journey needs at least two stops"
            : "Compile the journey and test the actual variable font here" },
        { kind: "sep" },
        { kind: "item", label: "Export Specimen Sheet (SVG)",
          disabled: !z, onSelect: exportSvg,
          title: "This location as a specimen sheet, with its map reading" },
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
      ],
    },
    {
      label: "View",
      items: [
        { kind: "item", label: dark ? "Light theme" : "Dark theme",
          onSelect: () => setDark((d) => !d) },
        { kind: "sep" },
        { kind: "item",
          label: `Atlas height: ${
            atlasHeight === "density" ? "crowding"
              : atlasHeight === "centroid" ? "distance from centroid"
              : "third axis"}`,
          hint: "cycle",
          onSelect: () => setAtlasHeight((h) =>
            h === "density" ? "centroid" : h === "centroid" ? "axis" : "density"),
          title: "What the vertical axis measures. On a latent axis it becomes "
                 + "a direction you can drag along." },
      ],
    },
    {
      label: "Help",
      items: [
        { kind: "item", label: "What the readings mean",
          onSelect: () => setAbout(true),
          title: "Stub: a page on altitude, density, the shell and the trail" },
        { kind: "item", label: "Keyboard shortcuts",
          onSelect: () => setAbout(true),
          title: "Stub" },
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
      isSane, resetToSane, trail])

  if (error && !corpus) return <Fatal message={error} />
  if (!corpus || !here) return <Booting />

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-stretch gap-3 pl-4 pr-3 h-11 border-b
                         border-border bg-card/60 shrink-0">
        <h1 className="font-display text-base tracking-tight self-center
                       whitespace-nowrap">
          Vectorography
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {__APP_VERSION__}
          </span>
        </h1>
        <MenuBar menus={menus} />
        <div className="flex-1" />
        <span className="self-center font-mono text-[10px] text-muted-foreground
                         hidden lg:inline whitespace-nowrap">
          {corpus.model?.name} {corpus.model?.version} · {corpus.count} OFL
          families · {corpus.dims}d
        </span>
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
        {/* Top: the type itself, at a size the hand can work on, with the
            space it sits in below and beside it. */}
        <section className="min-h-0 overflow-hidden flex flex-col gap-3
                            px-3 pt-3"
                 style={{ flex: `${split} 1 0%` }}>
          <div className="panel shrink-0 h-[168px] px-3 py-2 text-ink">
            <SpecimenStage
              glyphs={location?.glyphs ?? []}
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

          <div className="flex-1 min-h-0 flex gap-3">
            <div className="flex-1 min-w-0">
              <Atlas data={atlas} busy={busy} onPick={goToFamily}
                     directions={directions}
                     colourBy={colourBy} setColourBy={setColourBy}
                     waypoint={waypoint} setWaypoint={setWaypoint}
                     onToward={goToward} radius={radius} sample={atlasChar}
                     liveGlyphs={location?.glyphs ?? null}
                     liveSelf={liveSelf}
                     ballOn={ballOn} setBallOn={setBallOn}
                     altitude={location?.altitude ?? null} corpus={corpus}
                     liveRadius={liveRadius} />
            </div>

            <div className="w-[210px] lg:w-[240px] shrink-0 min-h-0
                            flex flex-col gap-2 overflow-hidden">
              <div className="flex-1 min-h-[96px] shrink">
                <CompassRose
                  points={compass}
                  centre={location?.glyphs ?? []}
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
          </div>
        </section>

        {/* The divider is draggable: how much room the space gets against how
            much the instruments get is the user's call, not ours. */}
        <div
          className="h-3 shrink-0 mx-3 my-1 cursor-row-resize group flex
                     items-center"
          onPointerDown={(e) => {
            const startY = e.clientY
            const start = split
            const host = (e.currentTarget.parentElement as HTMLElement)
            const total = host.clientHeight
            const move = (ev: PointerEvent) => {
              const d = (ev.clientY - startY) / Math.max(total, 1)
              setSplit(Math.max(0.25, Math.min(0.78, start + d)))
            }
            const up = () => {
              window.removeEventListener("pointermove", move)
              window.removeEventListener("pointerup", up)
            }
            window.addEventListener("pointermove", move)
            window.addEventListener("pointerup", up)
          }}
        >
          <div className="h-px w-full bg-border group-hover:bg-burgundy
                          transition-colors" />
        </div>

        {/* Bottom: readings and controls. */}
        <section className="min-h-0 overflow-y-auto px-3 pb-3 grid gap-4
                            grid-cols-1 md:grid-cols-2
                            xl:grid-cols-[176px_minmax(0,1fr)_212px]"
                 style={{ flex: `${1 - split} 1 0%` }}>
          <div className="min-w-0">
            <AltitudeMeter altitude={location?.altitude ?? null} corpus={corpus} />
          </div>

          <div className="min-w-0 flex flex-col gap-3">
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

          <div className="min-w-0 min-h-0 flex flex-col md:col-span-2 xl:col-span-1">
            <input
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="font-mono text-[11px] w-full bg-background border
                         border-border rounded-sm px-2 py-1 mb-3"
              title="Family name for the exported typeface"
            />
            <Trail trail={trail} cursor={cursor} onGo={setCursor}
                   onExport={exportJourney} onTest={() => setTesting(true)}
                   canCompile={ancestry.length >= 2} busy={busy} />
          </div>
        </section>
      </main>

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

      <footer className="h-8 shrink-0 px-4 flex items-center gap-4 border-t
                         border-border bg-card/60">
        <span className="font-mono text-[10px] text-muted-foreground">
          arrows walk · d drift · r repel · ⌘Z undo · ⇧⌘Z redo
        </span>
        <div className="flex-1" />
        {error && (
          <button className="font-mono text-[10px] text-burgundy truncate max-w-md"
                  onClick={() => setError(null)} title={error}>
            {error}
          </button>
        )}
        <span className="font-mono text-[10px] text-muted-foreground"
              title={`${corpus.count} families from the Google Fonts OFL tree, `
                     + `${corpus.dims} dimensions`}>
          corpus: {corpus.model?.id ?? "VectorModel"}
        </span>
      </footer>
    </div>
  )
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
