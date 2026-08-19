/**
 * The corpus families' own font files, loaded on demand.
 *
 * Shared by anything that wants to show a family in its own face rather than
 * name it in a fallback. Deliberately the real font rather than the space's
 * reconstruction: a list of typefaces should be set in those typefaces.
 */
const LOADED = new Map<string, boolean>()   // name -> usable
const MAX_FACES = 120

/** Family name to use, or null while it loads or if there is no file. */
export function familyFace(name: string, onReady: () => void): string | null {
  const known = LOADED.get(name)
  if (known === true) return `vg-${name}`
  if (known === false) return null
  if (LOADED.size >= MAX_FACES) return null
  LOADED.set(name, false)
  const face = new FontFace(`vg-${name}`, `url(/api/fontfile/${name})`)
  face.load()
    .then((f) => { document.fonts.add(f); LOADED.set(name, true); onReady() })
    .catch(() => { LOADED.set(name, false) })
  return null
}
