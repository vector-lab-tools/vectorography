import { useMemo } from "react"
import type { Glyph, SpacingRow, SpacingSuggestion } from "../api"
import { LINE_H, layout } from "./handles"

/**
 * Spacing, against a string, with a number under every letter.
 *
 * After RoboFont's Space Center and the sidebearing fields in Glyphs and
 * FontLab. A designer does not space a glyph on its own: they set `nnoonn` or
 * `HHOOHH` and look at the rhythm, and the numbers are there to be typed into
 * once the eye has decided.
 *
 * A field takes a number in units, or a key. `=n` on the left of `m` means
 * *mine equals n's*, and it stays true when `n` moves, which is the thing the
 * craft actually wants to say: two letters begin the same way, and the number
 * is a consequence. `=|n` takes n's other side, `=n+8` adds, and `=|` mirrors
 * within the same glyph.
 *
 * What this adds to the editors it is copied from is the suggestion. A key has
 * to be chosen, and the corpus has an opinion worth hearing: across the sixty
 * families nearest the middle of the space, `o` and `c` agree on their left
 * sidebearing to within four units and `m` and `o` do not. Each offer carries
 * how steadily it held, so a key can be taken or refused on evidence.
 */
export function SpaceCenter({ text, setText, glyphs, rows, suggestions,
                             spacing, setSpacing, onSuggest, busy, onClose }: {
  text: string
  setText: (t: string) => void
  glyphs: Glyph[]
  rows: SpacingRow[]
  suggestions: Record<string, SpacingSuggestion> | null
  spacing: Record<string, { left?: string; right?: string }>
  setSpacing: (s: Record<string, { left?: string; right?: string }>) => void
  onSuggest: () => void
  busy: boolean
  onClose?: () => void
}) {
  const by = useMemo(() => {
    const m: Record<string, SpacingRow> = {}
    for (const r of rows) m[r.char] = r
    return m
  }, [rows])

  const placed = useMemo(() => layout(glyphs, text), [glyphs, text])
  const width = placed.reduce((w, p) => Math.max(w, p.x0 + p.g.advance), 0.5)

  const set = (ch: string, side: "left" | "right", value: string) => {
    const next = { ...spacing, [ch]: { ...spacing[ch], [side]: value } }
    if (!value) delete next[ch][side]
    if (!next[ch].left && !next[ch].right) delete next[ch]
    setSpacing(next)
  }

  // One column per distinct letter in the string, in the order it first
  // appears, because a letter is spaced once however often it is set.
  const columns = useMemo(
    () => [...new Set([...text])].filter((c) => by[c]), [text, by])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-1 pb-1.5 shrink-0 flex-wrap">
        <span className="rail-label">Spacing</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="font-mono text-[11px] w-44 px-2 py-1 rounded-sm
                     bg-background border border-ink/25 focus:outline-none
                     focus:border-burgundy"
          title="The string you are spacing against"
        />
        {["nnoonn", "HHOOHH", "nonbnpn", "HOHOHO"].map((t) => (
          <button key={t} onClick={() => setText(t)}
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm border
                        transition-colors ${text === t
                          ? "border-burgundy text-burgundy"
                          : "border-border text-muted-foreground"}`}>
            {t}
          </button>
        ))}
        <button onClick={onSuggest} disabled={busy}
          title={"Ask the sixty families nearest the middle of the space "
            + "which letter each one should take its sidebearing from"}
          className="text-[11px] px-2 py-0.5 rounded-sm border border-border
                     hover:border-burgundy hover:text-burgundy
                     disabled:opacity-40 transition-colors">
          {busy ? "reading the corpus…" : "Suggest keys"}
        </button>
        {onClose && (
          <button onClick={onClose} title="Put the spacing away"
                  className="ml-auto font-mono text-[11px] leading-none px-1
                             text-muted-foreground hover:text-foreground
                             transition-colors">
            ×
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {/* The string, set. Sidebearings are judged by the rhythm of this
            and then typed; the numbers below are not the instrument. */}
        <svg viewBox={`0 ${-0.85} ${width} ${LINE_H}`}
             height={76} width="100%"
             preserveAspectRatio="xMinYMid meet"
             className="block text-ink">
          <g transform="scale(1,-1)" fill="currentColor" fillRule="evenodd">
            {placed.map((p, i) => (
              <path key={i} d={p.g.path}
                    transform={`translate(${p.x0.toFixed(4)},0)`} />
            ))}
          </g>
        </svg>

        <div className="mt-2 flex gap-2 flex-wrap">
          {columns.map((ch) => {
            const r = by[ch]
            const s = suggestions?.[ch]
            return (
              <div key={ch}
                   className="border border-border rounded-sm px-2 py-1.5
                              min-w-[128px]">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[13px]">{ch}</span>
                  <span className="font-mono text-[9px] text-muted-foreground
                                   tabular-nums">
                    {r.advance}
                  </span>
                </div>
                {(["left", "right"] as const).map((side) => (
                  <div key={side} className="mt-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground w-7">
                        {side === "left" ? "L" : "R"}
                      </span>
                      <input
                        value={(spacing[ch]?.[side] ?? "") as string}
                        placeholder={String(
                          side === "left" ? r.left : r.right)}
                        onChange={(e) => set(ch, side, e.target.value)}
                        spellCheck={false}
                        title={"A number in units, or a key: =n, =|n, =n+8, =|"}
                        className="w-full min-w-0 font-mono text-[10px] px-1
                                   py-0.5 rounded-sm bg-background border
                                   border-ink/20 focus:outline-none
                                   focus:border-burgundy tabular-nums"
                      />
                    </div>
                    {s?.[side]?.length ? (
                      <div className="flex gap-1 mt-0.5 ml-8 flex-wrap">
                        {s[side].map((o) => (
                          <button key={o.key}
                            onClick={() => set(ch, side, o.key)}
                            title={`Held to within ${o.spread} units across the sample`}
                            className="font-mono text-[9px] px-1 rounded-sm
                                       border border-border
                                       text-muted-foreground
                                       hover:border-burgundy
                                       hover:text-burgundy transition-colors">
                            {o.key}
                            <span className="opacity-60"> ±{o.spread}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
