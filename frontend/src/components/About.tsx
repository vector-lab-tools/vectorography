import { useEffect } from "react"

/** Who made it, what it is, and what it was built on. Click anywhere to go. */
export function About({ version, model, dims, onClose }: {
  version: string
  model: string
  dims: number
  onClose: () => void
}) {
  useEffect(() => {
    const key = () => onClose()
    document.addEventListener("keydown", key)
    return () => document.removeEventListener("keydown", key)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[200] bg-ink/45 backdrop-blur-[2px]
                 flex items-center justify-center p-6
                 animate-[fadeIn_.14s_ease-out] cursor-pointer"
      onClick={onClose}
    >
      <div className="bg-background border border-border rounded-md
                      shadow-editorial-md w-full max-w-md px-8 py-7 text-center">
        {/* The mark: a letterform at a point in a space, which is the whole
            idea in one drawing. */}
        <svg viewBox="0 0 120 120" className="w-20 h-20 mx-auto mb-4"
             aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none"
                  stroke="hsl(var(--border))" strokeWidth="1.5" />
          <ellipse cx="60" cy="60" rx="52" ry="18" fill="none"
                   stroke="hsl(var(--border))" strokeWidth="1" />
          <ellipse cx="60" cy="60" rx="18" ry="52" fill="none"
                   stroke="hsl(var(--border))" strokeWidth="1" />
          {[[36, 44], [78, 39], [30, 74], [86, 77], [62, 30], [48, 88],
            [70, 62], [40, 60]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.2"
                    fill="hsl(var(--muted-foreground))" opacity="0.55" />
          ))}
          <text x="60" y="72" textAnchor="middle"
                className="font-display" fontSize="34"
                fill="hsl(var(--here))">V</text>
        </svg>

        <h2 className="font-display text-2xl tracking-tight">Vectorography</h2>
        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          version {version} · {model}
        </p>

        <p className="text-[13px] leading-relaxed mt-5">
          Type design by traversal. A vector space of letterforms that is
          travelled rather than prompted.
        </p>

        <p className="text-[13px] leading-relaxed mt-4">
          Vectorography is an experimental typographic collaboration between
          {" "}
          <a href="https://profiles.sussex.ac.uk/p125219-david-berry"
             target="_blank" rel="noreferrer"
             onClick={(e) => e.stopPropagation()}
             className="font-display underline decoration-border
                        underline-offset-2 hover:decoration-burgundy">
            David M. Berry
          </a> and{" "}
          <a href="https://www.kingston.ac.uk/staff/profile/marcus-leis-allion-490/"
             target="_blank" rel="noreferrer"
             onClick={(e) => e.stopPropagation()}
             className="font-display underline decoration-border
                        underline-offset-2 hover:decoration-burgundy">
            Marcus Leis Allion
          </a>.
        </p>

        <p className="font-mono text-[10px] text-muted-foreground mt-5
                      leading-relaxed">
          {/* The space has a document of its own: what it was fitted from,
              what is in the file, what the coordinates mean, and what it
              cannot do. A reader who wants to know what they are travelling
              through should be one press away from it. */}
          <a href="https://github.com/vector-lab-tools/vectorography/blob/main/MODEL.md"
             target="_blank" rel="noreferrer"
             onClick={(e) => e.stopPropagation()}
             title="What the space was fitted from, and what is in it"
             className="underline decoration-border underline-offset-2
                        hover:decoration-burgundy hover:text-foreground">
            {model} ({dims} dimensions)
          </a><br />
          Software: GPL-3.0
        </p>

        <p className="font-mono text-[10px] text-muted-foreground mt-4">
          Vectorography design and coding by David M. Berry
        </p>

        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          © 2026 David M. Berry
        </p>

        <p className="font-mono text-[9px] text-muted-foreground/70 mt-5">
          click anywhere to dismiss
        </p>
      </div>
    </div>
  )
}
