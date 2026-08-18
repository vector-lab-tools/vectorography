import { useEffect, type ReactNode } from "react"

/** Overlay that closes on Escape or a click outside its panel. */
export function Modal({ title, subtitle, onClose, children, wide }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/40 backdrop-blur-[2px]
                 flex items-center justify-center p-6 animate-[fadeIn_.12s_ease-out]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-background border border-border rounded-md
                       shadow-editorial-md flex flex-col max-h-full w-full
                       ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex items-baseline gap-3 px-5 py-3 border-b border-border
                        shrink-0">
          <h2 className="font-display text-base">{title}</h2>
          {subtitle && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {subtitle}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose}
                  className="font-mono text-[10px] uppercase tracking-[0.12em]
                             text-muted-foreground hover:text-burgundy
                             transition-colors">
            close · esc
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
