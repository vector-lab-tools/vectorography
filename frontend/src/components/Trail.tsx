export type Crumb = {
  id: number
  z: number[]
  mode: string
  label: string
  parent: number | null
  depth: number
}

/**
 * A journey that overwrites its own history is not a record. Returning to an
 * earlier crumb and moving again opens a branch; both survive, and the indent
 * shows the fork.
 */
export function Trail({ trail, cursor, onGo, onExport, busy }: {
  trail: Crumb[]
  cursor: number
  onGo: (id: number) => void
  onExport: () => void
  busy: boolean
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-baseline justify-between mb-2">
        <span className="rail-label">Trail</span>
        <span className="font-mono text-[10px] text-muted-foreground">
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
                className={`w-full flex items-center gap-2 px-2 py-1 rounded-sm
                            text-left transition-colors
                            ${here ? "bg-burgundy text-ivory" : "hover:bg-muted"}`}
              >
                <span className={`font-mono text-[10px] ${here ? "text-ivory/70"
                  : "text-muted-foreground"}`}>
                  {String(c.id).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate text-[11px] font-mono">
                  {c.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <button
        className="btn mt-3 w-full"
        onClick={onExport}
        disabled={busy || trail.length < 2}
        title={trail.length < 2
          ? "Travel somewhere first: a journey needs at least two stops"
          : "Compile this journey into a variable font"}
      >
        Compile journey
      </button>
    </div>
  )
}
