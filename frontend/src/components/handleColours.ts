import type { HandleKind } from "./handles"

/**
 * A colour per property, used wherever that property appears: the grab points
 * on the letterform, and the slider that moves the same direction from the
 * rail. Two controls for one property should look like one thing.
 *
 * Hues are spaced round the wheel and kept at a muted saturation so eight of
 * them can sit on a specimen without turning it into a diagram. Red is not
 * among them: red means the hand has hold of something.
 */
export const HANDLE_HUE: Record<HandleKind, string> = {
  weight: "218 62% 48%",        // blue
  width: "188 58% 40%",         // teal
  tightness: "150 46% 38%",     // green
  "x-height": "96 44% 38%",     // olive
  contrast: "42 72% 44%",       // amber
  serif: "22 68% 48%",          // orange
  straightness: "272 44% 52%",  // violet
  slant: "322 46% 50%",         // magenta
}

export function handleColour(kind: HandleKind, alpha = 1) {
  return `hsl(${HANDLE_HUE[kind]} / ${alpha})`
}
