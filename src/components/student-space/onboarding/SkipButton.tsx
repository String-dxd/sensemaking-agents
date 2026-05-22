import type { Game } from '~/engine/student-space/Game'
import { performOnboardingSkip } from '~/lib/student-space/onboarding-skip'
import { cn } from '~/lib/utils'

/**
 * Floating "Skip onboarding (dev)" button (U16 React rewrite of
 * React skip affordance for the onboarding ceremony.
 *
 * Lives outside the `.onboarding-root` subtree so per-surface fade
 * transitions don't tween it in and out alongside the active surface.
 * Hidden on `login` / `done` / `pending` stages — EdupassLogin renders
 * its own inline skip affordance integrated with the landing wordmark.
 */
export function SkipButton({ game, stage }: { game: Game | null; stage: string }) {
  const hidden = stage === 'login' || stage === 'done' || stage === 'pending'
  if (hidden) return null

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
        'inline-flex min-h-10 items-center rounded-full border border-white/70 bg-white/88 px-4 text-sm font-semibold text-(--color-sheet-ink) shadow-[0_12px_30px_rgba(43,38,32,0.16)]',
        'transition-[background,color,opacity,transform] duration-150 ease-out hover:bg-white active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-onb-accent)',
      )}
    >
      Skip onboarding (dev)
    </button>
  )
}
