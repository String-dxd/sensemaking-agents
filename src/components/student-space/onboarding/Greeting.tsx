import { useEffect, useRef, useState } from 'react'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { cn } from '~/lib/utils'

/**
 * Post-login greeting surface (U16 React rewrite of
 * `src/engine/student-space/Game/View/Onboarding/Greeting.js`).
 *
 * "Hi, {name}." + sub + hint + CTA. No bird visible yet — the egg hasn't
 * been picked. Fade-in on mount; fade-out is owned by the orchestrator
 * via React unmount, mirroring the legacy entry/exit timing.
 */
const ENTER_MS = 320

export function Greeting({
  studentName,
  reducedMotion,
  onAdvance,
}: {
  studentName: string
  reducedMotion: boolean
  onAdvance: () => void
}) {
  const ctaRef = useRef<HTMLButtonElement | null>(null)
  // Drive the entrance fade with a one-tick delay so the transition fires
  // rather than the element appearing at full opacity from frame zero.
  const [visible, setVisible] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) {
      ctaRef.current?.focus({ preventScroll: true })
      return
    }
    const frame = requestAnimationFrame(() => setVisible(true))
    const focusTimer = setTimeout(() => ctaRef.current?.focus({ preventScroll: true }), ENTER_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(focusTimer)
    }
  }, [reducedMotion])

  const name = (studentName || '').split(' ')[0] || 'there'
  const hello = ONBOARDING_COPY.greeting.hello.replace('{name}', name)

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center',
        'px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] gap-7',
        'bg-(--color-onb-bg-cream) text-(--color-onb-ink)',
        'transition-opacity duration-[320ms] ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      data-testid="onboarding-greeting"
    >
      <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
        <h1 className="m-0 font-medium text-[clamp(28px,7vw,36px)]">{hello}</h1>
        <p className="m-0 text-[18px] text-(--color-onb-ink)">{ONBOARDING_COPY.greeting.sub}</p>
        <p className="mx-0 mt-1 mb-0 text-sm italic text-(--color-onb-ink-faint)">
          {ONBOARDING_COPY.greeting.hint}
        </p>
      </div>
      <button
        ref={ctaRef}
        type="button"
        data-testid="onboarding-greeting-cta"
        onClick={onAdvance}
        className={cn(
          'min-h-[56px] rounded-[14px] border-0 px-[26px] text-base tracking-[0.02em]',
          'cursor-pointer bg-(--color-onb-accent) text-white',
          'shadow-[0_8px_20px_rgba(255,138,92,0.30),0_1px_2px_rgba(43,38,32,0.06)]',
          'transition-[transform,background,box-shadow] duration-[180ms] ease-out',
          'hover:-translate-y-px hover:bg-(--onb-accent-deep)',
          'hover:shadow-[0_12px_26px_rgba(255,138,92,0.38),0_2px_4px_rgba(43,38,32,0.08)]',
          'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
        )}
      >
        {ONBOARDING_COPY.greeting.cta}
      </button>
    </div>
  )
}
