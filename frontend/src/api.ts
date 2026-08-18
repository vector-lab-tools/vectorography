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

  location: (z: number[], text: string, full = false) =>
    post<Location>("/api/location", { z, text, full }),

  compass: (
    z: number[], text: string, radius: number,
    axis_a: number, axis_b: number, ride: number[] | null,
  ) => post<{ points: CompassPoint[] }>("/api/compass",
    { z, text, radius, axis_a, axis_b, ride }),

  travel: (body: Record<string, unknown>) =>
    post<{ z: number[]; altitude: Altitude }>("/api/travel", body),

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
