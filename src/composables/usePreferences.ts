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
