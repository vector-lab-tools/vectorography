import { useMemo, useRef, useState } from "react"
import type { Glyph } from "../api"

/**
 * One glyph, large, with its points, drawn on by hand.
 *
 * Everything else here reads a point in the space and shows what it decodes
 * to. This does the opposite: a point is dragged on the letter and the letter
 * stops being a reading. The edit is held beside the location the way spacing
 * is, so the glyph no longer follows when the traveller moves, and the output
 * is no longer a sample from the fitted distribution. That is the departure,
 * and it is meant to be one.
 *
 * **Pull the space to it** asks the other question: what would the space have
 * to be standing at for this drawing to be the nearest thing it can say, and
 * what can it still not say. A hand stretch of the `o` by a quarter reaches
 * 47.6% and leaves 0.0131 em over, which is the size of the departure in ems
 * rather than in adjectives.
 *
 * The points are the model's own: forty per contour at uniform arc length,
 * five contours, the same ones every other part of the instrument works on.
 * They are not where a type designer would have put them, and the README says
 * so; dragging them is drawing on the representation rather than drawing a
 * letter.
 */

/** Below this a contour is a collapsed pad rather than part of the letter. */
function live(contour: number[][]): boolean {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of contour) {
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return (x1 - x0) > 0.01 && (y1 - y0) > 0.01
}

export function GlyphEdit({ char, setChar, glyph, edited, onEdit, onClear,
                           onPull, alphabet, busy, pulled }: {
  char: string
  setChar: (c: string) => void
  /** The glyph as it stands, with contours. */
  glyph: Glyph | null
  /** The hand drawing, when there is one. */
  edited: number[][][] | null
  onEdit: (contours: number[][][]) => void
  onClear: () => void
  onPull: () => void
  alphabet: string
  busy: boolean
  /** What the last pull found, to report beside the letter. */
  pulled: { explained: number; residual: number; moved: number } | null
}) {
  const [grabbed, setGrabbed] = useState<[number, number] | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  const shown = edited ?? glyph?.contours ?? null
  const adv = glyph?.advance ?? 0.5
  const liveIdx = useMemo(
    () => (shown ?? []).map((c, i) => [c, i] as const)
      .filter(([c]) => live(c)).map(([, i]) => i), [shown])

  // Room either side of the advance, so the sidebearings are visible as
  // space rather than as the edge of the picture.
  const pad = 0.18
  const left = -pad, width = adv + pad * 2
  const top = -0.95, height = 1.3

  const toEm = (e: React.PointerEvent) => {
    const el = svg.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const sx = width / r.width, sy = height / r.height
    return {
      x: left + (e.clientX - r.left) * sx,
      // The group is flipped, so screen-down is font-down.
      y: -(top + (e.clientY - r.top) * sy),
    }
  }

  const move = (e: React.PointerEvent) => {
    if (!grabbed || !shown) return
    const p = toEm(e)
    if (!p) return
    const next = shown.map((c) => c.map((q) => q.slice()))
    next[grabbed[0]][grabbed[1]] = [p.x, p.y]
    onEdit(next)
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 pb-1.5 shrink-0 flex-wrap">
        <span className="rail-label">Glyph</span>
        <select value={char} onChange={(e) => setChar(e.target.value)}
                className="font-mono text-[11px] px-1.5 py-1 rounded-sm
                           bg-background border border-ink/25">
          {[...alphabet].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {edited ? (
          <>
            <span className="font-mono text-[10px] text-gold">
              drawn · off the space
            </span>
            <button onClick={onPull} disabled={busy}
              title={"Travel to the nearest location the space can offer to "
                + "this drawing, and say what it still cannot reach"}
              className="text-[11px] px-2 py-0.5 rounded-sm border border-border
                         hover:border-burgundy hover:text-burgundy
                         disabled:opacity-40 transition-colors">
              {busy ? "asking the space…" : "Pull the space to it"}
            </button>
            <button onClick={onClear}
              title="Give the glyph back to the location"
              className="text-[11px] px-2 py-0.5 rounded-sm border border-border
                         hover:border-burgundy hover:text-burgundy
                         transition-colors">
              Let it go
            </button>
          </>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">
            drag a point to draw on it
          </span>
        )}

        {pulled && (
          <span className="font-mono text-[10px] text-muted-foreground ml-auto">
            reached {(pulled.explained * 100).toFixed(0)}% ·{" "}
            {pulled.residual.toFixed(4)} em left over ·{" "}
            moved {pulled.moved.toFixed(2)}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {!shown ? (
          <div className="h-full grid place-items-center text-[11px]
                          text-muted-foreground">
            drawing the glyph…
          </div>
        ) : (
          <svg ref={svg}
               viewBox={`${left} ${top} ${width} ${height}`}
               width="100%" height="100%"
               preserveAspectRatio="xMidYMid meet"
               className="block touch-none select-none text-ink"
               onPointerMove={move}
               onPointerUp={() => setGrabbed(null)}
               onPointerLeave={() => setGrabbed(null)}>
            <g transform="scale(1,-1)">
              {/* Where the letter is measured from. */}
              {([[0, "baseline"], [0.5, "x-height"], [0.7, "cap"],
                 [0.75, "ascender"], [-0.2, "descender"]] as const)
                .map(([y, name]) => (
                  <g key={name}>
                    <line x1={left} x2={left + width} y1={y} y2={y}
                          stroke="currentColor" strokeWidth={0.003}
                          opacity={name === "baseline" ? 0.5 : 0.18} />
                  </g>
                ))}
              {/* The sidebearings, as the two walls the letter sits between. */}
              {[0, adv].map((x, i) => (
                <line key={i} x1={x} x2={x} y1={-0.3} y2={0.85}
                      stroke="currentColor" strokeWidth={0.003} opacity={0.3} />
              ))}

              {/* The letter: filled faintly so the counters read, and
                  stroked so the outline being worked on is the thing that
                  shows. */}
              <path d={glyph?.path ?? ""} fill="currentColor" opacity={0.1}
                    fillRule="evenodd" />
              {liveIdx.map((ci) => (
                <polygon key={ci}
                  points={shown[ci].map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none" stroke="currentColor" strokeWidth={0.004}
                  opacity={0.8} />
              ))}

              {liveIdx.map((ci) => shown[ci].map(([x, y], pi) => (
                <circle
                  key={`${ci}.${pi}`}
                  cx={x} cy={y}
                  r={grabbed && grabbed[0] === ci && grabbed[1] === pi
                    ? 0.016 : 0.009}
                  className="cursor-grab"
                  fill={grabbed && grabbed[0] === ci && grabbed[1] === pi
                    ? "hsl(var(--burgundy))" : "hsl(var(--here))"}
                  onPointerDown={(e) => {
                    // Capture so the release arrives even when the pointer
                    // leaves the circle, which it does immediately. Guarded,
                    // because a pointer id the browser does not recognise
                    // throws and would take the whole gesture with it.
                    try { e.currentTarget.setPointerCapture(e.pointerId) }
                    catch { /* no capture; the svg still sees the move */ }
                    // The first drag seeds the edit from every contour, pads
                    // included: the space expects a glyph of a fixed shape and
                    // a drawing missing its empty slots is not one.
                    if (!edited && glyph?.contours) {
                      onEdit(glyph.contours.map((c) => c.map((q) => q.slice())))
                    }
                    setGrabbed([ci, pi])
                  }}
                />
              )))}
            </g>
          </svg>
        )}
      </div>
    </div>
  )
}
