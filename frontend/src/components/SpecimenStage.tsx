import { useCallback, useMemo, useRef, useState } from "react"
import type { Glyph } from "../api"
import { FamilyPicker } from "./FamilyPicker"
import { ICONS, StageToolbar, type Dock, type Tool } from "./StageToolbar"
import { handleColour } from "./handleColours"
import { allHandles, handleAt, layout, lineWidth, xHeightOf,
         type Handle, type HandleKind } from "./handles"

/**
 * The specimen as the instrument.
 *
 * Everywhere else in this tool the type is read in one place and changed in
 * another: a mark on a map, a row of plus and minus buttons. Here the hand goes
 * on the letters. Approaching a stem says weight, approaching the gap between
 * two letters says spacing, and pulling says how much.
 *
 * It is still travel. A drag is a path through the space, it lands somewhere
 * real, and it goes on the trail like any other move.
 */

export type Depth = "handles" | "modifier" | "perspective"

export type DragReport = {
  /** Property to move along, and by how much, in whitened units. */
  moves: { key: HandleKind; amount: number }[]
  /** Properties this gesture is about, so the chips can follow it. */
  aiming: HandleKind[]
}

const DEPTH_SCREEN: [number, number] = [0.62, -0.78]   // "into" the perspective

export const PROPS: HandleKind[] = ["weight", "width", "tightness", "x-height",
                                    "contrast", "serif", "straightness",
                                    "slant"]

export function SpecimenStage({
  glyphs, text, hullRadius, radius, depth, setDepth,
  onDragStart, onDrag, onDragEnd, lost, onReset,
  onUndo, onRedo, canUndo, canRedo,
  setText, proofs, neighbours, onGoToFamily, geometry, busy,
  xProp, yProp, zProp, setProps,
}: {
  glyphs: Glyph[]
  text: string
  /** Where the corpus runs out, so the drag can be made to feel heavier. */
  hullRadius: number | null
  radius: number | null
  depth: Depth
  setDepth: (d: Depth) => void
  onDragStart: (aiming: HandleKind[]) => void
  onDrag: (r: DragReport) => void
  onDragEnd: () => void
  /** Outside the corpus, where the outlines stop being readings. */
  lost: boolean
  onReset: () => void
  /** Keep this exact place, and go back to the one kept last. Shaping runs
   *  ahead of the trail: a hand tries twenty things and wants the good one
   *  back, not the twentieth. */
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Outlines for hit-testing, which arrive after the specimen does. */
  geometry: Glyph[] | null
  /** The word being set, and the proofs worth setting it in. */
  setText: (t: string) => void
  proofs: string[]
  /** Real families, nearest first, and travel to the one chosen. */
  neighbours: { family: string; distance: number }[]
  onGoToFamily: (name: string) => void
  busy: boolean
  xProp: HandleKind; yProp: HandleKind; zProp: HandleKind
  setProps: (x: HandleKind, y: HandleKind, z: HandleKind) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Handle | null>(null)
  const [dragging, setDragging] = useState<Handle | "plane" | null>(null)
  const [fader, setFader] = useState(0)
  const faderLast = useRef(0)
  // Metrics are wanted while judging a shape and in the way while reading a
  // word, so they come and go on their own switch, and the choice is kept.
  const [guides, setGuides] = useState(
    () => localStorage.getItem("vg.guides") !== "0")
  // How much of the control surface the type carries. All of it while
  // learning what the letters offer, one point at a time once that is known,
  // none of it when the specimen is being judged as a specimen.
  const [points, setPoints] = useState<"on" | "minimal" | "off">(
    () => (localStorage.getItem("vg.points") as
      "on" | "minimal" | "off" | null) ?? "on")
  // Where the tools sit. Kept, because it is a decision about the desk.
  const [dock, setDock] = useState<Dock>(
    () => (localStorage.getItem("vg.dock.v2") as Dock | null)
      // On a phone the head row carries the proof chips and the foot carries
      // the depth schemes and the reading, so the tools take the right edge,
      // where they stack vertically and leave the letters clear.
      ?? "bottom-right")

  const placed = useMemo(() => layout(glyphs, text), [glyphs, text])
  // Laid out from the outlines, which lag the specimen by a beat. The handles
  // follow that copy; the letters are drawn from the fresh one.
  const probed = useMemo(
    () => layout(geometry ?? [], text), [geometry, text])
  const width = useMemo(() => lineWidth(placed), [placed])
  const xh = useMemo(() => xHeightOf(placed), [placed])
  // Cap height, read off a capital if the specimen has one.
  const capH = useMemo(() => {
    const cap = placed.find((p) => /[A-Z]/.test(p.g.char))
    if (!cap) return xh * 1.35
    let top = 0
    for (const c of cap.g.contours ?? []) {
      for (const [, y] of c) if (y > top) top = y
    }
    return top || xh * 1.35
  }, [placed, xh])
  const hasGeometry = probed.some((p) => p.g.contours?.length)

  // Every handle the letterform offers, drawn rather than waited for. Hidden
  // until the hand came near, nothing announced that the type could be
  // touched at all.
  const handles = useMemo(
    () => (hasGeometry ? allHandles(probed, xh) : []), [probed, xh, hasGeometry])

  // The content group is flipped, so inside it coordinates are the font's own:
  // y up from the baseline. The viewBox is in the flipped frame, which is why
  // the ascender sits at a negative y here.
  const VB = { x0: -0.06, y0: -0.94, w: width + 0.12, h: 1.24 }

  /** A client point in the font's own coordinates: x along the line, y up. */
  const toEm = useCallback((cx: number, cy: number) => {
    const el = svg.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const s = Math.min(r.width / VB.w, r.height / VB.h)
    const ox = r.left + (r.width - VB.w * s) / 2
    const oy = r.top + (r.height - VB.h * s) / 2
    return { x: (cx - ox) / s + VB.x0, y: -((cy - oy) / s + VB.y0), s }
  }, [VB.h, VB.w, VB.x0, VB.y0])

  const probe = useCallback((cx: number, cy: number) => {
    const p = toEm(cx, cy)
    if (!p) return null
    return handleAt(probed, p.x, p.y, xh)
  }, [probed, toEm, xh])

  const beyond = lost
    || (hullRadius != null && radius != null && radius > hullRadius)

  const tools: Tool[] = [
    // How the hand drives the letters, first, because it decides what every
    // other gesture on the drawing means.
    ...(["handles", "modifier", "perspective"] as Depth[]).map((d) => ({
      key: d,
      on: depth === d,
      icon: d === "handles" ? ICONS.handles
        : d === "modifier" ? ICONS.modifier : ICONS.perspective,
      label: d === "handles" ? "Handles"
        : d === "modifier" ? "Modifier" : "Perspective",
      title: d === "handles"
        ? "grab the part of the letter that expresses the property"
        : d === "modifier"
          ? "drag anywhere for two properties, wheel or fader for the third"
          : "drag anywhere for two properties, into the picture for the third",
      onClick: () => setDepth(d),
      // Held down, the plane modes offer the properties the hand drives.
      // Handles has none to offer: there the letter decides.
      menu: d === "handles" ? undefined : (
        <span className="flex flex-col gap-1.5">
          <span className="rail-label !text-[8px]">
            what the hand moves
          </span>
          {([["\u2194 sideways", xProp, 0],
             ["\u2195 up and down", yProp, 1],
             [d === "perspective" ? "\u2316 into the picture"
                                  : "\u2316 wheel or fader", zProp, 2],
            ] as const).map(([label, val, slot]) => (
            <span key={slot} className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] text-muted-foreground
                               whitespace-nowrap">
                {label}
              </span>
              <select
                value={val}
                onChange={(e) => {
                  const v = e.target.value as HandleKind
                  setProps(slot === 0 ? v : xProp, slot === 1 ? v : yProp,
                           slot === 2 ? v : zProp)
                }}
                className="font-mono text-[10px] bg-background border
                           border-border rounded-sm px-1 py-0.5"
              >
                {PROPS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </span>
          ))}
        </span>
      ),
    })),
    {
      key: "points", divider: true, on: points !== "off",
      icon: points === "on" ? ICONS.points
        : points === "minimal" ? ICONS.pointsMinimal : ICONS.pointsOff,
      label: points === "on" ? "Grab points: all"
        : points === "minimal" ? "Grab points: only the one under the hand"
        : "Grab points: none",
      title: points === "on"
        ? "showing all of them \u00b7 click for only the one under the hand"
        : points === "minimal"
        ? "showing only the one under the hand \u00b7 click for none"
        : "hidden \u00b7 click to show all of them",
      onClick: () => {
        const next = points === "on" ? "minimal"
          : points === "minimal" ? "off" : "on"
        setPoints(next)
        localStorage.setItem("vg.points", next)
      },
    },
    {
      key: "guides", on: guides, icon: ICONS.guides, label: "Guides",
      title: "baseline, x-height and cap height behind the letters",
      onClick: () => {
        const next = !guides
        setGuides(next)
        localStorage.setItem("vg.guides", next ? "1" : "0")
      },
    },
    // Undo and redo, where the hand already is. Keeping and recalling a place
    // sat here before, and both did their work invisibly: on a phone, with no
    // tooltip to read, a press that changes nothing on screen is a press that
    // did not work. Both still live in the Edit menu.
    {
      key: "undo", on: false, divider: true, icon: ICONS.recall, label: "Undo",
      title: "back to the last stop on the trail",
      disabled: !canUndo,
      onClick: onUndo,
    },
    {
      key: "redo", on: false, icon: ICONS.redo, label: "Redo",
      title: "forward again, to the stop you came back from",
      disabled: !canRedo,
      onClick: onRedo,
    },
    ...(beyond ? [{
      key: "rescue", on: true, icon: ICONS.rescue,
      label: "Back to the last sane position",
      title: "the last stop still inside the corpus",
      onClick: onReset,
    }] : []),
  ]
  const last = useRef<{ x: number; y: number } | null>(null)
  const held = useRef<Handle | "plane" | null>(null)

  const move = useCallback((e: React.PointerEvent) => {
    const grabbed = held.current
    if (!grabbed) {
      if (!hasGeometry || busy) return
      const h = probe(e.clientX, e.clientY)
      setHover((prev) =>
        prev?.kind === h?.kind && prev?.at[0] === h?.at[0] ? prev : h)
      return
    }

    const p = toEm(e.clientX, e.clientY)
    const prev = last.current
    if (!p || !prev) return
    let dxEm = p.x - prev.x
    let dyEm = p.y - prev.y
    last.current = { x: p.x, y: p.y }

    // A hand that slips, or a pointer that jumps because the window scrolled
    // under it, should not throw the type across the space. One step is capped
    // at a fraction of an em: a real gesture is many small steps and is
    // unaffected, and an accident is absorbed.
    const CAP = 0.09
    const big = Math.hypot(dxEm, dyEm)
    if (big > CAP) {
      const k = CAP / big
      dxEm *= k
      dyEm *= k
    }

    // Past the edge of the data the outlines fall apart. The drag is not
    // stopped and the mess is not hidden, but it is made heavier, so the end of
    // the known universe is something the hand meets rather than something a
    // caption reports afterwards.
    const drag = beyond ? 0.45 : 1

    const moves: { key: HandleKind; amount: number }[] = []
    const add = (key: HandleKind | undefined, amount: number) => {
      if (key && Math.abs(amount) > 1e-6) moves.push({ key, amount })
    }

    if (grabbed === "plane") {
      add(xProp, dxEm * drag)
      add(yProp, dyEm * drag)
      if (depth === "perspective") {
        const along = dxEm * DEPTH_SCREEN[0] + (-dyEm) * DEPTH_SCREEN[1]
        add(zProp, along * drag * 0.6)
      }
    } else {
      // A handle points along its own property, and gives the perpendicular
      // to a second one, so a stem can be thickened and its modulation
      // adjusted without letting go.
      add(grabbed.x, dxEm * drag)
      add(grabbed.y, dyEm * drag)
    }
    if (moves.length) onDrag({ moves, aiming: aimingOf(grabbed, xProp, yProp) })
  }, [beyond, busy, depth, hasGeometry, onDrag, probe, toEm, xProp, yProp, zProp])

  /** The pointer the drawing has captured, so it can be handed back. */
  const captured = useRef<number | null>(null)

  const down = useCallback((e: React.PointerEvent) => {
    // Before any of the reasons this might not become a drag. A press that
    // misses a handle is still a press on the drawing, and left to itself the
    // browser answers it by sweeping a selection across the whole panel.
    if (e.button === 0 || e.pointerType !== "mouse") e.preventDefault()
    if (busy) return
    const h = depth === "handles" ? probe(e.clientX, e.clientY) : null
    const grabbed: Handle | "plane" = h ?? (depth === "handles" ? null as never : "plane")
    if (depth === "handles" && !h) return
    const p = toEm(e.clientX, e.clientY)
    if (!p) return
    // Anything already highlighted stays highlighted through the drag and
    // comes back the moment the pointer moves over it.
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) sel.removeAllRanges()
    last.current = { x: p.x, y: p.y }
    held.current = grabbed
    captured.current = e.pointerId
    setDragging(grabbed)
    onDragStart(aimingOf(grabbed, xProp, yProp))
    // Capture on the drawing, never on what happens to be under the pointer.
    // The outlines are rebuilt on every frame of the drag, so a capture held
    // by a path dies with the path it was taken on, and the movement and the
    // release that ends it are both delivered somewhere else.
    svg.current?.setPointerCapture?.(e.pointerId)
  }, [busy, depth, onDragStart, probe, toEm, xProp, yProp])

  const up = useCallback(() => {
    if (!held.current) return
    held.current = null
    last.current = null
    if (captured.current !== null) {
      svg.current?.releasePointerCapture?.(captured.current)
      captured.current = null
    }
    setDragging(null)
    onDragEnd()
  }, [onDragEnd])

  // The third property, when it is not coming from a handle.
  const wheel = useCallback((e: React.WheelEvent) => {
    if (!held.current || depth !== "modifier") return
    const drag = beyond ? 0.45 : 1
    onDrag({ moves: [{ key: zProp, amount: -e.deltaY * 0.0016 * drag }],
             aiming: [zProp] })
  }, [beyond, depth, onDrag, zProp])

  const marker = dragging && dragging !== "plane" ? dragging : hover
  const showing = !!marker && !busy

  return (
    <div ref={box} className="relative w-full h-full select-none">
      <svg
        ref={svg}
        viewBox={`${VB.x0} ${VB.y0} ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={`w-full h-full touch-none select-none lg:pr-0 ${
          dock === "right" ? "pr-8" : dock === "left" ? "pl-8" : ""} ${
          dragging ? "cursor-grabbing"
          : showing ? "cursor-grab"
          : depth === "handles" ? "cursor-default" : "cursor-grab"}`}
        onPointerMove={move}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={(e) => {
          if (held.current) return
          if (e.pointerType !== "mouse") setTimeout(() => setHover(null), 1500)
          else setHover(null)
        }}
        onWheel={wheel}
      >
        <g transform="scale(1,-1)">
          {/* Baseline, x-height and cap, behind the type. The letters are read
              against them the way a designer reads them off a drawing, and
              they sit under the ink rather than over it. */}
          {guides && (
            <g pointerEvents="none" stroke="hsl(var(--ink) / 0.13)"
               strokeWidth={0.004}>
              <line x1={VB.x0} x2={VB.x0 + VB.w} y1={0} y2={0}
                    strokeWidth={0.006} />
              <line x1={VB.x0} x2={VB.x0 + VB.w} y1={xh} y2={xh} />
              <line x1={VB.x0} x2={VB.x0 + VB.w} y1={capH} y2={capH} />
            </g>
          )}
          {/* A shallow presentation, so "further away" is a direction the hand
              can push in. The letters stay flat and readable: the depth is in
              how the specimen sits, not in extruded type. */}
          <g transform={depth === "perspective"
            ? "matrix(1,0,-0.16,1,0.06,0)" : undefined}>
            {depth === "perspective" && (
              <g opacity="0.10"
                 transform="translate(0.055,0.045) scale(0.985)"
                 fill="currentColor" fillRule="evenodd">
                {placed.map((p, i) => (
                  <path key={i} transform={`translate(${p.x0.toFixed(4)},0)`}
                        d={p.g.path} />
                ))}
              </g>
            )}
            <g fill="currentColor" fillRule="evenodd">
              {placed.map((p, i) => (
                <path key={i} transform={`translate(${p.x0.toFixed(4)},0)`}
                      d={p.g.path} />
              ))}
            </g>
          </g>

          {/* Every grab point, always, each in its property's colour. Once one
              is under the hand the rest fade back: the question has become
              "this stem", and the other seventy points are no longer part of
              it. */}
          <g pointerEvents="none">
            {(points === "off" ? [] : handles).map((h, i) => {
              const held = dragging !== "plane" && dragging?.kind === h.kind
                && dragging.glyph === h.glyph
              const near = !dragging && hover?.kind === h.kind
                && hover.glyph === h.glyph
              const singled = !!dragging || !!hover
              if (points === "minimal" && !held && !near) return null
              const alpha = held || near ? 0.95 : singled ? 0.09 : 0.4
              return (
                <circle
                  key={`${h.glyph}:${h.kind}:${i}`}
                  cx={h.at[0]} cy={h.at[1]}
                  r={held ? 0.052 : near ? 0.044 : 0.03}
                  fill={held ? "hsl(var(--burgundy))"
                             : handleColour(h.kind, alpha)}
                />
              )
            })}
          </g>

          {showing && marker && (
            <g pointerEvents="none">
              <circle cx={marker.at[0]} cy={marker.at[1]} r={0.068}
                      fill="none"
                      stroke={dragging ? "hsl(var(--burgundy))"
                                       : "hsl(var(--here))"}
                      strokeWidth={dragging ? 0.012 : 0.008} />
              <line
                x1={marker.at[0] - marker.along[0] * 0.085}
                y1={marker.at[1] - marker.along[1] * 0.085}
                x2={marker.at[0] + marker.along[0] * 0.085}
                y2={marker.at[1] + marker.along[1] * 0.085}
                stroke={dragging ? "hsl(var(--burgundy))" : "hsl(var(--here))"}
                strokeWidth={0.01}
                strokeLinecap="round" opacity={0.8} />
            </g>
          )}
        </g>
      </svg>

      {/* What the type is being set in, at the head of the panel it is set
          in. It had been up in the menu bar, a long way from the letters it
          changes. */}
      <div className="absolute top-1 left-2 right-2 flex items-center gap-1
                      overflow-x-auto no-scrollbar">
        {proofs.map((t) => (
          <button
            key={t}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setText(t)}
            title={t}
            className={`font-mono text-[9px] px-2 py-[3px] rounded-full border
                        transition-all active:translate-y-px ${text === t
                          ? "border-burgundy bg-burgundy text-ivory"
                          : "border-border bg-muted/60 text-muted-foreground "
                            + "hover:bg-card hover:text-foreground "
                            + "hover:border-burgundy/60"}`}
          >
            {t === "Hamburgefonstiv" ? "Ham"
              : t === "Vectorography" ? "Vg"
              : t === "adhesion" ? "adh"
              : t.startsWith("HHOO") ? "HHOO" : "pangram"}
          </button>
        ))}
        <input
          value={text}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="font-mono text-[10px] w-24 sm:w-40 ml-2 px-2 py-1 rounded-sm
                     select-text
                     bg-background border border-ink/25
                     shadow-[inset_0_1px_2px_hsl(var(--ink)/0.08)]
                     focus:outline-none focus:border-burgundy
                     focus:ring-1 focus:ring-burgundy/30
                     placeholder:text-muted-foreground/60"
          placeholder="type anything"
          title={"What the specimen sets. Reading the letters is how you "
            + "decide where to go."}
        />

        {/* The real families you are standing among, nearest first, each set
            in its own face: the list was a readout, and every line of it is
            somewhere the traveller might want to be. */}
        <div className="flex-1" />
        <FamilyPicker neighbours={neighbours} onPick={onGoToFamily}
                      sample={[...text].filter((c) => /[A-Za-z]/.test(c))
                        .slice(0, 3).join("") || "Ham"} />
      </div>

      {showing && marker && (
        <div className="absolute top-8 left-2 font-mono text-[10px]
                        pointer-events-none">
          <span style={{ color: dragging ? "hsl(var(--burgundy))"
                                         : handleColour(marker.kind) }}>
            {marker.label}
          </span>
          {marker.y && marker.x && marker.y !== marker.x && (
            <span style={{ color: handleColour(marker.y, 0.75) }}>
              {" · ↕ "}{marker.y}
            </span>
          )}
        </div>
      )}

      <StageToolbar tools={tools} dock={dock}
                    setDock={(d) => { setDock(d); localStorage.setItem("vg.dock.v2", d) }} />

      {/* The wheel's job, for hands without a wheel: a fader that springs
          back to rest, so it deals in movement rather than position, exactly
          as the wheel does. Coarse pointers only. */}
      {depth === "modifier" && (
        <div className="hidden coarse:flex absolute left-1 top-1/3 bottom-1/4
                        w-6 flex-col items-center opacity-70"
             title={`${zProp}: drag up or down, springs back`}
             onPointerDown={(e) => e.stopPropagation()}>
          <input
            type="range" min={-50} max={50} value={fader}
            style={{ writingMode: "vertical-lr", direction: "rtl",
                     touchAction: "none" }}
            className="vg-fader flex-1 w-4 accent-burgundy opacity-70"
            onPointerDown={() => {
              faderLast.current = 0
              onDragStart([zProp as HandleKind])
            }}
            onChange={(e) => {
              const v = Number(e.target.value)
              const d = v - faderLast.current
              faderLast.current = v
              setFader(v)
              const drag = beyond ? 0.45 : 1
              onDrag({ moves: [{ key: zProp, amount: d * 0.012 * drag }],
                       aiming: [zProp] })
            }}
            onPointerUp={() => { setFader(0); faderLast.current = 0; onDragEnd() }}
            onPointerCancel={() => { setFader(0); faderLast.current = 0; onDragEnd() }}
          />
        </div>
      )}

      <div className={`absolute bottom-1 left-2 flex flex-wrap items-center
                       gap-1 ${dock === "bottom-right" ? "right-[124px]"
                         : dock === "bottom" ? "right-[124px]" : "right-2"}`}>
        {depth !== "handles" && (
          <span className="hidden lg:flex items-center gap-1 ml-1">
            {([["↔", xProp, 0], ["↕", yProp, 1], ["⌖", zProp, 2]] as const)
              .map(([sym, val, slot]) => (
                <span key={slot} className="flex items-center gap-0.5">
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {sym}
                  </span>
                  <select
                    value={val}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = e.target.value as HandleKind
                      setProps(slot === 0 ? v : xProp, slot === 1 ? v : yProp,
                               slot === 2 ? v : zProp)
                    }}
                    className="font-mono text-[9px] bg-card border border-border
                               rounded-sm px-0.5 py-0.5"
                  >
                    {PROPS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </span>
              ))}
          </span>
        )}

        {/* Departure, where the hand is. The three numbers this used to read
            out, r and \u03c1 and k\u2085, are the altitude strip's job and are
            written out in words there; under the letters they were a row of
            Greek that had to be decoded before it said anything. What is left
            is the one state a traveller must not miss: outlines out here are
            guesses rather than readings. */}
        {beyond && (
          <span className="font-mono text-[10px] ml-2 whitespace-nowrap
                           text-gold"
                title={"Past the furthest real family in the corpus. The "
                  + "shapes still draw, but nothing was ever fitted this far "
                  + "out, so read them as guesses. The altitude strip in the "
                  + "map says how far out you are."}>
            {"\u26a0 beyond the hull"}
          </span>
        )}

      </div>
    </div>
  )
}

function aimingOf(grabbed: Handle | "plane", xProp: HandleKind,
                  yProp: HandleKind): HandleKind[] {
  if (grabbed === "plane") return [xProp, yProp]
  return [grabbed.x, grabbed.y].filter(Boolean) as HandleKind[]
}
