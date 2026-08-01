/* "Where this is up to" — the section that says nothing has been decided.
 *
 * It exists because the guardrail ledger was removed on 2026-07-30 and took the page's only
 * admission of uncertainty with it. The ledger showed three states side by side, which implied
 * "some of this is settled and some is not" without ever saying it. This says it.
 *
 * Every number here is DERIVED from the document (see review-posture.ts) rather than typed by a
 * contributor, and that is the whole design: a hand-typed "24 questions" goes stale the first
 * time somebody publishes a twenty-fifth, and a stale number on a page about not overstating
 * things is the worst possible place for one.
 *
 * WHY THE PROSE IS NOT EDITABLE, which is a real loss and was not the first choice. It was built
 * with these four strings as optional fields on the document, and that broke the live page: the
 * FAQ reads from the database, every stored revision is re-validated and re-digested on read,
 * and a revision written before today has no such fields. The page went to 503 within seconds of
 * the change, which is how this was found rather than shipped.
 *
 * Making it editable properly means a structure-version bump and a re-bootstrap of revision 1,
 * which is the runbook's v1-to-v2 procedure and needs the database owner. Until then the copy
 * lives here, where it cannot take the page down. */

import type { MyWorldFaqContent } from '~/data/my-world-faq'
import { tallyPosture } from '~/data/my-world-faq/review-posture'

const COPY = {
  eyebrow: 'Where this is up to',
  heading: 'Still gathering, not yet deciding.',
  introduction:
    'We are collecting signals from sessions, evidence from research and the prototype, and questions from anyone who reads this. Each answer below carries the kind of thing it rests on, and how much of it we have.',
  decisionNote:
    'No pilot has been approved and no decision has been made. When one is, it will be written here rather than announced elsewhere.',
} as const

export interface PosturePanelProps {
  content: MyWorldFaqContent
}

export function PosturePanel({ content }: PosturePanelProps) {
  const tally = tallyPosture(content)
  /* Four numbers chosen after measuring the content, not before. An earlier version showed
   * "questions settled" against "questions open" and read 0 against 34, because every question
   * on the page carries the same not-yet-human-reviewed status — true, and a serious understatement
   * of work that has 49 of its 92 evidence blocks checked. These four discriminate. */
  const counts = [
    { value: tally.questions, label: 'questions answered here' },
    {
      value: `${tally.checked}/${tally.blocks}`,
      label: 'pieces of evidence checked against a source or the prototype',
    },
    { value: tally.openThreads, label: 'things we still cannot answer' },
    { value: tally.signals, label: 'comments from sessions' },
  ]

  return (
    <section
      aria-labelledby="faq-posture-title"
      data-testid="faq-posture"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-surface) text-(--color-faq-ink)"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-(--color-faq-coral-ink)">{COPY.eyebrow}</p>
            <h2
              id="faq-posture-title"
              className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-balance"
            >
              {COPY.heading}
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-relaxed lg:col-span-5 lg:justify-self-end">
            {COPY.introduction}
          </p>
        </div>

        <dl className="mt-12 grid gap-px overflow-hidden rounded-lg border border-(--color-faq-line-strong) bg-(--color-faq-line-strong) sm:grid-cols-2 lg:grid-cols-4">
          {counts.map((count) => (
            <div key={count.label} className="bg-(--color-faq-paper) p-5 sm:p-6">
              <dt className="sr-only">{count.label}</dt>
              <dd>
                <span className="block text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-none tracking-[-0.05em] tabular-nums">
                  {count.value}
                </span>
                <span className="mt-2 block max-w-[22ch] text-sm leading-snug text-(--color-faq-ink-soft)">
                  {count.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        {/* The sentence the section is really for. Given its own block, with the strongest
            emphasis available here, because it is the one thing a reader most needs to leave
            with and the easiest to skim past. */}
        <p className="mt-8 max-w-[62ch] border-l-2 border-(--color-faq-coral-ink) pl-5 text-[clamp(1.05rem,2vw,1.35rem)] font-medium leading-snug tracking-[-0.02em] text-pretty">
          {COPY.decisionNote}
        </p>

        {tally.lastReviewed ? (
          <p className="mt-6 text-xs text-(--color-faq-ink-soft)">
            Most recent review of any answer on this page: {tally.lastReviewed}.
          </p>
        ) : null}
      </div>
    </section>
  )
}
