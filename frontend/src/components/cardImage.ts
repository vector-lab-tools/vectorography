/**
 * A location as an image, handed to whatever the device shares with.
 *
 * WhatsApp and Messages take a picture, not an outline, so the card is drawn
 * as SVG on the server for the letterforms and rasterised here for sending.
 */
export type CardWhat = { z: number[]; text: string; family: string }

export async function cardSvg(what: CardWhat): Promise<string> {
  const r = await fetch("/api/export/card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(what),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.text()
}

/** Twice the size it is shown at, so it survives a good screen. */
export function cardPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement("canvas")
      cv.width = 2400
      cv.height = 1260
      cv.getContext("2d")!.drawImage(img, 0, 0, 2400, 1260)
      cv.toBlob((b) => {
        URL.revokeObjectURL(src)
        b ? resolve(b) : reject(new Error("could not draw the image"))
      }, "image/png")
    }
    img.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error("could not draw the image"))
    }
    img.src = src
  })
}

export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = u
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(u), 1000)
}

/**
 * The system share sheet where there is one, the clipboard where there is not,
 * and a file on disk otherwise. Returns what it managed to do.
 */
export async function sendCard(blob: Blob, name: string, title: string) {
  const file = new File([blob], `${name}.png`, { type: "image/png" })
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean
    share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void>
  }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title,
                        text: `${title} · a location in the space` })
      return "shared"
    } catch {
      return "cancelled"
    }
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    return "copied to the clipboard"
  } catch {
    saveBlob(blob, `${name}.png`)
    return "saved"
  }
}
