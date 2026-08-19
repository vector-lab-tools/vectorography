import { useState } from "react"
import type { CorpusInfo } from "../api"

export type Ride = { a: string; b: string; vec: number[] } | null
export type Orbit = { name: string; z: number[] } | null

/**
 * Modes of travel. Every control here is a movement; none of them produces a
 * result from a description. There is no generate button because there is
 * nothing to generate: the letterforms are already everywhere in the space,
 * and the work is getting to them.
 */
export function TravelBar({
  corpus, radius, setRadius, temperature, setTemperature, step, setStep,
  axX, axY, axZ, setAxes, overlap, ride, orbit, onDrift, onRepel, onOrbit,
  onSetRide, onClearRide, onSetOrbit, onClearOrbit, busy,
}: {
  corpus: CorpusInfo | null
  radius: number; setRadius: (v: number) => void
  temperature: number; setTemperature: (v: number) => void
  step: number; setStep: (v: number) => void
  axX: string; axY: string; axZ: string
  setAxes: (x: string, y: string, z: string) => void
  overlap: { y_on_x: number; z_on_plane: number } | null
  ride: Ride; orbit: Orbit
  onDrift: () => void; onRepel: () => void; onOrbit: () => void
  onSetRide: (a: string, b: string) => void; onClearRide: () => void
  onSetOrbit: (name: string) => void; onClearOrbit: () => void
  busy: boolean
}) {
  const [a, setA] = useState("")
  const [b, setB] = useState("")
  const [o, setO] = useState("")
  const evr = corpus?.explained_variance ?? []
  const dirs = corpus?.directions ?? []

  return (
    <div className="w-full min-w-0 flex flex-wrap items-end gap-x-3 gap-y-2
                    overflow-hidden rounded-md border border-border/60
                    bg-muted/25 px-2.5 py-2 text-muted-foreground">
      <Slider label="radius" value={radius} min={0.05} max={3} step={0.05}
              onChange={setRadius}
              title={"How far one compass step travels, in whitened units. "
                + "The corpus median sits about 7 from the centre."} />

      <div className="flex items-end gap-2">
        <button className="btn" onClick={onDrift} disabled={busy}
                title="Random walk, scaled by temperature">Drift</button>
        <Slider label="temp" value={temperature} min={0.05} max={2.5} step={0.05}
                onChange={setTemperature} width="w-24"
                title="How far a drift wanders on each step" />
      </div>

      <div className="flex items-end gap-2">
        <button className="btn border-gold text-gold hover:bg-gold/10"
                onClick={onRepel} disabled={busy}
                title="Step directly against the local density gradient">
          Repel
        </button>
        <Slider label="step" value={step} min={0.1} max={2.5} step={0.05}
                onChange={setStep} width="w-24"
                title="How far one repel moves against the crowd" />
      </div>

      {/* the heading plane is a choice, so the choice is shown */}
      <div>
        <div className="rail-label !text-[8px] mb-0.5"
             title={"The three directions the map and the compass work in. "
               + "Each is either a corpus eigendirection or a measured "
               + "property."}>
          axes{" "}
          {overlap && overlap.y_on_x > 0.3 && (
            <span className="text-gold normal-case tracking-normal"
                  title={"These two properties overlap: the corpus varies in "
                    + "both together. The second axis is drawn with the shared "
                    + "part removed, so it shows what it adds to the first."}>
              · {(overlap.y_on_x * 100).toFixed(0)}% shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <AxisPick value={axX} dirs={dirs} evr={evr} disabled={!!ride}
                    title={ride
                      ? "Held by the ride: east and west follow the heading "
                        + "until you release it"
                      : "What east and west mean, on the map and on the compass"}
                    onChange={(v) => setAxes(v, axY, axZ)} />
          <span className="font-mono text-[10px] text-muted-foreground">x</span>
          <AxisPick value={axY} dirs={dirs} evr={evr}
                    title={"What north and south mean, on the map and on the "
                      + "compass"}
                    onChange={(v) => setAxes(axX, v, axZ)} />
          <span className="font-mono text-[10px] text-muted-foreground">x</span>
          <AxisPick value={axZ} dirs={dirs} evr={evr}
                    title={"What depth means: the direction into and out of "
                      + "the screen"}
                    onChange={(v) => setAxes(axX, axY, v)} />
        </div>
      </div>

      <div>
        <div className="rail-label !text-[8px] mb-0.5"
             title={ride
               ? `Holding the heading from ${ride.a} to ${ride.b}. The compass `
                 + "now steps along it from wherever you are."
               : "Take the difference between two real families as a heading, "
                 + "and steer by it from anywhere in the space"}>
          ride {ride && <span className="text-burgundy">· {ride.a} → {ride.b}</span>}
        </div>
        {ride ? (
          <button className="btn btn-active" onClick={onClearRide}
                  title="Give the compass its own axes back">
            Release heading
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <FamilyInput value={a} onChange={setA} corpus={corpus} placeholder="from"
                         title="The family the heading starts at" />
            <span className="font-mono text-[10px] text-muted-foreground">→</span>
            <FamilyInput value={b} onChange={setB} corpus={corpus} placeholder="to"
                         title="The family it points towards" />
            <button className="btn" disabled={!a || !b || busy}
                    onClick={() => onSetRide(a, b)}
                    title="Make B minus A a compass heading usable from anywhere">
              Set
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="rail-label !text-[8px] mb-0.5"
             title={orbit
               ? `Circling ${orbit.name} at your present distance from it`
               : "Circle a family at a fixed distance, to see what sits at the "
                 + "same remove from it in every direction"}>
          orbit {orbit && <span className="text-burgundy">· {orbit.name}</span>}
        </div>
        {orbit ? (
          <div className="flex gap-1">
            <button className="btn btn-active" onClick={onOrbit} disabled={busy}
                    title="Swing twenty degrees around it, keeping your distance">
              Orbit +20°
            </button>
            <button className="btn" onClick={onClearOrbit}
                    title="Stop circling and travel freely again">Release</button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <FamilyInput value={o} onChange={setO} corpus={corpus} placeholder="family"
                         title="The family to circle" />
            <button className="btn" disabled={!o || busy} onClick={() => onSetOrbit(o)}
                    title="Fix it as the centre of the orbit">
              Lock
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A view axis: a property somebody measured, or a direction the corpus varies
 * in most. Naming both in one list is the point, since choosing between them is
 * choosing whether to move through the space by a name or by its own structure.
 */
function AxisPick({ value, dirs, evr, onChange, disabled, title }: {
  value: string
  dirs: { key: string; label: string; minus: string; plus: string }[]
  evr: number[]
  onChange: (v: string) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono text-[10px] bg-card border border-border rounded-sm
                 px-1 py-1.5 max-w-[92px] disabled:opacity-40"
    >
      <optgroup label="measured">
        {dirs.map((d) => (
          <option key={d.key} value={`dir:${d.key}`}>
            {d.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="corpus axes">
        {evr.map((v, i) => (
          <option key={i} value={`axis:${i}`}>
            {i + 1} · {(v * 100).toFixed(1)}%
          </option>
        ))}
      </optgroup>
    </select>
  )
}

function FamilyInput({ value, onChange, corpus, placeholder, title }: {
  value: string; onChange: (v: string) => void
  corpus: CorpusInfo | null; placeholder: string; title?: string
}) {
  return (
    <>
      <input
        list="vg-families"
        value={value}
        placeholder={placeholder}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-[11px] w-20 min-w-0 bg-card border border-border
                   rounded-sm px-1.5 py-1.5"
      />
      <datalist id="vg-families">
        {corpus?.families.map((f) => <option key={f} value={f} />)}
      </datalist>
    </>
  )
}

function Slider({ label, value, min, max, step, onChange, width = "w-28",
                 title }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; width?: string; title?: string
}) {
  // The title goes on the track and the label as well as the box around them.
  // A range input is a shadow tree, and hovering the thumb does not always
  // reach an ancestor's tooltip.
  return (
    <div title={title}>
      <div className="rail-label !text-[8px] mb-0.5" title={title}>
        {label} <span className="text-foreground">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             title={title}
             onChange={(e) => onChange(Number(e.target.value))}
             className={`${width} accent-burgundy`} />
    </div>
  )
}
