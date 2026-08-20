import { useState } from "react"
import { Modal } from "./Modal"
import { TERMS } from "./Licence"
import { PROPS } from "./SpecimenStage"
import type { HandleKind } from "./handles"

export type Theme = "system" | "light" | "dark"
export const THEME_KEY = "vg.theme"
export const TEXT_KEY = "vg.text"

function Field({ label, note, children }: {
  label: string; note?: string; children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 items-baseline py-2
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
  xProp, yProp, zProp, setProps,
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

  return (
    <Modal title="Settings" wide onClose={onClose}
           subtitle="Kept between sessions, on this machine only">
      <div className="max-h-[58vh] overflow-y-auto pr-2 space-y-5">
        <section>
          <h3 className="font-display text-[13px] mb-1">Appearance</h3>
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
          <h3 className="font-display text-[13px] mb-1">Specimen and map</h3>
          <Field label="Opening text"
                 note="What the specimen is set in when the app starts">
            <input value={defaultText}
                   onChange={(e) => setDefaultText(e.target.value)}
                   placeholder="Hamburgefonstiv"
                   className="font-mono text-[11px] w-full bg-background
                              border border-border rounded-sm px-2 py-1" />
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
          <h3 className="font-display text-[13px] mb-1">Dragging the specimen</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            In modifier and perspective modes the whole word is one control:
            these say which property each direction of the hand moves. Handles
            mode ignores them, since there the property comes from the part of
            the letter being held.
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
          <h3 className="font-display text-[13px] mb-1">Exports</h3>
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
      </div>

      <div className="mt-3 pt-3 border-t border-border/60 flex items-baseline
                      justify-between gap-3">
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
    </Modal>
  )
}
