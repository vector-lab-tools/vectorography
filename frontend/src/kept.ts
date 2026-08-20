import { useCallback, useState } from "react"

/**
 * A choice about the desk, remembered.
 *
 * Anything that says how the instrument is set up rather than where the
 * traveller is: which mode the hand is in, what the map is coloured by, how
 * the window is divided. A journey belongs in a file; these belong to the
 * machine, and having to set them again every morning made the instrument
 * feel like a demonstration rather than a tool.
 */
export function useKept<T>(key: string, initial: T,
                           valid: (v: unknown) => boolean = () => true) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial
      const parsed = JSON.parse(raw) as T
      return valid(parsed) ? parsed : initial
    } catch { return initial }
  })
  const set = useCallback((next: T) => {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* full or blocked */ }
  }, [key])
  return [value, set] as const
}
