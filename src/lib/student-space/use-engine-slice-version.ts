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
 * Originally lived in `src/engine/student-space/profile-tab-react-bridge.tsx`;
 * extracted here so every React surface can subscribe without importing the
 * (soon-to-be-removed) bridge.
 */
export interface EngineSliceSubscribable {
  subscribe: (cb: () => void) => () => void
}

export function useEngineSliceVersion(slice: EngineSliceSubscribable | null | undefined): void {
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!slice) return
    return slice.subscribe(() => setVersion((v) => v + 1))
  }, [slice])
}
