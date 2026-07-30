import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Badge } from '~/components/ui/badge'
import { buttonVariants } from '~/components/ui/button'
import type { MyWorldFaqContent } from '~/data/my-world-faq'
import { cn } from '~/lib/utils'
import type { MyWorldFaqFieldRenderer } from './FaqFieldRenderer'
import { createMyWorldFaqAuthoringShortcut } from './faq-authoring-shortcut'
import { ProductLoop } from './ProductLoop'
import { QuestionField } from './QuestionField'
import { SignalSourceStrip } from './SignalSourceStrip'

export interface MyWorldFaqPageProps {
  feedbackEnabled: boolean
  content: MyWorldFaqContent
  authoringShortcutEnabled?: boolean
  editorMode?: boolean
  renderField?: MyWorldFaqFieldRenderer
  faqEditorControl?: ReactNode
}

export function MyWorldFaqPage({
  feedbackEnabled,
  content,
  authoringShortcutEnabled = false,
  editorMode = false,
  renderField,
  faqEditorControl,
}: MyWorldFaqPageProps) {
  const field: MyWorldFaqFieldRenderer = (args) => renderField?.(args) ?? args.value

  useEffect(() => {
    if (!authoringShortcutEnabled) return

    const onKeyDown = createMyWorldFaqAuthoringShortcut()
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [authoringShortcutEnabled])

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
      <header
        className={cn(
          'z-30 border-b border-(--color-faq-line-strong) bg-(--color-faq-paper)',
          editorMode ? 'relative' : 'sticky top-0',
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12">
          <a
            href="#top"
            aria-label="My World FAQ home"
            className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus) focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className="relative grid size-7 place-items-center overflow-hidden rounded-full bg-(--color-faq-ink)"
            >
              <span className="size-2.5 rounded-full bg-(--color-faq-coral) transition-transform duration-(--duration-fast) ease-(--ease-out) group-hover:scale-125 motion-reduce:transition-none" />
            </span>
            <span className="hidden min-[350px]:inline">My World FAQ</span>
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
                {field({
                  path: 'page.hero.eyebrow',
                  label: 'Hero label',
                  value: content.page.hero.eyebrow,
                })}
              </Badge>
              <h1 className="mt-7 max-w-4xl text-[clamp(3.1rem,8vw,7rem)] font-semibold leading-[0.91] tracking-[-0.07em] text-balance">
                {field({
                  path: 'page.hero.heading',
                  label: 'Hero heading',
                  value: content.page.hero.heading,
                })}
                <span className="block text-(--color-faq-coral-ink)">
                  {field({
                    path: 'page.hero.headingAccent',
                    label: 'Hero accent',
                    value: content.page.hero.headingAccent,
                  })}
                </span>
              </h1>
              <p className="mt-8 max-w-[58ch] text-[clamp(1.05rem,2vw,1.3rem)] leading-relaxed text-(--color-faq-ink-soft) text-pretty">
                {field({
                  path: 'page.hero.introduction',
                  label: 'Hero introduction',
                  value: content.page.hero.introduction,
                })}
              </p>
              {editorMode ? (
                <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-2">
                  {field({
                    path: 'page.hero.productCta',
                    label: 'Product link label',
                    value: content.page.hero.productCta,
                  })}
                  {field({
                    path: 'page.hero.faqCta',
                    label: 'FAQ link label',
                    value: content.page.hero.faqCta,
                  })}
                </div>
              ) : (
                <div className="mt-9 flex flex-wrap gap-3">
                  <a
                    href="#product"
                    className={cn(
                      buttonVariants({ variant: 'default', size: 'lg' }),
                      'faq-button-primary h-12 bg-(--color-faq-ink) px-6 text-(--color-faq-paper) hover:bg-(--color-faq-coral-ink)',
                    )}
                  >
                    {content.page.hero.productCta}
                  </a>
                  <a
                    href="#faq"
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'faq-button-secondary h-12 border-(--color-faq-ink) bg-transparent px-6 hover:bg-(--color-faq-yellow)',
                    )}
                  >
                    {content.page.hero.faqCta}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>

        <ProductLoop content={content} editorMode={editorMode} renderField={renderField} />
        <SignalSourceStrip content={content} renderField={renderField} />
        {/* The guardrail ledger section was removed from this page on 2026-07-30, on the
            owner's call that it was not earning its place. Its DATA is deliberately still
            here: `page.ledger` and `ledgerPreview` are `z.strictObject` in content-schema.ts
            and are seeded by default-document.ts, so dropping them from the document type
            would make any revision already written to the database fail validation — and the
            public FAQ answers a validation failure with a 503. Bringing the section back is
            restoring one component and one line here. */}
        <QuestionField
          content={content}
          editorMode={editorMode}
          renderField={renderField}
          editorControl={faqEditorControl}
        />
        <section
          aria-labelledby="faq-more-questions-title"
          className="border-b border-(--color-faq-ink) bg-(--color-faq-coral) text-(--color-faq-ink)"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-12 lg:items-end lg:px-12">
            <div className="lg:col-span-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                {field({
                  path: 'page.contribution.eyebrow',
                  label: 'Contribution label',
                  value: content.page.contribution.eyebrow,
                })}
              </p>
              <h2
                id="faq-more-questions-title"
                className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
              >
                {field({
                  path: 'page.contribution.heading',
                  label: 'Contribution heading',
                  value: content.page.contribution.heading,
                })}
              </h2>
            </div>
            <p className="max-w-[48ch] text-base leading-relaxed lg:col-span-4">
              {field({
                path: 'page.contribution.body',
                label: 'Contribution text',
                value: content.page.contribution.body,
              })}
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-(--color-faq-ink) text-(--color-faq-paper)">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="size-4 rounded-full bg-(--color-faq-coral)" />
            <span className="text-sm font-semibold">
              {field({
                path: 'page.footer.brand',
                label: 'Footer name',
                value: content.page.footer.brand,
              })}
            </span>
          </div>
          <span className="max-w-xl text-xs leading-relaxed text-(--color-faq-paper-soft) sm:text-right">
            {field({
              path: 'page.footer.sharing',
              label: 'Sharing note',
              value: content.page.footer.sharing,
            })}
          </span>
        </div>
      </footer>
    </div>
  )
}
