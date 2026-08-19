import { useCallback, useEffect, useRef, useState } from "react"
import type { AtlasData, Glyph, NamedDirection } from "../api"

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

const DEFAULT_CAM: Cam = { yaw: 0.6, pitch: 0.62, zoom: 52 }

/**
 * Waypoints are off while direct dragging is being worked on: clicking the
 * ground to aim and dragging the specimen there are two answers to the same
 * question, and having both at once makes the map ambiguous to click.
 * Flip this back on to restore aiming; nothing else needs changing.
 */
const WAYPOINTS = false

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

/** An `H S% L%` token as rgb, so the canvas can use the theme's own ink. */
function tokenRgb(token: string): [number, number, number] {
  const m = token.trim().match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
  if (!m) return [26, 26, 26]
  const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100
  if (sat === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
  const pp = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return pp + (q - pp) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6
    return pp
  }
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255),
          Math.round(f(h - 1 / 3) * 255)]
}

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

function axisName(spec: string, dirs: NamedDirection[]) {
  if (spec?.startsWith("dir:")) {
    const d = dirs.find((x) => x.key === spec.slice(4))
    return d ? d.label.toLowerCase() : spec.slice(4)
  }
  return `axis ${Number(spec?.split(":").pop() ?? 0) + 1}`
}

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

function labelImage(name: string, text: string, rgb: [number, number, number],
                    onReady: () => void): HTMLCanvasElement | null {
  const face = faceFor(name, () => {
    LABELS.delete(labelKey(name, text, rgb)); onReady()
  })
  // Nothing is drawn until the family's own file is here: the mark is the
  // typeface, and set in a fallback face it would be a mark of nothing.
  if (!face) return null
  const key = labelKey(name, text, rgb)
  const hit = LABELS.get(key)
  if (hit) return hit

  const font = `${LABEL_PX * LABEL_DPR}px "${face}", ui-monospace, monospace`
  const probe = document.createElement("canvas").getContext("2d")!
  probe.font = font
  const wpx = Math.ceil(probe.measureText(text).width) + 4
  const hpx = Math.ceil(LABEL_PX * LABEL_DPR * 1.5)

  const cv = document.createElement("canvas")
  cv.width = Math.max(wpx, 2); cv.height = hpx
  const cx = cv.getContext("2d")!
  cx.font = font
  cx.textBaseline = "middle"
  cx.fillStyle = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
  cx.fillText(text, 0, hpx / 2)

  // Evict the oldest rather than wiping. The cap was below the number of keys
  // in play (a name has a plain entry and a typeface entry), so the whole cache
  // was being cleared and every label re-rasterised, over and over.
  if (LABELS.size > 1400) {
    const oldest = LABELS.keys().next().value
    if (oldest !== undefined) LABELS.delete(oldest)
  }
  LABELS.set(key, cv)
  return cv
}

function labelKey(name: string, text: string, rgb: [number, number, number]) {
  return `${name}|${text}|${Math.round(rgb[0])},${Math.round(rgb[1])},${
    Math.round(rgb[2])}`
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
                        waypoint, setWaypoint, onToward, radius, sample,
  liveGlyphs, liveSelf, onWantAxisHeight }: {
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
  /** What each family is set in, so every mark on the map is comparable. */
  sample: string
  /** The outlines at the position being dragged to, as they arrive. */
  liveGlyphs: Glyph[] | null
  /** Where the specimen actually is while dragging. The constraint decides
   *  this, not the pointer, so it is reported back rather than assumed. */
  liveSelf: { x: number; y: number; h: number } | null
  /** The ball is only a true picture when all three view directions are real
   *  axes, so asking for it asks for the height axis to become one. */
  onWantAxisHeight: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The camera is a ref, not state. Held as state, every pointer event during
  // a drag re-rendered the tree before it drew a frame, which is most of what
  // made orbiting feel heavy.
  const cam = useRef<Cam>({ ...DEFAULT_CAM })
  const [hover, setHover] = useState<{ name: string; sx: number; sy: number } | null>(null)
  const hoverName = useRef<string | null>(null)
  const drag = useRef<{ x: number; y: number; cam: Cam } | null>(null)
  // The atlas turns the model and nothing else. Shaping the type happens on
  // the type, in the specimen panel: a map is for finding out where you are and
  // what is nearby, and it was doing two jobs at once.
  // How far out a drag may go: a little beyond the furthest real family.
  const reach = useRef(40)
  const liveRef = useRef<Glyph[] | null>(null)
  liveRef.current = liveGlyphs
  const pending = useRef<{ mx: number; my: number } | null>(null)
  const paths = useRef(new Map<string, Path2D>())
  const frame = useRef(0)
  const lastDraw = useRef(0)
  // Per-label opacity, eased toward its target. The declutter grid is computed
  // in screen space, so which font holds a cell changes as the camera turns; on
  // a hard toggle that reads as names blinking on and off. Easing turns the
  // same decision into a fade.
  const labelAlpha = useRef(new Map<number, number>())
  const dirty = useRef(false)
  // Where the view is centred, read by unproject without re-subscribing.
  const selfRef = useRef({ x: 0, y: 0, h: 0 })
  // What a family is drawn as. "letters" sets the same sample in that family's
  // own face, which is the thing a designer can actually read off a map; the
  // name is a string that happens to be attached to it.
  // Names by default, not letters. When every family was drawn as its own
  // "Ha" the map competed with the traveller's own specimen and the one mark
  // that matters was lost among four hundred that look like it. Colour already
  // carries the property being read; the letters stay available on request.
  // Dots by default. The corpus is a distribution and its shape is the thing
  // being read; four hundred names or letterforms describe the same points at
  // the cost of being able to see them at all. Names and letters stay one
  // click away, and hovering names any dot.
  const mode = useRef<"off" | "names" | "letters">("off")
  const [modeOn, setModeOn] = useState<"off" | "names" | "letters">("off")
  const [zoomLabel, setZoomLabel] = useState(DEFAULT_CAM.zoom)
  // Remembered, because it is a way of looking at the space rather than a
  // momentary action, and having to switch it back on after every reload made
  // it feel like something that had gone wrong.
  // On by default: the shape of the space is the thing being read, and the
  // shells are what make the map a place rather than a scatter.
  const ball = useRef(localStorage.getItem("vg.ball") !== "0")
  const [ballOn, setBallOn] = useState(ball.current)

  // How much screen a unit of height is worth. On a latent axis it is set so
  // that a unit up is the same size as a unit across: only then is the view
  // isotropic, and only then does a ball drawn in it look like a ball.
  const HEIGHT_SCALE = 5.5
  const hs = useRef(HEIGHT_SCALE)
  // Sized in screen pixels, not world units. Tied to the zoom, the traveller's
  // own specimen was a pixel and a half across at the fitted view, which is the
  // one view every user sees first.
  const SELF_PX = 46

  // The traveller is the subject: the view is centred on them and the map moves
  // underneath, so orbiting turns about where you are standing rather than
  // about an origin you may be nowhere near.
  const project = useCallback((x: number, y: number, h: number,
                               w: number, ht: number, c: Cam,
                               cx = 0, cy0 = 0, ch = 0) => {
    const HS = hs.current
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw)
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch)
    const dx = x - cx, dy = y - cy0, dh = h - ch
    const rx = dx * cy - dy * sy
    const ry = dx * sy + dy * cy
    return {
      sx: w / 2 + rx * c.zoom,
      sy: ht * 0.5 + (ry * sp - dh * HS * cp) * c.zoom,
      depth: ry * cp + dh * HS * sp,
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

  // Loading a face has to be able to ask for another frame once it arrives.
  const scheduleRef = useRef<() => void>(() => {})
  const schedule = useCallback(() => scheduleRef.current(), [])

  const draw = useCallback(() => {
    const cv = canvas.current, bx = box.current
    if (!cv || !bx || !data) return
    const marks = mode.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = bx.clientWidth, h = bx.clientHeight
    cv.width = w * dpr; cv.height = h * dpr
    cv.style.width = `${w}px`; cv.style.height = `${h}px`
    const ctx = cv.getContext("2d", { alpha: true })!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const css = getComputedStyle(document.documentElement)
    const burg = `hsl(${css.getPropertyValue("--burgundy")})`
    const here = `hsl(${css.getPropertyValue("--here")})`
    const muted = `hsl(${css.getPropertyValue("--muted-foreground")})`
    // Names and letterforms are set in the theme's ink. Colour is the dots'
    // job: a name tinted by the property it scores on is harder to read and
    // says nothing the dot beside it has not already said.
    const inkRgb = tokenRgb(css.getPropertyValue("--ink"))
    const axisHeight = data.axes.height === "axis"
    const span = Math.max(data.range.h_max - data.range.h_min, 1e-6)
    hs.current = axisHeight ? span : HEIGHT_SCALE

    const c = cam.current
    // While dragging, the view follows the specimen rather than the last
    // position the server told us about.
    const ds = liveSelf
    const cx = ds ? ds.x : data.self.x
    const cy0 = ds ? ds.y : data.self.y
    const ch = ds ? ds.h : norm(data.self.h)
    selfRef.current = { x: cx, y: cy0, h: ch }
    const P = (x: number, y: number, hh: number) =>
      project(x, y, hh, w, h, c, cx, cy0, ch)

    // No ground plane. The corpus is a ball, not a landscape: a grid under it
    // implied a floor to stand on and a height above it, neither of which the
    // space has. What is left is the centroid, the shells, and where you are.
    const R = Math.ceil(Math.max(
      ...data.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))), 4))
    reach.current = R * 2.5

    // The centroid: the average of every font in the corpus, and a place where
    // almost none of them is.
    const o = P(0, 0, 0)
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.55
    ctx.beginPath(); ctx.arc(o.sx, o.sy, 3.5, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(o.sx - 6, o.sy); ctx.lineTo(o.sx + 6, o.sy)
    ctx.moveTo(o.sx, o.sy - 6); ctx.lineTo(o.sx, o.sy + 6)
    ctx.stroke()
    ctx.globalAlpha = 1

    // One projection pass. Hover, decluttering and drawing all read from it;
    // projecting the corpus once per frame rather than once per purpose is most
    // of the difference between this being smooth and not.
    const probe = drag.current ? null : pending.current
    let hit: { name: string; sx: number; sy: number; dist: number } | null = null

    type Item = { depth: number; sx: number; sy: number
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

    // Names are not selected or drawn while the camera is moving. Deciding
    // which of five hundred labels survive, and blitting them, is the bulk of a
    // frame, and none of it is worth doing at a moment when the map is sliding
    // under the pointer and nobody is reading. They fade back the instant the
    // drag stops.
    const labelled = new Set<number>()
    if (marks !== "off" && !drag.current) {
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
      items.push({ depth: q.depth, sx: q.sx, sy: q.sy, p: q.p })
    }

    // Ease every label toward on or off, and keep drawing while any is moving.
    let animating = false
    const alphas = labelAlpha.current
    for (const q of proj) {
      if (!q.on) { alphas.delete(q.p.i); continue }
      const target = labelled.has(q.p.i) ? 1 : 0
      const prev = alphas.get(q.p.i) ?? 0
      if (prev === target) continue
      const next = prev + (target - prev) * 0.22
      const settled = Math.abs(target - next) < 0.01
      alphas.set(q.p.i, settled ? target : next)
      if (!settled) animating = true
    }

    items.sort((a, b) => b.depth - a.depth)

    // The ball the corpus sits in.
    //
    // Under an orthographic projection the silhouette of a sphere is exactly a
    // circle, so the outer edge is drawn as one and the wireframe is drawn
    // inside it: rings of latitude and longitude, with the far half of every
    // ring fainter than the near half, which is what makes it read as a solid
    // shape rather than as a stack of ellipses.
    if (ball.current && axisHeight && data.ball) {
      const hOf = (raw: number) => (raw - data.range.h_min) / span
      const centre = P(0, 0, hOf(0))

      // A ring, drawn segment by segment so depth can fade it.
      const ring = (r: number, fn: (t: number) => [number, number, number],
                    base: number) => {
        const N = 96
        let prev: { sx: number; sy: number; depth: number } | null = null
        for (let i = 0; i <= N; i++) {
          const t = (i / N) * Math.PI * 2
          const [a, b, c2] = fn(t)
          const q = P(a * r, b * r, hOf(c2 * r))
          if (prev) {
            const near = (q.depth + prev.depth) / 2
            const front = 1 / (1 + Math.exp(-near * 1.4))
            ctx.globalAlpha = base * (0.28 + 0.72 * front)
            ctx.beginPath()
            ctx.moveTo(prev.sx, prev.sy)
            ctx.lineTo(q.sx, q.sy)
            ctx.stroke()
          }
          prev = q
        }
        ctx.globalAlpha = 1
      }

      const hull = data.ball.max
      const shells: [number, number, number][] = [
        [hull, 0.30, 3], [data.ball.q90, 0.18, 2], [data.ball.q50, 0.13, 2]]

      ctx.strokeStyle = muted
      ctx.lineWidth = 1

      for (const [r, alpha, lats] of shells) {
        // Longitudes.
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI
          ring(r, (t) => [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a),
                          Math.sin(t)], alpha)
        }
        // Latitudes, evenly in angle so they crowd toward the poles as they
        // should rather than being spaced evenly in height.
        for (let k = 1; k <= lats; k++) {
          const phi = (k / (lats + 1)) * Math.PI - Math.PI / 2
          const rr = Math.cos(phi), zz = Math.sin(phi)
          ring(r, (t) => [Math.cos(t) * rr, Math.sin(t) * rr, zz], alpha)
        }
      }

      // The edge of the known space, as a hard line.
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = muted
      ctx.beginPath()
      ctx.arc(centre.sx, centre.sy, hull * c.zoom, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1

      // From the average of every font to where you are standing.
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = here
      ctx.setLineDash([3, 3])
      const meNow = P(cx, cy0, ch)
      ctx.beginPath(); ctx.moveTo(centre.sx, centre.sy)
      ctx.lineTo(meNow.sx, meNow.sy)
      ctx.stroke(); ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // The waypoint, and the line you would travel along to reach it.
    if (WAYPOINTS && waypoint) {
      const wp = P(waypoint.x, waypoint.y, ch)
      const from = P(cx, cy0, ch)
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

      ctx.fillStyle = `rgb(${r} ${g} ${b})`
      ctx.globalAlpha = 0.25 + 0.6 * near
      ctx.beginPath(); ctx.arc(it.sx, it.sy, 1.7 + 1.8 * near, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

      // Marks are blitted, not typeset. Shaping and rasterising dozens of
      // different faces on every frame is what made this crawl; each mark is
      // drawn once into its own canvas and copied thereafter.
      const fade = alphas.get(it.p.i) ?? 0
      if (fade > 0.02) {
        const img = labelImage(it.p.name, it.p.name, inkRgb, schedule)
        if (img) {
          const scale = (9 + 3 * near) / LABEL_PX
          const iw = (img.width / LABEL_DPR) * scale
          const ih = (img.height / LABEL_DPR) * scale
          ctx.globalAlpha = fade * (0.3 + 0.65 * near)
          ctx.drawImage(img, it.sx + 4, it.sy - ih * 0.72, iw, ih)
          ctx.globalAlpha = 1
        }
      }
    }

    // You: drawn last, in the accent, with a drop line to the ground so the
    // height reading is not ambiguous.
    const me = P(cx, cy0, ch)
    ctx.save()
    ctx.translate(me.sx, me.sy)
    ctx.scale(SELF_PX, -SELF_PX)
    ctx.fillStyle = here
    // The outlines drawn are the freshest the server has sent, so the shape
    // changes under the pointer as the specimen is moved.
    const wanted = [...sample].filter((ch2) => /[A-Za-z0-9]/.test(ch2))
    const live = liveRef.current
    const selfGlyphs = (ds && live)
      ? wanted.map((ch2) => live.find((g) => g.char === ch2))
              .filter((g): g is Glyph => !!g)
      : data.self.glyphs
    let sdx = 0
    for (const gl of selfGlyphs) {
      const key = `self:${gl.char}:${gl.path.length}:${gl.path.slice(-12)}`
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
  }, [data, norm, project, waypoint, schedule, sample, liveSelf])

  // One draw per frame at most, and never faster than MAX_FPS. Pointer events
  // arrive far more often than the screen can show them, so they only mark the
  // canvas dirty and the loop coalesces them.
  const MAX_FPS = 60
  const scheduleImpl = useCallback(() => {
    // Nothing is scheduled against a hidden window: requestAnimationFrame does
    // not fire there, and the frame id would stay set, so every later request
    // would return early and the canvas would never come back.
    if (document.hidden) { dirty.current = true; return }
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
  const unproject = useCallback((sx: number, sy: number, atHeight?: number) => {
    const bx = box.current
    if (!bx) return null
    const w = bx.clientWidth, hgt = bx.clientHeight
    const c = cam.current
    const sp = Math.sin(c.pitch)
    // Looking along the plane edge-on, a screen point names no ground point.
    if (Math.abs(sp) < 0.08) return null
    const self = selfRef.current
    const cp = Math.cos(c.pitch)
    const rx = (sx - w / 2) / c.zoom
    // Solved on the plane the caller names, defaulting to the ground. Dragging
    // has to solve on the plane the specimen is already on: on the ground plane
    // the point under the pointer is the one *below* a specimen that floats, so
    // taking hold of it threw it several units away before it had moved at all.
    const h0 = atHeight ?? 0
    const ry = ((sy - hgt * 0.5) / c.zoom - (h0 - self.h) * HEIGHT_SCALE * cp) / sp
    const cy = Math.cos(c.yaw), sy2 = Math.sin(c.yaw)
    return { x: rx * cy + ry * sy2 + self.x, y: -rx * sy2 + ry * cy + self.y }
  }, [])

  // Zoom without a wheel: a trackpad pinch is not obvious, and reaching the
  // far country by scrolling is tedious.
  const setZoom = useCallback((next: number) => {
    cam.current = { ...cam.current, zoom: Math.max(4, Math.min(120, next)) }
    setZoomLabel(cam.current.zoom)
    draw()
  }, [draw])

  // Back to the view you started in: your own neighbourhood, at the angle it
  // is first shown at.
  const reset = useCallback(() => {
    cam.current = { ...DEFAULT_CAM }
    setZoomLabel(DEFAULT_CAM.zoom)
    draw()
  }, [draw])

  const fitAll = useCallback(() => {
    if (!data || !box.current) return
    const self = selfRef.current
    const spread = Math.max(...data.points.map((p) =>
      Math.max(Math.abs(p.x - self.x), Math.abs(p.y - self.y))), 1)
    cam.current = { ...cam.current,
      zoom: Math.max(4, Math.min(120, (box.current.clientWidth * 0.42) / spread)) }
    setZoomLabel(cam.current.zoom)
    draw()
  }, [data, draw])

  // New data and resizes draw straight away. Only interaction goes through the
  // frame cap: requestAnimationFrame does not fire while a tab is hidden, so
  // scheduling the first paint through it leaves the canvas blank until
  // something moves, which for an offscreen or backgrounded pane is never.
  useEffect(() => {
    draw()
    const ro = new ResizeObserver(() => draw())
    if (box.current) ro.observe(box.current)

    // Coming back from another window: drop any frame that was queued and
    // never ran, forget a drag whose pointerup was delivered elsewhere, and
    // paint once directly rather than waiting for a frame that may not come.
    const revive = () => {
      if (document.hidden) return
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
      drag.current = null
      dirty.current = false
      draw()
    }
    document.addEventListener("visibilitychange", revive)
    window.addEventListener("focus", revive)
    window.addEventListener("pointerup", () => { drag.current = null })

    return () => {
      ro.disconnect()
      document.removeEventListener("visibilitychange", revive)
      window.removeEventListener("focus", revive)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [draw])

  const controls = data && (
    <>
      <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em]
                         text-muted-foreground pointer-events-none truncate
                         max-w-[62%]"
              title={`Ground plane: ${data.axes.ride ? "ride heading"
                : `axis ${data.axes.x}`} by axis ${data.axes.y}. Height: ${
                data.axes.height === "density"
                  ? "crowding" : "distance from the centroid"}.`}>
          {data.axes.ride ? "ride" : axisName(data.axes.x, directions)}
          {" × "}{axisName(data.axes.y, directions)}
          {" · "}{data.axes.height === "density" ? "crowding"
            : data.axes.height === "centroid" ? "centroid"
            : axisName(data.axes.z, directions)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const next = !ball.current
              ball.current = next
              setBallOn(next)
              localStorage.setItem("vg.ball", next ? "1" : "0")
              if (next) onWantAxisHeight()
              schedule()
            }}
            title={"The corpus as it sits in the three directions on screen: "
                   + "an isotropic ball, with most families in a shell rather "
                   + "than near the middle. Needs the height to be a real axis, "
                   + "so turning it on makes it one."}
            className={`w-5 h-5 flex items-center justify-center rounded-sm
                        border text-[11px] leading-none transition-colors
                        ${ballOn ? "border-here text-here bg-here/10"
                                 : "border-border text-muted-foreground"}`}
          >
            ◯
          </button>
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
              const next = mode.current === "off" ? "names" : "off"
              mode.current = next
              setModeOn(next)
              LABELS.clear()
              schedule()
            }}
            title="What each family is drawn as"
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border
                        transition-colors ${modeOn !== "off"
                          ? "border-burgundy text-burgundy"
                          : "border-border text-muted-foreground"}`}
          >
            {modeOn === "names" ? "names" : "dots"}
          </button>
        </div>
      </div>

      {ballOn && data.ball && data.axes.height === "axis" && (
        <div className="absolute top-[52px] left-2 font-mono text-[9px]
                        text-muted-foreground pointer-events-none">
          shell: {data.ball.q50.toFixed(2)} / {data.ball.q90.toFixed(2)} ·
          {" "}you {data.ball.self.toFixed(2)}
          {" "}({data.ball.inside_q50.toFixed(0)}% of families are nearer in)
        </div>
      )}

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
         className={`relative w-full h-full rounded-md border border-border
                     bg-card overflow-hidden select-none
                     ${hover ? "cursor-pointer" : "cursor-grab"}`}
         onPointerDown={(e) => {
           // Dragging turns the model. Nothing here changes the type.
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
         onPointerUp={() => {
           drag.current = null
           schedule()
         }}
         onPointerCancel={() => {
           drag.current = null
           schedule()
         }}
         onPointerLeave={() => {
           drag.current = null
           pending.current = null
           if (hoverName.current) { hoverName.current = null; setHover(null) }
           schedule()
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
           if (!WAYPOINTS) return
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
           ["⌖", reset, "Back to the default view, centred on you"],
           ["⤢", fitAll, "Fit the whole corpus"]] as const).map(([label, fn, tip]) => (
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

      {WAYPOINTS && waypoint && data && (
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

      {(!WAYPOINTS || !waypoint) && (
        <div className="absolute bottom-2 right-2 max-w-[46%] truncate
                        font-mono text-[9px] text-muted-foreground/70
                        pointer-events-none text-right"
             title="Drag to orbit. Alt-drag, or the move toggle, drags the
                    specimen through the space. Shift while moving goes up and
                    down the third axis. Click a family to travel to it.">
          drag to turn · hover a family to name it · click to travel there
        </div>
      )}
    </div>
  )
}
