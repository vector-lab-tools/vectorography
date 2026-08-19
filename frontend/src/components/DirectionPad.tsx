import type { NamedDirection } from "../api"

/**
 * Measured axes, as steps rather than as gestures.
 *
 * Shaping happens on the letterform now, which is better for "a bit heavier"
 * and worse for "one notch heavier, again, again". This is the second of those:
 * a countable, repeatable step along a property somebody measured, for when the
 * hand is not the right instrument.
 */
export function DirectionPad({ directions, onSteer, onHard, busy }: {
  directions: NamedDirection[]
  onSteer: (key: string, sign: number) => void
  /** A long push along one property rather than a step. */
  onHard: (key: string, sign: number) => void
  busy: boolean
}) {
  const straight = directions.find((d) => d.key === "straightness")
  return (
    <div>
      <div className="rail-label mb-1">Steer</div>
      <div className="space-y-px">
        {directions.map((d) => (
          <div key={d.key} className="flex items-center gap-1">
            <span className="flex-1 min-w-0 truncate text-[10.5px] font-display"
                  title={`${d.minus} \u2190 ${d.label} \u2192 ${d.plus}`}>
              {d.label}
            </span>
            {([[-1, "\u2212", d.minus], [1, "+", d.plus]] as const).map(
              ([sign, glyph, way]) => (
                <button
                  key={sign}
                  className="w-5 h-[17px] border border-border rounded-sm
                             bg-card font-mono text-[10px] leading-none
                             hover:border-burgundy hover:text-burgundy
                             active:translate-y-px disabled:opacity-40
                             transition-colors"
                  disabled={busy}
                  onClick={() => onSteer(d.key, sign)}
                  title={`More ${way}`}
                >
                  {glyph}
                </button>
              ))}
          </div>
        ))}
      </div>

      {/* A long push rather than a step. It travels the same direction the
          Shape row does, as far as the corpus will carry it: past the point
          where real families stop being straight-sided there is nothing to
          interpolate toward, and the letters begin to guess. */}
      {straight && (
        <button
          onClick={() => onHard("straightness", 1)}
          disabled={busy}
          title="Push hard toward straight-sided letters, as far as the corpus
                 supports. Past that the outlines are guesses."
          className="mt-1.5 w-full font-mono text-[9px] uppercase
                     tracking-[0.1em] px-2 py-1 rounded-sm border border-border
                     bg-card hover:border-burgundy hover:text-burgundy
                     active:translate-y-px disabled:opacity-40
                     transition-colors"
        >
          rigidify
        </button>
      )}
    </div>
  )
}
