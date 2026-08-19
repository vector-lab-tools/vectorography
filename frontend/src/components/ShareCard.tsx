import { useEffect, useRef, useState } from "react"
import { Modal } from "./Modal"

/**
 * A location as something you can hand to someone.
 *
 * The card is drawn on the server as SVG, which keeps the letterforms as
 * outlines rather than as a screenshot, and rasterised here only when a PNG is
 * wanted: everything that reads it can read outlines, and almost nothing that
 * receives a share can.
 */
export function ShareCard({ z, text, family, onClose }: {
  z: number[]
  text: string
  family: string
  onClose: () => void
}) {
  const [svg, setSvg] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let dead = false
    fetch("/api/export/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ z, text, family }),
    })
      .then((r) => r.text())
      .then((t) => { if (!dead) setSvg(t) })
      .catch((e) => { if (!dead) setNote(String(e)) })
    return () => { dead = true }
  }, [z, text, family])

  const png = async (): Promise<Blob | null> => {
    if (!svg) return null
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      const cv = document.createElement("canvas")
      cv.width = 1200; cv.height = 630
      cv.getContext("2d")!.drawImage(img, 0, 0, 1200, 630)
      return await new Promise((res) => cv.toBlob((b) => res(b), "image/png"))
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const save = (blob: Blob, name: string) => {
    const u = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = u; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(u), 1000)
  }

  const shareIt = async () => {
    const blob = await png()
    if (!blob) return
    const file = new File([blob], "vectorography.png", { type: "image/png" })
    // The share sheet where there is one, the clipboard where there is not.
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean
      share?: (d: { files: File[]; title?: string }) => Promise<void>
    }
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title: family || text }); return }
      catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ])
      setNote("copied to the clipboard")
    } catch {
      save(blob, "vectorography.png")
    }
  }

  return (
    <Modal wide title="Share card"
           subtitle="the specimen, its readings, and where it came from"
           onClose={onClose}>
      <div className="space-y-4">
        <div ref={holder}
             className="rounded-sm border border-border overflow-hidden
                        [&>svg]:w-full [&>svg]:h-auto"
             dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}>
          {!svg && (
            <p className="font-mono text-[11px] text-muted-foreground py-16
                          text-center">drawing the card…</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={!svg} onClick={shareIt}>
            Share or copy
          </button>
          <button className="btn" disabled={!svg}
                  onClick={async () => {
                    const b = await png()
                    if (b) save(b, `${(family || text).replace(/ /g, "")}.png`)
                  }}>
            Download PNG
          </button>
          <button className="btn" disabled={!svg}
                  onClick={() => svg && save(
                    new Blob([svg], { type: "image/svg+xml" }),
                    `${(family || text).replace(/ /g, "")}.svg`)}>
            Download SVG
          </button>
          {note && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {note}
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
}
