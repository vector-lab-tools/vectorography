import type { CompassPoint, Glyph } from "../api"
import { Specimen } from "./Specimen"

/**
 * Eight places, shown as places. The traveller chooses between eight visible
 * letterforms rather than eight abstract directions, which is why the
 * neighbourhood view is the main ideation surface and not a control panel.
 *
 * Bearings are 45-degree steps in the current heading plane. The plane is a
 * choice, and the choice is shown in the plane selector below.
 */

// bearing -> grid cell, arrow, and which edge the arrow sits on, so that each
// tile points away from the centre in the direction it would take you
const DIRS: Record<number, { cell: string; arrow: string }> = {
  135: { cell: "col-start-1 row-start-1", arrow: "↖" },
  90:  { cell: "col-start-2 row-start-1", arrow: "↑" },
  45:  { cell: "col-start-3 row-start-1", arrow: "↗" },
  180: { cell: "col-start-1 row-start-2", arrow: "←" },
  0:   { cell: "col-start-3 row-start-2", arrow: "→" },
  225: { cell: "col-start-1 row-start-3", arrow: "↙" },
  270: { cell: "col-start-2 row-start-3", arrow: "↓" },
  315: { cell: "col-start-3 row-start-3", arrow: "↘" },
}

export function CompassRose({
  points, centre, compassText, radius, onTravel, busy,
}: {
  points: CompassPoint[]
  centre: Glyph[]
  compassText: string
  radius: number
  onTravel: (p: CompassPoint) => void
  busy: boolean
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2.5 h-full min-h-0">
      {points.map((p) => {
        const d = DIRS[p.bearing]
        return (
          <button
            key={p.bearing}
            onClick={() => onTravel(p)}
            disabled={busy}
            title={`Walk ${d.arrow} bearing ${p.bearing}°, ${radius.toFixed(2)} units`}
            className={`${d.cell} group relative overflow-hidden rounded-md
                        flex items-center justify-center px-2 pt-4 pb-2
                        bg-card border-2 border-border shadow-editorial
                        hover:border-burgundy hover:bg-burgundy/[0.04]
                        hover:shadow-editorial-md
                        active:translate-y-px active:shadow-editorial
                        focus-visible:outline-none focus-visible:border-burgundy
                        disabled:opacity-50 disabled:cursor-wait
                        transition-all duration-100`}
          >
            <span className="absolute top-1 left-1.5 flex items-center gap-1
                             font-mono leading-none text-muted-foreground/60
                             group-hover:text-burgundy transition-colors">
              <span className="text-[14px]">{d.arrow}</span>
              <span className="text-[9px]">{String(p.bearing).padStart(3, "0")}</span>
            </span>
            <Specimen
              glyphs={p.glyphs}
              text={compassText}
              className="w-full h-full max-h-[86px] text-ink
                         group-hover:text-burgundy transition-colors"
            />
            {/* how crowded the destination is: a full bar means this step
                walks you back into the middle of the distribution */}
            <span className="absolute bottom-0 left-0 h-[3px] bg-burgundy/40
                             group-hover:bg-burgundy/70 transition-colors"
                  style={{ width: `${p.altitude.density_percentile}%` }} />
          </button>
        )
      })}

      {/* The centre shows where you already are, at the same scale as the eight
          around it, so the comparison is like for like. It is not a control. */}
      <div className="col-start-2 row-start-2 rounded-md flex items-center
                      justify-center px-2 pt-4 pb-2 relative bg-muted/70
                      border-2 border-dashed border-ink/25">
        <Specimen glyphs={centre} text={compassText}
                  className="w-full h-full max-h-[86px] text-ink" />
        <span className="absolute top-1 left-1/2 -translate-x-1/2 font-mono
                         text-[9px] uppercase tracking-[0.14em] text-burgundy">
          here
        </span>
      </div>
    </div>
  )
}
