import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { cn } from '~/lib/utils'

/**
 * A self-contained transition between authentication and the live island.
 *
 * This deliberately uses text and CSS only. The engine canvas may have been
 * disposed and boot assets may still be in flight, so the transition cannot
 * depend on either one to look complete.
 */
export function WorldBootScreen({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="student-space-engine-loading"
      className={cn(
        'fixed top-(--frame-inset) right-(--frame-inset) bottom-(--frame-inset) left-[calc(var(--rail-width)+var(--frame-inset))]',
        'grid place-items-center overflow-hidden rounded-(--frame-radius) bg-[#f8eedb] text-(--color-onb-ink)',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.88)_0%,rgba(255,244,216,0.72)_35%,rgba(238,211,168,0.46)_100%)]"
      />
      <div className="relative flex -translate-y-[3vh] flex-col items-center text-center">
        <span className="text-[clamp(2.25rem,6vw,4.5rem)] leading-[0.9] font-black tracking-[-0.035em] text-[#d76741]">
          {ONBOARDING_COPY.login.wordmark}
        </span>
        <span className="mt-5 text-[clamp(0.95rem,1.6vw,1.125rem)] font-semibold text-(--color-onb-ink)">
          {ONBOARDING_COPY.login.opening}…
        </span>
        <span
          aria-hidden="true"
          className="mt-5 size-2 animate-pulse rounded-full bg-(--color-onb-accent-deep) shadow-[0_3px_10px_rgba(226,106,60,0.38)] motion-reduce:animate-none"
        />
      </div>
    </div>
  )
}
