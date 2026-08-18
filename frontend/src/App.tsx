import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, type CompassPoint, type CorpusInfo, type Location } from "./api"
import { AltitudeMeter } from "./components/AltitudeMeter"
import { CompassRose } from "./components/CompassRose"
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
      setTrail([{ id: 0, z: new Array(c.dims).fill(0), mode: "origin",
                  label: "origin · the centroid", parent: null, depth: 0 }])
      setCursor(0)
    }).catch((e) => setError(String(e)))
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

  const push = useCallback((nz: number[], mode: string, label: string) => {
    setTrail((prev) => {
      const parent = prev.find((c) => c.id === cursor)
      const isTip = prev.length > 0 && prev[prev.length - 1].id === cursor
      const depth = parent ? (isTip ? parent.depth : parent.depth + 1) : 0
      const id = prev.length ? Math.max(...prev.map((c) => c.id)) + 1 : 0
      setCursor(id)
      return [...prev, { id, z: nz, mode, label, parent: cursor, depth }]
    })
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

  if (error && !corpus) return <Fatal message={error} />
  if (!corpus || !here) return <Booting />

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-4 px-4 h-12 border-b border-border
                         bg-card/60 shrink-0">
        <h1 className="font-display text-base tracking-tight">
          Vectorography
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {__APP_VERSION__}
          </span>
        </h1>
        <span className="font-mono text-[10px] text-muted-foreground hidden md:inline">
          {corpus.count} OFL families · {corpus.dims}-dim space ·
          {" "}{(corpus.explained_variance.reduce((a, b) => a + b, 0) * 100).toFixed(0)}% variance
        </span>
        <div className="flex-1" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="font-mono text-[11px] w-56 bg-background border border-border
                     rounded-sm px-2 py-1"
          title="Specimen text. Reading the letters is how you decide where to go."
        />
        <button className="btn" onClick={exportSvg}>Specimen SVG</button>
        <button className="btn" onClick={() => setDark((d) => !d)}
                title="Toggle dark">{dark ? "Light" : "Dark"}</button>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[180px_minmax(0,1fr)_215px] gap-4 p-4">
        <aside className="min-h-0 min-w-0">
          <AltitudeMeter altitude={location?.altitude ?? null} corpus={corpus} />
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
                   onExport={exportJourney} busy={busy} />
          </div>
        </aside>
      </main>

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
