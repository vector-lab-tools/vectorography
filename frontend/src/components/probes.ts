/**
 * Holding properties still while one of them is moved.
 *
 * The eight measured directions were fitted off the corpus and they are not
 * orthogonal to one another. Stepping along one as written therefore drags the
 * others with it: measured at `cardo`, a step of 1.5 along slant moves width
 * by −0.96, tightness by +0.96 and x-height by −0.95, which is about two
 * thirds of what was asked for, arriving in three properties nobody touched.
 * Eight sliders behaving that way are one control with eight handles.
 *
 * A probe is the part of a direction that the held properties cannot feel:
 * the target with its projection onto their span removed. Moving along it
 * changes the target's own reading and leaves every held reading exactly
 * where it was. Twisting serif with the other seven held reads serif +1.329
 * and −0.000 on all seven.
 *
 * What it costs is reach. Once the other seven are held, between 0.59 of a
 * direction (slant) and 0.95 (contrast) is left to move in, so the same step
 * travels less far. `surviving` reports that, and a probe with nothing left in
 * it means the properties being held have already decided this one.
 *
 * Done here rather than on the server because a slider that waits on a round
 * trip is dead, and this is a Gram-Schmidt over at most a dozen vectors.
 */

export type Probe = {
  /** Unit direction to move along. */
  u: number[]
  /** How much of the original direction survived the holding, 0 to 1. */
  surviving: number
}

const dot = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

const norm = (a: number[]) => Math.sqrt(dot(a, a))

/**
 * An orthonormal basis for the span of `vectors`, by modified Gram-Schmidt.
 *
 * Modified rather than classical: the vectors handed in are corpus directions
 * that sit close together, and the classical form loses orthogonality on
 * exactly that input.
 */
function basis(vectors: number[][]): number[][] {
  const out: number[][] = []
  for (const v of vectors) {
    const w = v.slice()
    for (const q of out) {
      const k = dot(w, q)
      for (let i = 0; i < w.length; i++) w[i] -= k * q[i]
    }
    const n = norm(w)
    // Anything this short was already inside the span of what came before it
    // and adds no direction to hold.
    if (n < 1e-9) continue
    for (let i = 0; i < w.length; i++) w[i] /= n
    out.push(w)
  }
  return out
}

/** `target` with everything the held directions can feel taken out of it. */
export function probe(target: number[], held: number[][]): Probe {
  const full = norm(target)
  if (full < 1e-12) return { u: target.slice(), surviving: 0 }
  const w = target.map((c) => c / full)
  for (const q of basis(held)) {
    const k = dot(w, q)
    for (let i = 0; i < w.length; i++) w[i] -= k * q[i]
  }
  const left = norm(w)
  if (left < 1e-9) return { u: target.map(() => 0), surviving: 0 }
  return { u: w.map((c) => c / left), surviving: left }
}

/**
 * Travel so that the reading along `target` becomes `value`, holding the rest.
 *
 * The reading stays what it always was, the projection onto the direction as
 * written, so a slider means the same thing whether anything is held or not.
 * Reaching a given reading along the probe instead of along the direction
 * takes a longer step, by exactly the reciprocal of what survived.
 */
export function slide(from: number[], target: number[], held: number[][],
                      value: number): number[] | null {
  const full = norm(target)
  if (full < 1e-12) return null
  const unit = target.map((c) => c / full)
  const { u, surviving } = probe(target, held)
  if (surviving < 1e-6) return null
  const t = (value - dot(from, unit)) / surviving
  if (Math.abs(t) < 1e-9) return null
  return from.map((c, i) => c + t * u[i])
}
