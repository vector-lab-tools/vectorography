import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Glyph } from "../api"
import { FamilyPicker } from "./FamilyPicker"
import { ProofBox } from "./ProofBox"
import { ICONS, StageToolbar, type Dock, type Tool } from "./StageToolbar"
import { handleColour } from "./handleColours"
import { GUIDE_STROKE, type GuideStyle } from "./Settings"
import { LINE_H, allHandles, handleAt, layout, lineCount, lineWidth,
         xHeightOf, type Handle, type HandleKind } from "./handles"

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

export const PROPS: HandleKind[] = ["weight", "width", "tightness", "x-height",
                                    "contrast", "serif", "straightness",
                                    "slant"]

export function SpecimenStage({
  glyphs, text, hullRadius, radius, depth, setDepth,
  onDragStart, onDrag, onDragEnd, lost, onReset,
  onUndo, onRedo, canUndo, canRedo, guideInk, guideStyle,
  setText, neighbours, onGoToFamily, geometry, busy,
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
  /** How strongly the guides and the depth rails are drawn. */
  guideInk: number
  /** And in what manner. */
  guideStyle: GuideStyle
  /** Outlines for hit-testing, which arrive after the specimen does. */
  geometry: Glyph[] | null
  /** The word being set. */
  setText: (t: string) => void
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
  // Which handle a press is asking for. With one chosen, a press anywhere on
  // the drawing takes hold of that property, so a designer working on weight
  // does not have to find a stem edge every time. "all" is the letterform
  // answering for itself, which is the mode the tool is named after.
  const [priority, setPriority] = useState<HandleKind | "all">(
    () => (localStorage.getItem("vg.handle") as HandleKind | null) ?? "all")
  const choosePriority = useCallback((k: HandleKind | "all") => {
    setPriority(k)
    localStorage.setItem("vg.handle", k)
  }, [])
  // Which way the shell is facing. A drag in perspective turns it, so the
  // space answers the hand rather than sitting behind the letters as a
  // decoration: moving across the floor spins it, pushing away tilts it.
  const [spin, setSpin] = useState({ yaw: 0.5, pitch: 0.42 })
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

  // A tall panel sets the text over as many lines as it can show at a
  // readable size; a short one keeps to one, as before. The measure is
  // whatever width gives every line about the same height as the box allows,
  // so dragging the divider changes the setting rather than the scale.
  // The measure the text is set to, in ems. Chosen by working out how big
  // each candidate setting would actually be drawn, which is the same sum the
  // SVG does when it fits the drawing to the box: the smaller of what the
  // width allows and what the height allows. Deriving it from the height
  // alone made a tall panel ask for an impossibly narrow measure, every
  // multi-line setting wrapped to more lines than it had asked for and was
  // thrown out, and the specimen fell back to one line drawn small. Dragging
  // the panel taller made the letters smaller, which is the opposite of what
  // dragging it taller is for.
  const [measure, setMeasure] = useState(Infinity)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      const wide = lineWidth(layout(glyphs, text))
      let best = { measure: Infinity, size: 0 }
      for (let n = 1; n <= 4; n++) {
        // Start from lines of roughly equal length, then let the measure grow
        // to whatever the box can actually show at the size that setting is
        // drawn at. Stopping at the first guess set the text to a measure
        // taken from its own length rather than from the room available, and
        // left a wide panel with margins down both sides.
        let m = n === 1 ? Infinity : (wide / n) * 1.02
        let size = 0
        for (let pass = 0; pass < 4; pass++) {
          const set = layout(glyphs, text, m)
          const vbW = lineWidth(set) + 0.12
          const vbH = 1.24 + (lineCount(set) - 1) * LINE_H
          size = Math.min(w / vbW, h / vbH)
          if (n === 1) break
          const grown = w / size - 0.12
          if (grown <= m + 0.02) break
          m = grown
        }
        // A further line has to earn its place by a clear margin, or the
        // setting flickers between two of them as the panel is dragged.
        if (size > best.size * 1.04) best = { measure: m, size }
      }
      setMeasure(best.measure)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [glyphs, text])

  const placed = useMemo(
    () => layout(glyphs, text, measure), [glyphs, text, measure])

  const probed = useMemo(
    () => layout(geometry ?? [], text, measure), [geometry, text, measure])
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
  // How many screen pixels one em is, right now. The drawing is fitted to the
  // box, and the box's contents change size as the type does, so anything
  // meant to stay the same size on screen has to be divided by this. The
  // grab points were fixed fractions of an em and grew as the letters got
  // narrower, which made the instrument look like it was zooming while the
  // type was being worked on.
  const lines = lineCount(placed)
  const VB = { x0: -0.06, y0: -0.94, w: width + 0.12,
               h: 1.24 + (lines - 1) * LINE_H }
  const el = box.current
  const scale = el && el.clientWidth
    ? Math.min(el.clientWidth / VB.w, el.clientHeight / VB.h) : 0
  /** A length in screen pixels, in the drawing's own units. */
  const px = (n: number) => (scale > 0 ? n / scale : n / 260)

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
    if (priority !== "all") {
      // The nearest handle of the kind asked for. Nearest, not the first,
      // so a word of many letters is still worked on where the hand is.
      let best: Handle | null = null
      let bestD = Infinity
      for (const h of handles) {
        if (h.kind !== priority) continue
        const d = Math.hypot(h.at[0] - p.x, h.at[1] - p.y)
        if (d < bestD) { bestD = d; best = h }
      }
      if (best) return best
    }
    return handleAt(probed, p.x, p.y, xh)
  }, [handles, priority, probed, toEm, xh])

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
      menu: d === "handles" ? (
        <span className="flex flex-col gap-1">
          <span className="rail-label !text-[8px]">handle to grab</span>
          {(["all", ...PROPS] as (HandleKind | "all")[]).map((k) => {
            const offered = k === "all" || handles.some((h) => h.kind === k)
            return (
              <button key={k} onClick={() => choosePriority(k)}
                      disabled={!offered}
                      title={k === "all"
                        ? "The part of the letter under the hand decides"
                        : offered
                          ? `A press anywhere takes hold of ${k}`
                          : `This specimen offers no ${k} handle`}
                      className={`text-left font-mono text-[10px] px-1.5 py-1
                                  max-lg:py-1.5 rounded-sm transition-colors
                                  disabled:opacity-30
                                  ${priority === k
                                    ? "bg-here/10 text-here"
                                    : "hover:bg-muted"}`}>
                {k === "all" ? "all \u00b7 choose via dot" : k}
              </button>
            )
          })}
        </span>
      ) : (
        <span className="flex flex-col gap-1.5">
          <span className="rail-label !text-[8px]">
            modifiers for dragging
          </span>
          {(d === "perspective"
            ? ([["\u2194 across the floor", xProp, 0],
                ["\u2191 away from the eye", zProp, 2]] as const)
            : ([["\u2194 sideways", xProp, 0],
                ["\u2195 up and down", yProp, 1],
                ["\u2316 wheel or fader", zProp, 2]] as const)
          ).map(([label, val, slot]) => (
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
      key: "points", divider: true, on: points !== "off" && depth === "handles",
      disabled: depth !== "handles",
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
      if (depth === "perspective") {
        setSpin((v) => ({
          yaw: v.yaw + dxEm * 1.6,
          // Short of the poles, where a wireframe reads as a flat disc and
          // the sense of turning is lost.
          pitch: Math.max(0.08, Math.min(1.32, v.pitch + dyEm * 1.1)),
        }))
        // The word stands on a floor. Sideways moves it across the floor and
        // up the screen pushes it away, which is where the third property
        // lives: one gesture, two properties, and the recession says which
        // is which without a caption. Modifier is the flat pad next door;
        // this is the one that has a distance in it.
        add(xProp, dxEm * drag)
        add(zProp, dyEm * drag * 1.15)
      } else {
        add(xProp, dxEm * drag)
        add(yProp, dyEm * drag)
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
            <g pointerEvents="none"
               stroke={`hsl(var(--ink) / ${guideInk.toFixed(2)})`}
               strokeWidth={GUIDE_STROKE[guideStyle].w}
               strokeDasharray={GUIDE_STROKE[guideStyle].dash}
               strokeLinecap={guideStyle === "dotted" ? "round" : "butt"}>
              <line x1={VB.x0} x2={VB.x0 + VB.w} y1={0} y2={0}
                    strokeWidth={GUIDE_STROKE[guideStyle].w * 1.5} />
              <line x1={VB.x0} x2={VB.x0 + VB.w} y1={xh} y2={xh} />
              <line x1={VB.x0} x2={VB.x0 + VB.w} y1={capH} y2={capH} />
            </g>
          )}
          {/* The same ball the atlas draws, behind the letters. Perspective
              needed a space to be a place in, and inventing a floor for it
              made a second spatial metaphor for one instrument. This is the
              corpus shell seen from inside: dashed, because it is a reading
              of where the corpus ends rather than a wall, and tilted to the
              angle the map is drawn at, so the two pictures are of the same
              space. Up the screen is away from the eye, into the ball. */}
          {depth === "perspective" && (() => {
            const lit = dragging === "plane"
            const cx = VB.x0 + VB.w / 2
            const cy = 0.3
            const R = Math.min(1.15, Math.max(0.62, VB.w * 0.28))
            const ink = "hsl(var(--muted-foreground))"
            const cy0 = Math.cos(spin.yaw), sy0 = Math.sin(spin.yaw)
            const cp = Math.cos(spin.pitch), sp = Math.sin(spin.pitch)
            // One projection, used for every ring: turn about the upright,
            // then tilt. The same two angles the atlas turns its ball by.
            const project = (a: number, b: number, c: number) => {
              const x1 = a * cy0 + c * sy0
              const z1 = -a * sy0 + c * cy0
              const y2 = b * cp - z1 * sp
              const depthOf = b * sp + z1 * cp
              return { x: cx + R * x1, y: cy + R * y2, front: depthOf }
            }
            // A great circle as two paths: the half facing the eye, drawn
            // plainly, and the half behind it, drawn fainter, which is what
            // makes a wireframe read as a solid rather than a knot.
            const ring = (key: string,
                          at: (t: number) => [number, number, number]) => {
              const near: string[] = []
              const far: string[] = []
              let wasFront: boolean | null = null
              const N = 72
              for (let i = 0; i <= N; i++) {
                const t = (i / N) * Math.PI * 2
                const q = project(...at(t))
                const isFront = q.front >= 0
                const into = isFront ? near : far
                const cmd = (wasFront === isFront ? "L" : "M")
                into.push(`${cmd}${q.x.toFixed(4)},${q.y.toFixed(4)}`)
                if (wasFront !== isFront && wasFront !== null) {
                  // Start the other run at the crossing too, so the two
                  // halves meet instead of leaving a gap at the silhouette.
                  ;(isFront ? far : near).push(
                    `M${q.x.toFixed(4)},${q.y.toFixed(4)}`)
                }
                wasFront = isFront
              }
              return (
                <g key={key}>
                  <path d={far.join(" ")} opacity={0.35} />
                  <path d={near.join(" ")} />
                </g>
              )
            }
            return (
              <g pointerEvents="none" fill="none" stroke={ink}
                 strokeWidth={0.004} strokeDasharray="0.022 0.03"
                 opacity={lit ? Math.min(1, guideInk * 1.7) : guideInk * 0.85}
                 style={{ transition: "opacity 120ms" }}>
                {/* The silhouette: a sphere's edge is a circle whichever way
                    it is turned, so this one does not move. */}
                <circle cx={cx} cy={cy} r={R} />
                {ring("equator", (t) => [Math.cos(t), 0, Math.sin(t)])}
                {ring("meridian", (t) => [Math.cos(t), Math.sin(t), 0])}
                {ring("meridian2", (t) => [0, Math.cos(t), Math.sin(t)])}
                {[0.5, -0.5].map((k) => ring(`lat${k}`, (t) => {
                  const r = Math.sqrt(1 - k * k)
                  return [r * Math.cos(t), k, r * Math.sin(t)]
                }))}
                {/* Where the eye is, so up reads as away rather than up. */}
                <g strokeDasharray="none" strokeWidth={0.006}
                   opacity={lit ? 1 : 0.7}>
                  <line x1={cx} y1={cy - R * 1.12} x2={cx} y2={cy - R * 0.72} />
                  <line x1={cx} y1={cy - R * 1.12}
                        x2={cx - 0.035} y2={cy - R * 1.04} />
                  <line x1={cx} y1={cy - R * 1.12}
                        x2={cx + 0.035} y2={cy - R * 1.04} />
                </g>
              </g>
            )
          })()}

          {/* A shallow presentation, so "further away" is a direction the hand
              can push in. The letters stay flat and readable: the depth is in
              how the specimen sits, not in extruded type. */}
          <g transform={depth === "perspective"
            ? "matrix(1,0,-0.16,1,0.06,0)" : undefined}>
            {depth === "perspective" && (
              <g opacity={dragging === "plane" ? 0.2 : 0.1}
                 transform="translate(0.055,0.045) scale(0.985)"
                 fill="currentColor" fillRule="evenodd">
                {placed.map((p, i) => (
                  <path key={i}
                        transform={`translate(${p.x0.toFixed(4)},${p.y0.toFixed(4)})`}
                        d={p.g.path} />
                ))}
              </g>
            )}
            <g fill="currentColor" fillRule="evenodd">
              {placed.map((p, i) => (
                <path key={i}
                      transform={`translate(${p.x0.toFixed(4)},${p.y0.toFixed(4)})`}
                      d={p.g.path} />
              ))}
            </g>
          </g>

          {/* Every grab point, always, each in its property's colour. Once one
              is under the hand the rest fade back: the question has become
              "this stem", and the other seventy points are no longer part of
              it. */}
          <g pointerEvents="none">
            {(points === "off" || depth !== "handles" ? [] : handles)
              .map((h, i) => {
              const held = dragging !== "plane" && dragging?.kind === h.kind
                && dragging.glyph === h.glyph
              const near = !dragging && hover?.kind === h.kind
                && hover.glyph === h.glyph
              const singled = !!dragging || !!hover
              if (points === "minimal" && !held && !near) return null
              // While a handle is in hand the rest go: the question has
              // become this stem, and seventy points around the letters it is
              // changing are something to read past rather than something to
              // use. They come back the moment it is let go.
              if (dragging && !held) return null
              const alpha = held || near ? 0.95 : singled ? 0.09 : 0.4
              return (
                <circle
                  key={`${h.glyph}:${h.kind}:${i}`}
                  cx={h.at[0]} cy={h.at[1]}
                  r={px(held ? 6.4 : near ? 5.6 : 3.8)}
                  fill={handleColour(h.kind, alpha)}
                />
              )
            })}
          </g>


      {/* What a press will take hold of, in the corner the eye starts from.
          The choice lives two presses deep in the toolbar, and a setting that
          changes every gesture should not be something to remember. */}
      <div className="absolute top-8 right-2 rail-label !text-[8px]
                      pointer-events-none">
        {depth === "handles"
          ? priority === "all" ? "handles \u00b7 all"
                               : `handles \u00b7 ${priority}`
          : depth === "perspective"
            ? `perspective \u00b7 ${xProp}/${zProp}`
            : `modifier \u00b7 ${xProp}/${yProp}/${zProp}`}
      </div>

      {showing && marker && (
            <g pointerEvents="none">
              {/* A ring, not a repaint: held is said by weight and by a
                  halo that separates the mark from whatever the letters are
                  drawn in, while the hue keeps saying which property. */}
              {dragging && (
                <circle cx={marker.at[0]} cy={marker.at[1]} r={px(8.6)}
                        fill="none" stroke="hsl(var(--card))"
                        strokeWidth={px(2.8)} opacity={0.85} />
              )}
              <circle cx={marker.at[0]} cy={marker.at[1]} r={px(8.6)}
                      fill="none"
                      stroke={handleColour(marker.kind, 1)}
                      strokeWidth={px(dragging ? 1.6 : 1)} />
              <line
                x1={marker.at[0] - marker.along[0] * px(11)}
                y1={marker.at[1] - marker.along[1] * px(11)}
                x2={marker.at[0] + marker.along[0] * px(11)}
                y2={marker.at[1] + marker.along[1] * px(11)}
                stroke={handleColour(marker.kind, 1)}
                strokeWidth={px(1.3)}
                strokeLinecap="round" opacity={0.8} />
            </g>
          )}
        </g>
      </svg>

      {/* What the type is being set in, at the head of the panel it is set
          in. It had been up in the menu bar, a long way from the letters it
          changes. */}
      {/* What the type is being set in, at the head of the panel it is set
          in. The five chips that stood here were the same strings the list
          holds, abbreviated to Ham and adh and HHOO, which read as words
          only to someone who already knew them. */}
      <div className="absolute top-1 left-2 right-2 z-30 flex items-center
                      justify-end gap-1">
        <ProofBox text={text} setText={setText} />

        {/* The real families you are standing among, nearest first, each set
            in its own face: the list was a readout, and every line of it is
            somewhere the traveller might want to be. */}
        <FamilyPicker neighbours={neighbours} onPick={onGoToFamily}
                      sample={[...text].filter((c) => /[A-Za-z]/.test(c))
                        .slice(0, 3).join("") || "Ham"} />
      </div>

      {depth === "perspective" && (
        <div className="absolute left-2 bottom-7 rail-label !text-[8px]
                        text-here pointer-events-none leading-tight">
          {"\u2191 away \u00b7 "}{zProp}
          <br />
          {"\u2194 across \u00b7 "}{xProp}
        </div>
      )}

      {/* What a press will take hold of, in the corner the eye starts from.
          The choice lives two presses deep in the toolbar, and a setting that
          changes every gesture should not be something to remember. */}
      <div className="absolute top-8 right-2 rail-label !text-[8px]
                      pointer-events-none">
        {depth === "handles"
          ? priority === "all" ? "handles \u00b7 all"
                               : `handles \u00b7 ${priority}`
          : depth === "perspective"
            ? `perspective \u00b7 ${xProp}/${zProp}`
            : `modifier \u00b7 ${xProp}/${yProp}/${zProp}`}
      </div>

      {showing && marker && (
        <div className="absolute top-8 left-2 font-mono text-[10px]
                        pointer-events-none">
          <span style={{ color: handleColour(marker.kind, 1) }}>
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
