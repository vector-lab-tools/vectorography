import type { NamedDirection } from "../api"

/**
 * Measured axes, as opposed to the space's own.
 *
 * The compass turns in a plane of corpus eigendirections: directions the
 * distribution happens to vary along most, which nobody declared and nobody can
 * name. These are the other kind. Each was measured off the outlines of every
 * font in the corpus, and the direction runs from the mean of the lightest
 * fifteen per cent to the mean of the heaviest, and so on for each property.
 * Both sorts of axis are in the same instrument on purpose.
 */
export function DirectionPad({ directions, onSteer, busy }: {
  directions: NamedDirection[]
  onSteer: (key: string, sign: number) => void
  busy: boolean
}) {
  return (
    <div>
      <div className="rail-label mb-1.5">Steer</div>
      <div className="space-y-0.5">
        {directions.map((d) => (
          <div key={d.key} className="flex items-center gap-1">
            <span className="flex-1 text-[10.5px] font-display truncate"
                  title={`${d.minus} ← ${d.label} → ${d.plus}`}>
              {d.label}
            </span>
            <button
              className="w-6 h-[19px] border border-border rounded-sm bg-card
                         font-mono text-[10px] leading-none
                         hover:border-burgundy hover:text-burgundy
                         active:translate-y-px
                         disabled:opacity-40 transition-colors"
              disabled={busy}
              onClick={() => onSteer(d.key, -1)}
              title={`More ${d.minus}`}
            >
              −
            </button>
            <button
              className="w-6 h-[19px] border border-border rounded-sm bg-card
                         font-mono text-[10px] leading-none
                         hover:border-burgundy hover:text-burgundy
                         active:translate-y-px
                         disabled:opacity-40 transition-colors"
              disabled={busy}
              onClick={() => onSteer(d.key, 1)}
              title={`More ${d.plus}`}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
