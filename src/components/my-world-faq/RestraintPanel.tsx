/* "Built deliberately" — the section that argues for how little the product does.
 *
 * The reason it exists: the surface is playful, and playful invites the assumption that the goal
 * is time spent. Here the goal is the opposite, and a reader who assumes otherwise is worried
 * about the wrong thing. So the restraint is stated rather than left to be inferred from screens
 * that look inviting.
 *
 * The clock is the section's one piece of interaction, and it is here because it MAKES the
 * argument instead of asserting it: the page tells you what time it is where you are, which is
 * the same clock the product runs on. Three constraints shaped it:
 *
 *   - It renders NOTHING on the server. The server's clock is in a different place from the
 *     reader's, so a server-rendered time is both a hydration mismatch and a wrong answer.
 *   - It ticks once a minute, never on seconds. A second hand is motion for its own sake in a
 *     section about not demanding attention, and it would be the one thing here that argued
 *     against the text next to it.
 *   - It is decoration. Everything the section says is in the prose, so a reader with no
 *     JavaScript loses a flourish and no meaning. */

import { useEffect, useState } from 'react'

/* Not document fields, and not editable. See the note in PosturePanel.tsx: putting this copy on
 * the document took the live page to 503, because every stored revision is re-validated and
 * re-digested on read and none of them has these keys. */
const COPY = {
  eyebrow: 'Built deliberately',
  heading: 'It runs on your time, and asks for little of it.',
  introduction:
    'My World follows the real clock. Morning is morning; a week takes a week. That is partly because a world that keeps its own time is nicer to return to \u2014 and mostly because it means there is never much waiting to be done. You cannot rush it, and it cannot fill an evening.',
  footnote:
    'The surface is playful on purpose. The choices underneath it are not: every one of them is argued, written down, and open to being wrong.',
} as const

export function RestraintPanel() {
  return (
    <section
      aria-labelledby="faq-restraint-title"
      data-testid="faq-restraint"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-paper) text-(--color-faq-ink)"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-(--color-faq-coral-ink)">
              {COPY.eyebrow}
            </p>
            <h2
              id="faq-restraint-title"
              className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-balance"
            >
              {COPY.heading}
            </h2>
            <p className="mt-6 max-w-[56ch] text-[clamp(1rem,1.8vw,1.2rem)] leading-relaxed text-pretty">
              {COPY.introduction}
            </p>
          </div>

          <div className="lg:col-span-5 lg:justify-self-end">
            <RealTimeCard />
            <p className="mt-6 max-w-[42ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
              {COPY.footnote}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* The reader's own clock, to the minute. Empty until mounted, on purpose — see the header. */
function RealTimeCard() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())

    /* Aligned to the top of the next minute rather than a 60s interval from mount, so the
     * displayed minute changes when the reader's clock changes it. A plain setInterval drifts
     * to whatever offset the page happened to load at, which shows the wrong minute for up to
     * 59 seconds — a small wrongness, in the one element on the page whose only job is to be
     * exactly right about the time. */
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const at = new Date()
      setNow(at)
      timer = setTimeout(tick, 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()))
    }
    const first = new Date()
    timer = setTimeout(tick, 60_000 - (first.getSeconds() * 1000 + first.getMilliseconds()))

    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      data-testid="faq-restraint-clock"
      className="rounded-lg border border-(--color-faq-line-strong) bg-(--color-faq-surface) p-6 sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-ink-soft)">
        Where you are, right now
      </p>
      {/* aria-hidden and a suppressed hydration warning together: the value is decorative, it is
          absent for the first frame by design, and a screen reader announcing a clock that
          changes under it would be noise rather than information. The sentence below carries the
          meaning for everybody. */}
      <p
        aria-hidden="true"
        suppressHydrationWarning
        className="mt-3 text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-none tracking-[-0.05em] tabular-nums"
      >
        {now
          ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : /* An explicit non-breaking space rather than a plain one, which JSX collapses to
               nothing — leaving the line with no height and the card jumping taller the
               moment the clock arrives. */
            '\u00a0'}
      </p>
      <p className="mt-4 max-w-[30ch] text-sm leading-relaxed">
        My World is on this clock too. Morning is morning, a week takes a week, and nothing in it
        can be hurried along.
      </p>
    </div>
  )
}
