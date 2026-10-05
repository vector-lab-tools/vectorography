import { useMemo } from "react"
import type { Glyph, Sheet } from "../api"
import { LINE_H, layout, lineCount, lineWidth } from "./handles"

/**
 * A wall of settings, judged side by side.
 *
 * The atlas answers "where am I" and answers it well. It does not answer "what
 * does this look like a bit heavier", which a type designer asks forty times
 * in a row, and which wants candidates beside one another rather than a map.
 *
 * So each row is one measured property and runs from less to more across the
 * page, with the current setting standing in the middle of every row. The
 * text is set as a paragraph at reading size rather than as a word at three
 * hundred pixels, because that is the size at which a text face is decided.
 */
export function ProofSheet({ sheet, text, radius, setRadius, onTravel,
                            properties, setProperties, busy }: {
  sheet: Sheet | null
  text: string
  radius: number
  setRadius: (r: number) => void
  /** Click to go; a held shift closes in rather than travelling. */
  onTravel: (z: number[], closeIn: boolean) => void
  properties: string[]
  setProperties: (p: string[]) => void
  busy: boolean
}) {
  if (!sheet) {
    return (
      <div className="h-full flex items-center justify-center rail-label
                      !text-[9px] text-muted-foreground">
        {busy ? "setting the sheet" : "no sheet yet"}
      </div>
    )
  }

  // The current setting belongs in the middle of every row, so the eye reads
  // outward from what it already has rather than left to right from nothing.
  const half = Math.ceil(sheet.steps.length / 2)

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-1 pb-1.5 shrink-0 flex-wrap">
        <span className="rail-label !text-[8px]">proof sheet</span>

        <label className="flex items-center gap-1.5">
          <span className="rail-label !text-[8px]">step</span>
          <input type="range" min={0.2} max={3} step={0.1} value={radius}
                 onChange={(e) => setRadius(Number(e.target.value))}
                 className="w-20 accent-burgundy" />
          <span className="font-mono text-[9px] text-muted-foreground w-6">
            {radius.toFixed(1)}
          </span>
        </label>

        <div className="flex items-center gap-1 flex-wrap">
          {sheet.available.map((a) => {
            const on = properties.length
              ? properties.includes(a.key)
              : sheet.rows.some((r) => r.key === a.key)
            return (
              <button
                key={a.key}
                onClick={() => {
                  const now = properties.length
                    ? properties : sheet.rows.map((r) => r.key)
                  setProperties(on ? now.filter((k) => k !== a.key)
                                   : [...now, a.key])
                }}
                className={`px-1.5 py-0.5 rounded-sm font-mono text-[9px]
                            border transition-colors ${on
                              ? "border-burgundy text-burgundy"
                              : "border-border text-muted-foreground"}`}
              >
                {a.label}
              </button>
            )
          })}
        </div>

        <span className="font-mono text-[8px] text-muted-foreground ml-auto">
          click to go there · shift-click to close in
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {sheet.rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline gap-2">
              <span className="rail-label !text-[8px]">{row.label}</span>
              <span className="font-mono text-[8px] text-muted-foreground">
                {row.minus} → {row.plus}
              </span>
            </div>
            <div className="mt-1 grid gap-1.5"
                 style={{ gridTemplateColumns:
                   `repeat(${sheet.steps.length + 1}, minmax(0, 1fr))` }}>
              {row.cells.slice(0, half).map((c, i) => (
                <Cell key={`l${i}`} glyphs={c.glyphs} text={text}
                      note={fmt(c.step)} onPick={(e) => onTravel(c.z, e)} />
              ))}
              <Cell glyphs={sheet.here.glyphs} text={text} note="here" here
                    onPick={() => { /* already standing here */ }} />
              {row.cells.slice(half).map((c, i) => (
                <Cell key={`r${i}`} glyphs={c.glyphs} text={text}
                      note={fmt(c.step)} onPick={(e) => onTravel(c.z, e)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmt(step: number) {
  return `${step > 0 ? "+" : ""}${step}`
}

/**
 * One candidate, set as a paragraph.
 *
 * The measure is fixed in ems rather than fitted to the box, so every cell on
 * the sheet is set at the same size and the comparison is between the
 * letterforms instead of between the scales they happened to be drawn at.
 */
function Cell({ glyphs, text, note, onPick, here }: {
  glyphs: Glyph[]
  text: string
  note: string
  onPick: (closeIn: boolean) => void
  here?: boolean
}) {
  const MEASURE = 11
  const placed = useMemo(
    () => layout(glyphs, text, MEASURE), [glyphs, text])
  const rows = lineCount(placed)
  const w = Math.max(lineWidth(placed), MEASURE)
  const top = 0.78
  const h = (rows - 1) * LINE_H + top + 0.3

  return (
    <button
      onClick={(e) => onPick(e.shiftKey)}
      title={here ? "Where you are standing" : "Go here. Shift to close in."}
      className={`block w-full text-left rounded-sm border px-1.5 py-1
                  transition-colors overflow-hidden
                  ${here ? "border-burgundy bg-burgundy/5"
                         : "border-border hover:border-burgundy"}`}
    >
      <span className={`rail-label !text-[7px] ${here ? "text-burgundy" : ""}`}>
        {note}
      </span>
      <svg viewBox={`0 ${-top} ${w} ${h}`} width="100%"
           preserveAspectRatio="xMinYMin meet"
           style={{ display: "block" }}>
        <g transform="scale(1,-1)" fill="currentColor" fillRule="evenodd">
          {placed.map((p, i) => (
            <path key={i} d={p.g.path}
                  transform={`translate(${p.x0.toFixed(4)},${p.y0.toFixed(4)})`} />
          ))}
        </g>
      </svg>
    </button>
  )
}
