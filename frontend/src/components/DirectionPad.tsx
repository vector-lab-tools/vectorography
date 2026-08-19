import type { NamedDirection } from "../api"

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
}) {
  const shape = directions.find((d) => d.key === "straightness")
  const rigidify = () => {
    if (!shape) return
    const lo = shape.lo ?? -2.2
    const hi = shape.hi ?? 2.2
    onSlide("straightness", hi + (hi - lo) * 0.3)
    onCommit()
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="rail-label">Steer</span>
        {shape && (
          <button
            onClick={rigidify}
            disabled={busy}
            title="Push shape to its straight end in one move. The same axis as
                   the Shape slider: past the corpus there are no straight-sided
                   families left to interpolate toward."
            className="font-mono text-[8.5px] uppercase tracking-[0.1em]
                       px-1.5 py-[1px] rounded-sm border border-border bg-card
                       text-muted-foreground hover:border-burgundy
                       hover:text-burgundy active:translate-y-px
                       disabled:opacity-40 transition-colors"
          >
            rigidify
          </button>
        )}
      </div>
      {/* One line per property: name, track, reading. Stacked over two lines
          each, eight properties did not fit a column and half of them lived
          behind a scrollbar. */}
      <div className="space-y-0.5">
        {directions.map((d) => {
          const lo = d.lo ?? -2.2
          const hi = d.hi ?? 2.2
          const pad = (hi - lo) * 0.35
          const now = at[d.key] ?? 0
          const outside = now < lo || now > hi
          return (
            <div key={d.key} className="flex items-center gap-1.5">
              <span className="w-[52px] shrink-0 truncate text-[10px]
                               font-display leading-none"
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
                className="flex-1 min-w-0 h-1 accent-burgundy"
                title={`${d.minus} to ${d.plus}`}
              />
              <span className={`w-[22px] shrink-0 text-right font-mono
                                text-[8.5px] leading-none ${outside
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
