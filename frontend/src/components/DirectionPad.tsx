import type { NamedDirection } from "../api"
import { handleColour } from "./handleColours"
import type { HandleKind } from "./handles"

/**
 * Where the type stands on each measured property, and a handle to move it.
 *
 * A slider needs a position, and a position in a 128-dimensional space is not a
 * number. What it does have is a projection: how far along the weight direction
 * this location sits, against how far the corpus itself runs. So the slider
 * reads the projection and setting it travels along that one direction until
 * the projection matches. The ends are the corpus's own 2nd and 98th
 * percentiles; past them the track is still there and the type keeps changing,
 * but there are no real families left to interpolate toward and the outlines
 * start to guess.
 */
export function DirectionPad({ directions, at, onSlide, onCommit, busy }: {
  directions: NamedDirection[]
  /** Current projection along each direction, keyed by property. */
  at: Record<string, number>
  onSlide: (key: string, value: number) => void
  onCommit: () => void
  busy: boolean
  /** Move halfway to the nearest real family. */
}) {

  return (
    <div>
      <div className="flex items-baseline justify-between gap-1 mb-1
                      flex-wrap">
        <span className="rail-label"
              title={"Push a single measured property, without moving off in "
                + "any other. The letterform changes in that one respect and "
                + "holds everything else where it is."}>Steer</span>
      </div>
      {/* One line per property: name, track, reading. Stacked over two lines
          each, eight properties did not fit a column and half of them lived
          behind a scrollbar. */}
      <div className="space-y-0.5 max-lg:space-y-1">
        {directions.map((d) => {
          const lo = d.lo ?? -2.2
          const hi = d.hi ?? 2.2
          const pad = (hi - lo) * 0.35
          const now = at[d.key] ?? 0
          const outside = now < lo || now > hi
          return (
            <div key={d.key} className="flex items-center gap-1.5
                                        max-lg:gap-2">
              {/* The same colour this property wears on the letterform, so the
                  slider and the grab point read as one control. */}
              <span className="w-[52px] max-lg:w-[58px] shrink-0 truncate
                               text-[10px] max-lg:text-[11px]
                               font-display leading-none"
                    style={{ color: handleColour(d.key as HandleKind, 0.95) }}
                    title={`${d.minus} \u2190 ${d.label} \u2192 ${d.plus}`}>
                {d.label}
              </span>
              <input
                type="range"
                min={lo - pad}
                max={hi + pad}
                step={(hi - lo) / 400}
                value={now}
                disabled={busy}
                onChange={(e) => onSlide(d.key, Number(e.target.value))}
                onPointerUp={onCommit}
                onKeyUp={onCommit}
                className="flex-1 min-w-0 h-1 max-lg:h-4 mr-1"
                style={{ accentColor: handleColour(d.key as HandleKind) }}
                title={`${d.minus} to ${d.plus}`}
              />
              <span className={`w-[30px] max-lg:w-[28px] shrink-0 text-right
                                font-mono text-[8.5px] max-lg:text-[10px]
                                leading-none ${outside
                                  ? "text-gold" : "text-muted-foreground"}`}>
                {outside ? "\u00b7\u00b7" : pct(now, lo, hi)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function pct(v: number, lo: number, hi: number) {
  return `${Math.round(((v - lo) / Math.max(hi - lo, 1e-6)) * 100)}`
}
