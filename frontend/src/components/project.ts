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
  /** 1 was the journey and how it was being looked at. 2 adds what the
   *  designer decided about the typeface itself, which a project that does not
   *  carry it is not really a project. Files at 1 still open. */
  version: 1 | 2
  saved: string
  model: { id: string; version?: string } | null
  family: string
  text: string
  trail: Crumb[]
  cursor: number
  /** Stops on the trail the traveller has marked. Ids, not positions: a
   *  waypoint is a place on the journey, and the journey already holds it. */
  waypoints: number[]
  view: {
    axX: string; axY: string; axZ: string
    colourBy: string
    atlasHeight: string
    ballOn: boolean
    depth: Depth
  }
  travel: { radius: number; temperature: number; step: number }
  /**
   * The decisions, as against the journey and the view.
   *
   * A location is where the work stands; these are what has been settled
   * about it. Letters held while the rest move, how hard the outlines are
   * pulled onto their straights, the sidebearings and the keys that hold them
   * to one another, and the axes the designer named by pointing at faces.
   * None of it can be recovered from the coordinates, so none of it can be
   * left out of the file.
   *
   * Absent in a version 1 file, where the defaults stand in.
   */
  work?: {
    settled: string[]
    settleTol: number
    straight: number
    spacing: Record<string, { left?: string; right?: string }>
    /** Learned axes travel whole: a vector is meaningless without the faces
     *  it was fitted from and the test that said whether it generalised. */
    axes: unknown[]
  }
}

/** What a file written before version 2 is taken to have meant. */
export const NO_WORK = {
  settled: [] as string[],
  settleTol: 0.01,
  straight: 0,
  spacing: {} as Record<string, { left?: string; right?: string }>,
  axes: [] as unknown[],
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
    version: 2,
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
  if (d.version !== 1 && d.version !== 2)
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

  // An axis is a direction in this space and nothing in another one, so it is
  // checked the way the trail is rather than loaded and left to misbehave.
  const axes = Array.isArray(d.work?.axes) ? d.work.axes : []
  for (const a of axes) {
    const v = (a as { vector?: unknown })?.vector
    if (!Array.isArray(v) || v.length !== dims)
      throw new Error(`A learned axis was fitted in ${
        Array.isArray(v) ? v.length : "?"} dimensions and this model has `
        + `${dims}. It was saved against a different model.`)
  }

  // A version 1 file has no work in it, and the defaults are what it meant.
  return {
    ...d,
    work: {
      ...NO_WORK,
      ...(d.work ?? {}),
      settled: Array.isArray(d.work?.settled) ? d.work.settled : [],
      spacing: (d.work?.spacing && typeof d.work.spacing === "object")
        ? d.work.spacing : {},
      axes,
    },
  } as Project
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

/** A font file to project, handed over whole rather than read as text. */
export function pickFont(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".ttf,.otf,font/ttf,font/otf,application/font-sfnt"
    input.onchange = () => { resolve(input.files?.[0] ?? null); input.remove() }
    window.addEventListener("focus", () => {
      setTimeout(() => { if (!input.files?.length) resolve(null) }, 400)
    }, { once: true })
    // In the document rather than floating, so the choice can be made by
    // something other than a hand: this is the one path with a real file in
    // it, and a path that cannot be driven cannot be tested.
    input.style.display = "none"
    document.body.appendChild(input)
    input.click()
  })
}
