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
export function Trail({ trail, cursor, onGo, onExport, onTest, canCompile, busy }: {
  trail: Crumb[]
  cursor: number
  onGo: (id: number) => void
  onExport: () => void
  onTest: () => void
  canCompile: boolean
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

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="btn"
          onClick={onTest}
          disabled={busy || !canCompile}
          title={!canCompile
            ? "Travel somewhere first: a journey needs at least two stops"
            : "Compile this journey and test the variable font here"}
        >
          Test
        </button>
        <button
          className="btn"
          onClick={onExport}
          disabled={busy || !canCompile}
          title={!canCompile
            ? "Travel somewhere first: a journey needs at least two stops"
            : "Compile this journey into a variable font and download it"}
        >
          Compile
        </button>
      </div>
    </div>
  )
}
