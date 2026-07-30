import { BookOpen, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import type { MyWorldFaqEditorialDocument } from '~/data/my-world-faq'
import { EditableFaqField } from './EditableFaqField'

export function FaqSupportingRecordsDialog({
  document,
  disabled = false,
  open,
  onOpenChange,
  targetPath,
}: {
  document: MyWorldFaqEditorialDocument
  disabled?: boolean
  open?: boolean
  onOpenChange?(open: boolean): void
  targetPath?: string | null
}) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !targetPath) return
    const frame = requestAnimationFrame(() => {
      const control = [
        ...(contentRef.current?.querySelectorAll<HTMLElement>('[data-editor-path]') ?? []),
      ].find((candidate) => candidate.dataset.editorPath === targetPath)
      if (!control) return
      const details = control.closest('details')
      if (details) details.open = true
      control.focus()
      control.scrollIntoView?.({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, targetPath])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            disabled={disabled}
            variant="outline"
            size="lg"
            className="min-h-11 border-(--color-faq-line-strong) bg-(--color-faq-surface)"
          />
        }
      >
        <BookOpen aria-hidden="true" className="mr-2 size-4" />
        Supporting records
      </DialogTrigger>
      <DialogContent
        ref={contentRef}
        showClose={false}
        className="max-h-[min(92svh,58rem)] max-w-4xl overflow-y-auto rounded-[2rem_0.75rem_2rem_0.75rem] border-(--color-faq-line-strong) bg-(--color-faq-surface) p-5 text-(--color-faq-ink) sm:p-8"
      >
        <DialogClose
          aria-label="Close supporting records"
          className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-(--color-faq-ink-soft) outline-none hover:bg-(--color-faq-paper) focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogClose>
        <DialogHeader className="pr-12">
          <DialogTitle className="text-2xl tracking-[-0.035em]">Supporting records</DialogTitle>
          <DialogDescription className="max-w-[65ch] leading-relaxed text-(--color-faq-ink-soft)">
            Edit source notes, prototype checks, guardrail evidence and media wording. Every
            guardrail is edited here now that the page no longer carries a ledger section.
          </DialogDescription>
        </DialogHeader>

        <RecordGroup title="Sources" count={document.sources.length}>
          {document.sources.map((source) => (
            <RecordDetails key={source.id} title={source.title}>
              <EditableFaqField
                path={`sources.${source.id}.title`}
                label="Source title"
                value={source.title}
              />
              <EditableFaqField
                path={`sources.${source.id}.publisher`}
                label="Publisher"
                value={source.publisher}
              />
              {source.authors.map((author, index) => (
                <EditableFaqField
                  // Author slots are structure-locked, so their manifest index is stable.
                  // biome-ignore lint/suspicious/noArrayIndexKey: author order cannot change in this editor
                  key={`${source.id}-author-${index}`}
                  path={`sources.${source.id}.authors.${index}`}
                  label={`Author ${index + 1}`}
                  value={author}
                />
              ))}
              <EditableFaqField
                path={`sources.${source.id}.published`}
                label="Publication date"
                value={source.published}
              />
              {'identifier' in source ? (
                <EditableFaqField
                  path={`sources.${source.id}.identifier`}
                  label="Identifier"
                  value={source.identifier ?? ''}
                />
              ) : null}
              <EditableFaqField path={`sources.${source.id}.url`} label="URL" value={source.url} />
              <EditableFaqField
                path={`sources.${source.id}.populationContext`}
                label="Population context"
                value={source.populationContext}
              />
              <EditableFaqField
                path={`sources.${source.id}.method`}
                label="Method"
                value={source.method}
              />
              <EditableFaqField
                path={`sources.${source.id}.fit`}
                label="Why it fits"
                value={source.fit}
              />
              <EditableFaqField
                path={`sources.${source.id}.limitations`}
                label="Limitations"
                value={source.limitations}
              />
            </RecordDetails>
          ))}
        </RecordGroup>

        <RecordGroup title="Prototype checks" count={document.productProvenance.length}>
          {document.productProvenance.map((item) => (
            <RecordDetails key={item.id} title={item.title}>
              <EditableFaqField
                path={`productProvenance.${item.id}.title`}
                label="Check title"
                value={item.title}
              />
              <EditableFaqField
                path={`productProvenance.${item.id}.claimScope`}
                label="Claim scope"
                value={item.claimScope}
              />
              <EditableFaqField
                path={`productProvenance.${item.id}.populationContext`}
                label="Population context"
                value={item.populationContext}
              />
              <EditableFaqField
                path={`productProvenance.${item.id}.fit`}
                label="Why it fits"
                value={item.fit}
              />
              <EditableFaqField
                path={`productProvenance.${item.id}.limitations`}
                label="Limitations"
                value={item.limitations}
              />
            </RecordDetails>
          ))}
        </RecordGroup>

        <RecordGroup title="Guardrail supporting notes" count={document.guardrails.length}>
          {document.guardrails.map((item) => (
            <RecordDetails key={item.id} title={item.title}>
              {ledgerPreviewFor(document, item.id)}
              <EditableFaqField
                path={`guardrails.${item.id}.title`}
                label="Guardrail title"
                value={item.title}
              />
              <EditableFaqField
                path={`guardrails.${item.id}.protects`}
                label="What it protects"
                value={item.protects}
              />
              <EditableFaqField
                path={`guardrails.${item.id}.statusSummary`}
                label="Status summary"
                value={item.statusSummary}
              />
              <EditableFaqField
                path={`guardrails.${item.id}.populationContext`}
                label="Population context"
                value={item.populationContext}
              />
              <EditableFaqField
                path={`guardrails.${item.id}.fit`}
                label="Why it fits"
                value={item.fit}
              />
              <EditableFaqField
                path={`guardrails.${item.id}.limitations`}
                label="Limitations"
                value={item.limitations}
              />
            </RecordDetails>
          ))}
        </RecordGroup>

        <RecordGroup title="Media descriptions" count={document.assets.length}>
          {document.assets.map((asset) => (
            <RecordDetails key={asset.id} title={asset.alt}>
              <EditableFaqField
                path={`assets.${asset.id}.alt`}
                label="Text alternative"
                value={asset.alt}
              />
              <EditableFaqField
                path={`assets.${asset.id}.transcript`}
                label="Transcript"
                value={asset.transcript}
              />
            </RecordDetails>
          ))}
        </RecordGroup>
      </DialogContent>
    </Dialog>
  )
}

function RecordGroup({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section
      className="mt-8"
      aria-labelledby={`faq-records-${title.replaceAll(' ', '-').toLowerCase()}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id={`faq-records-${title.replaceAll(' ', '-').toLowerCase()}`}
          className="text-lg font-semibold"
        >
          {title}
        </h2>
        <span className="text-xs tabular-nums text-(--color-faq-ink-faint)">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function RecordDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-(--color-faq-line-strong) bg-(--color-faq-paper)">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)">
        {title}
      </summary>
      <div className="border-t border-(--color-faq-line) p-3 sm:p-4">{children}</div>
    </details>
  )
}

/* The ledger section on the page used to carry this wording, and the section was removed on
 * 2026-07-30. It is not section furniture though -- it says what a guardrail's state MEANS, so it
 * belongs with the guardrail rather than with the layout that happened to show it. Returns null
 * for a guardrail that is not in the preview, which is most of them. */
function ledgerPreviewFor(document: MyWorldFaqEditorialDocument, guardrailId: string) {
  const preview = document.ledgerPreview.find((item) => item.guardrailId === guardrailId)
  if (!preview) return null

  return (
    <EditableFaqField
      path={`ledgerPreview.${preview.state}.description`}
      label={`What "${preview.label}" means`}
      value={preview.description}
    />
  )
}
