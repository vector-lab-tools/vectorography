import type { CompassPoint } from "../api"
import { Specimen } from "./Specimen"

/**
 * Eight places, shown as places. The traveller chooses between eight visible
 * letterforms rather than eight abstract directions, which is why the
 * neighbourhood view is the main ideation surface and not a control panel.
 *
 * Bearings are 45-degree steps in the current heading plane. The plane is a
 * choice, and the choice is shown in the plane selector below.
 *
 * The middle is left empty. It held the current specimen, drawn at the same
 * size for comparison, but it was the one tile that could not be clicked and it
 * read as a control that did nothing. Where you are is rendered above, at the
 * size of a specimen rather than a thumbnail.
 */

// bearing -> grid cell, arrow, and which edge the arrow sits on, so that each
// tile points away from the centre in the direction it would take you
// The arrow sits at the edge of the tile it points from, so the ring of eight
// reads as eight directions out of the middle rather than eight labelled boxes.
const DIRS: Record<number, { cell: string; arrow: string; at: string }> = {
  135: { cell: "col-start-1 row-start-1", arrow: "↖", at: "top-0 left-0.5" },
  90:  { cell: "col-start-2 row-start-1", arrow: "↑",
         at: "top-0 left-0.5/2 -translate-x-1/2" },
  45:  { cell: "col-start-3 row-start-1", arrow: "↗", at: "top-0 right-0.5" },
  180: { cell: "col-start-1 row-start-2", arrow: "←",
         at: "left-0.5 top-1/2 -translate-y-1/2" },
  0:   { cell: "col-start-3 row-start-2", arrow: "→",
         at: "right-0.5 top-1/2 -translate-y-1/2" },
  225: { cell: "col-start-1 row-start-3", arrow: "↙", at: "bottom-0 left-0.5" },
  270: { cell: "col-start-2 row-start-3", arrow: "↓",
         at: "bottom-0 left-0.5/2 -translate-x-1/2" },
  315: { cell: "col-start-3 row-start-3", arrow: "↘", at: "bottom-0 right-0.5" },
}

export function CompassRose({
  points, compassText, radius, onTravel, busy,
}: {
  points: CompassPoint[]
  compassText: string
  radius: number
  onTravel: (p: CompassPoint) => void
  busy: boolean
}) {
  return (
    <div className="flex flex-col h-full min-h-0 items-start">
      {/* The rose is a control surface, so it is framed as one. The atlas next
          to it is a picture of the space; these are buttons that move you. */}
      <div className="mb-1.5 shrink-0">
        <span className="rail-label"
              title={"Eight neighbours, one step out on the two axes the map "
                + "is drawn in. Stepping is the only way to arrive anywhere: "
                + "there is nothing here to generate."}>Traverse vector space</span>
      </div>
      {/* Square cells, and the rose keeps its shape whatever room the column
          has. Stretched to fill the height, each neighbour was set in a tall
          box and the eight of them no longer read as eight steps around one
          place: a specimen judged in a different frame from its neighbours is
          not being compared with them. */}
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5 shrink-0
                      w-full max-w-[min(100%,theme(spacing.80))] aspect-square
                      rounded-md bg-muted/40 border border-border p-1.5">
      {points.map((p) => {
        const d = DIRS[p.bearing]
        return (
          <button
            key={p.bearing}
            onClick={() => onTravel(p)}
            disabled={busy}
            title={`Walk ${d.arrow} bearing ${p.bearing}°, ${radius.toFixed(2)} units`}
            className={`${d.cell} group relative overflow-hidden rounded-sm
                        flex items-center justify-center px-2.5 py-1
                        bg-card border border-ink/25
                        shadow-[0_1px_0_0_hsl(var(--ink)/0.18)]
                        hover:border-burgundy hover:bg-burgundy/[0.05]
                        hover:shadow-[0_2px_0_0_hsl(var(--burgundy)/0.5)]
                        active:translate-y-[1px] active:shadow-none
                        focus-visible:outline-none focus-visible:border-burgundy
                        disabled:opacity-50 disabled:cursor-wait
                        transition-all duration-100`}
          >
            <span className={`absolute ${d.at} font-mono text-[13px]
                              leading-none text-muted-foreground/55
                              group-hover:text-burgundy transition-colors`}>
              {d.arrow}
            </span>
            <Specimen
              glyphs={p.glyphs}
              text={compassText}
              height={54}
              className="text-slate group-hover:text-burgundy transition-colors"
            />
            {/* how crowded the destination is: a full bar means this step
                walks you back into the middle of the distribution */}
            <span className="absolute bottom-0 left-0 h-[3px] bg-burgundy/40
                             group-hover:bg-burgundy/70 transition-colors"
                  style={{ width: `${p.altitude.density_percentile}%` }} />
          </button>
        )
      })}

      </div>
    </div>
  )
}
