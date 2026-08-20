export type Crumb = {
  id: number
  z: number[]
  mode: string
  label: string
  parent: number | null
  depth: number
  /** Every position a gesture passed through, when it was one. A drag from
   *  thin to fat is an axis drawn by hand, and it exports as one. */
  path?: number[][]
}

/**
 * A journey that overwrites its own history is not a record. Returning to an
 * earlier crumb and moving again opens a branch; both survive, and the indent
 * shows the fork.
 */
export function Trail({ trail, cursor, onGo, waypoints, onFlag, onClearFlags }: {
  trail: Crumb[]
  cursor: number
  onGo: (id: number) => void
  waypoints: number[]
  onFlag: (id: number) => void
  onClearFlags: () => void
}) {
  return (
    <div className="flex flex-col min-h-0 min-w-0 flex-1">
      <div className="flex items-baseline justify-end gap-3 mb-1">
        {waypoints.length > 0 && (
          <button onClick={onClearFlags}
                  className="font-mono text-[9px] text-muted-foreground
                             hover:text-burgundy transition-colors"
                  title="Unmark every waypoint. The stops themselves stay.">
            clear {waypoints.length}{" "}
            {waypoints.length === 1 ? "waypoint" : "waypoints"}
          </button>
        )}
        <span className="font-mono text-[9px] text-muted-foreground"
              title={"Click a stop to return to it; carrying on from an "
                + "earlier stop opens a branch and keeps both."}>
          {trail.length} {trail.length === 1 ? "stop" : "stops"}
        </span>
      </div>

      <ol className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-px">
        {trail.map((c) => {
          const here = c.id === cursor
          const flagged = waypoints.includes(c.id)
          return (
            <li key={c.id} style={{ paddingLeft: `${c.depth * 10}px` }}
                className="flex items-center gap-1">
              {/* The flag is its own target: marking a stop and travelling to
                  it are different intentions and should not share a press. */}
              <span role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onFlag(c.id) }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onFlag(c.id)
                    }}
                    title={flagged ? "Unmark this waypoint"
                                   : "Mark this stop as a waypoint"}
                    className={`w-5 h-5 max-lg:w-7 max-lg:h-7 shrink-0 flex
                                items-center justify-center rounded-sm
                                font-mono text-[11px] leading-none
                                cursor-pointer transition-colors ${flagged
                                  ? "text-burgundy"
                                  : "text-muted-foreground/25 hover:text-burgundy"}`}>
                {flagged ? "\u2691" : "\u2690"}
              </span>
              <button
                onClick={() => onGo(c.id)}
                title={here
                  ? "Where you are"
                  : `Return to stop ${c.id}: ${c.label}. Nothing is lost by `
                    + "going back, and travelling on from here opens a branch "
                    + "rather than overwriting what came after."}
                className={`group flex-1 min-w-0 flex items-center gap-2
                            px-2 py-1
                            rounded-sm text-left transition-colors
                            ${here ? "bg-burgundy text-ivory"
                                   : "hover:bg-muted"}`}
              >
                <span className={`font-mono text-[10px] ${here ? "text-ivory/70"
                  : "text-muted-foreground"}`}>
                  {String(c.id).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate text-[11px] font-mono">
                  {c.label}
                </span>
                {/* Says the row is a place you can go, not a line of a log. */}
                <span className={`font-mono text-[10px] shrink-0 ${here
                  ? "text-ivory/70"
                  : "text-burgundy opacity-0 group-hover:opacity-100 "
                    + "coarse:opacity-100 transition-opacity"}`}>
                  {here ? "here" : "\u21a9"}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

    </div>
  )
}
