import { useMemo } from "react"
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
  const cd = altitude?.centroid_distance ?? 0
  const frac = Math.min(cd / max, 1.35)
  const beyond = cd > max

  // Beside the map, because it is a reading of the position the map shows.
  return (
    <div className="pointer-events-none h-full flex flex-col items-center gap-1">
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

export function AltitudeMeter({ altitude, corpus }:
  { altitude: Altitude | null; corpus: CorpusInfo | null }) {

  const max = corpus?.centroid_max ?? 1
  const cd = altitude?.centroid_distance ?? 0
  const beyond = cd > max

  return (
    <div className="flex flex-col gap-3">
      <div className="rail-label">Altitude</div>

      <div className="space-y-3">
        <Reading
          label="from centroid"
          value={cd.toFixed(2)}
          note={beyond
            ? `${(cd / max).toFixed(2)}x beyond the furthest real font`
            : `${(altitude?.centroid_percentile ?? 0).toFixed(0)}th percentile of corpus`}
          alarm={beyond}
        />
        <Reading
          label="local density"
          value={`${(altitude?.density_percentile ?? 0).toFixed(0)}th`}
          note={densityWord(altitude?.density_percentile ?? 0)}
          alarm={(altitude?.density_percentile ?? 0) > 80}
        />
        <Reading
          label="isolation"
          value={(altitude?.knn_distance ?? 0).toFixed(2)}
          note={`5-nearest mean, ${(altitude?.isolation_percentile ?? 0).toFixed(0)}th pct`}
        />
      </div>
    </div>
  )
}

function densityWord(p: number) {
  if (p > 90) return "in the crowd"
  if (p > 70) return "busy ground"
  if (p > 40) return "populated"
  if (p > 15) return "thinning out"
  return "open country"
}

function Reading({ label, value, note, alarm }:
  { label: string; value: string; note: string; alarm?: boolean }) {
  return (
    <div>
      <div className="rail-label">{label}</div>
      <div className={`font-display text-xl leading-tight
                       ${alarm ? "text-burgundy" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground">{note}</div>
    </div>
  )
}
