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
export function Trail({ trail, cursor, onGo }: {
  trail: Crumb[]
  cursor: number
  onGo: (id: number) => void
}) {
  return (
    <div className="flex flex-col min-h-0 min-w-0 flex-1">
      <div className="flex items-baseline justify-end mb-1">
        <span className="font-mono text-[9px] text-muted-foreground"
              title={"Click a stop to return to it; carrying on from an "
                + "earlier stop opens a branch and keeps both."}>
          {trail.length} {trail.length === 1 ? "stop" : "stops"}
        </span>
      </div>

      <ol className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-px">
        {trail.map((c) => {
          const here = c.id === cursor
          return (
            <li key={c.id} style={{ paddingLeft: `${c.depth * 10}px` }}>
              <button
                onClick={() => onGo(c.id)}
                title={here
                  ? "Where you are"
                  : `Return to stop ${c.id}: ${c.label}. Nothing is lost by `
                    + "going back, and travelling on from here opens a branch "
                    + "rather than overwriting what came after."}
                className={`group w-full flex items-center gap-2 px-2 py-1
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
