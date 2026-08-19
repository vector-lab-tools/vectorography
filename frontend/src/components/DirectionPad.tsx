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
  return (
    <div>
      <div className="rail-label mb-1">Steer</div>
      <div className="space-y-1">
        {directions.map((d) => {
          const lo = d.lo ?? -2.2
          const hi = d.hi ?? 2.2
          const pad = (hi - lo) * 0.35
          const now = at[d.key] ?? 0
          const outside = now < lo || now > hi
          return (
            <div key={d.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] font-display truncate"
                      title={`${d.minus} \u2190 ${d.label} \u2192 ${d.plus}`}>
                  {d.label}
                </span>
                <span className={`font-mono text-[8.5px] ${outside
                  ? "text-gold" : "text-muted-foreground"}`}>
                  {outside ? "beyond" : pct(now, lo, hi)}
                </span>
              </div>
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
                className="w-full h-3 accent-burgundy"
                title={`${d.minus} to ${d.plus}`}
              />
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
