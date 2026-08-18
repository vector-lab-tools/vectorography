import { useMemo, type ReactElement } from "react"
import type { Glyph } from "../api"

type Props = {
  glyphs: Glyph[]
  text: string
  className?: string
  colour?: string
  /** Fixed viewBox width, so sibling specimens stay at one scale. */
  fixedWidth?: number
}

/**
 * Glyph outlines are y-up in font coordinates; the inner group flips them.
 * Nothing here knows how the outlines were produced, which is deliberate: a
 * location decodes to contours, and the specimen only shows what is there.
 */
export function Specimen({ glyphs, text, className, colour, fixedWidth }: Props) {
  const { body, width } = useMemo(() => {
    const by = new Map(glyphs.map((g) => [g.char, g]))
    let x = 0
    const parts: ReactElement[] = []
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === " ") { x += 0.3; continue }
      const g = by.get(ch)
      if (!g) { x += 0.3; continue }
      const at = x
      parts.push(
        <g key={i} transform={`translate(${at.toFixed(4)},0)`}>
          {g.paths.map((d, j) => <path key={j} d={d} />)}
        </g>,
      )
      x += g.advance
    }
    return { body: parts, width: Math.max(x, 0.1) }
  }, [glyphs, text])

  const w = fixedWidth ?? width
  return (
    <svg
      className={className}
      viewBox={`0 ${-0.88} ${w.toFixed(4)} ${1.16}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={text}
    >
      <g transform="scale(1,-1)" fill={colour ?? "currentColor"} fillRule="evenodd">
        {body}
      </g>
    </svg>
  )
}
