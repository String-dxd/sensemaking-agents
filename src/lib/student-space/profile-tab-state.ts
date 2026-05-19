/**
 * Thin React-side bridge for the Profile non-VIPS tabs (Relationships +
 * Choices). The `/library/relationships` and `/library/choices` routes do
 * NOT mount the full engine (`StudentSpaceHost`) — they only need access to
 * the engine state singletons. This module ensures those singletons exist,
 * hydrates them from `Persistence` once per session, and exposes a tiny
 * `useEngineSlice` hook that triggers re-renders on slice mutations.
 *
 * When the engine IS already booted (the user navigated here from `/`),
 * the singleton-guarded constructors are no-ops and we share state.
 */

import { useEffect, useState } from 'react'
import Choices from '~/engine/student-space/Game/State/Choices.js'
import Persistence from '~/engine/student-space/Game/State/Persistence.js'
import Relationships from '~/engine/student-space/Game/State/Relationships.js'

let booted = false

interface SubscribableSlice {
  subscribe: (cb: (event: unknown) => void) => () => void
}

/**
 * Ensure the Persistence singleton + Relationships and Choices slices exist
 * and have hydrated from disk at least once. Safe to call repeatedly.
 *
 * SSR-safe: bails out early when `window` is undefined so the route loader
 * can call this without dragging localStorage into a server render.
 */
export function bootProfileTabSlices(): {
  relationships: Relationships
  choices: Choices
} | null {
  if (typeof window === 'undefined') return null
  // The Persistence constructor is singleton-guarded; calling it when the
  // engine already booted simply returns the same instance.
  const persistence = Persistence.getInstance() ?? new Persistence()
  const relationships = Relationships.getInstance() ?? new Relationships()
  const choices = Choices.getInstance() ?? new Choices()
  if (!booted) {
    const snapshot = persistence.load()
    // `Persistence.load()` types each slice as `unknown` since it has no
    // opinion on shapes; each merger inside the slice is lenient.
    relationships.hydrate(snapshot.relationships as Parameters<Relationships['hydrate']>[0])
    choices.hydrate(snapshot.choices as Parameters<Choices['hydrate']>[0])
    booted = true
  }
  return { relationships, choices }
}

/**
 * Subscribe to a slice's pub/sub and re-render the calling component on any
 * notify. Returns the slice itself; callers read via the slice's own list
 * accessors (which return referentially stable arrays between mutations).
 *
 * Using a version counter + useState instead of `useSyncExternalStore` so
 * we don't have to materialise stable composite snapshots — the slice's
 * own accessors are the stable surface.
 */
export function useEngineSlice<T extends SubscribableSlice>(slice: T | null): T | null {
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!slice) return
    const unsub = slice.subscribe(() => setVersion((v) => v + 1))
    return unsub
  }, [slice])
  return slice
}

/** Reset module-level boot flag — for tests only. */
export function resetProfileTabBoot() {
  booted = false
}
