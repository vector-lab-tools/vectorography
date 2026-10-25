import type { NamedDirection } from "../api"
import { handleColour } from "./handleColours"
import type { HandleKind } from "./handles"

/**
 * Where the type stands on each measured property, and a handle to move it.
 *
 * A slider needs a position, and a position in a 128-dimensional space is not a
 * number. What it does have is a projection: how far along the weight direction
 * this location sits, against how far the corpus itself runs. So the slider
 * reads the projection and setting it travels along that one direction until
 * the projection matches. The ends are the corpus's own 2nd and 98th
 * percentiles; past them the track is still there and the type keeps changing,
 * but there are no real families left to interpolate toward and the outlines
 * start to guess.
 */
export function DirectionPad({ directions, at, onSlide, onCommit, busy,
                               locks, setLocks, isolate, setIsolate }: {
  directions: NamedDirection[]
  /** Current projection along each direction, keyed by property. */
  at: Record<string, number>
  onSlide: (key: string, value: number) => void
  onCommit: () => void
  busy: boolean
  /** Properties held while any other is moved. */
  locks: string[]
  setLocks: (k: string[]) => void
  /** Hold every other property for the length of a gesture. */
  isolate: boolean
  setIsolate: (v: boolean) => void
}) {
  const flip = (key: string) =>
    setLocks(locks.includes(key) ? locks.filter((k) => k !== key)
                                 : [...locks, key])

  return (
    <div>
      {/* The eight directions were fitted off the corpus and are not
          orthogonal to one another, so a step along one arrives in the others
          as well. Holding the rest is what turns eight handles on one control
          into eight controls. */}
      <label className="flex items-center gap-1.5 mb-1.5 cursor-pointer">
        <input type="checkbox" checked={isolate}
               onChange={(e) => setIsolate(e.target.checked)}
               className="accent-burgundy" />
        <span className="text-[11px]">Twist one at a time</span>
        <span className="font-mono text-[9px] text-muted-foreground ml-auto"
              title={"With this off, only the padlocked properties are held "
                + "and the rest move together as they always did."}>
          {locks.length ? `${locks.length} held` : ""}
        </span>
      </label>
      {/* One line per property: name, track, reading. Stacked over two lines
          each, eight properties did not fit a column and half of them lived
          behind a scrollbar. */}
      <div className="space-y-0.5 max-lg:space-y-1">
        {directions.map((d) => {
          const lo = d.lo ?? -2.2
          const hi = d.hi ?? 2.2
          const pad = (hi - lo) * 0.35
          const now = at[d.key] ?? 0
          const outside = now < lo || now > hi
          return (
            <div key={d.key} className="flex items-center gap-1.5
                                        max-lg:gap-2">
              {/* Held, so that moving anything else leaves this one where it
                  is. Dimmed rather than hidden when isolate is on, since then
                  everything is held for the length of a gesture anyway and a
                  padlock would be saying something already true. */}
              <button
                onClick={() => flip(d.key)}
                title={locks.includes(d.key)
                  ? `${d.label} is held: other properties move without it`
                  : `Hold ${d.label} while other properties move`}
                className={`shrink-0 w-3 text-[9px] leading-none transition-opacity
                            ${locks.includes(d.key)
                              ? "text-burgundy"
                              : "text-muted-foreground opacity-35 hover:opacity-100"}
                            ${isolate ? "opacity-20" : ""}`}>
                {locks.includes(d.key) ? "●" : "○"}
              </button>
              {/* The same colour this property wears on the letterform, so the
                  slider and the grab point read as one control. */}
              <span className="w-[52px] max-lg:w-[58px] shrink-0 truncate
                               text-[10px] max-lg:text-[11px]
                               font-display leading-none"
                    style={{ color: handleColour(d.key as HandleKind, 0.95) }}
                    title={`${d.minus} \u2190 ${d.label} \u2192 ${d.plus}`}>
                {d.label}
              </span>
              <input
                type="range"
                min={lo - pad}
                max={hi + pad}
                step={(hi - lo) / 400}
                value={now}
                disabled={busy}
                onChange={(e) => onSlide(d.key, Number(e.target.value))}
                onPointerUp={onCommit}
                onKeyUp={onCommit}
                className="vg-steer flex-1 min-w-0 h-1 max-lg:h-4 mr-1"
                style={{
                  accentColor: handleColour(d.key as HandleKind),
                  // Drawn rather than left to the browser on a dark ground:
                  // Chrome's own dark track is a mid grey, which against this
                  // navy is the lightest thing in the panel and says nothing.
                  ["--hue" as string]: handleColour(d.key as HandleKind),
                  ["--fill" as string]:
                    `${Math.min(100, Math.max(0,
                      ((now - (lo - pad)) / ((hi + pad) - (lo - pad))) * 100))}%`,
                }}
                title={`${d.minus} to ${d.plus}`}
              />
              <span className={`w-[30px] max-lg:w-[28px] shrink-0 text-right
                                font-mono text-[8.5px] max-lg:text-[10px]
                                leading-none ${outside
                                  ? "text-gold" : "text-muted-foreground"}`}>
                {outside ? "\u00b7\u00b7" : pct(now, lo, hi)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function pct(v: number, lo: number, hi: number) {
  return `${Math.round(((v - lo) / Math.max(hi - lo, 1e-6)) * 100)}`
}
