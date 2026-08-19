import { useEffect, useRef, useState } from "react"
import { cardPng, cardSvg, saveBlob, sendCard } from "./cardImage"
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
  // The preview is the PNG itself, not the SVG it came from. WhatsApp and
  // Messages take an image and not an outline, and on a phone the most
  // reliable way to send one is still to press and hold the picture on screen.
  const [png, setPng] = useState<{ url: string; blob: Blob } | null>(null)
  const [note, setNote] = useState("")
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let dead = false
    cardSvg({ z, text, family })
      .then((t) => { if (!dead) setSvg(t) })
      .catch((e) => { if (!dead) setNote(String(e)) })
    return () => { dead = true }
  }, [z, text, family])

  // Rasterised as soon as the card arrives, since the picture is the thing
  // being sent and the preview should be the picture.
  useEffect(() => {
    if (!svg) return
    let dead = false
    let made: string | null = null
    cardPng(svg)
      .then((b) => {
        if (dead) return
        made = URL.createObjectURL(b)
        setPng({ url: made, blob: b })
      })
      .catch((e) => { if (!dead) setNote(String(e)) })
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [svg])

  const shareIt = async () => {
    if (!png) return
    const name = (family || text).replace(/ /g, "")
    setNote(await sendCard(png.blob, name, family || text))
  }

  return (
    <Modal wide title="Share card"
           subtitle="the specimen, its readings, and where it came from"
           onClose={onClose}>
      <div className="space-y-4">
        {png ? (
          <div ref={holder} className="rounded-sm border border-border
                                       overflow-hidden">
            <img src={png.url} alt="Share card"
                 className="w-full h-auto block" />
          </div>
        ) : (
          <div className="rounded-sm border border-border">
            <p className="font-mono text-[11px] text-muted-foreground py-16
                          text-center">
              {note || (svg ? "drawing the image\u2026" : "drawing the card\u2026")}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={!png} onClick={shareIt}>
            Share image
          </button>
          <button className="btn" disabled={!png}
                  onClick={() => png && saveBlob(
                    png.blob, `${(family || text).replace(/ /g, "")}.png`)}>
            Download PNG
          </button>
          <button className="btn" disabled={!svg}
                  onClick={() => svg && saveBlob(
                    new Blob([svg], { type: "image/svg+xml" }),
                    `${(family || text).replace(/ /g, "")}.svg`)}>
            Download SVG
          </button>
          {note && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {note}
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground w-full">
            PNG for WhatsApp and Messages, which take a picture rather than an
            outline. The SVG keeps the letterforms as outlines.
          </span>
        </div>
      </div>
    </Modal>
  )
}
