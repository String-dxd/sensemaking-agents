import { Button as BaseButton } from '@base-ui-components/react/button'
import type { Game } from '~/engine/student-space/Game'
import { performOnboardingSkip } from '~/lib/student-space/onboarding-skip'
import { cn } from '~/lib/utils'

/**
 * "Skip onboarding (dev)" affordance, anchored to the top-right corner of
 * the onboarding dialog. Mounts inside the dialog as a sibling to the
 * `StageSlot` so per-surface fade transitions don't tween it.
 *
 * Hidden on `login` / `done` / `pending` stages — EdupassLogin renders
 * its own inline skip affordance integrated with the landing wordmark.
 */
export function SkipButton({ game, stage }: { game: Game | null; stage: string }) {
  const hidden = stage === 'login' || stage === 'done' || stage === 'pending'
  if (hidden) return null

  return (
    <BaseButton
      type="button"
      aria-label="Skip onboarding"
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
        'absolute top-4 right-4 z-10 cursor-pointer',
        'inline-flex min-h-9 items-center rounded-full border border-(--color-frame-border) bg-white/85 px-4 text-[13px] font-semibold text-(--color-sheet-ink) shadow-[0_4px_12px_rgba(43,38,32,0.08)] backdrop-blur',
        'transition-[background,color,opacity,transform] duration-150 ease-out hover:bg-white active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-onb-accent)',
      )}
    >
      Skip
    </BaseButton>
  )
}
