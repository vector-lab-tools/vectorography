import { useEffect, useRef, useState } from "react"
import { familyFace } from "./familyFonts"

/**
 * The real families nearest this location, each set in its own typeface.
 *
 * Not a native select: an option element takes no font in Safari, and the
 * point of the list is that you can see what you would be travelling to.
 */
export function FamilyPicker({ neighbours, onPick, sample, inline = false }: {
  neighbours: { family: string; distance: number }[]
  onPick: (name: string) => void
  /** A few letters shown in each family, beside its name. */
  sample: string
  /** In the inspector the list is simply open: it is a section of its own
   *  that a designer closes when they are not thinking about it, so a
   *  dropdown inside it would be a second lid on the same box. */
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [, bump] = useState(0)
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

  const nearest = neighbours[0]
  const redraw = () => bump((n) => n + 1)

  const rows = (
    <>
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
              className="text-[15px] leading-none w-[52px] shrink-0 text-ink"
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
    </>
  )

  if (inline) return (
    <div className="-mx-1 max-h-[240px] overflow-y-auto">{rows}</div>
  )

  return (
    <div ref={root} className="relative">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        disabled={!neighbours.length}
        title="Real families nearest this location. Choosing one travels to it."
        className="font-mono text-[9px] bg-card border border-border rounded-sm
                   pl-1.5 pr-1 py-1 max-w-[186px] flex items-center gap-1
                   disabled:opacity-40 hover:border-burgundy transition-colors"
      >
        <span className="truncate">
          {nearest
            ? `nearest: ${nearest.family} \u00b7 ${nearest.distance.toFixed(2)}`
            : "nearest: \u2014"}
        </span>
        <svg viewBox="0 0 10 10" aria-hidden="true"
             className={`w-2.5 h-2.5 shrink-0 text-muted-foreground
                         transition-transform ${open ? "rotate-180" : ""}`}
             fill="none" stroke="currentColor" strokeWidth="1.4"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-[260px] max-h-[280px]
                        overflow-y-auto bg-card border border-border rounded-sm
                        shadow-editorial-md py-1">
          {rows}
        </div>
      )}
    </div>
  )
}
