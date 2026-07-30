import { Badge } from '~/components/ui/badge'
import type { MyWorldFaqContent } from '~/data/my-world-faq'
import type { MyWorldFaqFieldRenderer } from './FaqFieldRenderer'

export interface GuardrailLedgerPreviewProps {
  content: MyWorldFaqContent
  editorMode?: boolean
  renderField?: MyWorldFaqFieldRenderer
}

export function GuardrailLedgerPreview({
  content,
  editorMode = false,
  renderField,
}: GuardrailLedgerPreviewProps) {
  const field: MyWorldFaqFieldRenderer = (args) => renderField?.(args) ?? args.value

  return (
    <section
      aria-labelledby="guardrail-preview-title"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-surface)"
      data-testid="faq-guardrail-preview"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-7 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold text-(--color-faq-coral-ink)">
              {field({
                path: 'page.ledger.eyebrow',
                label: 'Guardrail section label',
                value: content.page.ledger.eyebrow,
              })}
            </p>
            <h2
              id="guardrail-preview-title"
              className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
            >
              {field({
                path: 'page.ledger.heading',
                label: 'Guardrail section heading',
                value: content.page.ledger.heading,
              })}
            </h2>
          </div>
          <p className="max-w-[50ch] text-sm leading-relaxed text-(--color-faq-ink-soft) lg:col-span-5 lg:justify-self-end">
            {field({
              path: 'page.ledger.introduction',
              label: 'Guardrail section introduction',
              value: content.page.ledger.introduction,
            })}
          </p>
        </div>

        {editorMode ? (
          <p className="mt-10 border-l-4 border-(--color-faq-ink) bg-(--color-faq-blue)/35 px-4 py-3 text-sm leading-relaxed">
            Edit the public wording below. State and evidence classifications are fixed.
          </p>
        ) : null}

        <div className={`${editorMode ? 'mt-5' : 'mt-12'} border-y border-(--color-faq-ink)`}>
          {content.ledgerPreview.map((preview, index) => {
            const guardrail = content.guardrails.find((item) => item.id === preview.guardrailId)
            if (!guardrail) return null
            return (
              <article
                key={preview.state}
                className="faq-ledger-row grid gap-6 border-b border-(--color-faq-ink) px-5 py-7 last:border-b-0 sm:px-7 lg:grid-cols-12 lg:items-start"
                data-state={preview.state}
              >
                {editorMode ? (
                  <>
                    <div className="lg:col-span-3">
                      <div className="mb-4 flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-10 shrink-0 place-items-center rounded-full border border-(--color-faq-ink) text-xs font-semibold tabular-nums"
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <Badge
                            variant="outline"
                            size="sm"
                            className="border-(--color-faq-ink) bg-transparent text-(--color-faq-ink)"
                          >
                            {preview.label}
                          </Badge>
                          <p className="mt-1 text-[11px] text-(--color-faq-ink-faint)">
                            State · fixed
                          </p>
                        </div>
                      </div>
                      {field({
                        path: `ledgerPreview.${preview.state}.description`,
                        label: 'What this state means',
                        value: preview.description,
                      })}
                    </div>
                    <div className="lg:col-span-5">
                      {field({
                        path: `guardrails.${guardrail.id}.title`,
                        label: 'Guardrail title',
                        value: guardrail.title,
                      })}
                      {field({
                        path: `guardrails.${guardrail.id}.statusSummary`,
                        label: 'Current position',
                        value: guardrail.statusSummary,
                      })}
                    </div>
                    <div className="lg:col-span-4 lg:pl-2">
                      <div className="mb-4">
                        <Badge
                          variant="outline"
                          size="sm"
                          className="border-(--color-faq-ink) bg-transparent text-(--color-faq-ink)"
                        >
                          {guardrail.label}
                        </Badge>
                        <p className="mt-1 text-[11px] text-(--color-faq-ink-faint)">
                          Evidence classification · fixed
                        </p>
                      </div>
                      {field({
                        path: `guardrails.${guardrail.id}.limitations`,
                        label: 'Evidence boundary',
                        value: guardrail.limitations,
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-4 lg:col-span-3">
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-full border border-(--color-faq-ink) text-xs font-semibold tabular-nums"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{preview.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-(--color-faq-ink-soft)">
                          {preview.description}
                        </p>
                      </div>
                    </div>
                    <div className="lg:col-span-4">
                      <h3 className="text-xl font-semibold tracking-[-0.03em]">
                        {guardrail.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                        {guardrail.statusSummary}
                      </p>
                    </div>
                    <p className="text-xs leading-relaxed text-(--color-faq-ink-soft) lg:col-span-5 lg:pl-8">
                      <span className="font-semibold text-(--color-faq-ink)">
                        {guardrail.label}.
                      </span>{' '}
                      {guardrail.limitations}
                    </p>
                  </>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
