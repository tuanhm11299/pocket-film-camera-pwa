import { ref, watch, type Ref } from 'vue'

/** A string preference kept in localStorage, for small per-device conveniences. */
export function useStoredString(key: string, fallback: string): Ref<string> {
  let initial = fallback
  try {
    initial = localStorage.getItem(key) ?? fallback
  } catch {
    // Storage can be unavailable, e.g. in private browsing. The default is fine.
  }
  const value = ref(initial)
  watch(value, (v) => {
    try {
      localStorage.setItem(key, v)
    } catch {
      // Not saved; the app still works.
    }
  })
  return value
}

/** A JSON preference kept in localStorage. Unreadable values give the fallback. */
export function useStoredJSON<T>(key: string, fallback: T): Ref<T> {
  let initial = fallback
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) initial = JSON.parse(stored) as T
  } catch {
    // Unavailable storage or a damaged value; the default is fine.
  }
  const value = ref(initial) as Ref<T>
  watch(
    value,
    (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {
        // Not saved; the app still works.
      }
    },
    { deep: true },
  )
  return value
}
