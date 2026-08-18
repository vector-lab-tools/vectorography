export type Glyph = { char: string; path: string; advance: number }

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
}

export type AtlasPoint = { i: number; name: string; x: number; y: number
                           h: number; d: number; c: number }

export type AtlasData = {
  colour: { key: string; label: string; low: string; high: string } | null
  axes: { x: number; y: number; x_evr: number; y_evr: number
          height: string; ride: boolean }
  points: AtlasPoint[]
  sprites: Record<string, Glyph[]>
  self: { x: number; y: number; h: number; glyphs: Glyph[] }
  trail: { x: number; y: number; h: number }[]
  range: { h_min: number; h_max: number }
}

export type Neighbour = { family: string; distance: number; index: number }

export type CorpusInfo = {
  families: string[]
  count: number
  dims: number
  explained_variance: number[]
  glyphs: string
  licence: string
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

  atlas: (body: Record<string, unknown>) =>
    post<AtlasData>("/api/atlas", body),

  location: (z: number[], text: string, full = false) =>
    post<Location>("/api/location", { z, text, full }),

  compass: (
    z: number[], text: string, radius: number,
    axis_a: number, axis_b: number, ride: number[] | null,
  ) => post<{ points: CompassPoint[] }>("/api/compass",
    { z, text, radius, axis_a, axis_b, ride }),

  travel: (body: Record<string, unknown>) =>
    post<{ z: number[]; altitude: Altitude }>("/api/travel", body),

  exportFont: (z: number[], family: string, style: string, format: string) =>
    api.download("/api/export/font", { z, family, style, format },
                 `${family.replace(/ /g, "")}-${style}.${format}`),

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
