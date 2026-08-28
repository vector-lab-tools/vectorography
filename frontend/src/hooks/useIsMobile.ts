import { useSyncExternalStore } from "react"

// The same boundary as Tailwind's `lg`, so the stylesheet and the component
// tree never disagree about which layout is showing.
const QUERY = "(min-width: 1024px)"

const mql = window.matchMedia(QUERY)

function subscribe(cb: () => void) {
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

export function useIsMobile(): boolean {
  return !useSyncExternalStore(subscribe, () => mql.matches, () => true)
}
