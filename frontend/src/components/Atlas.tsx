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

export type Waypoint = { x: number; y: number }

/**
 * Every family's name, set in that family.
 *
 * The files are the corpus originals rather than the space's reconstruction of
 * them: a label naming a typeface should show that typeface, not this
 * instrument's lossy account of it. Loading is lazy and capped, and anything
 * that fails, or that is missing because the corpus was never downloaded,
 * falls back to the plain face without comment.
 */
const LOADED = new Map<string, boolean>()   // name -> usable
const MAX_FACES = 90

// Labels are rendered once into their own canvas and blitted thereafter.
export const LABEL_PX = 22
export const LABEL_DPR = 2
const LABELS = new Map<string, HTMLCanvasElement>()

function labelImage(name: string, rgb: [number, number, number],
                    onReady: () => void): HTMLCanvasElement | null {
  const face = faceFor(name, () => { LABELS.delete(labelKey(name, rgb)); onReady() })
  const key = labelKey(name, rgb)
  const hit = LABELS.get(key)
  if (hit) return hit

  const font = `${LABEL_PX * LABEL_DPR}px ${face
    ? `"${face}", ui-monospace, monospace` : "ui-monospace, Menlo, monospace"}`
  const probe = document.createElement("canvas").getContext("2d")!
  probe.font = font
  const wpx = Math.ceil(probe.measureText(name).width) + 4
  const hpx = Math.ceil(LABEL_PX * LABEL_DPR * 1.5)

  const cv = document.createElement("canvas")
  cv.width = Math.max(wpx, 2); cv.height = hpx
  const cx = cv.getContext("2d")!
  cx.font = font
  cx.textBaseline = "middle"
  cx.fillStyle = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
  cx.fillText(name, 0, hpx / 2)

  if (LABELS.size > 600) LABELS.clear()
  LABELS.set(key, cv)
  return cv
}

function labelKey(name: string, rgb: [number, number, number]) {
  return `${name}|${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])}`
}

function faceFor(name: string, onReady: () => void): string | null {
  const known = LOADED.get(name)
  if (known === true) return `vg-${name}`
  if (known === false) return null
  if (LOADED.size >= MAX_FACES) return null
  LOADED.set(name, false)
  const face = new FontFace(`vg-${name}`, `url(/api/fontfile/${name})`)
  face.load()
    .then((f) => { document.fonts.add(f); LOADED.set(name, true); onReady() })
    .catch(() => { LOADED.set(name, false) })
  return null
}

export function Atlas({ data, onPick, busy, directions, colourBy, setColourBy,
                        waypoint, setWaypoint, onToward, radius }: {
  data: AtlasData | null
  onPick: (name: string) => void
  busy: boolean
  directions: NamedDirection[]
  colourBy: string
  setColourBy: (k: string) => void
  waypoint: Waypoint | null
  setWaypoint: (w: Waypoint | null) => void
  onToward: (w: Waypoint, amount: number | null) => void
  radius: number
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
  // Per-label opacity, eased toward its target. The declutter grid is computed
  // in screen space, so which font holds a cell changes as the camera turns; on
  // a hard toggle that reads as names blinking on and off. Easing turns the
  // same decision into a fade.
  const labelAlpha = useRef(new Map<number, number>())
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

  // Corpus glyph outlines do not change between moves, so the cache survives
  // them. Only the traveller's own specimen is rebuilt, and its key carries
  // enough to tell one from the next.
  useEffect(() => {
    for (const k of paths.current.keys())
      if (k.startsWith("self:")) paths.current.delete(k)
  }, [data])

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

  // Loading a face has to be able to ask for another frame once it arrives.
  const scheduleRef = useRef<() => void>(() => {})
  const schedule = useCallback(() => scheduleRef.current(), [])

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
    const card = `hsl(${css.getPropertyValue("--card")})`
    const c = cam.current
    const P = (x: number, y: number, hh: number) => project(x, y, hh, w, h, c)

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

    const o = P(0, 0, 0)
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.arc(o.sx, o.sy, 4, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 1

    // One projection pass. Hover, decluttering and drawing all read from it;
    // projecting the corpus once per frame rather than once per purpose is most
    // of the difference between this being smooth and not.
    const probe = drag.current ? null : pending.current
    let hit: { name: string; sx: number; sy: number; dist: number } | null = null

    type Item = { depth: number; kind: "dot" | "sprite"; sx: number; sy: number
                  p: typeof data.points[0] }
    const items: Item[] = []
    const proj: { p: typeof data.points[0]; sx: number; sy: number
                  depth: number; on: boolean }[] = []

    for (const p of data.points) {
      const q = P(p.x, p.y, norm(p.h))
      if (probe) {
        const dd = Math.hypot(q.sx - probe.mx, q.sy - probe.my)
        if (dd < 16 && (!hit || dd < hit.dist))
          hit = { name: p.name, sx: q.sx, sy: q.sy, dist: dd }
      }
      const on = q.sx > -220 && q.sx < w + 220 && q.sy > -220 && q.sy < h + 220
      proj.push({ p, sx: q.sx, sy: q.sy, depth: q.depth, on })
    }

    // Which names get drawn. Five hundred labels over one another is not more
    // information than fifty, it is less, so the plane is divided into cells
    // and the nearest font in each takes the cell.
    const labelled = new Set<number>()
    if (names) {
      const taken = new Set<string>()
      for (const q of [...proj].sort((a, b) => a.p.d - b.p.d)) {
        if (!q.on || q.sx < 0 || q.sx > w || q.sy < 0 || q.sy > h) continue
        const key = `${Math.round(q.sx / 74)}:${Math.round(q.sy / 14)}`
        if (taken.has(key)) continue
        taken.add(key)
        labelled.add(q.p.i)
      }
    }

    for (const q of proj) {
      if (!q.on) continue
      items.push({ depth: q.depth, kind: data.sprites[q.p.i] ? "sprite" : "dot",
                   sx: q.sx, sy: q.sy, p: q.p })
    }

    // Ease every label toward on or off, and keep drawing while any is moving.
    let animating = false
    const alphas = labelAlpha.current
    for (const q of proj) {
      const target = labelled.has(q.p.i) ? 1 : 0
      const prev = alphas.get(q.p.i) ?? target
      const next = prev + (target - prev) * 0.18
      if (Math.abs(target - next) > 0.01) animating = true
      alphas.set(q.p.i, Math.abs(target - next) < 0.005 ? target : next)
    }

    const rank = { dot: 0, sprite: 1 } as const
    items.sort((a, b) => rank[a.kind] - rank[b.kind] || b.depth - a.depth)

    // The waypoint, and the line you would travel along to reach it.
    if (waypoint) {
      const wp = P(waypoint.x, waypoint.y, 0)
      const from = P(data.self.x, data.self.y, 0)
      ctx.strokeStyle = burg
      ctx.globalAlpha = 0.5
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(from.sx, from.sy); ctx.lineTo(wp.sx, wp.sy)
      ctx.stroke(); ctx.setLineDash([])
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(wp.sx, wp.sy, 6, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(wp.sx - 10, wp.sy); ctx.lineTo(wp.sx + 10, wp.sy)
      ctx.moveTo(wp.sx, wp.sy - 10); ctx.lineTo(wp.sx, wp.sy + 10)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Trail, on the ground plane so the route reads as a route.
    if (data.trail.length > 1) {
      ctx.strokeStyle = burg; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5
      ctx.beginPath()
      data.trail.forEach((t, i) => {
        const q = P(t.x, t.y, norm(t.h))
        i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy)
      })
      ctx.stroke()
      ctx.globalAlpha = 0.35
      ctx.fillStyle = burg
      for (const t of data.trail) {
        const q = P(t.x, t.y, norm(t.h))
        ctx.beginPath(); ctx.arc(q.sx, q.sy, 2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    for (const it of items) {
      const near = Math.max(0, 1 - it.p.d / 16)
      const [r, g, b] = ramp(it.p.c)

      if (it.kind === "dot") {
        ctx.fillStyle = `rgb(${r} ${g} ${b})`
        ctx.globalAlpha = 0.25 + 0.6 * near
        ctx.beginPath(); ctx.arc(it.sx, it.sy, 1.7 + 1.8 * near, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else {
        const glyphs = data.sprites[it.p.i]
        ctx.save()
        ctx.globalAlpha = 0.75
        ctx.fillStyle = card
        ctx.beginPath()
        ctx.ellipse(it.sx + SPRITE_PX * 0.5, it.sy - SPRITE_PX * 0.22,
                    SPRITE_PX * 0.95, SPRITE_PX * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.translate(it.sx, it.sy)
        ctx.scale(SPRITE_PX, -SPRITE_PX)
        ctx.fillStyle = ink
        ctx.globalAlpha = Math.max(0.35, 1 - it.p.d / 12)
        let dx = 0
        for (const gl of glyphs) {
          const key = `${it.p.i}:${gl.char}`
          let path = paths.current.get(key)
          if (!path) { path = new Path2D(gl.path); paths.current.set(key, path) }
          ctx.save(); ctx.translate(dx, 0); ctx.fill(path, "evenodd"); ctx.restore()
          dx += gl.advance
        }
        ctx.restore()
        ctx.globalAlpha = 1
      }

      // Labels are blitted, not typeset. Shaping and rasterising dozens of
      // different faces on every frame is what made this crawl; each label is
      // drawn once into its own canvas and copied thereafter.
      const fade = alphas.get(it.p.i) ?? 0
      if (fade > 0.02) {
        const img = labelImage(it.p.name, [r, g, b], schedule)
        if (img) {
          const scale = (it.kind === "sprite" ? 12 : 9 + 3 * near) / LABEL_PX
          const iw = (img.width / LABEL_DPR) * scale
          const ih = (img.height / LABEL_DPR) * scale
          ctx.globalAlpha = fade *
            (it.kind === "sprite" ? 0.95 : 0.25 + 0.7 * near)
          if (it.kind === "sprite") {
            ctx.drawImage(img, it.sx + SPRITE_PX * 0.5 - iw / 2,
                          it.sy + 4, iw, ih)
          } else {
            ctx.drawImage(img, it.sx + 4, it.sy - ih * 0.72, iw, ih)
          }
          ctx.globalAlpha = 1
        }
      }
    }

    // You: drawn last, in the accent, with a drop line to the ground so the
    // height reading is not ambiguous.
    const me = P(data.self.x, data.self.y, norm(data.self.h))
    const ground = P(data.self.x, data.self.y, 0)
    ctx.strokeStyle = burg; ctx.globalAlpha = 0.35
    ctx.setLineDash([2, 3])
    ctx.beginPath(); ctx.moveTo(me.sx, me.sy); ctx.lineTo(ground.sx, ground.sy)
    ctx.stroke(); ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.save()
    ctx.translate(me.sx, me.sy)
    ctx.scale(SELF_PX, -SELF_PX)
    ctx.fillStyle = burg
    let sdx = 0
    for (const gl of data.self.glyphs) {
      const key = `self:${gl.char}:${gl.path.length}`
      let path = paths.current.get(key)
      if (!path) { path = new Path2D(gl.path); paths.current.set(key, path) }
      ctx.save(); ctx.translate(sdx, 0); ctx.fill(path, "evenodd"); ctx.restore()
      sdx += gl.advance
    }
    ctx.restore()

    if (probe) {
      pending.current = null
      const name = hit?.name ?? null
      if (name !== hoverName.current) {
        hoverName.current = name
        setHover(hit ? { name: hit.name, sx: hit.sx, sy: hit.sy } : null)
      }
    }

    if (animating) schedule()
  }, [data, norm, project, waypoint, schedule])

  // One draw per frame at most, and never faster than MAX_FPS. Pointer events
  // arrive far more often than the screen can show them, so they only mark the
  // canvas dirty and the loop coalesces them.
  const MAX_FPS = 60
  const scheduleImpl = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame((t) => {
      frame.current = 0
      if (t - lastDraw.current < 1000 / MAX_FPS - 1) { schedule(); return }
      lastDraw.current = t
      draw()
    })
  }, [draw])
  scheduleRef.current = scheduleImpl

  /**
   * Screen point back to a position in the heading plane, on the ground.
   * The projection is orthographic, so this inverts exactly: undo the scale
   * and the tilt, then undo the yaw.
   */
  const unproject = useCallback((sx: number, sy: number) => {
    const bx = box.current
    if (!bx) return null
    const w = bx.clientWidth, hgt = bx.clientHeight
    const c = cam.current
    const sp = Math.sin(c.pitch)
    // Looking along the plane edge-on, a screen point names no ground point.
    if (Math.abs(sp) < 0.08) return null
    const rx = (sx - w / 2) / c.zoom
    const ry = ((sy - hgt * 0.62) / c.zoom) / sp
    const cy = Math.cos(c.yaw), sy2 = Math.sin(c.yaw)
    return { x: rx * cy + ry * sy2, y: -rx * sy2 + ry * cy }
  }, [])

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
         onClick={(e) => {
           if (busy) return
           // A font under the pointer is a place with a name; anywhere else is
           // a bearing on the map.
           if (hover) { onPick(hover.name); return }
           const r = box.current!.getBoundingClientRect()
           const g = unproject(e.clientX - r.left, e.clientY - r.top)
           if (g) setWaypoint(g)
         }}
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

      {waypoint && data && (
        <div className="absolute bottom-10 right-2 flex items-center gap-1.5
                        bg-card border border-border rounded-sm px-2 py-1.5
                        shadow-editorial">
          <span className="font-mono text-[9px] text-muted-foreground">
            waypoint {waypoint.x.toFixed(1)}, {waypoint.y.toFixed(1)} ·{" "}
            {Math.hypot(waypoint.x - data.self.x,
                        waypoint.y - data.self.y).toFixed(1)} away
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToward(waypoint, radius) }}
            className="btn !px-2 !py-1 !text-[9px]"
            title={`One step of ${radius.toFixed(2)} toward the waypoint`}
          >
            step
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToward(waypoint, null) }}
            className="btn !px-2 !py-1 !text-[9px]"
            title="Travel the whole way"
          >
            go
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setWaypoint(null) }}
            className="btn !px-2 !py-1 !text-[9px]"
          >
            clear
          </button>
        </div>
      )}

      <div className="absolute bottom-2 right-2 font-mono text-[9px]
                      text-muted-foreground/70 pointer-events-none">
        drag to orbit · click a font to travel · click the ground to aim
      </div>
    </div>
  )
}
