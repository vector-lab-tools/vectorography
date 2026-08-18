import { useCallback, useEffect, useRef, useState } from "react"
import type { AtlasData, NamedDirection } from "../api"

/**
 * The corpus as a place, drawn with letterforms rather than with numbers.
 *
 * Both ground axes are the plane the compass turns in, so this is the surface
 * actually being steered on and not some other projection of the space. Height
 * is density: the crowded middle of the distribution rises, open country falls
 * away, and REPEL is visibly downhill. Coordinates are absolute with the corpus
 * centroid at the origin, so the map holds still while you move across it.
 *
 * Near neighbours are drawn as their actual letterforms. Everything else is a
 * dot, because five hundred simultaneous typefaces is not a map, it is a mess.
 */

type Cam = { yaw: number; pitch: number; zoom: number }

/**
 * Colour runs along whichever measured property is selected: a diverging ramp
 * from one end of the measurement to the other, through a neutral middle. It is
 * a reading of the corpus, not decoration, so the legend always says which
 * property is being shown and which way it runs.
 */
const RAMP: [number, number, number][] = [
  [124, 45, 54],    // burgundy: the low end
  [176, 122, 84],
  [150, 146, 128],  // neutral middle
  [86, 130, 133],
  [30, 74, 106],    // deep blue: the high end
]

function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1)
  const i = Math.min(Math.floor(x), RAMP.length - 2)
  const f = x - i
  const a = RAMP[i], b = RAMP[i + 1]
  return [a[0] + (b[0] - a[0]) * f,
          a[1] + (b[1] - a[1]) * f,
          a[2] + (b[2] - a[2]) * f]
}

export function Atlas({ data, onPick, busy, directions, colourBy, setColourBy }: {
  data: AtlasData | null
  onPick: (name: string) => void
  busy: boolean
  directions: NamedDirection[]
  colourBy: string
  setColourBy: (k: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The camera is a ref, not state. Held as state, every pointer event during
  // a drag re-rendered the tree before it drew a frame, which is most of what
  // made orbiting feel heavy.
  const cam = useRef<Cam>({ yaw: 0.6, pitch: 0.62, zoom: 22 })
  const fitted = useRef(false)
  const [hover, setHover] = useState<{ name: string; sx: number; sy: number } | null>(null)
  const hoverName = useRef<string | null>(null)
  const drag = useRef<{ x: number; y: number; cam: Cam } | null>(null)
  const pending = useRef<{ mx: number; my: number } | null>(null)
  const paths = useRef(new Map<string, Path2D>())
  const frame = useRef(0)
  const lastDraw = useRef(0)
  const showNames = useRef(true)
  const [namesOn, setNamesOn] = useState(true)
  const [zoomLabel, setZoomLabel] = useState(22)

  const HEIGHT_SCALE = 5.5
  // Letterforms are sized in screen pixels, not world units. Tying them to the
  // zoom made them a pixel and a half across at the fitted view, which is the
  // one view every user sees first.
  const SPRITE_PX = 30
  const SELF_PX = 46

  const project = useCallback((x: number, y: number, h: number,
                               w: number, ht: number, c: Cam) => {
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw)
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch)
    const rx = x * cy - y * sy
    const ry = x * sy + y * cy
    return {
      sx: w / 2 + rx * c.zoom,
      sy: ht * 0.62 + (ry * sp - h * HEIGHT_SCALE * cp) * c.zoom,
      depth: ry * cp + h * HEIGHT_SCALE * sp,
    }
  }, [])

  // Height already arrives normalised to 0..1 from the server.
  const norm = useCallback((h: number) => h, [])

  useEffect(() => { paths.current.clear() }, [data])

  // Fit to the corpus once, so the first sight of the space is the whole of it.
  // Guarded on a measured width: run before layout settles and the fit is
  // computed against a box of nothing.
  useEffect(() => {
    if (!data || fitted.current) return
    const w = box.current?.clientWidth ?? 0
    if (w < 50) return
    const spread = Math.max(
      ...data.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))), 1)
    fitted.current = true
    cam.current = { ...cam.current, zoom: Math.max(7, Math.min(60, (w * 0.40) / spread)) }
    setZoomLabel(cam.current.zoom)
  }, [data])

  const draw = useCallback(() => {
    const cv = canvas.current, bx = box.current
    if (!cv || !bx || !data) return
    const names = showNames.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = bx.clientWidth, h = bx.clientHeight
    cv.width = w * dpr; cv.height = h * dpr
    cv.style.width = `${w}px`; cv.style.height = `${h}px`
    const ctx = cv.getContext("2d", { alpha: true })!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const css = getComputedStyle(document.documentElement)
    const ink = `hsl(${css.getPropertyValue("--ink")})`
    const burg = `hsl(${css.getPropertyValue("--burgundy")})`
    const muted = `hsl(${css.getPropertyValue("--muted-foreground")})`
    const c = cam.current
    const P = (x: number, y: number, hh: number) => project(x, y, hh, w, h, c)

    // Hover is resolved here rather than on every pointer event: the points are
    // being projected anyway, so the hit test is a comparison rather than a
    // second pass, and it runs once a frame instead of once an event.
    const probe = drag.current ? null : pending.current
    let hit: { name: string; sx: number; sy: number; dist: number } | null = null

    // Ground: the plane of the corpus centroid.
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.16; ctx.lineWidth = 1
    const R = Math.ceil(Math.max(
      ...data.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))), 4))
    const gstep = R / 4
    for (let g = -R; g <= R + 1e-9; g += gstep) {
      const a = P(g, -R, 0), b = P(g, R, 0)
      const c2 = P(-R, g, 0), d2 = P(R, g, 0)
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(c2.sx, c2.sy); ctx.lineTo(d2.sx, d2.sy); ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Centroid: the average of every font in the corpus.
    const o = P(0, 0, 0)
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.arc(o.sx, o.sy, 4, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 1

    // Which names get drawn. Five hundred labels over one another is not more
    // information than fifty, it is less, so the plane is divided into cells
    // and the nearest font in each takes the cell. Nearest first, so the labels
    // that survive are the ones in the country being travelled.
    const taken = new Set<string>()
    const labelled = new Set<number>()
    if (names) {
      const order = [...data.points].sort((a, b) => a.d - b.d)
      for (const p of order) {
        const q = P(p.x, p.y, norm(p.h))
        if (q.sx < 0 || q.sx > w || q.sy < 0 || q.sy > h) continue
        const key = `${Math.round(q.sx / 62)}:${Math.round(q.sy / 12)}`
        if (taken.has(key)) continue
        taken.add(key)
        labelled.add(p.i)
      }
    }

    type Item = { depth: number; kind: "dot" | "sprite" | "self"
                  sx: number; sy: number; p?: typeof data.points[0] }
    const items: Item[] = []
    for (const p of data.points) {
      const q = P(p.x, p.y, norm(p.h))
      if (probe) {
        const dd = Math.hypot(q.sx - probe.mx, q.sy - probe.my)
        if (dd < 16 && (!hit || dd < hit.dist))
          hit = { name: p.name, sx: q.sx, sy: q.sy, dist: dd }
      }
      if (q.sx < -200 || q.sx > w + 200 || q.sy < -200 || q.sy > h + 200) continue
      items.push({ depth: q.depth, kind: data.sprites[p.i] ? "sprite" : "dot",
                   sx: q.sx, sy: q.sy, p })
    }
    const me = P(data.self.x, data.self.y, norm(data.self.h))
    items.push({ depth: me.depth, kind: "self", sx: me.sx, sy: me.sy })
    // Depth order within a kind, but letterforms always above the dust: a
    // sprite buried under a hundred dots is not a label of anything.
    const rank = { dot: 0, sprite: 1, self: 2 } as const
    items.sort((a, b) => rank[a.kind] - rank[b.kind] || b.depth - a.depth)

    // Trail, on the ground plane so the route reads as a route.
    if (data.trail.length > 1) {
      ctx.strokeStyle = burg; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5
      ctx.beginPath()
      data.trail.forEach((t, i) => {
        const q = P(t.x, t.y, norm(t.h))
        i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy)
      })
      ctx.stroke()
      ctx.globalAlpha = 1
      for (const t of data.trail) {
        const q = P(t.x, t.y, norm(t.h))
        ctx.fillStyle = burg; ctx.globalAlpha = 0.35
        ctx.beginPath(); ctx.arc(q.sx, q.sy, 2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    for (const it of items) {
      if (it.kind === "dot" && it.p) {
        // Fades with distance, so the near country reads clearly and the far
        // country stays as context rather than competing with it.
        const near = Math.max(0, 1 - it.p.d / 16)
        const [r, g, b] = ramp(it.p.c)
        ctx.fillStyle = `rgb(${r} ${g} ${b})`
        ctx.globalAlpha = 0.25 + 0.6 * near
        ctx.beginPath(); ctx.arc(it.sx, it.sy, 1.7 + 1.8 * near, 0, Math.PI * 2)
        ctx.fill()
        if (names && labelled.has(it.p.i)) {
          ctx.globalAlpha = 0.2 + 0.7 * near
          ctx.font = `${7 + 2 * near}px ui-monospace, Menlo, monospace`
          ctx.textAlign = "left"
          ctx.fillText(it.p.name, it.sx + 4, it.sy + 2.5)
        }
        ctx.globalAlpha = 1
      } else if (it.kind === "sprite" && it.p) {
        const glyphs = data.sprites[it.p.i]
        const scale = SPRITE_PX
        // A little of the ground colour behind each letterform, so it reads
        // against the cloud rather than dissolving into it.
        ctx.save()
        ctx.globalAlpha = 0.75
        ctx.fillStyle = `hsl(${css.getPropertyValue("--card")})`
        ctx.beginPath()
        ctx.ellipse(it.sx + scale * 0.5, it.sy - scale * 0.22,
                    scale * 0.95, scale * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.translate(it.sx, it.sy)
        ctx.scale(scale, -scale)
        ctx.fillStyle = ink
        ctx.globalAlpha = Math.max(0.35, 1 - it.p.d / 12)
        let dx = 0
        for (const g of glyphs) {
          let path = paths.current.get(`${it.p.i}:${g.char}`)
          if (!path) {
            path = new Path2D(g.path)
            paths.current.set(`${it.p.i}:${g.char}`, path)
          }
          ctx.save(); ctx.translate(dx, 0); ctx.fill(path, "evenodd"); ctx.restore()
          dx += g.advance
        }
        ctx.restore()
        ctx.globalAlpha = 1
        if (names && it.p) {
          const [r, g, b] = ramp(it.p.c)
          ctx.fillStyle = `rgb(${r} ${g} ${b})`
          ctx.globalAlpha = 0.9
          ctx.font = "8px ui-monospace, Menlo, monospace"
          ctx.textAlign = "center"
          ctx.fillText(it.p.name, it.sx + SPRITE_PX * 0.5, it.sy + 11)
          ctx.globalAlpha = 1
        }
      } else {
        // You: drawn last within its depth, in the accent, with a drop line to
        // the ground so the height reading is not ambiguous.
        const ground = P(data.self.x, data.self.y, 0)
        ctx.strokeStyle = burg; ctx.globalAlpha = 0.35
        ctx.setLineDash([2, 3])
        ctx.beginPath(); ctx.moveTo(it.sx, it.sy); ctx.lineTo(ground.sx, ground.sy)
        ctx.stroke(); ctx.setLineDash([])
        ctx.globalAlpha = 1

        const scale = SELF_PX
        ctx.save()
        ctx.translate(it.sx, it.sy)
        ctx.scale(scale, -scale)
        ctx.fillStyle = burg
        let dx = 0
        for (const g of data.self.glyphs) {
          let path = paths.current.get(`self:${g.char}`)
          if (!path) { path = new Path2D(g.path); paths.current.set(`self:${g.char}`, path) }
          ctx.save(); ctx.translate(dx, 0); ctx.fill(path, "evenodd"); ctx.restore()
          dx += g.advance
        }
        ctx.restore()
      }
    }

    if (probe) {
      pending.current = null
      const name = hit?.name ?? null
      // Only disturb React when the hovered font actually changes.
      if (name !== hoverName.current) {
        hoverName.current = name
        setHover(hit ? { name: hit.name, sx: hit.sx, sy: hit.sy } : null)
      }
    }
  }, [data, norm, project])

  // One draw per frame at most, and never faster than MAX_FPS. Pointer events
  // arrive far more often than the screen can show them, so they only mark the
  // canvas dirty and the loop coalesces them.
  const MAX_FPS = 60
  const schedule = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame((t) => {
      frame.current = 0
      if (t - lastDraw.current < 1000 / MAX_FPS - 1) { schedule(); return }
      lastDraw.current = t
      draw()
    })
  }, [draw])

  // Zoom without a wheel: a trackpad pinch is not obvious, and reaching the
  // far country by scrolling is tedious.
  const setZoom = useCallback((next: number) => {
    cam.current = { ...cam.current, zoom: Math.max(4, Math.min(120, next)) }
    setZoomLabel(cam.current.zoom)
    draw()
  }, [draw])

  const refit = useCallback(() => {
    if (!data || !box.current) return
    const spread = Math.max(
      ...data.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))), 1)
    setZoom((box.current.clientWidth * 0.40) / spread)
    cam.current = { ...cam.current, yaw: 0.6, pitch: 0.62 }
    draw()
  }, [data, setZoom, draw])

  // New data and resizes draw straight away. Only interaction goes through the
  // frame cap: requestAnimationFrame does not fire while a tab is hidden, so
  // scheduling the first paint through it leaves the canvas blank until
  // something moves, which for an offscreen or backgrounded pane is never.
  useEffect(() => {
    draw()
    const ro = new ResizeObserver(() => draw())
    if (box.current) ro.observe(box.current)
    return () => {
      ro.disconnect()
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [draw])

  const controls = data && (
    <>
      <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em]
                         text-muted-foreground pointer-events-none">
          {data.axes.ride ? "ride heading" : `axis ${data.axes.x}`}
          {" × "}axis {data.axes.y}
          {" · height: "}
          {data.axes.height === "density" ? "crowding" : "from centroid"}
        </span>
        <div className="flex items-center gap-1.5">
          <select
            value={colourBy}
            onChange={(e) => setColourBy(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            className="font-mono text-[9px] bg-card border border-border
                       rounded-sm px-1 py-0.5"
            title="Which measured property the colour shows"
          >
            {directions.map((d) => (
              <option key={d.key} value={d.key}>colour: {d.label}</option>
            ))}
          </select>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              showNames.current = !showNames.current
              setNamesOn(showNames.current)
              schedule()
            }}
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border
                        transition-colors ${namesOn
                          ? "border-burgundy text-burgundy"
                          : "border-border text-muted-foreground"}`}
          >
            names
          </button>
        </div>
      </div>

      {data.colour && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5
                        pointer-events-none">
          <span className="font-mono text-[9px] text-muted-foreground">
            {data.colour.low}
          </span>
          <span className="h-2 w-20 rounded-sm" style={{
            background: `linear-gradient(90deg, ${
              [0, 0.25, 0.5, 0.75, 1].map((t) => {
                const [r, g, b] = ramp(t)
                return `rgb(${r} ${g} ${b})`
              }).join(", ")})`,
          }} />
          <span className="font-mono text-[9px] text-muted-foreground">
            {data.colour.high}
          </span>
        </div>
      )}
    </>
  )

  return (
    <div ref={box}
         className="relative w-full h-full rounded-md border border-border
                    bg-card overflow-hidden select-none"
         onPointerDown={(e) => {
           drag.current = { x: e.clientX, y: e.clientY, cam: { ...cam.current } }
           if (hoverName.current) { hoverName.current = null; setHover(null) }
           ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
         }}
         onPointerMove={(e) => {
           if (drag.current) {
             const dx = e.clientX - drag.current.x
             const dy = e.clientY - drag.current.y
             cam.current = {
               yaw: drag.current.cam.yaw + dx * 0.006,
               pitch: Math.max(0.06, Math.min(1.45,
                 drag.current.cam.pitch + dy * 0.005)),
               zoom: drag.current.cam.zoom,
             }
             schedule()
             return
           }
           const r = box.current!.getBoundingClientRect()
           pending.current = { mx: e.clientX - r.left, my: e.clientY - r.top }
           schedule()
         }}
         onPointerUp={() => { drag.current = null }}
         onPointerLeave={() => {
           drag.current = null
           pending.current = null
           if (hoverName.current) { hoverName.current = null; setHover(null) }
         }}
         onWheel={(e) => {
           const c = cam.current
           cam.current = { ...c,
             zoom: Math.max(4, Math.min(120, c.zoom * (e.deltaY > 0 ? 0.9 : 1.11))) }
           setZoomLabel(cam.current.zoom)
           schedule()
         }}
         onClick={() => { if (hover && !busy) onPick(hover.name) }}
    >
      <canvas ref={canvas} className="block" />
      {controls}
      {hover && (
        <div className="absolute px-1.5 py-0.5 bg-ink text-ivory rounded-sm
                        font-mono text-[10px] pointer-events-none
                        -translate-x-1/2 -translate-y-[150%]"
             style={{ left: hover.sx, top: hover.sy }}>
          {hover.name}
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1">
        {([["−", () => setZoom(cam.current.zoom / 1.35), "Zoom out"],
           ["+", () => setZoom(cam.current.zoom * 1.35), "Zoom in"],
           ["⤢", refit, "Fit the whole corpus"]] as const).map(([label, fn, tip]) => (
          <button
            key={label}
            title={tip}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); fn() }}
            className="w-6 h-6 flex items-center justify-center rounded-sm
                       border border-border bg-card font-mono text-[11px]
                       leading-none hover:border-burgundy hover:text-burgundy
                       active:translate-y-px transition-colors"
          >
            {label}
          </button>
        ))}
        <input
          type="range" min={4} max={120} step={1} value={zoomLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-24 accent-burgundy ml-1"
          title="Zoom"
        />
        <span className="font-mono text-[9px] text-muted-foreground w-8">
          {Math.round(zoomLabel)}
        </span>
      </div>

      <div className="absolute bottom-2 right-2 font-mono text-[9px]
                      text-muted-foreground/70 pointer-events-none">
        drag to orbit · click a font to travel there
      </div>
    </div>
  )
}
