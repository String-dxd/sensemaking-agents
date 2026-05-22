import { createContext, useContext } from 'react'
import type { Game } from '~/engine/student-space/Game'

/**
 * Engine instance exposed to React surfaces via context. `null` while the
 * engine is still booting (dynamic import + `createGame`); non-null thereafter.
 *
 * Mounted by `<EngineHost>` once at the root layout level. Routed-page React
 * components (post-Phase B) and non-routed overlays (post-Phase C+) read the
 * engine instance through `useEngine()` instead of prop drilling or
 * window.__studentSpaceGame.
 */
export const EngineContext = createContext<Game | null>(null)

/**
 * Returns the live engine instance, or `null` while it's still booting.
 * Surfaces that absolutely require the engine (e.g. mid-flight rendering)
 * should render a lightweight placeholder while the value is null.
 */
export function useEngine(): Game | null {
  return useContext(EngineContext)
}
