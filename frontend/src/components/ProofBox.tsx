import { useEffect, useRef, useState } from "react"

/**
 * What the specimen is set in: type anything, or take one of the strings the
 * trade already uses.
 *
 * The groups are not decoration. A pangram tells you the face has been drawn
 * all the way through; a control string tells you whether it holds together
 * where letters meet, which is where an interpolated face falls apart first,
 * and where the readings from the map are least use.
 */
const PROOFS: [string, string[]][] = [
  ["Test words", [
    "Hamburgefonstiv",
    "adhesion",
    "handgloves",
    "onomatopoeia",
    "Vectorography",
  ]],
  ["Pangrams", [
    "Sphinx of black quartz, judge my vow",
    "The quick brown fox jumps over the lazy dog",
    "Pack my box with five dozen liquor jugs",
    "Waltz, bad nymph, for quick jigs vex",
    "Jackdaws love my big sphinx of quartz",
    "Amazingly few discotheques provide jukeboxes",
  ]],
  ["Spacing controls", [
    "HHHOOOHHH",
    "nnoonn",
    "AVA WAW LTL",
    "rn m cl d",
    "Il1| O0Q",
  ]],
  ["Whole alphabet", [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789 .,:;!?",
    "àéîöü ÀÉÎÖÜ ß «»",
  ]],
]

export function ProofBox({ text, setText }: {
  text: string
  setText: (t: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <div className="flex items-stretch">
        <input
          value={text}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="font-mono text-[10px] w-24 sm:w-40 px-2 py-1 rounded-l-sm
                     select-text bg-background border border-r-0 border-ink/25
                     shadow-[inset_0_1px_2px_hsl(var(--ink)/0.08)]
                     focus:outline-none focus:border-burgundy
                     focus:ring-1 focus:ring-burgundy/30
                     placeholder:text-muted-foreground/60"
          placeholder="type anything"
          title={"What the specimen sets. Reading the letters is how you "
            + "decide where to go."}
        />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((o) => !o)}
          title="Strings the trade sets type with"
          aria-label="Choose a proof"
          className="px-1.5 rounded-r-sm border border-ink/25 bg-muted/60
                     text-muted-foreground hover:text-foreground
                     hover:border-burgundy/60 transition-colors"
        >
          <span className="font-mono text-[9px]">{open ? "⌃" : "⌄"}</span>
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-[300px] max-h-[300px]
                        overflow-y-auto panel p-1 shadow-editorial">
          {PROOFS.map(([group, items]) => (
            <div key={group} className="mb-1 last:mb-0">
              <span className="rail-label !text-[8px] block px-1.5 py-0.5">
                {group}
              </span>
              {items.map((t) => (
                <button
                  key={t}
                  onClick={() => { setText(t); setOpen(false) }}
                  title={t}
                  className={`w-full text-left px-1.5 py-1 rounded-sm truncate
                              transition-colors ${text === t
                                ? "bg-burgundy text-ivory"
                                : "hover:bg-muted"}`}
                >
                  {/* Set in the face being designed, so the choice is made by
                      looking at the letters rather than at a list of names. */}
                  <span className="font-mono text-[10px]">{t}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
