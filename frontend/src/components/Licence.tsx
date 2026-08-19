import { useState } from "react"
import { Modal } from "./Modal"

export type Licence = { id: string; author: string }

export const LICENCE_KEY = "vg.licence"
export const AUTHOR_KEY = "vg.author"

/** The terms on offer, and what each one asks of whoever receives the font. */
const TERMS: { id: string; name: string; note: string }[] = [
  { id: "ofl", name: "SIL Open Font License 1.1",
    note: "What most released type uses. Free to use, study, modify and "
        + "redistribute; derivatives keep the licence and cannot be sold on "
        + "their own." },
  { id: "mit", name: "MIT License",
    note: "Do anything, keep the notice. Simpler than the OFL and more "
        + "permissive, with no reserved-name clause." },
  { id: "cc-by", name: "Creative Commons Attribution 4.0",
    note: "Any use, including commercial, so long as you are credited. Not "
        + "written with fonts in mind, but widely understood." },
  { id: "cc0", name: "CC0 1.0",
    note: "Placed in the public domain as far as the law allows. No "
        + "attribution, no conditions." },
  { id: "arr", name: "All rights reserved",
    note: "Nobody may redistribute it. Use this while a face is still "
        + "yours alone." },
  { id: "none", name: "No licence",
    note: "No licence written into the font. The terms are then whatever you "
        + "agree separately, which is fine for a private test." },
]

/**
 * What a compiled typeface goes out under.
 *
 * The outlines come out of a linear transformation of a fitted space, not out
 * of any one face, so the terms are the author's to set. The choice is written
 * into the font's own name table, where a type designer looks for it, and into
 * the export bundle.
 */
export function LicencePicker({ value, onSave, onClose }: {
  value: Licence
  onSave: (v: Licence) => void
  onClose: () => void
}) {
  const [id, setId] = useState(value.id)
  const [author, setAuthor] = useState(value.author)

  return (
    <Modal title="Licence for exports" wide onClose={onClose}
           subtitle="Written into the name table of every font you compile">
      <div className="max-h-[54vh] overflow-y-auto pr-2 space-y-1">
        {TERMS.map((t) => (
          <label key={t.id}
                 className={`flex gap-3 items-start p-2.5 rounded-sm border
                             cursor-pointer transition-colors
                             ${id === t.id
                               ? "border-burgundy bg-burgundy/5"
                               : "border-border/50 hover:bg-muted/40"}`}>
            <input type="radio" name="licence" value={t.id}
                   checked={id === t.id}
                   onChange={() => setId(t.id)}
                   className="mt-1 accent-burgundy" />
            <span className="min-w-0">
              <span className="block font-display text-[13px]">{t.name}</span>
              <span className="block text-[11px] leading-relaxed
                               text-muted-foreground">{t.note}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border/60">
        <label className="rail-label !text-[8px] block mb-1"
               title={"Goes into the copyright and designer fields. Leave it "
                 + "empty and the font says only how it was made."}>
          Copyright holder
        </label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="your name, or leave empty"
          className="font-mono text-[11px] w-full bg-background border
                     border-border rounded-sm px-2 py-1.5"
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-active"
                onClick={() => { onSave({ id, author: author.trim() }); onClose() }}>
          Use these terms
        </button>
      </div>
    </Modal>
  )
}
