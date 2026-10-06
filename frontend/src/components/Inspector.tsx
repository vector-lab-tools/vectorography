import { useState, type ReactNode } from "react"

/**
 * One sidebar of collapsible sections, after the font editors.
 *
 * Glyphs puts Dimensions, Fit Curve, Layers and Transformations in a single
 * right-hand column. RoboFont puts nine sections there and you open the one
 * you want. FontLab stacks Layers, Elements and Variations down one side. In
 * all three the canvas keeps the rest of the window.
 *
 * This instrument had the same material spread over three edges of the screen
 * at once: a column of compass and sliders on the right, a row of travel
 * controls and the trail along the bottom, and the map filling what was left.
 * Six panels of equal weight, none of them the work. Collecting them here is
 * what gives the letters the window back, and closing a section is how a
 * designer says they are not thinking about that today.
 */
export function Inspector({ children }: { children: ReactNode }) {
  return (
    <aside className="w-[290px] shrink-0 border-l border-border
                      overflow-y-auto overscroll-contain">
      {children}
    </aside>
  )
}

export function Section({ title, note, children, defaultOpen = false, id }: {
  title: string
  /** A reading or a count, shown on the header so a closed section still
   *  says what is in it. */
  note?: string
  children: ReactNode
  defaultOpen?: boolean
  /** Remembered, because which sections a designer keeps open is a habit. */
  id: string
}) {
  const [open, setOpen] = useState(() => {
    try {
      const kept = localStorage.getItem(`vg.insp.${id}`)
      return kept == null ? defaultOpen : kept === "1"
    } catch { return defaultOpen }
  })
  const flip = () => {
    setOpen((o) => {
      try { localStorage.setItem(`vg.insp.${id}`, o ? "0" : "1") } catch { /* full */ }
      return !o
    })
  }

  return (
    <section className="border-b border-border last:border-b-0">
      <button
        onClick={flip}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left
                   hover:bg-muted/60 transition-colors"
      >
        <span aria-hidden className={`text-[8px] leading-none
                                      text-muted-foreground transition-transform
                                      ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
        <span className="flex-1 text-[12px]">{title}</span>
        {note && (
          <span className="font-mono text-[10px] text-muted-foreground
                           tabular-nums">
            {note}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  )
}
