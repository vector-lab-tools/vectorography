import { useEffect, useRef, useState } from "react"

export type MenuItem =
  | { kind: "item"; label: string; hint?: string; onSelect: () => void
      disabled?: boolean; title?: string }
  | { kind: "sep" }

export type Menu = { label: string; items: MenuItem[] }

/**
 * A plain menu bar. Export lives here rather than as loose buttons because a
 * typeface leaving the instrument is a deliberate act and should read as one.
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
            className={`px-1.5 sm:px-3 font-mono text-[10px] sm:text-[11px]
                        uppercase tracking-[0.06em] sm:tracking-[0.1em]
                        transition-colors
                        ${open === m.label
                          ? "bg-burgundy text-ivory"
                          : "hover:bg-muted text-foreground"}`}
          >
            {m.label}
          </button>

          {open === m.label && (
            <div className="absolute top-full left-0 z-50 min-w-[260px] py-1
                            bg-card border border-border rounded-sm
                            shadow-editorial-md
                            max-lg:fixed max-lg:left-2 max-lg:right-2
                            max-lg:top-11 max-lg:min-w-0 max-lg:max-h-[70dvh]
                            max-lg:overflow-y-auto">
              {m.items.map((it, i) =>
                it.kind === "sep" ? (
                  <div key={i} className="my-1 border-t border-border" />
                ) : (
                  <button
                    key={i}
                    disabled={it.disabled}
                    title={it.title}
                    onClick={() => { setOpen(null); it.onSelect() }}
                    className="w-full flex items-center gap-4 px-3 py-1.5
                               coarse:py-3
                               text-left text-[12px] hover:bg-muted
                               disabled:opacity-35 disabled:hover:bg-transparent
                               disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="flex-1">{it.label}</span>
                    {it.hint && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {it.hint}
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
