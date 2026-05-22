import { useEffect, useState } from 'react'

/**
 * React subscription to an engine slice. The slice's `subscribe(cb)` returns
 * an unsubscribe function and fires `cb` on every mutation; we bump a version
 * counter to force a re-render.
 *
 * We use a version counter instead of `useSyncExternalStore` because engine
 * slices return fresh array/object instances from their accessors on every
 * call, which trips React's cached-snapshot warning under SES. Slice
 * hardening for `useSyncExternalStore` is deferred (see plan Scope Boundaries).
 *
 * Shared by the migrated React surfaces so they can subscribe without owning
 * engine slice internals.
 */
export interface EngineSliceSubscribable {
  subscribe: (cb: () => void) => () => void
}

export function useEngineSliceVersion(slice: EngineSliceSubscribable | null | undefined): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!slice) return
    return slice.subscribe(() => setVersion((v) => v + 1))
  }, [slice])
  return version
}
