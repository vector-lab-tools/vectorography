import { useMemo, useState } from "react"
import { familyFace } from "./familyFonts"

/**
 * Where a project starts.
 *
 * The instrument used to open at the centroid, which is the average of 441
 * families and a place none of them occupies. It is the one location in the
 * space nobody would choose, and it was the only one on offer.
 *
 * A type designer starts a face at the control characters: `n` and `o` set the
 * system, and the rest is derived from them. Someone choosing a face for a job
 * starts at a reference: this one, but narrower. Those are two entrances to
 * the same work, so they are doors rather than modes. Nothing is shut off
 * behind either: whoever came in through a reference can settle letters an
 * hour later, and whoever came in through the control characters can bring a
 * drawing in to see where it landed.
 */
export function Doors({ families, onControlCharacters, onFamily, onFont,
                        onCentroid }: {
  families: string[]
  onControlCharacters: () => void
  onFamily: (name: string) => void
  onFont: () => void
  onCentroid: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState("")
  const [, bump] = useState(0)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return families.filter((f) => !q || f.includes(q)).slice(0, 36)
  }, [families, query])

  return (
    <div className="h-full overflow-y-auto grid place-items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl">Vectorography</h1>
          <p className="font-mono text-[11px] text-muted-foreground mt-1">
            type design by traversal
          </p>
        </div>

        {!picking ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <Door
              title="Draw the control characters"
              line="n and o set the system. Settle them, and the space proposes
                    the rest of the alphabet."
              note="for designing a face"
              onClick={onControlCharacters}
            />
            <Door
              title="Start from a face you know"
              line="Take one off the corpus, or bring your own in, and move
                    away from it on purpose."
              note="for choosing one"
              onClick={() => setPicking(true)}
            />
          </div>
        ) : (
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="find a family"
                spellCheck={false}
                className="flex-1 font-mono text-[12px] px-2.5 py-2 rounded-sm
                           bg-background border border-ink/25
                           focus:outline-none focus:border-burgundy"
              />
              <button onClick={onFont}
                className="px-3 py-2 rounded-sm border border-border
                           font-mono text-[11px] whitespace-nowrap
                           hover:border-burgundy hover:text-burgundy
                           transition-colors">
                Bring a font in…
              </button>
            </div>

            <div className="mt-3 max-h-[42vh] overflow-y-auto grid
                            grid-cols-2 sm:grid-cols-3 gap-1">
              {matches.map((f) => (
                <button key={f} onClick={() => onFamily(f)}
                  className="text-left px-2 py-1.5 rounded-sm hover:bg-muted
                             truncate transition-colors">
                  {/* Set in its own face. A name says what a typeface is
                      called; its letters say what it is. */}
                  <span className="text-[13px]"
                        style={{ fontFamily:
                          familyFace(f, () => bump((n) => n + 1)) ?? undefined }}>
                    {f}
                  </span>
                </button>
              ))}
            </div>

            <button onClick={() => setPicking(false)}
              className="mt-3 font-mono text-[10px] text-muted-foreground
                         hover:text-foreground transition-colors">
              ← back
            </button>
          </div>
        )}

        <div className="text-center mt-6">
          <button onClick={onCentroid}
            className="font-mono text-[10px] text-muted-foreground
                       hover:text-foreground transition-colors">
            or begin at the centroid, the average of all 441
          </button>
        </div>
      </div>
    </div>
  )
}

function Door({ title, line, note, onClick }: {
  title: string; line: string; note: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="panel p-5 text-left hover:border-burgundy transition-colors
                 group">
      <span className="rail-label !text-[8px]">{note}</span>
      <h2 className="font-display text-lg mt-1 group-hover:text-burgundy
                     transition-colors">
        {title}
      </h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground mt-1.5">
        {line}
      </p>
    </button>
  )
}
