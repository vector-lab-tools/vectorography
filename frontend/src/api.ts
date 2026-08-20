export type Glyph = {
  char: string; path: string; advance: number
  /** Outline points, present when the location was asked for with geometry.
   *  This is what makes the specimen touchable. */
  contours?: number[][][]
}

export type Altitude = {
  centroid_distance: number
  centroid_percentile: number
  knn_distance: number
  isolation_percentile: number
  log_density: number
  density_percentile: number
  corpus_centroid_max: number
}

export type NamedDirection = {
  key: string; label: string; minus: string; plus: string; spread: number
  vector?: number[]
  /** Where the corpus sits along this direction, so a slider can show a
   *  position rather than only offer a step. */
  lo?: number; hi?: number; min?: number; max?: number
}

export type AtlasPoint = { i: number; name: string; x: number; y: number
                           h: number; d: number; c: number }

export type AtlasData = {
  colour: { key: string; label: string; low: string; high: string } | null
  axes: { x: string; y: string; z: string; height: string; ride: boolean
          overlap: { y_on_x: number; z_on_plane: number } }
  points: AtlasPoint[]
  sprites: Record<string, Glyph[]>
  self: { x: number; y: number; h: number; glyphs: Glyph[] }
  trail: { x: number; y: number; h: number }[]
  range: { h_min: number; h_max: number }
  ball: { q50: number; q90: number; max: number; self: number
          inside_q50: number }
}

export type Neighbour = { family: string; distance: number; index: number }

export type CorpusInfo = {
  families: string[]
  count: number
  dims: number
  explained_variance: number[]
  glyphs: string
  licence: string
  directions?: { key: string; label: string; minus: string; plus: string }[]
  centroid_distances: number[]
  centroid_max: number
  version: string
  model: { name: string; version: string; kind: string; id: string }
}

export type Location = {
  glyphs: Glyph[]
  altitude: Altitude
  neighbours: Neighbour[]
}

export type CompassPoint = {
  bearing: number
  z: number[]
  glyphs: Glyph[]
  altitude: { density_percentile: number }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const api = {
  corpus: () => fetch("/api/corpus").then((r) => r.json() as Promise<CorpusInfo>),

  directions: () => fetch("/api/directions")
    .then((r) => r.json() as Promise<{ directions: NamedDirection[] }>),

  basis: (ax: string, ay: string, az: string, ride: number[] | null) =>
    post<{ u: number[]; v: number[]; w: number[]
           overlap: { y_on_x: number; z_on_plane: number } }>("/api/basis",
      { ax, ay, az, ride }),

  atlas: (body: Record<string, unknown>) =>
    post<AtlasData>("/api/atlas", body),

  location: (z: number[], text: string, full = false, geometry = false,
             neighbours = 5) =>
    post<Location>("/api/location", { z, text, full, geometry, neighbours }),

  compass: (
    z: number[], text: string, radius: number,
    ax: string, ay: string, ride: number[] | null,
  ) => post<{ points: CompassPoint[] }>("/api/compass",
    { z, text, radius, ax, ay, ride }),

  travel: (body: Record<string, unknown>) =>
    post<{ z: number[]; altitude: Altitude }>("/api/travel", body),

  exportFont: (z: number[], family: string, style: string, format: string,
               licence = "none", author = "") =>
    api.download("/api/export/font", { z, family, style, format, licence, author },
                 // Regular is not part of a name: the file is called what the
                 // typeface is called.
                 (style && style.toLowerCase() !== "regular"
                   ? `${family.replace(/ /g, "")}-${style.replace(/ /g, "")}`
                   : family.replace(/ /g, "")) + `.${format}`),

  exportFamily: (z: number[], family: string, licence = "none", author = "") =>
    api.download("/api/export/family", { z, family, licence, author },
                 `${family.replace(/ /g, "")}-family.zip`),

  exportUfo: (z: number[], family: string, licence = "none", author = "") =>
    api.download("/api/export/ufo", { z, family, licence, author },
                 `${family.replace(/ /g, "")}-ufo.zip`),

  exportGlyphSvg: (z: number[], family: string) =>
    api.download("/api/export/glyph-svg", { z, family },
                 `${family.replace(/ /g, "")}-glyphs-svg.zip`),

  fontPosition: (name: string) =>
    fetch(`/api/font/${name}`).then((r) => r.json() as Promise<{ z: number[] }>),

  async download(url: string, body: unknown, fallback: string) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(await r.text())
    const blob = await r.blob()
    const cd = r.headers.get("Content-Disposition") || ""
    const m = /filename=([^;]+)/.exec(cd)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = m ? m[1].trim() : fallback
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  },
}
