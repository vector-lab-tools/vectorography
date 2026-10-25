import { useState } from "react"

/**
 * What the window is showing, as tabs across the top.
 *
 * Glyphs, FontLab and RoboFont all work this way: one Font tab holding the
 * character set, then a tab per string being worked on, each remembering its
 * own text. Five separate surfaces here used to show the same typeface at
 * once, with no way to keep two strings open or to say which was the one
 * being judged.
 *
 * The Map tab is the one tab no font editor has, because no font editor has a
 * corpus to sit in.
 */
export type Doc =
  | { kind: "font" }
  | { kind: "map" }
  | { kind: "text"; id: number; text: string }

export function Tabs({ docs, at, pick, add, close, rename }: {
  docs: Doc[]
  /** Index into docs. */
  at: number
  pick: (i: number) => void
  add: () => void
  close: (i: number) => void
  rename: (i: number, text: string) => void
}) {
  const [editing, setEditing] = useState<number | null>(null)

  return (
    <div className="flex items-stretch shrink-0 bg-muted/40 border-b
                    border-border px-2 overflow-x-auto">
      {docs.map((d, i) => {
        const on = i === at
        const label = d.kind === "font" ? "Font"
          : d.kind === "map" ? "Map"
          : d.text || "untitled"
        return (
          <div key={d.kind === "text" ? `t${d.id}` : d.kind}
               className={`group flex items-center border-b-2 transition-colors
                           ${on ? "border-burgundy" : "border-transparent"}`}>
            {editing === i && d.kind === "text" ? (
              <input
                autoFocus
                defaultValue={d.text}
                onBlur={(e) => { rename(i, e.target.value); setEditing(null) }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur()
                  if (e.key === "Escape") setEditing(null)
                }}
                spellCheck={false}
                className="w-28 mx-2 my-1.5 font-mono text-[11px] bg-background
                           border border-burgundy rounded-sm px-1 py-0.5
                           focus:outline-none" />
            ) : (
              <button
                onClick={() => on && d.kind === "text"
                  ? setEditing(i) : pick(i)}
                title={d.kind === "text"
                  ? "The string this tab is set in. Click again to retype it."
                  : d.kind === "font" ? "Every glyph in the character set"
                  : "Where this face sits among the 441 families"}
                className={`px-3 py-2 text-[12px] whitespace-nowrap
                            transition-colors ${on
                              ? "text-foreground"
                              : "text-muted-foreground"
                                + " hover:text-foreground"}`}>
                {label}
              </button>
            )}
            {d.kind === "text" && docs.filter((x) => x.kind === "text")
                                      .length > 1 && (
              <button onClick={() => close(i)}
                      aria-label={`Close ${label}`}
                      title="Close this tab"
                      className="pr-2 text-[11px] text-muted-foreground
                                 opacity-0 group-hover:opacity-100
                                 hover:text-burgundy transition-opacity">
                {"×"}
              </button>
            )}
          </div>
        )
      })}
      <button onClick={add} aria-label="New tab"
              title="Another string to work on"
              className="px-3 text-[15px] text-muted-foreground
                         hover:text-foreground transition-colors">
        +
      </button>
    </div>
  )
}
