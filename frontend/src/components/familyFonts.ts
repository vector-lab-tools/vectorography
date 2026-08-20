/**
 * The corpus families' own faces, so a list of typefaces can be set in those
 * typefaces rather than named in a fallback.
 *
 * Two sources, tried in that order. Google Fonts serves every family in the
 * corpus, which is where they came from, and a deployed instrument can lean on
 * that rather than shipping three hundred megabytes of font files. Where the
 * corpus is present locally the server's own copy is used instead, which keeps
 * the tool working with no network at all.
 *
 * Everything degrades quietly: a family whose face has not arrived is set in
 * the page's own face and nothing waits for it.
 */

type State = "loading" | "ready" | "absent"

const STATE = new Map<string, State>()
const CDN_NAME = new Map<string, string>()      // corpus slug -> family's name
const MAX_FACES = 140

let names: Record<string, string> | null = null
let namesAsked = false

/** The slug-to-name map, fetched once. Absent is a fine answer. */
function ensureNames(onReady: () => void) {
  if (namesAsked) return
  namesAsked = true
  fetch("/families.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { names = j; onReady() })
    .catch(() => { names = null })
}

/**
 * The family name to set text in, or null while it loads or if there is none.
 */
export function familyFace(slug: string, onReady: () => void): string | null {
  ensureNames(onReady)

  const state = STATE.get(slug)
  if (state === "ready") return CDN_NAME.get(slug) ?? `vg-${slug}`
  if (state === "loading" || state === "absent") return null
  if (STATE.size >= MAX_FACES) return null

  STATE.set(slug, "loading")
  const proper = names?.[slug]

  if (proper) {
    // One stylesheet per family. The browser fetches the face only when it is
    // used, so this costs a small CSS request and nothing more until then.
    const href = "https://fonts.googleapis.com/css2?family="
      + encodeURIComponent(proper).replace(/%20/g, "+") + "&display=swap"
    const existing = document.querySelector(`link[href="${href}"]`)

    // Canvas will not wait for a face the way layout does, so it is asked for
    // explicitly and the caller is told when it is really there. The asking
    // has to wait for the stylesheet: document.fonts.load matches against the
    // faces the document already knows, and called the moment the link was
    // appended it found none, decided Google had nothing, and fell back to a
    // corpus that a deployed instrument does not carry. Locally that fallback
    // worked, so the list was set in its own faces on a laptop and in one
    // plain face everywhere else.
    const ask = () => {
      document.fonts.load(`16px "${proper}"`)
        .then((faces) => {
          if (faces.length) {
            CDN_NAME.set(slug, proper)
            STATE.set(slug, "ready")
            onReady()
          } else {
            fromServer(slug, onReady)
          }
        })
        .catch(() => fromServer(slug, onReady))
    }

    if (existing) ask()
    else {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.addEventListener("load", ask)
      link.addEventListener("error", () => fromServer(slug, onReady))
      document.head.appendChild(link)
    }
    return null
  }

  fromServer(slug, onReady)
  return null
}

/** The corpus as this server holds it, when it holds it. */
function fromServer(slug: string, onReady: () => void) {
  const face = new FontFace(`vg-${slug}`, `url(/api/fontfile/${slug})`)
  face.load()
    .then((f) => {
      document.fonts.add(f)
      STATE.set(slug, "ready")
      onReady()
    })
    .catch(() => STATE.set(slug, "absent"))
}
