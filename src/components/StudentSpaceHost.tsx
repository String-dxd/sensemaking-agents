import { lazy, Suspense } from 'react'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'
import { CaptureFab } from './student-space/capture/CaptureFab'
import { StudentSpaceHud } from './student-space/hud/StudentSpaceHud'

// `WorldInteractions` imports all of three.js. Lazy so the renderer stays off
// the chunk graph the browser parses before hydration — it can only do
// anything once the engine exists anyway, which is strictly later. The fetch
// still starts at module evaluation (not first render) so the hover/click
// bridges are ready by the time the engine boots, instead of leaving a brief
// window where the canvas is interactive but unbridged.
const worldInteractionsPromise =
  typeof window === 'undefined' ? null : import('./student-space/world/WorldInteractions')
const WorldInteractions = lazy(() =>
  (worldInteractionsPromise ?? import('./student-space/world/WorldInteractions')).then((m) => ({
    default: m.WorldInteractions,
  })),
)

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
      <Suspense fallback={null}>
        <WorldInteractions game={game} onboardingMode={!ceremonyDone || isOnboarding} />
      </Suspense>
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
