import type { Altitude, Freedom } from "../api"

/**
 * What the readings measure: how far this face has gone from the 441 families
 * the space was fitted on, and how much of it is still open.
 *
 * The word is not a second name for the axes. The axes are the controls, and
 * a type designer already owns that word for exactly what the sliders are.
 * Divergence is the measurement, after active divergence in Broad, Berns,
 * Colton and Grierson (arXiv 2107.05599): a departure from the fitted
 * distribution, by an amount you can read off.
 *
 * The freedom figure is the one reading no other type editor has. Decided
 * letters pin the directions that move them, so the number says how much of
 * the typeface is still open. Measured on VectorModel 0.2: 128 directions
 * from the centroid, 83 once n is decided, 68 with n and o, 20 at nine
 * letters, 1 with the whole lowercase.
 */
export function Divergence({ altitude, freedom, tol, settled, dims }: {
  altitude: Altitude | null
  freedom: Freedom | null
  /** The tolerance the free count was asked for at, as written. */
  tol: number
  settled: string[]
  dims: number
}) {
  const total = freedom?.dims ?? dims
  const free = settled.length === 0 ? total : freedom?.free?.[String(tol)]
  const share = free != null && total ? free / total : null

  return (
    <div className="space-y-3">
      <div className="flex gap-5">
        <Reading
          value={altitude ? altitude.centroid_distance.toFixed(1) : "—"}
          label="from centre"
          title={"How far from the average of the whole corpus, in the "
            + "whitened units the space is measured in. The average is a "
            + "place no real family occupies."} />
        <Reading
          value={altitude
            ? `${Math.round(altitude.density_percentile)}${
                ord(Math.round(altitude.density_percentile))}`
            : "—"}
          label="density"
          title={"Where this sits among the corpus for crowding. Low is out "
            + "on its own; high is in the thick of what already exists."} />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px]">Still undecided</span>
          <span className="font-mono text-[12px] text-burgundy">
            {free == null ? "—" : `${free} / ${total}`}
          </span>
        </div>
        <div className="mt-1 h-[5px] rounded-sm bg-muted overflow-hidden">
          <div className="h-full bg-burgundy transition-[width]"
               style={{ width: `${((share ?? 1) * 100).toFixed(1)}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          {settled.length === 0
            ? "Nothing decided, so every direction still moves everything."
            : `${settled.join(" ")} decided. `
              + `${free ?? "—"} directions left that will not disturb `
              + (settled.length === 1 ? "it." : "them.")}
        </p>
      </div>
    </div>
  )
}

function Reading({ value, label, title }: {
  value: string; label: string; title: string
}) {
  return (
    <div title={title}>
      <div className="font-mono text-[14px] leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

function ord(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return "th"
  return ["th", "st", "nd", "rd"][n % 10] ?? "th"
}
