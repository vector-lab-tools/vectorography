import { useMemo } from "react"
import type { Glyph } from "../api"

/**
 * The whole character set at this location, after the Font View.
 *
 * Every font editor opens on one: Glyphs calls it Font View and makes it the
 * first tab of every window, RoboFont puts it down the left of the canvas.
 * It is where a designer finds out what they have, which letters have been
 * decided and which have not, and where the work is uneven. This instrument
 * had a specimen of whatever word was typed and no way to see the other
 * hundred and fifty glyphs at all.
 *
 * Every cell is drawn in the same vertical frame, so the baselines line up
 * across the grid and the x-heights and cap-heights can be read down a column.
 * Cells sized to their own ink would each look correct and the set would look
 * like nothing in particular.
 */

/** Ascender to descender, in font coordinates: the frame every cell shares. */
const TOP = 0.86
const BOTTOM = -0.26

type Group = { name: string; chars: string }

function groupOf(ch: string): string {
  if (/[0-9]/.test(ch)) return "Numbers"
  if (/[A-Z]/.test(ch)) return "Capitals"
  if (/[a-z]/.test(ch)) return "Lowercase"
  if (/[À-Þ]/.test(ch)) return "Accented capitals"
  if (/[ß-ÿ]/.test(ch)) return "Accented lowercase"
  if (/[£€$]/.test(ch)) return "Currency"
  return "Punctuation and symbols"
}

const ORDER = ["Lowercase", "Capitals", "Accented lowercase",
               "Accented capitals", "Numbers", "Currency",
               "Punctuation and symbols"]

export function CharacterSet({ glyphs, settled, spacing, onPick,
                               onToggleSettled, busy }: {
  glyphs: Glyph[]
  settled: string[]
  spacing: Record<string, { left?: string; right?: string }>
  /** Put this character in the specimen, which is how you look at one. */
  onPick: (ch: string) => void
  onToggleSettled: (ch: string) => void
  busy: boolean
}) {
  const held = useMemo(() => new Set(settled), [settled])
  const groups = useMemo<Group[]>(() => {
    const by: Record<string, string> = {}
    for (const g of glyphs) {
      const k = groupOf(g.char)
      by[k] = (by[k] ?? "") + g.char
    }
    return ORDER.filter((n) => by[n])
      .map((name) => ({ name, chars: by[name] }))
  }, [glyphs])
  const byChar = useMemo(() => {
    const m: Record<string, Glyph> = {}
    for (const g of glyphs) m[g.char] = g
    return m
  }, [glyphs])

  if (!glyphs.length) {
    return (
      <div className="h-full grid place-items-center text-[11px]
                      text-muted-foreground">
        {busy ? "drawing the character set…" : "nothing to show"}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g.name} className="mb-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="rail-label">{g.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {g.chars.length}
            </span>
          </div>
          <div className="grid gap-1"
               style={{ gridTemplateColumns:
                 "repeat(auto-fill, minmax(58px, 1fr))" }}>
            {[...g.chars].map((ch) => (
              <Cell key={ch} ch={ch} glyph={byChar[ch]}
                    settled={held.has(ch)}
                    spaced={!!spacing[ch]}
                    onPick={() => onPick(ch)}
                    onSettle={() => onToggleSettled(ch)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Cell({ ch, glyph, settled, spaced, onPick, onSettle }: {
  ch: string
  glyph: Glyph
  settled: boolean
  spaced: boolean
  onPick: () => void
  onSettle: () => void
}) {
  const w = Math.max(glyph.advance, 0.2)
  return (
    <button
      onClick={(e) => (e.shiftKey ? onSettle() : onPick())}
      title={`${ch} · U+${ch.codePointAt(0)!.toString(16).toUpperCase()
        .padStart(4, "0")}\nClick to set the specimen in it. `
        + `Shift-click to ${settled ? "unsettle" : "settle"} it.`}
      className={`relative rounded-sm border px-1 pt-1 pb-0.5 text-ink
                  transition-colors hover:border-burgundy
                  ${settled ? "border-burgundy/60 bg-burgundy/5"
                            : "border-border"}`}
    >
      <svg viewBox={`${-w * 0.08} ${-TOP} ${w * 1.16} ${TOP - BOTTOM}`}
           width="100%" height={34} preserveAspectRatio="xMidYMax meet"
           style={{ display: "block" }}>
        <g transform="scale(1,-1)" fill="currentColor" fillRule="evenodd">
          <path d={glyph.path} />
        </g>
      </svg>
      <div className="flex items-center justify-center gap-0.5 mt-0.5">
        <span className="font-mono text-[8px] text-muted-foreground">
          {ch === " " ? "sp" : ch}
        </span>
        {/* A letter whose spacing has been set says so, since nothing in the
            drawing shows it and the grid is where a gap in the work is
            supposed to be visible. */}
        {spaced && (
          <span className="w-1 h-1 rounded-full bg-burgundy"
                title="Spacing set on this glyph" />
        )}
      </div>
    </button>
  )
}
