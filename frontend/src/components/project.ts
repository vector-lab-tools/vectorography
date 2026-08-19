import type { Crumb } from "./Trail"
import type { Depth } from "./SpecimenStage"

/** What is worth keeping when the tab closes.
 *
 *  A journey is the work. Losing it to a refresh would make the instrument
 *  something you use in one sitting or not at all, so the whole trail travels,
 *  branches included, and so do the settings that decide what the map means.
 */
export type Project = {
  format: "vectorography/project"
  version: 1
  saved: string
  model: { id: string; version?: string } | null
  family: string
  text: string
  trail: Crumb[]
  cursor: number
  snapshot: number[] | null
  view: {
    axX: string; axY: string; axZ: string
    colourBy: string
    atlasHeight: string
    ballOn: boolean
    depth: Depth
  }
  travel: { radius: number; temperature: number; step: number }
}

export const PROJECT_EXT = ".vgy"

/** A filename from the family name, without punctuation a filesystem minds. */
export function projectFilename(family: string): string {
  const stem = (family || "journey").trim()
    .replace(/[^\w. -]+/g, "").replace(/\s+/g, "-").slice(0, 60) || "journey"
  return stem + PROJECT_EXT
}

export function serialise(p: Omit<Project, "format" | "version" | "saved">)
    : string {
  const doc: Project = {
    format: "vectorography/project",
    version: 1,
    saved: new Date().toISOString(),
    ...p,
  }
  return JSON.stringify(doc, null, 1)
}

/**
 * Read a project file, refusing anything that is not one.
 *
 * A file that opens into a half-loaded state is worse to recover from than one
 * that refuses to open, so every field the app will read is checked here
 * rather than where it is used.
 */
export function parse(raw: string, dims: number): Project {
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    throw new Error("That is not a project file: it is not even JSON.")
  }
  const d = doc as Partial<Project>
  if (!d || d.format !== "vectorography/project")
    throw new Error("That is not a Vectorography project file.")
  if (d.version !== 1)
    throw new Error(`Project format ${String(d.version)} is newer than this `
                    + "version of Vectorography can read.")
  if (!Array.isArray(d.trail) || d.trail.length === 0)
    throw new Error("The project has no journey in it.")

  for (const c of d.trail) {
    if (!Array.isArray(c.z) || c.z.length !== dims)
      throw new Error(`The journey was recorded in ${c.z?.length ?? "?"} `
        + `dimensions and this model has ${dims}. It was probably saved `
        + "against a different model.")
    if (typeof c.id !== "number" || typeof c.depth !== "number")
      throw new Error("A stop in the journey is malformed.")
  }
  if (!d.trail.some((c) => c.id === d.cursor))
    throw new Error("The project points at a stop that is not in its journey.")
  return d as Project
}

/** Hand the file to the browser. */
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Ask for a file and read it. Resolves to null if the picker was dismissed. */
export function pickFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = `${PROJECT_EXT},application/json`
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      const r = new FileReader()
      r.onload = () => resolve({ name: f.name, text: String(r.result) })
      r.onerror = () => resolve(null)
      r.readAsText(f)
    }
    // A picker dismissed without choosing fires nothing in most browsers, so
    // nothing waits on this promise for longer than the window has focus.
    window.addEventListener("focus", () => {
      setTimeout(() => { if (!input.files?.length) resolve(null) }, 400)
    }, { once: true })
    input.click()
  })
}
