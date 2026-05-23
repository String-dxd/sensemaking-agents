import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'
import { CaptureFab } from './student-space/capture/CaptureFab'
import { StudentSpaceHud } from './student-space/hud/StudentSpaceHud'
import { WorldInteractions } from './student-space/world/WorldInteractions'

/**
 * World-route React composition. Mounts on `/` and `/onboarding` — the
 * `WorldInteractions` bridge that hosts Kira's speech bubble must be
 * present during the ceremony, so it's never gated out.
 *
 * Chrome (HUD, CaptureFab, IslandProgressionOverlay) only appears once
 * `onboarding.isDone === true`. Gating directly on engine state — rather
 * than the `isOnboarding` overlay flag — closes the one-frame flash
 * window between game boot and `OnboardingFlow`'s `setIsOnboarding(true)`
 * effect commit.
 */
type GameLike = {
  state?: {
    onboarding?: {
      stage?: string
      isDone?: boolean
      subscribe?: (cb: () => void) => () => void
    }
  }
}

export function StudentSpaceHost() {
  const game = useEngine()
  const { isOnboarding } = useEngineOverlay()

  const onboarding = (game as unknown as GameLike | null)?.state?.onboarding
  // Re-render the moment the ceremony hits `done` so chrome appears
  // without waiting for the overlay provider's effect to settle.
  useEngineSliceVersion(
    onboarding?.subscribe ? (onboarding as { subscribe: (cb: () => void) => () => void }) : null,
  )

  if (!game) return null

  const ceremonyDone = onboarding?.isDone === true || onboarding?.stage === 'done'
  const showWorldChrome = ceremonyDone && !isOnboarding

  return (
    <>
      <WorldInteractions game={game} onboardingMode={!ceremonyDone || isOnboarding} />
      {showWorldChrome ? (
        <>
          <IslandProgressionOverlay game={game} />
          <StudentSpaceHud game={game} />
          <CaptureFab />
        </>
      ) : null}
    </>
  )
}
