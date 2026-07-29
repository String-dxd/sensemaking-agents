const HEARD_QUESTIONS = [
  {
    quote: 'Are we replacing the dinner table conversation, not just adding a feature?',
    className: 'faq-signal-card--coral lg:col-span-7',
  },
  {
    quote: 'Not all students have a safe space at home to share with too.',
    className: 'faq-signal-card--blue lg:col-span-5',
  },
  {
    quote: 'How can we validate this is what students or teachers want?',
    className: 'faq-signal-card--yellow lg:col-span-4',
  },
  {
    quote:
      'Would this product add to screen time, given students already spend significant time on SLS?',
    className: 'faq-signal-card--green lg:col-span-8',
  },
  {
    quote:
      'Need very strong privacy guardrails in place before this can safely be released to students.',
    className: 'faq-signal-card--pink lg:col-span-12',
  },
] as const

export function SignalSourceStrip() {
  return (
    <section
      aria-labelledby="signal-source-title"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-ink) text-(--color-faq-paper)"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-(--color-faq-yellow)">Questions we heard</p>
            <h2
              id="signal-source-title"
              className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-balance"
            >
              Concern is part of the work.
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-relaxed text-(--color-faq-paper-soft) lg:col-span-5 lg:justify-self-end">
            Anonymous event comments shaped this FAQ. They are signals, not survey results.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 lg:grid-cols-12">
          {HEARD_QUESTIONS.map((item) => (
            <li key={item.quote} className={item.className}>
              <blockquote className="faq-signal-card relative flex h-full min-h-48 flex-col justify-between overflow-hidden p-6 text-(--color-faq-ink) sm:p-8">
                <span
                  aria-hidden="true"
                  className="text-[4rem] font-semibold leading-none tracking-[-0.08em]"
                >
                  “
                </span>
                <p className="relative z-10 max-w-[34ch] text-[clamp(1.05rem,2.2vw,1.55rem)] font-medium leading-snug tracking-[-0.025em] text-pretty">
                  {item.quote}
                </p>
              </blockquote>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
