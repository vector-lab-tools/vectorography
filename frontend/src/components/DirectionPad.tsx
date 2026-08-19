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
export function DirectionPad({ directions, onSteer, busy, active, toggle }: {
  directions: NamedDirection[]
  onSteer: (key: string, sign: number) => void
  busy: boolean
  /** What a drag is allowed to change. Dragging moves along these and nothing
   *  else, so the chips are how the drag is aimed. */
  active: Set<string>
  toggle: (key: string) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="rail-label">Steer</span>
        <span className="font-mono text-[9px] text-muted-foreground"
              title="Dragging the specimen moves along the lit properties only.
                     With none lit it moves freely, through everything at once.">
          {active.size ? `drag: ${active.size}` : "drag: free"}
        </span>
      </div>
      <div className="space-y-0.5">
        {directions.map((d) => (
          <div key={d.key} className="flex items-center gap-1">
            <button
              onClick={() => toggle(d.key)}
              title={active.has(d.key)
                ? `Dragging changes ${d.label.toLowerCase()} (${d.minus} to ${d.plus}). Click to drop it.`
                : `Add ${d.label.toLowerCase()} to what dragging changes.`}
              className={`flex-1 min-w-0 text-left text-[10.5px] font-display
                          truncate px-1.5 py-0.5 rounded-full border
                          transition-colors ${active.has(d.key)
                            ? "border-here bg-here/10 text-here"
                            : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {d.label}
            </button>
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
