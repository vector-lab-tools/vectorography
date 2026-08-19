import { Modal } from "./Modal"

/**
 * What a mode will be, before it is. Named honestly: it says what the mode is
 * for and what it would need, rather than promising a date.
 */
export type Planned = { title: string; blurb: string; needs: string[] }

export function ComingSoon({ item, onClose }:
  { item: Planned; onClose: () => void }) {
  return (
    <Modal title={item.title} subtitle="not built yet" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed">{item.blurb}</p>
        <div>
          <div className="rail-label mb-1.5">what it needs first</div>
          <ul className="space-y-1">
            {item.needs.map((n) => (
              <li key={n} className="flex gap-2 text-[12px] leading-relaxed">
                <span className="text-muted-foreground">·</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          Coming soon. Travel mode is the one that works today.
        </p>
      </div>
    </Modal>
  )
}
