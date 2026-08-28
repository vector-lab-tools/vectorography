import { useMemo, useState } from "react"
import type { Altitude, CorpusInfo } from "../api"

/**
 * Where you are in the distribution, permanently on screen.
 *
 * Two readings, because one of them saturates. Density percentile stops
 * discriminating just outside the corpus hull, which is exactly where a
 * traveller who has been repelling ends up. Distance from the centroid,
 * expressed against the furthest real font, keeps reading out there.
 */
export function AltitudeStrip({ altitude, corpus }:
  { altitude: Altitude | null; corpus: CorpusInfo | null }) {
  const bins = useBins(corpus)
  const max = corpus?.centroid_max ?? 1
  const [open, setOpen] = useState(false)
  const cd = altitude?.centroid_distance ?? 0
  const frac = Math.min(cd / max, 1.35)
  const beyond = cd > max

  // Beside the map, because it is a reading of the position the map shows. The
  // three named numbers used to have a panel of their own in the rail below,
  // where they said the same thing as the reading above the specimen; they live
  // on the strip now, for whoever wants them.
  return (
    <div className="group h-full flex flex-col items-center gap-1 relative"
         onClick={() => setOpen((o) => !o)}>
      <span className="font-mono text-[8px] text-muted-foreground">
        {max.toFixed(0)}
      </span>
      <div className="relative w-4 flex-1 min-h-[120px] bg-muted/50 border
                      border-border rounded-sm overflow-hidden">
        <div className="absolute inset-0 flex flex-col-reverse">
          {bins.map((v, i) => (
            <div key={i} className="flex-1 flex items-center">
              <div className="h-full bg-parchment"
                   style={{ width: `${Math.max(v * 100, 2)}%` }} />
            </div>
          ))}
        </div>
        <div className="absolute left-0 right-0 flex items-center"
             style={{ bottom: `calc(${Math.min(frac, 1) * 100}% - 1px)` }}>
          <div className={`h-[2px] w-full ${beyond ? "bg-gold" : "bg-burgundy"}`} />
        </div>
      </div>
      <span className="font-mono text-[8px] text-muted-foreground">0</span>

      {/* Hover opens this for a mouse; a tap toggles it for a finger. */}
      <div className={`pointer-events-none absolute right-6 top-0 w-[178px]
                      ${open ? "opacity-100" : "opacity-0"}
                      group-hover:opacity-100 transition-opacity
                      bg-card border border-border rounded-sm shadow-editorial
                      px-2.5 py-2 space-y-1.5 z-20`}>
        <Reading label="from centroid" value={cd.toFixed(2)}
                 note={`${altitude?.centroid_percentile.toFixed(0) ?? 0}th `
                       + `percentile · furthest family ${max.toFixed(1)}`} />
        <Reading label="local density"
                 value={`${altitude?.density_percentile.toFixed(0) ?? 0}th`}
                 note={beyond ? "off the map"
                   : (altitude?.density_percentile ?? 0) > 75 ? "busy ground"
                   : (altitude?.density_percentile ?? 0) > 40 ? "populated"
                   : "open country"} />
        <Reading label="isolation"
                 value={altitude?.knn_distance.toFixed(2) ?? "0"}
                 note="mean distance to the five nearest families" />
      </div>
    </div>
  )
}

function Reading({ label, value, note }:
  { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="rail-label !text-[8px]">{label}</span>
        <span className="font-display text-[13px]">{value}</span>
      </div>
      <div className="font-mono text-[8px] text-muted-foreground leading-snug">
        {note}
      </div>
    </div>
  )
}

function useBins(corpus: CorpusInfo | null) {
  return useMemo(() => {
    if (!corpus) return []
    const n = 28
    const max = corpus.centroid_max
    const out = new Array(n).fill(0)
    for (const d of corpus.centroid_distances) {
      const i = Math.min(n - 1, Math.floor((d / max) * n))
      out[i]++
    }
    const peak = Math.max(...out, 1)
    return out.map((v) => v / peak)
  }, [corpus])
}
