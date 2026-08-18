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
export function AltitudeMeter({ altitude, corpus }:
  { altitude: Altitude | null; corpus: CorpusInfo | null }) {

  const bins = useMemo(() => {
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

  const max = corpus?.centroid_max ?? 1
  const cd = altitude?.centroid_distance ?? 0
  const frac = Math.min(cd / max, 1.35)
  const beyond = cd > max

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="rail-label">Altitude</div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* corpus histogram, vertical: bottom = centroid, top = furthest font */}
        <div className="relative w-16 bg-muted/60 border border-border rounded-sm
                        overflow-hidden">
          <div className="absolute inset-0 flex flex-col-reverse">
            {bins.map((v, i) => (
              <div key={i} className="flex-1 flex items-center">
                <div className="h-full bg-parchment"
                     style={{ width: `${Math.max(v * 100, 2)}%` }} />
              </div>
            ))}
          </div>
          {/* you-are-here */}
          <div
            className="absolute left-0 right-0 flex items-center pointer-events-none"
            style={{ bottom: `calc(${Math.min(frac, 1) * 100}% - 1px)` }}
          >
            <div className={`h-[2px] w-full ${beyond ? "bg-gold" : "bg-burgundy"}`} />
          </div>
          <div className="absolute inset-x-0 bottom-0 border-t border-dashed
                          border-muted-foreground/40" />
        </div>

        <div className="flex flex-col justify-between py-0.5 text-[10px]
                        font-mono text-muted-foreground">
          <span>{max.toFixed(1)}</span>
          <span className="text-burgundy">you</span>
          <span>0 centroid</span>
        </div>
      </div>

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
