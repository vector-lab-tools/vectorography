import type { Glyph } from "../api"

/**
 * Which property a point on a letterform belongs to.
 *
 * The premise is that a designer does not think "which axis do I want", they
 * think "this stem is too thin". So the outline is asked instead of the
 * designer: given a point on it, what part of a letter is this, and what
 * property does that part express? A stem side is weight. The outer edge of a
 * bowl is width, its shoulder is shape. The gap between two letters is spacing.
 * The baseline is slant.
 *
 * Everything here works on the decoded contours of the specimen actually on
 * screen, so it follows the letterforms as they change rather than describing
 * an idealised alphabet.
 */

export type HandleKind =
  | "weight" | "width" | "x-height" | "tightness"
  | "slant" | "straightness" | "serif" | "contrast"

export type Handle = {
  kind: HandleKind
  /** Property driven by horizontal movement, and by vertical. */
  x?: HandleKind
  y?: HandleKind
  /** Where to draw the marker, in em coordinates of the whole line. */
  at: [number, number]
  /** Direction the handle is pulled along, for the marker's orientation. */
  along: [number, number]
  label: string
  glyph: string
  dbg?: Record<string, number | string | boolean>
}

export type Placed = { g: Glyph; x0: number }

/** Lay the text out once; everything else measures against this. */
export function layout(glyphs: Glyph[], text: string): Placed[] {
  const by = new Map(glyphs.map((g) => [g.char, g]))
  const out: Placed[] = []
  let x = 0
  for (const ch of text) {
    const g = by.get(ch)
    if (!g) { x += 0.3; continue }
    out.push({ g, x0: x })
    x += g.advance
  }
  return out
}

export function lineWidth(placed: Placed[]): number {
  const last = placed[placed.length - 1]
  return last ? last.x0 + last.g.advance : 0.5
}

function inkBounds(g: Glyph) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const c of g.contours ?? []) {
    for (const [x, y] of c) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { x0, x1, y0, y1 }
}

/** Outline point nearest the probe, with the local outward normal. */
function nearestPoint(g: Glyph, px: number, py: number) {
  let best: { d: number; x: number; y: number; nx: number; ny: number
              ci: number; pi: number } | null = null
  const cs = g.contours ?? []
  for (let ci = 0; ci < cs.length; ci++) {
    const c = cs[ci]
    for (let i = 0; i < c.length; i++) {
      const [x, y] = c[i]
      const d = Math.hypot(x - px, y - py)
      if (best && d >= best.d) continue
      const [ax, ay] = c[(i - 1 + c.length) % c.length]
      const [bx, by] = c[(i + 1) % c.length]
      const tx = bx - ax, ty = by - ay
      const n = Math.hypot(tx, ty) || 1
      // Outward normal of a positively wound contour.
      best = { d, x, y, nx: ty / n, ny: -tx / n, ci, pi: i }
    }
  }
  return best
}

/** How thick the stroke is at a point, measured across it. */
function thicknessAt(g: Glyph, x: number, y: number, nx: number, ny: number) {
  let best = Infinity
  for (const c of g.contours ?? []) {
    for (const [qx, qy] of c) {
      const dx = qx - x, dy = qy - y
      const along = dx * -nx + dy * -ny        // inward
      if (along < 0.012) continue
      const across = Math.abs(dx * -ny + dy * nx)
      if (across > 0.05) continue
      if (along < best) best = along
    }
  }
  return best
}

const NAMES: Record<HandleKind, string> = {
  weight: "weight", width: "width", "x-height": "x-height",
  tightness: "spacing", slant: "slant", straightness: "shape",
  serif: "serif", contrast: "contrast",
}

/**
 * What the pointer is on. Coordinates are in em, with the baseline at y=0 and
 * x running along the line.
 */
export function handleAt(placed: Placed[], px: number, py: number,
                         xHeight: number): Handle | null {
  if (!placed.length) return null

  // The outline wins if the hand is on it. Only when it is clearly in the
  // space between two letters does the gap answer, or reaching for a stem from
  // slightly the wrong side would adjust the spacing instead of the weight.
  let onInk = false
  for (const p of placed) {
    const np0 = nearestPoint(p.g, px - p.x0, py)
    if (np0 && np0.d < 0.055) { onInk = true; break }
  }

  // Between two letters, at a height where letters actually are: spacing.
  for (let i = 0; !onInk && i < placed.length - 1; i++) {
    const a = placed[i], b = placed[i + 1]
    const ab = inkBounds(a.g), bb = inkBounds(b.g)
    const gapL = a.x0 + (isFinite(ab.x1) ? ab.x1 : a.g.advance)
    const gapR = b.x0 + (isFinite(bb.x0) ? bb.x0 : 0)
    if (gapR - gapL > 0.02 && px > gapL + 0.004 && px < gapR - 0.004
        && py > 0.02 && py < xHeight * 0.95) {
      return { kind: "tightness", x: "tightness",
               at: [(gapL + gapR) / 2, xHeight * 0.5], along: [1, 0],
               label: NAMES.tightness, glyph: " " }
    }
  }

  // Otherwise, the nearest letter's outline.
  let chosen: Placed | null = null
  let near = Infinity
  for (const p of placed) {
    const b = inkBounds(p.g)
    if (!isFinite(b.x0)) continue
    const cx = px - p.x0
    const d = cx < b.x0 ? b.x0 - cx : cx > b.x1 ? cx - b.x1 : 0
    if (d < near) { near = d; chosen = p }
  }
  if (!chosen || near > 0.25) return null

  const lx = px - chosen.x0
  const np = nearestPoint(chosen.g, lx, py)
  if (!np || np.d > 0.16) return null

  const b = inkBounds(chosen.g)
  const at: [number, number] = [chosen.x0 + np.x, np.y]
  const vertical = Math.abs(np.nx) > Math.abs(np.ny)
  const thick = thicknessAt(chosen.g, np.x, np.y, np.nx, np.ny)

  const dbg = { glyph: chosen.g.char, px: +px.toFixed(3), py: +py.toFixed(3),
                lx: +lx.toFixed(3), npx: +np.x.toFixed(3), npy: +np.y.toFixed(3),
                d: +np.d.toFixed(3), nx: +np.nx.toFixed(2), ny: +np.ny.toFixed(2),
                vertical, thick: +thick.toFixed(3), xh: +xHeight.toFixed(3),
                by0: +b.y0.toFixed(3), by1: +b.y1.toFixed(3) }

  // Baseline: shear the whole line. Judged on where the pointer is, not on
  // where the nearest outline point happens to be: an outline point near the
  // baseline can be the closest thing to a pointer halfway up a letter, and
  // reading that as "the hand is on the baseline" was wrong.
  const nearBaseline = py < Math.max(0.06, xHeight * 0.16)
    && py > -0.12 && Math.abs(np.y - py) < 0.12

  // The top of a lowercase letter is its x-height.
  if (nearBaseline && !vertical) {
    return { kind: "slant", x: "slant", at, along: [1, 0],
             label: NAMES.slant, glyph: chosen.g.char }
  }

  const lower = chosen.g.char === chosen.g.char.toLowerCase()
    && chosen.g.char !== chosen.g.char.toUpperCase()
  if (lower && !vertical && np.ny > 0.5
      && Math.abs(np.y - xHeight) < Math.max(0.055, xHeight * 0.16)) {
    return { kind: "x-height", y: "x-height", x: "width", at, along: [0, 1],
             label: NAMES["x-height"], glyph: chosen.g.char, dbg }
  }


  if (vertical) {
    // The outermost edges of a letter set its width; the sides of the strokes
    // inside it set its weight.
    const outer = np.x < b.x0 + 0.045 || np.x > b.x1 - 0.045
    return outer
      ? { kind: "width", x: "width", y: "straightness", at, along: [1, 0],
          label: NAMES.width, glyph: chosen.g.char, dbg }
      : { kind: "weight", x: "weight", y: "contrast", at, along: [1, 0],
          label: NAMES.weight, glyph: chosen.g.char, dbg }
  }

  // A horizontal edge at the very end of a stroke is a terminal, which is
  // where a serif would be if the face had one.
  const terminal = np.y > b.y1 - 0.05 || np.y < b.y0 + 0.05
  if (terminal) {
    return { kind: "serif", y: "serif", x: "weight", at, along: [0, 1],
             label: NAMES.serif, glyph: chosen.g.char, dbg }
  }

  // A thin stroke meeting a thick one is where contrast lives; otherwise this
  // is the shoulder of a curve, which is its shape.
  if (isFinite(thick) && thick < 0.055) {
    return { kind: "contrast", y: "contrast", x: "weight", at, along: [0, 1],
             label: NAMES.contrast, glyph: chosen.g.char, dbg }
  }
  return { kind: "straightness", x: "straightness", y: "weight", at,
           along: [1, 0], label: NAMES.straightness, glyph: chosen.g.char, dbg }
}

/** x-height of the specimen as drawn, from a lowercase letter if there is one. */
export function xHeightOf(placed: Placed[]): number {
  const pick = placed.find((p) => "xzvwnmurs".includes(p.g.char))
    ?? placed.find((p) => p.g.char === p.g.char.toLowerCase())
  if (!pick) return 0.5
  const b = inkBounds(pick.g)
  return isFinite(b.y1) ? b.y1 : 0.5
}
