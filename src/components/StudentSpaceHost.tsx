import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'
import { CaptureFab } from './student-space/capture/CaptureFab'
import { StudentSpaceHud } from './student-space/hud/StudentSpaceHud'
import { WorldInteractions } from './student-space/world/WorldInteractions'

/**
 * World-route React composition. Mounts only when the home (`/`) route is
 * active — for routed sheet pages (Phase B), the routes own their own
 * content; for non-routed overlays (Phase C/E/F/G), this is where capture
 * sheets, HUDs, in-world labels, pickers, and the onboarding flow live.
 *
 * Engine boot, canvas DOM, backend bridge, and route-sync moved to
 * `<EngineHost>` in U2. This component reads the live engine through
 * `useEngine()` and stays a small composition surface.
 *
 * U13/U15: HUDs and admin pickers now render as React/Tailwind surfaces from
 * this host. Engine state and view modules stay authoritative for behavior.
 */
export function StudentSpaceHost() {
  const game = useEngine()
  const { isOnboarding } = useEngineOverlay()

  if (!game) return null
  return (
    <>
      <WorldInteractions game={game} onboardingMode={isOnboarding} />
      {isOnboarding ? null : (
        <>
          <IslandProgressionOverlay game={game} />
          <StudentSpaceHud game={game} />
          <CaptureFab />
        </>
      )}
    </>
  )
}
