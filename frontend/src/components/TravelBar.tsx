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
  axisA, axisB, setPlane, ride, orbit, onDrift, onRepel, onOrbit,
  onSetRide, onClearRide, onSetOrbit, onClearOrbit, busy,
}: {
  corpus: CorpusInfo | null
  radius: number; setRadius: (v: number) => void
  temperature: number; setTemperature: (v: number) => void
  step: number; setStep: (v: number) => void
  axisA: number; axisB: number; setPlane: (a: number, b: number) => void
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

  return (
    <div className="panel p-3 flex flex-wrap items-end gap-x-4 gap-y-3 overflow-hidden">
      <Slider label="radius" value={radius} min={0.05} max={3} step={0.05}
              onChange={setRadius} />

      <div className="flex items-end gap-2">
        <button className="btn" onClick={onDrift} disabled={busy}
                title="Random walk, scaled by temperature">Drift</button>
        <Slider label="temp" value={temperature} min={0.05} max={2.5} step={0.05}
                onChange={setTemperature} width="w-24" />
      </div>

      <div className="flex items-end gap-2">
        <button className="btn border-gold text-gold hover:bg-gold/10"
                onClick={onRepel} disabled={busy}
                title="Step directly against the local density gradient">
          Repel
        </button>
        <Slider label="step" value={step} min={0.1} max={2.5} step={0.05}
                onChange={setStep} width="w-24" />
      </div>

      {/* the heading plane is a choice, so the choice is shown */}
      <div>
        <div className="rail-label mb-1">heading plane</div>
        <div className="flex items-center gap-1">
          <AxisPick value={axisA} evr={evr} onChange={(v) => setPlane(v, axisB)}
                    disabled={!!ride} />
          <span className="font-mono text-[10px] text-muted-foreground">x</span>
          <AxisPick value={axisB} evr={evr} onChange={(v) => setPlane(axisA, v)} />
        </div>
      </div>

      <div>
        <div className="rail-label mb-1">
          ride {ride && <span className="text-burgundy">· {ride.a} → {ride.b}</span>}
        </div>
        {ride ? (
          <button className="btn btn-active" onClick={onClearRide}>
            Release heading
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <FamilyInput value={a} onChange={setA} corpus={corpus} placeholder="from" />
            <span className="font-mono text-[10px] text-muted-foreground">→</span>
            <FamilyInput value={b} onChange={setB} corpus={corpus} placeholder="to" />
            <button className="btn" disabled={!a || !b || busy}
                    onClick={() => onSetRide(a, b)}
                    title="Make B minus A a compass heading usable from anywhere">
              Set
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="rail-label mb-1">
          orbit {orbit && <span className="text-burgundy">· {orbit.name}</span>}
        </div>
        {orbit ? (
          <div className="flex gap-1">
            <button className="btn btn-active" onClick={onOrbit} disabled={busy}>
              Orbit +20°
            </button>
            <button className="btn" onClick={onClearOrbit}>Release</button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <FamilyInput value={o} onChange={setO} corpus={corpus} placeholder="family" />
            <button className="btn" disabled={!o || busy} onClick={() => onSetOrbit(o)}>
              Lock
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AxisPick({ value, evr, onChange, disabled }: {
  value: number; evr: number[]; onChange: (v: number) => void; disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="font-mono text-[11px] bg-card border border-border rounded-sm
                 px-1.5 py-1.5 disabled:opacity-40"
    >
      {evr.map((v, i) => (
        <option key={i} value={i}>
          {i + 1} · {(v * 100).toFixed(1)}%
        </option>
      ))}
    </select>
  )
}

function FamilyInput({ value, onChange, corpus, placeholder }: {
  value: string; onChange: (v: string) => void
  corpus: CorpusInfo | null; placeholder: string
}) {
  return (
    <>
      <input
        list="vg-families"
        value={value}
        placeholder={placeholder}
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

function Slider({ label, value, min, max, step, onChange, width = "w-28" }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; width?: string
}) {
  return (
    <div>
      <div className="rail-label mb-1">
        {label} <span className="text-foreground">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             className={`${width} accent-burgundy`} />
    </div>
  )
}
