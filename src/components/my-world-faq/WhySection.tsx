import { DEFAULT_MY_WORLD_FAQ_BUILD_STORY, type MyWorldFaqContent } from '~/data/my-world-faq'
import type { MyWorldFaqFieldRenderer } from './FaqFieldRenderer'

export interface WhySectionProps {
  content: MyWorldFaqContent
  renderField?: MyWorldFaqFieldRenderer
}

export function WhySection({ content, renderField }: WhySectionProps) {
  const field: MyWorldFaqFieldRenderer = (args) => renderField?.(args) ?? args.value
  const buildCopy = content.page.build ?? DEFAULT_MY_WORLD_FAQ_BUILD_STORY

  return (
    <div className="bg-(--color-faq-paper) px-5 pb-14 sm:px-8 sm:pb-18 lg:px-12 lg:pb-20">
      <section
        id="why"
        aria-label="Why student choice matters"
        data-testid="faq-why"
        className="mx-auto flex min-h-[18rem] w-full max-w-7xl items-center rounded-[3rem_1rem_3rem_1rem] border border-(--color-faq-ink) bg-(--color-faq-ink) px-6 py-12 text-(--color-faq-paper) sm:px-10 sm:py-14 lg:px-16"
      >
        <p
          data-testid="faq-build-closing"
          className="mx-auto max-w-4xl text-center text-[clamp(1.35rem,2.6vw,2.15rem)] font-medium leading-[1.24] tracking-[-0.03em] text-balance"
        >
          {field({
            path: 'page.build.closingBody',
            label: 'Guiding belief',
            value: buildCopy.closingBody,
          })}
        </p>
      </section>
    </div>
  )
}
