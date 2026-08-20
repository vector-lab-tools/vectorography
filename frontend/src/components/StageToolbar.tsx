import { useRef, useState } from "react"

/**
 * The switches that belong to the specimen, as icons, docked to one of its
 * edges. Dragged to another edge it stays there, since where a designer wants
 * their tools is a matter of hand and desk rather than of software.
 */
export type Dock = "right" | "left" | "top" | "bottom"
  | "bottom-right" | "bottom-left" | "top-right" | "top-left"

export type Tool = {
  key: string
  /** Lit when the tool is doing something. */
  on: boolean
  title: string
  label: string
  onClick: () => void
  icon: React.ReactNode
  /** Nothing to act on: shown, but plainly not available. */
  disabled?: boolean
}

export function StageToolbar({ tools, dock, setDock }: {
  tools: Tool[]
  dock: Dock
  setDock: (d: Dock) => void
}) {
  const [dragging, setDragging] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Vertical only when docked to a side; a corner reads as a horizontal
  // cluster, which is what a toolbar in a corner usually is.
  const vertical = dock === "left" || dock === "right"
  const place =
    dock === "right" ? "right-1.5 top-1/2 -translate-y-1/2"
    : dock === "left" ? "left-1.5 top-1/2 -translate-y-1/2"
    : dock === "top" ? "top-1.5 left-1/2 -translate-x-1/2"
    : dock === "bottom" ? "bottom-1.5 left-1/2 -translate-x-1/2"
    : dock === "bottom-right" ? "bottom-1 right-1.5"
    : dock === "bottom-left" ? "bottom-1.5 left-1.5"
    // On a narrow panel the head row is already full of proof chips and the
    // family picker, so the top docks sit just under it.
    : dock === "top-right" ? "top-1.5 max-sm:top-11 right-1.5"
    : "top-1.5 max-sm:top-11 left-1.5"

  /** Nearest edge of the panel to where the toolbar was let go. */
  const nearestEdge = (e: PointerEvent | React.PointerEvent): Dock => {
    const box = root.current?.parentElement?.getBoundingClientRect()
    if (!box) return dock
    const x = (e.clientX - box.left) / box.width
    const y = (e.clientY - box.top) / box.height
    // Corners win when the pointer is near two edges at once.
    const nearL = x < 0.28, nearR = x > 0.72, nearT = y < 0.3, nearB = y > 0.7
    if (nearB && nearR) return "bottom-right"
    if (nearB && nearL) return "bottom-left"
    if (nearT && nearR) return "top-right"
    if (nearT && nearL) return "top-left"
    const d: [Dock, number][] = [
      ["left", x], ["right", 1 - x], ["top", y], ["bottom", 1 - y],
    ]
    d.sort((a, b) => a[1] - b[1])
    return d[0][0]
  }

  return (
    <div
      ref={root}
      className={`absolute ${place} z-20 flex items-center gap-0.5 rounded-md
                  border bg-card/95 p-0.5 shadow-editorial
                  ${vertical ? "flex-col" : "flex-row"}
                  ${dragging ? "border-here" : "border-border"}`}
    >
      {/* The grip: the toolbar moves by this, so a press on a button is still
          a press on that button. */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation()
          setDragging(true)
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => { if (dragging) e.stopPropagation() }}
        onPointerUp={(e) => {
          if (!dragging) return
          e.stopPropagation()
          setDragging(false)
          setDock(nearestEdge(e))
        }}
        title="Drag to another edge of the specimen"
        className={`flex items-center justify-center cursor-grab touch-none
                    active:cursor-grabbing text-muted-foreground/50
                    hover:text-muted-foreground
                    ${vertical ? "w-7 h-4 sm:w-6 sm:h-3" : "w-4 h-7 sm:w-3 sm:h-6"}`}
      >
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor">
          {vertical
            ? [3, 6, 9].map((x) => <circle key={x} cx={x} cy={6} r="0.9" />)
            : [3, 6, 9].map((y) => <circle key={y} cx={6} cy={y} r="0.9" />)}
        </svg>
      </div>

      {tools.map((t) => (
        <button
          key={t.key}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={t.onClick}
          disabled={t.disabled}
          title={`${t.label} — ${t.title}`}
          aria-label={t.label}
          className={`w-6 h-6 flex items-center justify-center
                      rounded-sm
                      border transition-colors
                      disabled:opacity-30 disabled:cursor-not-allowed ${t.on
                        ? "border-here text-here bg-here/10"
                        : "border-transparent text-muted-foreground "
                          + "hover:border-border hover:text-foreground"}`}
        >
          {t.icon}
        </button>
      ))}
    </div>
  )
}

const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.3,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
}

export const ICONS = {
  /** Grab points, in each of the three states the button cycles through.
   *  Lighting one icon for two of the three states said only that the tool was
   *  not off, which is the one thing a designer already knows by looking at
   *  the letterform. */
  points: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <circle cx="4" cy="11" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5.3 9.8 10.2 6.2" />
    </svg>
  ),
  /** Only the point under the hand: one filled, one waiting. */
  pointsMinimal: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <circle cx="4" cy="11" r="1.6" />
      <circle cx="11.5" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5.3 9.8 10.2 6.2" strokeDasharray="1.6 1.6" />
    </svg>
  ),
  /** None: the same mark, struck through. */
  pointsOff: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <circle cx="4" cy="11" r="1.6" />
      <circle cx="11.5" cy="5" r="1.6" />
      <path d="M5.3 9.8 10.2 6.2" />
      <path d="M2.5 13.5 13.5 2.5" />
    </svg>
  ),
  /** Guides: the metric lines behind the letters. */
  guides: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <path d="M2 4h12M2 8h12M2 12h12" strokeDasharray="3 2" />
    </svg>
  ),
  keep: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <path d="M2.5 2.5h8.5l2.5 2.5v8.5h-11z" />
      <path d="M5 2.5h5.5V6H5z" />
      <path d="M4.5 9.5h7v4h-7z" />
    </svg>
  ),
  recall: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <path d="M3 8a5 5 0 1 1 1.6 3.7" />
      <path d="M2.4 4.6v3.2h3.2" />
    </svg>
  ),
  /** The same arrow, turned the other way. */
  redo: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <path d="M13 8a5 5 0 1 0-1.6 3.7" />
      <path d="M13.6 4.6v3.2h-3.2" />
    </svg>
  ),
  /** Back inside the corpus. */
  rescue: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" {...stroke}>
      <circle cx="8" cy="8" r="5.5" strokeDasharray="2 2" />
      <path d="M8 5v3.2l2.2 1.4" />
    </svg>
  ),
}
