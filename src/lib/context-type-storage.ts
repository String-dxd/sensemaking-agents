/**
 * Shared localStorage helpers for the last-used VIPS context type.
 *
 * Two writers — `ContextTypePicker` (post-Stop review path) and
 * `MirrorSession` (synthetic default when the picker is skipped) — need
 * the same key and the same parsing discipline so a new variant added
 * to `VipsContextTypeSchema` doesn't silently fall back to `'school'`
 * in one and to the new value in the other.
 */
import { type VipsContextType, VipsContextTypeSchema } from '~/agents/tools/schemas'

export const CONTEXT_LAST_USED_KEY = 'sensemaking.context_type.last_used'

const DEFAULT_CONTEXT_TYPE: VipsContextType = 'school'

export function readLastUsedContextType(): VipsContextType {
  if (typeof window === 'undefined') return DEFAULT_CONTEXT_TYPE
  try {
    const raw = window.localStorage.getItem(CONTEXT_LAST_USED_KEY)
    const parsed = raw ? VipsContextTypeSchema.safeParse(raw) : null
    if (parsed?.success) return parsed.data
  } catch {
    /* localStorage unavailable (private mode / SSR / etc.) — fall through. */
  }
  return DEFAULT_CONTEXT_TYPE
}

export function writeLastUsedContextType(next: VipsContextType): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONTEXT_LAST_USED_KEY, next)
  } catch {
    /* best-effort */
  }
}
