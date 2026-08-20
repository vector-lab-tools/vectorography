import { useState } from "react"
import { Modal } from "./Modal"
import { TERMS } from "./Licence"
import { PROPS } from "./SpecimenStage"
import type { HandleKind } from "./handles"

export type Theme = "system" | "light" | "dark"
export const THEME_KEY = "vg.theme"
export const TEXT_KEY = "vg.text"
export const GUIDE_KEY = "vg.guide.ink"
export const INK_KEY = "vg.specimen.ink"
export const GUIDE_STYLE_KEY = "vg.guide.style"

export type GuideStyle = "solid" | "dashed" | "dotted" | "hair"

/** Dash pattern and weight for each, in the specimen's own em units. */
export const GUIDE_STROKE: Record<GuideStyle, { w: number; dash?: string }> = {
  solid: { w: 0.004 },
  dashed: { w: 0.004, dash: "0.03 0.02" },
  dotted: { w: 0.005, dash: "0.001 0.014" },
  hair: { w: 0.0018 },
}

/** A few inks that hold up on both grounds, and the theme's own. */
export const INKS: [string, string][] = [
  ["auto", "Follows the theme"],
  ["#1a1a1a", "Black"],
  ["#7c2d36", "Burgundy"],
  ["#2f4858", "Slate"],
  ["#3a5a40", "Green"],
  ["#8a6d1f", "Gold"],
  ["#5b3a8a", "Violet"],
]

function Field({ label, note, children }: {
  label: string; note?: string; children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 items-baseline py-1.5
                    border-b border-border/40 last:border-0">
      <div>
        <span className="rail-label !text-[8px] block">{label}</span>
        {note && (
          <span className="block text-[9px] leading-snug
                           text-muted-foreground/80 mt-0.5">{note}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

const SELECT = "font-mono text-[11px] bg-card border border-border "
             + "rounded-sm px-1.5 py-1"

/**
 * The choices that outlast a session.
 *
 * Anything here is remembered; anything on the stage toolbar is a thing you
 * flip while working. The theme in particular was not being kept at all, so
 * every reload put a dark room back into daylight.
 */
export function Settings({
  theme, setTheme, defaultText, setDefaultText, ballOn, setBallOn,
  licence, setLicence, onForget, onClose,
  xProp, yProp, zProp, setProps, guideInk, setGuideInk, ink, setInk,
  guideStyle, setGuideStyle, inline = false,
}: {
  theme: Theme
  setTheme: (t: Theme) => void
  defaultText: string
  setDefaultText: (t: string) => void
  ballOn: boolean
  setBallOn: (v: boolean) => void
  licence: { id: string; author: string }
  setLicence: (v: { id: string; author: string }) => void
  onForget: () => void
  onClose: () => void
  xProp: HandleKind
  yProp: HandleKind
  zProp: HandleKind
  setProps: (x: HandleKind, y: HandleKind, z: HandleKind) => void
  guideInk: number
  setGuideInk: (v: number) => void
  /** The specimen's colour: a hex, or "auto" for the theme's own ink. */
  ink: string
  setInk: (v: string) => void
  guideStyle: GuideStyle
  setGuideStyle: (v: GuideStyle) => void
  /** Shown in place, as one of the phone's tabs, rather than over the work. */
  inline?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <Modal title="Clear settings" onClose={() => setConfirming(false)}
             subtitle="This cannot be undone">
        <p className="text-[12px] leading-relaxed">
          Every remembered choice goes back to its default: the theme, the
          opening text, the licence and copyright holder, the corpus shell,
          and where the stage toolbar sits.
        </p>
        <p className="text-[12px] leading-relaxed mt-2">
          The journey you are on is not touched, and nothing already saved to
          a file is either.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirming(false)}>
            Keep them
          </button>
          <button
            className="btn border-burgundy bg-burgundy text-ivory
                       hover:bg-burgundy/90"
            onClick={() => { onForget(); setConfirming(false); onClose() }}>
            Clear settings
          </button>
        </div>
      </Modal>
    )
  }

  const body = (
    <>
      <div className={`${inline ? "flex-1 min-h-0" : "max-h-[58vh]"}
                       overflow-y-auto pr-2 space-y-3.5`}>
        <section>
          <h3 className="font-display text-[13px] mb-0.5">Appearance</h3>
          <Field label="Theme"
                 note="System follows the one your machine is set to">
            <select className={SELECT} value={theme}
                    onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </section>

        <section>
          <h3 className="font-display text-[13px] mb-0.5">Specimen and map</h3>
          <Field label="Opening text"
                 note="What the specimen is set in when the app starts">
            <input value={defaultText}
                   onChange={(e) => setDefaultText(e.target.value)}
                   placeholder="Hamburgefonstiv"
                   className="font-mono text-[11px] w-full bg-background
                              border border-border rounded-sm px-2 py-1" />
          </Field>
          <Field label="Specimen colour"
                 note="What the letters are drawn in. Auto follows the theme,
                       so the type stays readable when the ground changes">
            <span className="flex items-center gap-1.5 flex-wrap">
              {INKS.map(([value, name]) => (
                <button key={value} onClick={() => setInk(value)}
                        title={name}
                        aria-label={name}
                        className={`w-6 h-6 rounded-sm border-2 transition-colors
                                    flex items-center justify-center
                                    ${ink === value ? "border-burgundy"
                                                    : "border-border"}`}
                        style={value === "auto" ? undefined
                                                : { background: value }}>
                  {value === "auto" && (
                    <span className="font-mono text-[8px]
                                     text-muted-foreground">A</span>
                  )}
                </button>
              ))}
              <input type="color"
                     value={ink === "auto" ? "#1a1a1a" : ink}
                     onChange={(e) => setInk(e.target.value)}
                     title="Any colour"
                     className="w-6 h-6 p-0 bg-transparent border border-border
                                rounded-sm cursor-pointer" />
            </span>
          </Field>
          <Field label="Guides"
                 note="Baseline, x-height and cap behind the letters, and the
                       shell in perspective">
            <span className="flex flex-col gap-1.5">
              {/* The setting, drawn. A number from one to ten says nothing
                  about what a guide will look like against a letter. */}
              <svg viewBox="0 0 120 34" className="w-full h-[34px] border
                                                   border-border rounded-sm
                                                   bg-background">
                <g stroke="hsl(var(--ink))" strokeOpacity={guideInk}
                   strokeWidth={GUIDE_STROKE[guideStyle].w * 250}
                   strokeDasharray={GUIDE_STROKE[guideStyle].dash
                     ? GUIDE_STROKE[guideStyle].dash!.split(" ")
                         .map((n) => +n * 250).join(" ")
                     : undefined}
                   strokeLinecap={guideStyle === "dotted" ? "round" : "butt"}>
                  <line x1="4" x2="116" y1="27" y2="27" />
                  <line x1="4" x2="116" y1="16" y2="16" />
                  <line x1="4" x2="116" y1="7" y2="7" />
                </g>
                <text x="8" y="27" fontSize="20" fontFamily="Georgia, serif"
                      fill="currentColor">Hxn</text>
              </svg>
              <span className="flex items-center gap-1 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => (i + 1) / 10).map((v) => (
                  <button key={v} onClick={() => setGuideInk(v)}
                          title={`${Math.round(v * 100)} per cent`}
                          className={`w-5 h-5 rounded-sm border font-mono
                                      text-[8px] transition-colors
                                      ${Math.abs(guideInk - v) < 0.05
                                        ? "border-burgundy text-burgundy"
                                        : "border-border text-muted-foreground"}`}>
                    {Math.round(v * 10)}
                  </button>
                ))}
              </span>
              <span className="flex items-center gap-1 flex-wrap">
                {(["solid", "dashed", "dotted", "hair"] as GuideStyle[])
                  .map((g) => (
                  <button key={g} onClick={() => setGuideStyle(g)}
                          className={`font-mono text-[9px] px-1.5 py-0.5
                                      rounded-sm border transition-colors
                                      ${guideStyle === g
                                        ? "border-burgundy text-burgundy"
                                        : "border-border text-muted-foreground"}`}>
                    {g}
                  </button>
                ))}
              </span>
            </span>
          </Field>
          <Field label="Corpus shell"
                 note="The dashed sphere the corpus is fitted to">
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={ballOn} className="accent-burgundy"
                     onChange={(e) => setBallOn(e.target.checked)} />
              Draw it in the atlas
            </label>
          </Field>
        </section>

        <section>
          <h3 className="font-display text-[13px] mb-0.5">Dragging the specimen</h3>
          <p className="text-[10px] text-muted-foreground leading-snug mb-1.5">
            In modifier and perspective the whole word is one control: these
            say which property each direction of the hand moves. Handles mode
            ignores them, since there the letter decides.
          </p>
          {([["\u2194 Sideways", xProp, 0],
             ["\u2195 Up and down", yProp, 1],
             ["\u2316 The third property", zProp, 2]] as const)
            .map(([label, val, slot]) => (
            <Field key={slot} label={label}
                   note={slot === 2
                     ? "Wheel while dragging, or the fader on a touchscreen"
                     : ""}>
              <select className={SELECT} value={val}
                      onChange={(e) => {
                        const v = e.target.value as HandleKind
                        setProps(slot === 0 ? v : xProp,
                                 slot === 1 ? v : yProp,
                                 slot === 2 ? v : zProp)
                      }}>
                {PROPS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
          ))}
        </section>

        <section>
          <h3 className="font-display text-[13px] mb-0.5">Exports</h3>
          <Field label="Licence"
                 note="Written into the name table of every font you compile">
            <select className={SELECT} value={licence.id}
                    onChange={(e) =>
                      setLicence({ ...licence, id: e.target.value })}>
              {TERMS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Copyright holder"
                 note="Goes into the copyright and designer fields">
            <input value={licence.author}
                   onChange={(e) =>
                     setLicence({ ...licence, author: e.target.value })}
                   placeholder="your name, or leave empty"
                   className="font-mono text-[11px] w-full bg-background
                              border border-border rounded-sm px-2 py-1" />
          </Field>
        </section>

        <div className="mt-10 pt-4 border-t-2 border-border flex items-baseline
                        justify-between gap-3 flex-wrap">
        <span className="text-[10px] text-muted-foreground">
          Nothing here leaves this machine. There is no account and no
          telemetry.
        </span>
        <button className="btn border-burgundy/60 text-burgundy
                           hover:bg-burgundy/10"
                onClick={() => setConfirming(true)}
                title={"Clear every remembered choice, including the toolbar's "
                  + "position, and start from the defaults"}>
          Clear settings
        </button>
        </div>
      </div>
    </>
  )

  if (inline) return <div className="h-full flex flex-col">{body}</div>

  return (
    <Modal title="Settings" onClose={onClose}
           subtitle="Kept between sessions, on this machine only">
      {body}
    </Modal>
  )
}
