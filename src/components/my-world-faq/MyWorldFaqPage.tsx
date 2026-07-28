import { GuardrailLedgerPreview } from './GuardrailLedgerPreview'
import { ProductLoop } from './ProductLoop'
import { QuestionField } from './QuestionField'
import { SignalSourceStrip } from './SignalSourceStrip'

export interface MyWorldFaqPageProps {
  feedbackEnabled: boolean
}

export function MyWorldFaqPage({ feedbackEnabled }: MyWorldFaqPageProps) {
  return (
    <div
      className="min-h-svh bg-(--color-faq-paper) text-(--color-faq-ink)"
      data-feedback-enabled={String(feedbackEnabled)}
      data-testid="my-world-faq-page"
    >
      <header className="border-b border-(--color-faq-line)">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
          <a
            href="#overview"
            className="rounded-sm text-sm font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-4 focus-visible:ring-offset-(--color-faq-paper)"
          >
            My World
          </a>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-(--color-faq-ink-soft)">
            Signals → Sensemaking
          </span>
        </div>
      </header>

      <main id="overview">
        <section className="relative overflow-hidden border-b border-(--color-faq-line)">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-(--color-faq-glow) blur-3xl"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-12 lg:px-10 lg:py-24">
            <div className="flex max-w-3xl flex-col items-start lg:col-span-8">
              <p className="inline-flex items-center gap-2 rounded-full border border-(--color-faq-stage-line) bg-(--color-faq-stage-soft) px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-(--color-faq-stage)"
                />
                Working prototype — testing a hypothesis
              </p>

              <h1 className="mt-7 max-w-3xl text-[clamp(2.5rem,7vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
                Could reflection take less effort—and stay human-led?
              </h1>

              <p className="mt-7 max-w-2xl text-[clamp(1.05rem,2.2vw,1.35rem)] leading-relaxed text-(--color-faq-ink-soft)">
                We are exploring whether carefully designed AI may lower the effort of capturing and
                reflecting on experience. Human relationships, student agency, and developmental
                safety remain the governing constraints.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#signals"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-(--color-faq-ink) px-5 py-2.5 text-sm font-semibold text-(--color-faq-paper) outline-none transition-transform duration-(--duration-fast) active:scale-(--press-scale) motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-4 focus-visible:ring-offset-(--color-faq-paper)"
                >
                  See the concerns
                </a>
                <a
                  href="#stage"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-(--color-faq-line-strong) px-5 py-2.5 text-sm font-semibold outline-none transition-colors duration-(--duration-fast) hover:bg-(--color-faq-surface) motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-4 focus-visible:ring-offset-(--color-faq-paper)"
                >
                  Read the project stage
                </a>
              </div>
            </div>

            <aside
              id="stage"
              aria-labelledby="stage-title"
              className="self-end rounded-3xl border border-(--color-faq-line) bg-(--color-faq-surface) p-6 shadow-(--shadow-faq-card) lg:col-span-4 lg:p-7"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-faq-ink-faint)">
                Project stage
              </p>
              <h2 id="stage-title" className="mt-3 text-xl font-semibold tracking-[-0.025em]">
                Pilot under consideration
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                Leadership is considering whether to proceed to a structured pilot. This page does
                not indicate MOE approval, endorsement, deployment, or a decision to launch.
              </p>
            </aside>
          </div>
        </section>

        <ProductLoop />
        <SignalSourceStrip />
        <QuestionField />
        <GuardrailLedgerPreview />

        <section aria-labelledby="access-title">
          <div className="mx-auto grid w-full max-w-6xl gap-7 px-5 py-12 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:px-10 lg:py-16">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-faq-ink-faint)">
                Access and listening
              </p>
              <h2 id="access-title" className="mt-2 text-lg font-semibold tracking-[-0.02em]">
                Unlisted, not private
              </h2>
            </div>
            <div className="max-w-2xl text-sm leading-relaxed text-(--color-faq-ink-soft)">
              <p>
                This page is intentionally absent from product navigation and search discovery.
                Anyone with the exact link can open or forward it, so it should not be treated as
                access-controlled.
              </p>
              <div className="mt-5 rounded-2xl border border-(--color-faq-line) bg-(--color-faq-surface) p-4">
                <h3 className="font-semibold text-(--color-faq-ink)">
                  We want the harder questions
                </h3>
                <p className="mt-2 text-(--color-faq-ink-soft)">
                  {feedbackEnabled
                    ? 'The delivery gate may be enabled, but this comprehension checkpoint does not include a submission form or claim that a message was received.'
                    : 'Feedback is currently disabled. No submission form or fake success state is shown while the delivery path, review ownership, and abuse controls remain gated.'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--color-faq-line)">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-(--color-faq-ink-faint) sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <span>My World team</span>
          <span>Signals → Sensemaking</span>
        </div>
      </footer>
    </div>
  )
}
