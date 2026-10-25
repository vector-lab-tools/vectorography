import type { SpacingRow, SpacingSuggestion } from "../api"

/**
 * One letter's sidebearings, in the inspector, where a font editor puts them.
 *
 * Either side takes a number in units or a metrics key, after Glyphs: `=n` is
 * n's own bearing, `=|n` is n's mirrored, `=n+8` is that plus eight units. A
 * key stays true when the letter it points at moves, which is the reason to
 * write one instead of a number.
 *
 * The suggestions come from the sixty families nearest the centroid rather
 * than from all 441. Across the whole corpus m and n agree to only ±17.8
 * units; restricted to the text core m~n holds to ±9.7 and o~c to ±4.1.
 */
export function GlyphMetrics({ char, row, suggestion, spacing, setSpacing,
                              decided, busy, onSuggest }: {
  char: string
  row: SpacingRow | null
  suggestion: SpacingSuggestion | null
  spacing: Record<string, { left?: string; right?: string }>
  setSpacing: (s: Record<string, { left?: string; right?: string }>) => void
  decided: boolean
  busy: boolean
  onSuggest: () => void
}) {
  const set = (side: "left" | "right", value: string) => {
    const next = { ...spacing, [char]: { ...spacing[char], [side]: value } }
    if (!value) delete next[char][side]
    if (!next[char].left && !next[char].right) delete next[char]
    setSpacing(next)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {(["left", "right"] as const).map((side) => (
          <label key={side} className="block">
            <span className="rail-label !text-[8px] block mb-0.5">{side}</span>
            <input
              value={spacing[char]?.[side] ?? ""}
              onChange={(e) => set(side, e.target.value)}
              spellCheck={false}
              placeholder={row ? String(row[side]) : ""}
              className="w-full min-w-0 font-mono text-[11px] bg-background
                         border border-border rounded-sm px-1.5 py-1
                         tabular-nums focus:outline-none
                         focus:border-burgundy"
              title={"A number in units, or a key: =n, =|n, =n+8, =|"} />
          </label>
        ))}
        <label className="block">
          <span className="rail-label !text-[8px] block mb-0.5">width</span>
          <input
            value={row ? String(row.advance) : ""}
            readOnly
            className="w-full min-w-0 font-mono text-[11px] bg-muted/60 border
                       border-border rounded-sm px-1.5 py-1 tabular-nums
                       text-muted-foreground"
            title="The advance that follows from the two bearings" />
        </label>
      </div>

      {spacing[char] && row && (
        <p className="font-mono text-[10px] text-muted-foreground">
          {`natural ${row.natural_left} · ${row.natural_right}`}
          <button onClick={() => {
                    const next = { ...spacing }
                    delete next[char]
                    setSpacing(next)
                  }}
                  className="ml-2 text-burgundy hover:underline">
            drop the override
          </button>
        </p>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="rail-label !text-[8px]">what the corpus writes</span>
          <button onClick={onSuggest} disabled={busy}
                  className="font-mono text-[10px] text-burgundy
                             hover:underline disabled:opacity-40">
            {busy ? "asking…" : "ask"}
          </button>
        </div>
        {suggestion
          ? (["left", "right"] as const).map((side) => (
              <div key={side} className="mt-1 flex items-baseline gap-1.5
                                         flex-wrap">
                <span className="font-mono text-[9px] text-muted-foreground
                                 w-7">{side === "left" ? "L" : "R"}</span>
                {(suggestion[side] ?? []).slice(0, 3).map((s) => (
                  <button key={s.key} onClick={() => set(side, s.key)}
                          title={`Held to within ${s.spread} units across the `
                            + "sixty families nearest the middle"}
                          className="font-mono text-[10px] px-1 py-0.5
                                     rounded-sm border border-border
                                     hover:border-burgundy
                                     hover:text-burgundy transition-colors">
                    {s.key}
                    <span className="opacity-60">{` ±${s.spread}`}</span>
                  </button>
                ))}
                {!(suggestion[side] ?? []).length && (
                  <span className="font-mono text-[10px]
                                   text-muted-foreground">
                    nothing held steady enough
                  </span>
                )}
              </div>
            ))
          : (
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              A key per side, with how steadily it held across the text core.
            </p>
          )}
      </div>

      {decided && (
        <p className="font-mono text-[10px] text-burgundy">
          {"decided · moves no longer disturb this letter"}
        </p>
      )}
    </div>
  )
}
