import { DEFAULT_MY_WORLD_FAQ_WHY_STORY, type MyWorldFaqContent } from '~/data/my-world-faq'
import type { MyWorldFaqFieldRenderer } from './FaqFieldRenderer'

export interface SignalSourceStripProps {
  content: MyWorldFaqContent
  renderField?: MyWorldFaqFieldRenderer
}

export function SignalSourceStrip({ content, renderField }: SignalSourceStripProps) {
  const field: MyWorldFaqFieldRenderer = (args) => renderField?.(args) ?? args.value
  const whyCopy = content.page.why ?? DEFAULT_MY_WORLD_FAQ_WHY_STORY

  return (
    <section
      id="why"
      aria-labelledby="faq-why-title"
      data-testid="faq-why"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-ink) text-(--color-faq-paper)"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="text-xs font-semibold text-(--color-faq-yellow)">
              {field({
                path: 'page.why.eyebrow',
                label: 'Why section label',
                value: whyCopy.eyebrow,
              })}
            </p>
            <h2
              id="faq-why-title"
              className="mt-3 max-w-4xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-balance"
            >
              {field({
                path: 'page.why.heading',
                label: 'Why section heading',
                value: whyCopy.heading,
              })}
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-relaxed text-(--color-faq-paper-soft) lg:col-span-4 lg:justify-self-end">
            {field({
              path: 'page.why.introduction',
              label: 'Why section introduction',
              value: whyCopy.introduction,
            })}
          </p>
        </div>

        <div className="mt-14 grid gap-6 border-t border-(--color-faq-paper)/25 pt-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-(--color-faq-pink)">
              {field({
                path: 'page.signals.eyebrow',
                label: 'Questions section label',
                value: content.page.signals.eyebrow,
              })}
            </p>
            <h3
              id="signal-source-title"
              className="mt-3 max-w-3xl text-[clamp(1.8rem,4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance"
            >
              {field({
                path: 'page.signals.heading',
                label: 'Questions section heading',
                value: content.page.signals.heading,
              })}
            </h3>
          </div>
          <p className="max-w-[48ch] text-sm leading-relaxed text-(--color-faq-paper-soft) lg:col-span-5 lg:justify-self-end">
            {field({
              path: 'page.signals.introduction',
              label: 'Questions section introduction',
              value: content.page.signals.introduction,
            })}
          </p>
        </div>

        <ul className="mt-12 grid gap-4 lg:grid-cols-12">
          {content.signalQuotes.map((item) => (
            <li key={item.id} className={item.className}>
              <blockquote className="faq-signal-card relative flex h-full min-h-48 flex-col justify-between overflow-hidden p-6 text-(--color-faq-ink) sm:p-8">
                <span
                  aria-hidden="true"
                  className="text-[4rem] font-semibold leading-none tracking-[-0.08em]"
                >
                  “
                </span>
                <p className="relative z-10 max-w-[34ch] text-[clamp(1.05rem,2.2vw,1.55rem)] font-medium leading-snug tracking-[-0.025em] text-pretty">
                  {field({
                    path: `signalQuotes.${item.id}.text`,
                    label: 'Audience quote',
                    value: item.text,
                  })}
                </p>
                <footer className={renderField ? 'mt-4' : 'sr-only'}>
                  {field({
                    path: `signalQuotes.${item.id}.contextLabel`,
                    label: 'Quote context',
                    value: item.contextLabel,
                  })}
                </footer>
              </blockquote>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
