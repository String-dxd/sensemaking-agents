import { useEngine } from '~/lib/student-space/use-engine'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'

/**
 * World-route React composition. Mounts only when the home (`/`) route is
 * active — for routed sheet pages (Phase B), the routes own their own
 * content; for non-routed overlays (Phase C/E/F/G), this is where capture
 * sheets, HUDs, in-world labels, pickers, and the onboarding flow will live
 * as the migration progresses.
 *
 * Engine boot, canvas DOM, backend bridge, and route-sync moved to
 * `<EngineHost>` in U2. This component reads the live engine through
 * `useEngine()` and stays a small composition surface.
 */
export function StudentSpaceHost() {
  const game = useEngine()
  if (!game) return null
  return <IslandProgressionOverlay game={game} />
}
