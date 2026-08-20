import { useRef } from "react"
import { Modal } from "./Modal"

export type ExportKind =
  | "otf" | "ttf" | "variable" | "ufo" | "ufo-journey" | "glyph-svg"
  | "specimen" | "test"

type Row = {
  kind: ExportKind
  name: string
  what: string
  /** Whether this one takes the journey rather than the place you stand. */
  journey?: boolean
}

/** Grouped by what you do with the file, which is the distinction that
 *  actually catches people out: an OTF is installed, a UFO is opened. */
const GROUPS: { title: string; note: string; rows: Row[] }[] = [
  {
    title: "To install and set text with",
    note: "Compiled fonts. Double-click to install, then use them anywhere.",
    rows: [
      { kind: "otf", name: "OTF font",
        what: "This location as a static OpenType font, cubic outlines, the "
            + "same curves the specimen is drawn from." },
      { kind: "ttf", name: "TTF font",
        what: "The same, with quadratic outlines." },
      { kind: "variable", name: "Variable font", journey: true,
        what: "The whole journey as one font with a Journey axis running from "
            + "the first stop to the last, every stop a named instance." },
      { kind: "test", name: "Test the journey here", journey: true,
        what: "Compile it and try the actual variable font in the browser, "
            + "without installing anything." },
    ],
  },
  {
    title: "To open and carry on working",
    note: "Source formats. What Glyphs, RoboFont, FontLab and FontForge read.",
    rows: [
      { kind: "ufo", name: "UFO source",
        what: "This location as UFO 3, with metrics, glyph names and "
            + "codepoints intact." },
      { kind: "ufo-journey", name: "Designspace + UFO masters", journey: true,
        what: "The standard source of a variable font: one UFO per stop and "
            + "the designspace binding them to the Journey axis." },
    ],
  },
  {
    title: "To draw with, or to look at",
    note: "Shapes rather than type. No metrics and no kerning.",
    rows: [
      { kind: "glyph-svg", name: "SVG outlines, one per glyph",
        what: "Every glyph as its own SVG, for Illustrator, Figma or a "
            + "cutter." },
      { kind: "specimen", name: "Specimen sheet",
        what: "One SVG sheet of this location, with where it stands in the "
            + "space printed on it." },
    ],
  },
]

export function ExportPanel({
  stops, busy, licence, family, setFamily, onLicence, onRun, onClose,
}: {
  stops: number
  busy: boolean
  licence: string
  family: string
  setFamily: (v: string) => void
  onLicence: () => void
  onRun: (kind: ExportKind) => void
  onClose: () => void
}) {
  const short = stops < 2
  const named = family.trim() !== "" && family.trim() !== "Unnamed"
  const field = useRef<HTMLInputElement>(null)
  return (
    <Modal title="Export" wide onClose={onClose}
           subtitle="What you leave with, and what it is for">
      {/* A font carries its name wherever it goes, and one called Unnamed is
          a nuisance to find again once it is installed. */}
      {/* The name is a field, not a warning that vanishes. It was shown only
          while the typeface had no name, so the first letter typed made it
          named, unmounted the box mid-word, and threw away the rest of the
          keystrokes along with the focus. */}
      <div className={`mb-3 p-2.5 rounded-sm border flex items-baseline gap-2
                       flex-wrap ${named ? "border-border"
                                         : "border-gold bg-gold/10"}`}>
        <span className="rail-label !text-[8px]">Typeface</span>
        <input
          ref={field}
          autoFocus={!named}
          value={family === "Unnamed" ? "" : family}
          placeholder="name it"
          onChange={(e) => setFamily(e.target.value)}
          className="font-display text-[13px] flex-1 min-w-[8rem]
                     bg-background border border-border rounded-sm px-2 py-1
                     focus:outline-none focus:border-burgundy"
        />
        {!named && (
          <span className="text-[10px] w-full text-muted-foreground">
            Name it before you take it away. A font carries its name wherever
            it goes, and a folder of files called Unnamed is a folder nobody
            can use.
          </span>
        )}
      </div>

      <div className="max-h-[58vh] overflow-y-auto pr-2 space-y-4">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="font-display text-[13px]">{g.title}</h3>
            <p className="text-[10px] text-muted-foreground mb-1.5">{g.note}</p>
            <div className="space-y-1">
              {g.rows.map((r) => {
                const off = busy || (r.journey && short) || !named
                return (
                  <button
                    key={r.kind}
                    disabled={off}
                    onClick={() => { onRun(r.kind); onClose() }}
                    title={!named
                      ? "Name the typeface first"
                      : r.journey && short
                        ? "Travel somewhere first: a journey needs at least "
                          + "two stops"
                        : r.what}
                    className={`w-full text-left p-2.5 rounded-sm border
                                transition-colors
                                ${off
                                  ? "border-border/40 opacity-45 "
                                    + "cursor-not-allowed"
                                  : "border-border/60 hover:border-burgundy "
                                    + "hover:bg-burgundy/5"}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-[13px]">{r.name}</span>
                      <span className="font-mono text-[9px]
                                       text-muted-foreground shrink-0">
                        {r.journey
                          ? `${stops} stop${stops === 1 ? "" : "s"}`
                          : "this location"}
                      </span>
                    </span>
                    <span className="block text-[11px] leading-relaxed
                                     text-muted-foreground mt-0.5">
                      {r.what}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border/60 flex items-baseline
                      justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          Licence written into every font: <strong>{licence}</strong>
        </span>
        <button className="btn" onClick={onLicence}
                title="Choose the terms a compiled typeface goes out under">
          Change…
        </button>
      </div>
    </Modal>
  )
}
