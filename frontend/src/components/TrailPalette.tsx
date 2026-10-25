import { Trail, type Crumb } from "./Trail"

/**
 * The trail, as a palette you open rather than a panel held open.
 *
 * It was one of six permanent surfaces competing with the letters for the
 * window. A history is consulted now and then, so it opens over the work like
 * the palettes in Glyphs and closes when the question is answered.
 *
 * It is also the designspace. The stops are the weights an export compiles
 * and the route between them is the axis, which is why marking one is an act
 * of type design rather than of bookkeeping.
 */
export function TrailPalette({ trail, cursor, onGo, waypoints, onFlag,
                              onClearFlags, onClose }: {
  trail: Crumb[]
  cursor: number
  onGo: (id: number) => void
  waypoints: number[]
  onFlag: (id: number) => void
  onClearFlags: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute right-3 top-3 z-30 w-[270px] max-h-[62vh]
                    flex flex-col panel shadow-lg">
      <div className="flex items-baseline justify-between gap-2 px-2.5 py-1.5
                      border-b border-border shrink-0">
        <span className="font-display text-[12px]">Trail</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {`${trail.length} stop${trail.length === 1 ? "" : "s"}`}
        </span>
        <button onClick={onClose} aria-label="Close the trail"
                className="text-[13px] text-muted-foreground
                           hover:text-foreground leading-none">
          {"×"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2">
        <Trail trail={trail} cursor={cursor} onGo={onGo}
               waypoints={waypoints} onFlag={onFlag}
               onClearFlags={onClearFlags} />
      </div>
    </div>
  )
}
