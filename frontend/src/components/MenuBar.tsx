import { useEffect, useRef, useState } from "react"

export type MenuItem =
  | { kind: "item"; label: string; hint?: string; onSelect: () => void
      disabled?: boolean; title?: string; on?: boolean }
  | { kind: "sep" }
  /** A heading over the items below it, until the next heading or rule. */
  | { kind: "group"; label: string }

export type Menu = { label: string; items: MenuItem[] }

/**
 * The menu bar, after the one on the Spacewar! research bench.
 *
 * The thing worth taking from it is not the look. It is that every item says
 * what it does, in a dimmed line under its own name, instead of hiding it in a
 * tooltip. Every item here already had that sentence written: it sat in the
 * `title` attribute, where it took a hover and a wait to read on a mouse and
 * could not be read at all on a touchscreen. The same words, moved up into the
 * menu, turn a list of names into something a person can use without being
 * told what the names mean.
 *
 * Headings over groups rather than bare rules, for the same reason: a divider
 * says two things are different, and a heading says what they are.
 */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null) }
    // Pointer events, in the capture phase. Listening for mousedown missed
    // every press that landed on the specimen or the map, because both call
    // preventDefault on the way down and no mouse event follows; the menu
    // stayed open over the very thing that had just been pressed. Capture,
    // so a handler that stops the press going further does not also stop the
    // menu closing.
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  return (
    <div ref={root} className="flex items-stretch h-full shrink-0">
      {menus.map((m) => (
        <div key={m.label} className="relative flex items-stretch">
          <button
            onClick={() => setOpen((o) => (o === m.label ? null : m.label))}
            onMouseEnter={() => setOpen((o) => (o ? m.label : o))}
            aria-expanded={open === m.label}
            className={`px-1.5 sm:px-3 font-mono text-[10px] sm:text-[11px]
                        uppercase tracking-[0.06em] sm:tracking-[0.1em]
                        transition-colors flex items-center gap-1
                        ${open === m.label
                          ? "bg-burgundy text-ivory accent-fill"
                          : "hover:bg-muted text-foreground"}`}
          >
            {m.label}
            {/* Turned over while the menu is open, so the bar says which one
                is down without relying on the highlight alone. */}
            <span aria-hidden
                  className={`text-[7px] leading-none transition-transform
                              ${open === m.label ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>

          {open === m.label && (
            <div className="absolute top-full left-0 z-50 w-[330px] py-1
                            bg-menu border border-border rounded-sm
                            shadow-editorial-md
                            max-lg:fixed max-lg:left-2 max-lg:right-2
                            max-lg:top-11 max-lg:w-auto max-lg:max-h-[70dvh]
                            max-lg:overflow-y-auto">
              {m.items.map((it, i) =>
                it.kind === "sep" ? (
                  <div key={i} className="my-1 border-t border-border" />
                ) : it.kind === "group" ? (
                  <div key={i} className={`rail-label !text-[8px] px-3 pb-0.5
                                           ${i === 0 ? "pt-1" : "pt-2.5"}`}>
                    {it.label}
                  </div>
                ) : (
                  <button
                    key={i}
                    disabled={it.disabled}
                    onClick={() => { setOpen(null); it.onSelect() }}
                    className={`w-full block px-3 py-1.5 coarse:py-2.5
                                text-left hover:bg-muted
                                disabled:opacity-35 disabled:hover:bg-transparent
                                disabled:cursor-not-allowed transition-colors
                                ${it.on ? "bg-burgundy/10" : ""}`}
                  >
                    <span className="flex items-baseline gap-4">
                      <span className={`flex-1 text-[12px]
                                        ${it.on ? "text-burgundy" : ""}`}>
                        {it.label}
                      </span>
                      {it.hint && (
                        <span className="font-mono text-[10px] shrink-0
                                         text-muted-foreground">
                          {it.hint}
                        </span>
                      )}
                    </span>
                    {it.title && (
                      <span className="block font-mono text-[9px] leading-snug
                                       text-muted-foreground mt-0.5">
                        {it.title}
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
