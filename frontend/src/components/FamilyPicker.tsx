import { useEffect, useRef, useState } from "react"
import { familyFace } from "./familyFonts"

/**
 * The real families nearest this location, each set in its own typeface.
 *
 * Not a native select: an option element takes no font in Safari, and the
 * point of the list is that you can see what you would be travelling to.
 */
export function FamilyPicker({ neighbours, onPick, sample }: {
  neighbours: { family: string; distance: number }[]
  onPick: (name: string) => void
  /** A few letters shown in each family, beside its name. */
  sample: string
}) {
  const [open, setOpen] = useState(false)
  const [, bump] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const nearest = neighbours[0]
  const redraw = () => bump((n) => n + 1)

  return (
    <div ref={root} className="relative">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        disabled={!neighbours.length}
        title="Real families nearest this location. Choosing one travels to it."
        className="font-mono text-[9px] bg-card border border-border rounded-sm
                   px-1.5 py-1 max-w-[168px] truncate disabled:opacity-40
                   hover:border-burgundy transition-colors"
      >
        {nearest
          ? `nearest: ${nearest.family} · ${nearest.distance.toFixed(2)}`
          : "nearest: —"}
      </button>

      {open && (
        <div className="absolute z-40 mt-1 left-0 w-[260px] max-h-[280px]
                        overflow-y-auto bg-card border border-border rounded-sm
                        shadow-editorial-md py-1">
          {neighbours.map((n) => {
            const face = familyFace(n.family, redraw)
            return (
              <button
                key={n.family}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { setOpen(false); onPick(n.family) }}
                className="w-full flex items-baseline gap-2 px-2 py-1
                           hover:bg-muted transition-colors text-left"
              >
                <span
                  className="text-[15px] leading-none w-[52px] shrink-0
                             text-ink"
                  style={face ? { fontFamily: `"${face}", serif` } : undefined}
                >
                  {sample}
                </span>
                <span className="flex-1 min-w-0 truncate font-mono text-[10px]">
                  {n.family}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {n.distance.toFixed(2)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
