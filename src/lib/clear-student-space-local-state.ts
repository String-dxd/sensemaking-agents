/**
 * Clears every `ss:v1:*` localStorage key the vendored Student Space engine
 * writes via its default `localStorageAdapter()`. Call this from any sign-out
 * surface (form submit handler, palette command) immediately before the
 * server-side sign-out so the next signed-in student does not inherit the
 * previous student's persisted engine state.
 *
 * This is a mitigation for the larger architectural fix tracked in plan
 * `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md`: a
 * per-student-key-prefixing wrapper around `localStorageAdapter()` and a
 * Postgres-backed StorageAdapter to replace localStorage entirely. Both
 * depend on backend wiring not yet in scope for this PR.
 *
 * Safe to call from SSR — guards on `typeof window`.
 */
export function clearStudentSpaceLocalState(): void {
  if (typeof window === 'undefined') return
  try {
    const storage = window.localStorage
    if (!storage) return
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith('ss:v1:')) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    // localStorage is unavailable (e.g. privacy mode); nothing to clear.
  }
}
