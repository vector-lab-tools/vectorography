import { useMemo } from "react"
import type { Projection } from "../api"
import { Modal } from "./Modal"

/**
 * What the space made of a drawing it did not produce.
 *
 * The location is the easy half and the instrument can already show it. The
 * readings below are the half worth stopping for: how much of the drawing the
 * fitted space could reach, how many of its 128 directions the drawing
 * actually had anything to say about, and whether the result beats assuming
 * the average of Google Fonts on the letters that were never drawn. A
 * completion that cannot beat the average is a completion with nothing in it.
 */
export function ProjectionReport({ result, file, onTravel, onClose }: {
  result: Projection
  file: string
  onTravel: () => void
  onClose: () => void
}) {
  const worst = useMemo(
    () => Object.entries(result.residual)
      .sort((a, b) => b[1] - a[1]).slice(0, 10),
    [result.residual])
  const skill = result.skill?.skill ?? null

  return (
    <Modal title="Projected" subtitle={file} onClose={onClose}>
      <div className="px-5 py-4 space-y-5 overflow-y-auto">
        <p className="text-[13px] leading-relaxed max-w-prose">
          The nearest location the space can offer to {file}, fitted on{" "}
          {result.glyphs.length} letters
          {result.glyphs.length <= 24 && (
            <> (<span className="font-mono">{result.glyphs.join("")}</span>)</>
          )}. What the space cannot reach is below, and is the part worth
          reading.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Figure label="reached"
                  value={`${(result.explained * 100).toFixed(0)}%`}
                  note="of the drawing's departure from the corpus average" />
          <Figure label="left over"
                  value={result.residual_overall.toFixed(4)}
                  note="em, root mean square over the letters fitted" />
          <Figure label="constrained"
                  value={`${result.constrained}/${result.dims}`}
                  note="directions the drawing spoke to; the rest came from the
                        corpus" />
          <Figure
            label="skill"
            value={skill == null ? "—" : `${(skill * 100).toFixed(0)}%`}
            tone={skill != null && skill <= 0 ? "warn" : undefined}
            note={skill == null
              ? "nothing could be held back to test on"
              : `against the corpus average, on ${result.held_out.length}`
                + " letters withheld from the fit"}
          />
        </div>

        <div>
          <span className="rail-label !text-[8px]">
            furthest from what the space can say
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {worst.map(([ch, v]) => (
              <span key={ch}
                    title={`${v.toFixed(4)} em`}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded-sm
                               bg-muted border border-border">
                {ch} <span className="text-muted-foreground">
                  {v.toFixed(3)}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div>
          <span className="rail-label !text-[8px]">
            whose neighbourhood it landed in
          </span>
          <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            {result.neighbours.map((n) => (
              <div key={n.family} className="flex justify-between max-w-xs">
                <span>{n.family}</span>
                <span>{n.distance.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-5 py-3
                      border-t border-border shrink-0">
        <button onClick={onClose}
                className="px-3 py-1.5 rounded-sm border border-border
                           font-mono text-[11px] hover:border-burgundy
                           hover:text-burgundy transition-colors">
          Close
        </button>
        <button onClick={onTravel}
                className="px-3 py-1.5 rounded-sm bg-burgundy text-ivory
                           font-mono text-[11px] hover:opacity-90
                           transition-opacity">
          Travel there
        </button>
      </div>
    </Modal>
  )
}

function Figure({ label, value, note, tone }: {
  label: string; value: string; note: string; tone?: "warn"
}) {
  return (
    <div className="border border-border rounded-sm px-2.5 py-2">
      <span className="rail-label !text-[8px]">{label}</span>
      <div className={`font-display text-[20px] leading-tight
                       ${tone === "warn" ? "text-gold" : ""}`}>
        {value}
      </div>
      <div className="font-mono text-[8px] text-muted-foreground leading-snug
                      mt-0.5">
        {note}
      </div>
    </div>
  )
}
