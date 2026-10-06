import { useMemo, useState } from "react"
import { api, type LearnedAxis } from "../api"
import { familyFace } from "./familyFonts"
import { Modal } from "./Modal"

/**
 * An axis named by pointing at faces.
 *
 * The eight measured properties are the vocabulary of the craft and are not
 * the whole of what a designer sees. "More like that one" is the commonest
 * thing said in front of a rack of proofs, and the instrument had no way to
 * hear it. Mark some faces *this* and some *not this*, and the direction
 * between the two means becomes a heading that can be walked, exported as an
 * axis, and kept with the project.
 *
 * The evidence shown beside it is the point rather than a flourish. Fitting a
 * direction between two handfuls of anything always returns something.
 * Whether what came back is a property or a list of favourites is settled by
 * keeping some of the marked faces back and seeing whether the axis finds them
 * again, and the two cases look identical until that is done.
 */
export function LearnAxis({ families, onSave, onClose }: {
  families: string[]
  onSave: (axis: LearnedAxis) => void
  onClose: () => void
}) {
  const [liked, setLiked] = useState<string[]>([])
  const [against, setAgainst] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [side, setSide] = useState<"liked" | "against">("liked")
  const [result, setResult] = useState<LearnedAxis | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The faces arrive from the CDN after the list is drawn, so a redraw is
  // asked for when one lands.
  const [, bump] = useState(0)

  const taken = useMemo(
    () => new Set([...liked, ...against]), [liked, against])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return families
      .filter((f) => !taken.has(f) && (!q || f.includes(q)))
      .slice(0, 40)
  }, [families, query, taken])

  const enough = liked.length >= 2 && against.length >= 2

  const learn = async () => {
    setBusy(true); setError(null)
    try {
      const r = await api.taste(liked, against)
      setResult(r)
      if (!name) setName("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <Modal title="Learn an axis" subtitle="by pointing at faces" onClose={onClose}>
      <div className="px-5 py-4 space-y-4 overflow-y-auto">
        <p className="text-[13px] leading-relaxed max-w-prose">
          Mark faces on each side. The axis points from <em>not this</em>{" "}
          toward <em>this</em>, and joins the steer list under whatever you
          call it.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <Basket label="this" names={liked} tone="text-burgundy"
                  onDrop={(n) => setLiked(liked.filter((x) => x !== n))} />
          <Basket label="not this" names={against} tone="text-muted-foreground"
                  onDrop={(n) => setAgainst(against.filter((x) => x !== n))} />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="find a family"
              spellCheck={false}
              className="flex-1 font-mono text-[11px] px-2 py-1 rounded-sm
                         bg-background border border-ink/25 focus:outline-none
                         focus:border-burgundy"
            />
            {(["liked", "against"] as const).map((k) => (
              <button key={k} onClick={() => setSide(k)}
                className={`px-2 py-1 rounded-sm font-mono text-[10px] border
                            transition-colors ${side === k
                              ? "border-burgundy text-burgundy"
                              : "border-border text-muted-foreground"}`}>
                {k === "liked" ? "this" : "not this"}
              </button>
            ))}
          </div>

          <div className="mt-2 max-h-40 overflow-y-auto grid
                          grid-cols-2 sm:grid-cols-3 gap-1">
            {matches.map((f) => (
              <button key={f}
                onClick={() => {
                  if (side === "liked") setLiked([...liked, f])
                  else setAgainst([...against, f])
                  setResult(null)
                }}
                className="text-left px-1.5 py-1 rounded-sm hover:bg-muted
                           truncate transition-colors">
                {/* Set in its own face, so the choice is made by looking. */}
                <span className="text-[12px]"
                      style={{ fontFamily:
                        familyFace(f, () => bump((n) => n + 1)) ?? undefined }}>
                  {f}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="font-mono text-[10px] text-gold">{error}</p>
        )}

        {result && <Evidence r={result} />}
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-t border-border
                      shrink-0">
        {result && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name this axis"
            spellCheck={false}
            className="flex-1 min-w-0 font-mono text-[11px] px-2 py-1.5
                       rounded-sm bg-background border border-ink/25
                       focus:outline-none focus:border-burgundy"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-sm border border-border
                       font-mono text-[11px] hover:border-burgundy
                       hover:text-burgundy transition-colors">
            Close
          </button>
          <button
            onClick={result ? () => onSave({ ...result, label: name.trim() })
                            : learn}
            disabled={busy || !enough || (!!result && !name.trim())}
            className="px-3 py-1.5 rounded-sm bg-burgundy text-ivory
                       font-mono text-[11px] hover:opacity-90
                       disabled:opacity-35 transition-opacity">
            {busy ? "fitting…" : result ? "Add to steer" : "Learn it"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Basket({ label, names, tone, onDrop }: {
  label: string; names: string[]; tone: string; onDrop: (n: string) => void
}) {
  return (
    <div className="border border-border rounded-sm p-2 min-h-[72px]">
      <span className={`rail-label !text-[8px] ${tone}`}>
        {label} · {names.length}
      </span>
      <div className="mt-1 flex flex-wrap gap-1">
        {names.map((n) => (
          <button key={n} onClick={() => onDrop(n)} title="Take it out again"
            className="px-1.5 py-0.5 rounded-sm bg-muted border border-border
                       font-mono text-[9px] hover:border-burgundy
                       transition-colors">
            {n} ×
          </button>
        ))}
        {!names.length && (
          <span className="font-mono text-[9px] text-muted-foreground">
            nothing yet
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * What the axis is, as against what it was asked to be.
 *
 * Two readings. Whether it finds faces it was not shown, which is the
 * difference between a property and a list of favourites. And how much of it
 * the eight measured properties already account for, because an axis that is
 * mostly weight is weight, and a second slider for it would be a second slider
 * for weight.
 */
function Evidence({ r }: { r: LearnedAxis }) {
  const good = (r.score ?? 0) >= 0.6
  return (
    <div className="border-t border-border pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border rounded-sm px-2.5 py-2">
          <span className="rail-label !text-[8px]">finds what it was not shown</span>
          <div className={`font-display text-[20px] leading-tight
                           ${r.tested ? (good ? "" : "text-gold") : ""}`}>
            {r.tested ? `${r.found}/${r.of}` : "—"}
          </div>
          <div className="font-mono text-[8px] text-muted-foreground
                          leading-snug mt-0.5">
            {r.tested
              ? `of the faces held back, inside the top ${r.top} of ${r.corpus}.`
                + (good ? " It generalises."
                        : " It is a direction toward the faces you marked"
                          + " rather than a property.")
              : "mark six or more on the ‘this’ side to test it"}
          </div>
        </div>
        <div className="border border-border rounded-sm px-2.5 py-2">
          <span className="rail-label !text-[8px]">already measured</span>
          <div className="font-display text-[20px] leading-tight">
            {Math.round(r.explained_by_named * 100)}%
          </div>
          <div className="font-mono text-[8px] text-muted-foreground
                          leading-snug mt-0.5">
            of it the eight properties can reproduce
            {r.closest_named?.length
              ? `; nearest is ${r.closest_named[0].key}` : ""}.
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <End label="toward" names={r.plus.map((p) => p.family)} />
        <End label="away from" names={r.minus.map((p) => p.family)} />
      </div>
    </div>
  )
}

function End({ label, names }: { label: string; names: string[] }) {
  return (
    <div>
      <span className="rail-label !text-[8px]">{label}</span>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground
                      leading-relaxed">
        {names.join(", ")}
      </div>
    </div>
  )
}
