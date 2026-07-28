const HEARD_QUESTIONS = [
  'Are we replacing the dinner table conversation, not just adding a feature?',
  'Not all students have a safe space at home to share with too.',
  'How can we validate this is what students or teachers want?',
  'Would this product add to screen time, given students already spend significant time on SLS?',
  'Need very strong privacy guardrails in place before this can safely be released to students.',
] as const

export function SignalSourceStrip() {
  return (
    <section
      aria-labelledby="signal-source-title"
      className="border-b border-(--color-faq-line) bg-(--color-faq-surface)"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:px-10 lg:py-18">
        <div className="lg:col-span-4">
          <p className="text-xs font-semibold text-(--color-faq-stage-ink)">Questions we heard</p>
          <h2
            id="signal-source-title"
            className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-semibold leading-tight tracking-[-0.04em] text-balance"
          >
            Concerns worth taking seriously
          </h2>
          <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
            Anonymous event comments shaped this FAQ. They are signals, not survey results.
          </p>
        </div>

        <ul className="border-y border-(--color-faq-line-strong) lg:col-span-8">
          {HEARD_QUESTIONS.map((question) => (
            <li key={question} className="border-b border-(--color-faq-line) last:border-b-0">
              <blockquote className="py-5 text-base leading-relaxed text-(--color-faq-ink-soft) text-pretty sm:py-6 sm:text-lg">
                “{question}”
              </blockquote>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
