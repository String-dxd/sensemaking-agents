import { Badge } from '~/components/ui/badge'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
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
      <header className="sticky top-0 z-30 border-b border-(--color-faq-line) bg-(--color-faq-paper)/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-10">
          <a
            href="#top"
            className="inline-flex min-h-11 shrink-0 items-center rounded-md text-sm font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-2"
          >
            My World
          </a>
          <nav aria-label="Page sections" className="flex items-center">
            <a
              href="#product"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'default' }),
                'min-h-11 px-3 text-xs sm:text-sm',
              )}
            >
              Product at a glance
            </a>
            <a
              href="#faq"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'default' }),
                'min-h-11 px-3 text-xs sm:text-sm',
              )}
            >
              FAQ
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="border-b border-(--color-faq-line)">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-12 lg:px-10 lg:py-20">
            <div className="max-w-3xl lg:col-span-8">
              <Badge
                variant="outline"
                className="border-(--color-faq-stage-line) bg-(--color-faq-stage-soft) text-(--color-faq-stage-ink)"
              >
                Working prototype
              </Badge>
              <h1 className="mt-6 max-w-3xl text-[clamp(2.4rem,7vw,5rem)] font-semibold leading-[1] tracking-[-0.055em] text-balance">
                Capture a moment. Make sense of it.
              </h1>
              <p className="mt-6 max-w-[66ch] text-[clamp(1rem,2vw,1.25rem)] leading-relaxed text-(--color-faq-ink-soft) text-pretty">
                My World helps students reflect on everyday experiences. We are exploring it as one
                touchpoint alongside family, friends, teachers and other support.
              </p>
            </div>
            <aside className="self-end border-l-2 border-(--color-faq-stage) pl-5 lg:col-span-4">
              <p className="text-xs font-semibold text-(--color-faq-stage-ink)">Current stage</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">
                Pilot under consideration
              </h2>
              <p className="mt-2 max-w-[50ch] text-sm leading-relaxed text-(--color-faq-ink-soft)">
                Leadership has not decided whether to run one. This page explains the prototype and
                the questions still open.
              </p>
            </aside>
          </div>
        </section>

        <ProductLoop />
        <SignalSourceStrip />
        <QuestionField />
      </main>

      <footer className="border-t border-(--color-faq-line)">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-6 text-xs text-(--color-faq-ink-faint) sm:px-8 lg:px-10">
          <span>My World working prototype</span>
          <span>Anyone with this link can open or forward it. Last reviewed 28 July 2026.</span>
        </div>
      </footer>
    </div>
  )
}
