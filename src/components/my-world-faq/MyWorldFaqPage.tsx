import { Badge } from '~/components/ui/badge'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
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
      <a
        href="#top"
        className="sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:not-sr-only focus:rounded-md focus:bg-(--color-faq-ink) focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-(--color-faq-paper) focus:outline-none focus:ring-2 focus:ring-(--color-faq-focus) focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-(--color-faq-line-strong) bg-(--color-faq-paper)">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12">
          <a
            href="#top"
            aria-label="My World home"
            className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className="relative grid size-7 place-items-center overflow-hidden rounded-full bg-(--color-faq-ink)"
            >
              <span className="size-2.5 rounded-full bg-(--color-faq-coral) transition-transform duration-(--duration-fast) ease-(--ease-out) group-hover:scale-125 motion-reduce:transition-none" />
            </span>
            <span className="hidden min-[350px]:inline">My World</span>
          </a>
          <nav
            aria-label="Page sections"
            className="faq-nav-shell flex items-center border border-(--color-faq-ink)"
          >
            <a
              href="#product"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'default' }),
                'faq-nav-link min-h-11 gap-2 px-3 text-xs hover:bg-(--color-faq-blue) sm:px-4 sm:text-sm',
              )}
            >
              <span aria-hidden="true" className="hidden text-[10px] font-semibold sm:inline">
                01
              </span>
              Product at a glance
            </a>
            <a
              href="#faq"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'default' }),
                'faq-nav-link min-h-11 gap-2 border-l border-(--color-faq-ink) px-3 text-xs hover:bg-(--color-faq-coral) sm:px-4 sm:text-sm',
              )}
            >
              <span aria-hidden="true" className="hidden text-[10px] font-semibold sm:inline">
                02
              </span>
              FAQ
            </a>
          </nav>
        </div>
      </header>

      <main id="top" tabIndex={-1}>
        <section className="relative overflow-hidden border-b border-(--color-faq-line-strong)">
          <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
            <div className="max-w-5xl">
              <Badge
                variant="outline"
                className="faq-eyebrow border-(--color-faq-ink) bg-(--color-faq-yellow) text-(--color-faq-ink)"
              >
                Working prototype
              </Badge>
              <h1 className="mt-7 max-w-4xl text-[clamp(3.1rem,8vw,7rem)] font-semibold leading-[0.91] tracking-[-0.07em] text-balance">
                Capture a moment.
                <span className="block text-(--color-faq-coral-ink)">Make sense of it.</span>
              </h1>
              <p className="mt-8 max-w-[58ch] text-[clamp(1.05rem,2vw,1.3rem)] leading-relaxed text-(--color-faq-ink-soft) text-pretty">
                My World helps students reflect on everyday experiences. We are exploring it as one
                touchpoint alongside family, friends, teachers and other support.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href="#product"
                  className={cn(
                    buttonVariants({ variant: 'default', size: 'lg' }),
                    'faq-button-primary h-12 bg-(--color-faq-ink) px-6 text-(--color-faq-paper) hover:bg-(--color-faq-coral-ink)',
                  )}
                >
                  See how it works
                </a>
                <a
                  href="#faq"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'lg' }),
                    'faq-button-secondary h-12 border-(--color-faq-ink) bg-transparent px-6 hover:bg-(--color-faq-yellow)',
                  )}
                >
                  Browse the questions
                </a>
              </div>
            </div>
          </div>
        </section>

        <ProductLoop />
        <SignalSourceStrip />
        <GuardrailLedgerPreview />
        <QuestionField />
        <section
          aria-labelledby="faq-more-questions-title"
          className="border-b border-(--color-faq-ink) bg-(--color-faq-coral) text-(--color-faq-ink)"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-12 lg:items-end lg:px-12">
            <div className="lg:col-span-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                Keep the questions coming
              </p>
              <h2
                id="faq-more-questions-title"
                className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
              >
                Have another question?
              </h2>
            </div>
            <p className="max-w-[48ch] text-base leading-relaxed lg:col-span-4">
              Send it to the My World team through the same channel that brought you here. Recurring
              concerns will shape this page and the pilot decision.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-(--color-faq-ink) text-(--color-faq-paper)">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="size-4 rounded-full bg-(--color-faq-coral)" />
            <span className="text-sm font-semibold">My World working prototype</span>
          </div>
          <span className="max-w-xl text-xs leading-relaxed text-(--color-faq-paper-soft) sm:text-right">
            Anyone with this link can open or forward it. Last reviewed 29 July 2026.
          </span>
        </div>
      </footer>
    </div>
  )
}
