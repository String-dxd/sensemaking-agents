import type { Game } from '~/engine/student-space/Game'
import { performOnboardingSkip } from '~/lib/student-space/onboarding-skip'
import { cn } from '~/lib/utils'

/**
 * Floating "Skip onboarding (dev)" button (U16 React rewrite of
 * `src/engine/student-space/Game/View/Onboarding/SkipButton.js`).
 *
 * Lives outside the `.onboarding-root` subtree so per-surface fade
 * transitions don't tween it in and out alongside the active surface.
 * Hidden on `login` / `done` / `pending` stages — EdupassLogin renders
 * its own inline skip affordance integrated with the landing wordmark.
 */
export function SkipButton({ game, stage }: { game: Game | null; stage: string }) {
  const hidden = stage === 'login' || stage === 'done' || stage === 'pending'

  return (
    <button
      type="button"
      aria-label="Skip onboarding (dev)"
      data-testid="onboarding-skip"
      onClick={() => {
        const state = (
          game as unknown as { state?: Parameters<typeof performOnboardingSkip>[0]['state'] } | null
        )?.state
        const profile = (
          game as unknown as {
            state?: { profile?: Parameters<typeof performOnboardingSkip>[0]['profile'] }
          } | null
        )?.state?.profile
        performOnboardingSkip({ state: state ?? null, profile: profile ?? null })
      }}
      className={cn(
        'fixed left-1/2 bottom-[18vh] -translate-x-1/2 z-[60]',
        'px-3 py-1.5 border-0 bg-transparent cursor-pointer',
        'text-[11px] font-medium font-sans leading-tight tracking-[0.04em] lowercase',
        'text-[rgba(43,38,32,0.45)] underline decoration-dotted decoration-transparent underline-offset-[3px]',
        'transition-[color,text-decoration-color,opacity] duration-150 ease-out',
        'hover:text-[rgba(43,38,32,0.78)] hover:decoration-current',
        hidden && 'opacity-0 pointer-events-none',
      )}
    >
      Skip onboarding (dev)
    </button>
  )
}
