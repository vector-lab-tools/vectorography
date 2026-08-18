import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, type CompassPoint, type CorpusInfo, type Location,
         type NamedDirection } from "./api"
import { AltitudeMeter } from "./components/AltitudeMeter"
import { CompassRose } from "./components/CompassRose"
import { DirectionPad } from "./components/DirectionPad"
import { JourneyTester } from "./components/JourneyTester"
import { MenuBar, type Menu } from "./components/MenuBar"
import { Neighbours } from "./components/Neighbours"
import { Specimen } from "./components/Specimen"
import { Trail, type Crumb } from "./components/Trail"
import { TravelBar, type Orbit, type Ride } from "./components/TravelBar"

const DEFAULT_TEXT = "Hamburgefonstiv"

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
  const [axisA, setAxisA] = useState(0)
  const [axisB, setAxisB] = useState(1)
  const [ride, setRide] = useState<Ride>(null)
  const [orbit, setOrbit] = useState<Orbit>(null)
  const [family, setFamily] = useState("Journey")
  const [testing, setTesting] = useState(false)
  const [directions, setDirections] = useState<NamedDirection[]>([])

  const [location, setLocation] = useState<Location | null>(null)
  const [compass, setCompass] = useState<CompassPoint[]>([])
  const [busy, setBusy] = useState(false)

  const here = trail.find((c) => c.id === cursor) ?? null
  const z = here?.z ?? null
  const seq = useRef(0)

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
    api.directions().then((d) => setDirections(d.directions)).catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

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
      api.location(z, text),
      api.compass(z, compassText, radius, axisA, axisB, ride?.vec ?? null),
    ]).then(([loc, comp]) => {
      if (n !== seq.current) return
      setLocation(loc)
      setCompass(comp.points)
    }).catch((e) => { if (n === seq.current) setError(String(e)) })
      .finally(() => { if (n === seq.current) setBusy(false) })
  }, [z, text, compassText, radius, axisA, axisB, ride])

  // Ids come from a counter rather than from the trail's length, and the
  // updater stays pure. Setting the cursor inside it made the update a side
  // effect, which React is free to run twice, and it duplicated crumbs.
  const nextId = useRef(1)

  const push = useCallback((nz: number[], mode: string, label: string) => {
    const id = nextId.current++
    setTrail((prev) => {
      const parent = prev.find((c) => c.id === cursor)
      const isTip = prev.length > 0 && prev[prev.length - 1].id === cursor
      const depth = parent ? (isTip ? parent.depth : parent.depth + 1) : 0
      return [...prev, { id, z: nz, mode, label, parent: cursor, depth }]
    })
    setCursor(id)
  }, [cursor])

  const travel = useCallback(async (body: Record<string, unknown>,
                                    mode: string, label: string) => {
    if (!z) return
    setBusy(true)
    try {
      const r = await api.travel({ z, radius, axis_a: axisA, axis_b: axisB,
                                   ride: ride?.vec ?? null, temperature, step,
                                   ...body })
      push(r.z, mode, label)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [z, radius, axisA, axisB, ride, temperature, step, push])

  const walk = useCallback((bearing: number) =>
    travel({ mode: "walk", bearing }, "walk",
           `walk ${String(bearing).padStart(3, "0")}° r${radius.toFixed(2)}`),
    [travel, radius])

  const steer = useCallback((key: string, sign: number) => {
    const d = directions.find((x) => x.key === key)
    const way = sign > 0 ? d?.plus : d?.minus
    return travel({ mode: "steer", direction: key, sign }, "steer",
                  `${way ?? key}`)
  }, [travel, directions])

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
        e.preventDefault(); setCursor(here.parent)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [walk, travel, temperature, step, here])

  // The journey exported is the path actually taken to get here, root to
  // cursor, so a branch exports its own line rather than the whole tree.
  const ancestry = useMemo(() => {
    const byId = new Map(trail.map((c) => [c.id, c]))
    const out: Crumb[] = []
    let c = byId.get(cursor)
    while (c) { out.unshift(c); c = c.parent != null ? byId.get(c.parent) : undefined }
    return out
  }, [trail, cursor])

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
      label: "View",
      items: [
        { kind: "item", label: dark ? "Light theme" : "Dark theme",
          onSelect: () => setDark((d) => !d) },
      ],
    },
  ], [z, busy, dark, ancestry.length, exportFont, exportJourney, exportSvg])

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
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="self-center font-mono text-[11px] w-52 bg-background
                     border border-border rounded-sm px-2 py-1"
          title="Specimen text. Reading the letters is how you decide where to go."
        />
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[196px_minmax(0,1fr)_215px] gap-4 p-4">
        <aside className="min-h-0 min-w-0 flex flex-col gap-4 overflow-y-auto">
          <AltitudeMeter altitude={location?.altitude ?? null} corpus={corpus} />
          {directions.length > 0 && (
            <div className="border-t border-border pt-3">
              <DirectionPad directions={directions} onSteer={steer} busy={busy} />
            </div>
          )}
        </aside>

        <section className="min-h-0 min-w-0 flex flex-col gap-3">
          {/* The location itself, at reading size. Everything else on this
              screen is about deciding where to go from here. */}
          <div className="panel shrink-0 px-5 py-3 flex items-center
                          justify-center h-[130px]">
            <Specimen glyphs={location?.glyphs ?? []} text={text}
                      className="w-full h-full text-ink" />
          </div>
          <div className="flex-1 min-h-0">
            <CompassRose
              points={compass}
              centre={location?.glyphs ?? []}

              compassText={compassText}
              radius={radius}
              onTravel={(p) => walk(p.bearing)}
              busy={busy}
            />
          </div>
          <TravelBar
            corpus={corpus}
            radius={radius} setRadius={setRadius}
            temperature={temperature} setTemperature={setTemperature}
            step={step} setStep={setStep}
            axisA={axisA} axisB={axisB}
            setPlane={(a, b) => { setAxisA(a); setAxisB(b) }}
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
        </section>

        <aside className="min-h-0 min-w-0 flex flex-col gap-4">
          <Neighbours neighbours={location?.neighbours ?? []} onPick={goToFamily} />
          <div className="border-t border-border pt-3 flex flex-col min-h-0 flex-1">
            <input
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="font-mono text-[11px] w-full bg-background border
                         border-border rounded-sm px-2 py-1 mb-3"
              title="Family name for the exported variable font"
            />
            <Trail trail={trail} cursor={cursor} onGo={setCursor}
                   onExport={exportJourney} onTest={() => setTesting(true)}
                   canCompile={ancestry.length >= 2} busy={busy} />
          </div>
        </aside>
      </main>

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
          arrows walk · d drift · r repel · backspace back
        </span>
        <div className="flex-1" />
        {error && (
          <button className="font-mono text-[10px] text-burgundy truncate max-w-md"
                  onClick={() => setError(null)} title={error}>
            {error}
          </button>
        )}
        <span className="font-mono text-[10px] text-muted-foreground">
          corpus: Google Fonts, OFL-1.1
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
