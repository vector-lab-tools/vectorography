import { useEffect, useRef, useState } from "react"
import { Modal } from "./Modal"

/**
 * The journey, compiled and tested in place.
 *
 * This loads the same variable font the export produces, so what is judged here
 * is the artefact that leaves the instrument rather than a rendering that
 * resembles it. Nothing is generated: the font is the trail, compiled.
 */
export function JourneyTester({ trail, family, stops, onClose }: {
  trail: number[][]
  family: string
  stops: number
  onClose: () => void
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("")
  const [axis, setAxis] = useState(0)
  const [size, setSize] = useState(64)
  const [text, setText] = useState("Hamburgefonstiv")
  const [guides, setGuides] = useState(true)
  const faceRef = useRef<FontFace | null>(null)
  const id = useRef(`VGJourney${Math.floor(performance.now())}`)

  useEffect(() => {
    let dead = false
    const face = id.current
    ;(async () => {
      try {
        const r = await fetch("/api/preview/journey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trail, family, masters: stops }),
        })
        if (!r.ok) throw new Error(await r.text())
        const buf = await r.arrayBuffer()
        if (dead) return
        const ff = new FontFace(face, buf)
        await ff.load()
        document.fonts.add(ff)
        faceRef.current = ff
        setState("ready")
      } catch (e) {
        if (!dead) { setMessage(String(e)); setState("error") }
      }
    })()
    return () => {
      dead = true
      if (faceRef.current) document.fonts.delete(faceRef.current)
    }
  }, [trail, family, stops])

  const style = {
    fontFamily: id.current,
    fontVariationSettings: `'JRNY' ${axis}`,
  } as const

  return (
    <Modal
      wide
      title={`Test journey · ${family}`}
      subtitle={`${trail.length} stops · compiled to ${stops} masters · axis JRNY 0–1000`}
      onClose={onClose}
    >
      {state === "loading" && (
        <p className="font-mono text-[11px] text-muted-foreground py-10 text-center">
          compiling the journey into a variable font…
        </p>
      )}

      {state === "error" && (
        <pre className="font-mono text-[10px] text-burgundy whitespace-pre-wrap
                        bg-muted p-3 rounded-sm">{message}</pre>
      )}

      {state === "ready" && (
        <div className="space-y-5">
          <div className="flex items-end gap-5 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="rail-label mb-1">
                journey axis <span className="text-foreground">{axis}</span>
              </div>
              <input type="range" min={0} max={1000} step={1} value={axis}
                     onChange={(e) => setAxis(Number(e.target.value))}
                     className="w-full accent-burgundy" />
              <div className="flex justify-between mt-1">
                {Array.from({ length: stops }, (_, i) => (
                  <button key={i}
                    onClick={() => setAxis(Math.round(i * 1000 / (stops - 1)))}
                    className="font-mono text-[9px] text-muted-foreground
                               hover:text-burgundy transition-colors">
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="rail-label mb-1">
                size <span className="text-foreground">{size}</span>
              </div>
              <input type="range" min={12} max={160} value={size}
                     onChange={(e) => setSize(Number(e.target.value))}
                     className="w-32 accent-burgundy" />
            </div>
            <button className={`btn ${guides ? "btn-active" : ""}`}
                    onClick={() => setGuides((g) => !g)}>
              Guides
            </button>
          </div>

          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="w-full font-mono text-[11px] bg-card border border-border
                       rounded-sm px-2 py-1.5"
          />

          {/* Faint baseline, x-height and cap-height behind the specimen, so the
              shapes can be read against the metrics the font declares. */}
          <SpecimenBoard text={text} size={size} style={style} guides={guides} />

          <div>
            <div className="rail-label mb-2">waterfall</div>
            <div className="space-y-1.5 border border-border rounded-sm
                            bg-card px-5 py-4 overflow-x-auto">
              {[14, 18, 24, 32, 48].map((s) => (
                <div key={s} className="whitespace-nowrap"
                     style={{ ...style, fontSize: s, lineHeight: 1.3 }}>
                  {text || "Hamburgefonstiv"}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="rail-label mb-2">in text</div>
            <p className="border border-border rounded-sm bg-card px-5 py-4"
               style={{ ...style, fontSize: 17, lineHeight: 1.55 }}>
              The quick brown fox jumps over the lazy dog. ABCDEFGHIJKLMNOPQRSTUVWXYZ
              abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
          </div>

          <p className="font-mono text-[10px] text-muted-foreground">
            This is the same variable font that File → Compile Journey writes.
          </p>
        </div>
      )}
    </Modal>
  )
}

/** Cap height and x-height as fractions of the em, as the fonts declare them. */
const CAP = 0.686
const XH = 0.507

function SpecimenBoard({ text, size, style, guides }: {
  text: string
  size: number
  style: React.CSSProperties
  guides: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [baseline, setBaseline] = useState<number | null>(null)

  // The baseline is measured, not guessed: a zero-sized inline-block aligned to
  // the baseline sits exactly on it, whatever the line box does.
  useEffect(() => {
    const measure = () => {
      if (!box.current || !probe.current) return
      setBaseline(probe.current.getBoundingClientRect().top
                  - box.current.getBoundingClientRect().top)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [text, size, style])

  const rows: [string, number][] = baseline == null ? [] : [
    ["cap", baseline - size * CAP],
    ["x-height", baseline - size * XH],
    ["baseline", baseline],
  ]

  return (
    <div ref={box} className="relative border border-border rounded-sm bg-card
                              overflow-x-auto">
      {guides && rows.map(([label, top]) => (
        <div key={label} className="absolute left-0 right-0 pointer-events-none"
             style={{ top }}>
          <div className="h-px w-full bg-burgundy/25" />
          <span className="absolute right-1.5 -top-3.5 font-mono text-[8px]
                           uppercase tracking-[0.1em] text-burgundy/45">
            {label}
          </span>
        </div>
      ))}
      <div className="relative px-5 py-10 whitespace-nowrap"
           style={{ ...style, fontSize: size, lineHeight: 1.2 }}>
        {text || " "}
        <span ref={probe} style={{ display: "inline-block", width: 0, height: 0,
                                   verticalAlign: "baseline" }} />
      </div>
    </div>
  )
}
