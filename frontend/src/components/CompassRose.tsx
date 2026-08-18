import type { CompassPoint, Glyph } from "../api"
import { Specimen } from "./Specimen"

/**
 * Eight places, shown as places. The traveller chooses between eight visible
 * letterforms rather than eight abstract directions, which is the whole reason
 * the neighbourhood view is the main ideation surface and not a control panel.
 *
 * Bearings are 45-degree steps in the current heading plane. The plane is a
 * choice, and the choice is shown in the plane selector above.
 */

// bearing -> css grid cell, laid out so the rose surrounds the centre
const CELL: Record<number, string> = {
  135: "col-start-1 row-start-1", 90: "col-start-2 row-start-1", 45: "col-start-3 row-start-1",
  180: "col-start-1 row-start-2", 0: "col-start-3 row-start-2",
  225: "col-start-1 row-start-3", 270: "col-start-2 row-start-3", 315: "col-start-3 row-start-3",
}

export function CompassRose({
  points, centre, compassText, onTravel, busy,
}: {
  points: CompassPoint[]
  centre: Glyph[]
  compassText: string
  onTravel: (p: CompassPoint) => void
  busy: boolean
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-3 h-full min-h-0">
      {points.map((p) => (
        <button
          key={p.bearing}
          onClick={() => onTravel(p)}
          disabled={busy}
          className={`${CELL[p.bearing]} panel group relative overflow-hidden
                      flex items-center justify-center p-2
                      hover:border-burgundy hover:shadow-editorial-md
                      transition-all disabled:opacity-50`}
          title={`Walk ${p.bearing}°`}
        >
          <Specimen
            glyphs={p.glyphs}
            text={compassText}
            className="w-full h-full max-h-[90px] text-ink
                       group-hover:text-burgundy transition-colors"
          />
          <span className="absolute top-1 left-1.5 font-mono text-[9px]
                           text-muted-foreground/70">
            {String(p.bearing).padStart(3, "0")}
          </span>
          {/* density of the destination: a full bar means you are walking
              back into the crowd */}
          <span
            className="absolute bottom-0 left-0 h-[2px] bg-burgundy/50"
            style={{ width: `${p.altitude.density_percentile}%` }}
          />
        </button>
      ))}

      {/* The centre shows where you already are, at the same scale as the
          eight around it, so the comparison is like for like. */}
      <div className="col-start-2 row-start-2 panel flex items-center
                      justify-center p-2 relative border-ink/40 bg-muted/40">
        <Specimen glyphs={centre} text={compassText}
                  className="w-full h-full max-h-[90px] text-ink" />
        <span className="absolute top-1 left-1.5 font-mono text-[9px]
                         text-burgundy">here</span>
      </div>
    </div>
  )
}
