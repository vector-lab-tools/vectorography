import type { Neighbour } from "../api"

/**
 * The provenance instrument. Whose neighbourhood you are standing in, always
 * named, always on screen. Distances are in whitened units, so they are
 * comparable across every axis.
 */
export function Neighbours({ neighbours, onPick }:
  { neighbours: Neighbour[]; onPick: (family: string) => void }) {
  const far = neighbours[0]?.distance ?? 0
  return (
    <div className="min-w-0">
      <div className="rail-label mb-2">Nearest real families</div>
      <ul className="space-y-1">
        {neighbours.map((n) => (
          <li key={n.family}>
            <button
              onClick={() => onPick(n.family)}
              title={`Travel to ${n.family}`}
              className="w-full group flex items-baseline gap-2 px-2 py-1 rounded-sm
                         hover:bg-muted text-left transition-colors"
            >
              <span className="flex-1 truncate text-[12px] font-display">
                {n.family}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {n.distance.toFixed(2)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {far > 4 && (
        <p className="mt-2 px-2 text-[10px] font-mono text-gold leading-snug">
          No real font within {far.toFixed(1)} units. You are off the map.
        </p>
      )}
    </div>
  )
}
