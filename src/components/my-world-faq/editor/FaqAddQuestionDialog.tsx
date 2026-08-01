import { Plus, X } from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import type { FAQ_EDITORIAL_FIELD_LIMITS, MyWorldFaqEditorialDocument } from '~/data/my-world-faq'

export interface AddFaqQuestionDraft {
  clusterId: string
  displayedQuestion: string
  shortAnswer: string
  detailedAnswer: string
  limitations: string
}

interface DraftErrors {
  clusterId?: string
  displayedQuestion?: string
  shortAnswer?: string
  detailedAnswer?: string
  limitations?: string
}

const EMPTY_DRAFT: AddFaqQuestionDraft = {
  clusterId: '',
  displayedQuestion: '',
  shortAnswer: '',
  detailedAnswer: '',
  limitations: '',
}

export function FaqAddQuestionDialog({
  document,
  disabled = false,
  disabledReason,
  limits,
  onAdd,
}: {
  document: MyWorldFaqEditorialDocument
  disabled?: boolean
  disabledReason?: string | null
  limits: typeof FAQ_EDITORIAL_FIELD_LIMITS
  onAdd(draft: AddFaqQuestionDraft): string | null
}) {
  const formId = useId()
  const disabledNoteId = `${formId}-disabled-note`
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AddFaqQuestionDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const addDisabled = disabled || Boolean(disabledReason)

  function closeDialog() {
    setOpen(false)
    setDraft(EMPTY_DRAFT)
    setErrors({})
    setFormError(null)
  }

  function update<K extends keyof AddFaqQuestionDraft>(field: K, value: AddFaqQuestionDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError(null)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateDraft(draft, limits)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const addError = onAdd({
      clusterId: draft.clusterId,
      displayedQuestion: draft.displayedQuestion.trim(),
      shortAnswer: draft.shortAnswer.trim(),
      detailedAnswer: draft.detailedAnswer.trim(),
      limitations: draft.limitations.trim(),
    })
    if (addError) {
      setFormError(addError)
      return
    }
    closeDialog()
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setOpen(true)
            return
          }
          closeDialog()
        }}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              size="lg"
              disabled={addDisabled}
              aria-describedby={disabledReason ? disabledNoteId : undefined}
              className="faq-button-primary min-h-11 bg-(--color-faq-ink) px-5 text-(--color-faq-paper) hover:bg-(--color-faq-coral-ink)"
            />
          }
        >
          <Plus aria-hidden="true" className="mr-2 size-4" />
          Add FAQ card
        </DialogTrigger>
        <DialogContent
          showClose={false}
          className="max-h-[min(92svh,52rem)] max-w-2xl overflow-y-auto rounded-[2rem_0.75rem_2rem_0.75rem] border-(--color-faq-line-strong) bg-(--color-faq-surface) p-5 text-(--color-faq-ink) sm:p-8"
        >
          <DialogClose
            aria-label="Close add FAQ card"
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-(--color-faq-ink-soft) outline-none hover:bg-(--color-faq-paper) focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
          <DialogHeader className="pr-12">
            <DialogTitle className="text-2xl tracking-[-0.035em]">Add an FAQ card</DialogTitle>
            <DialogDescription className="max-w-[60ch] leading-relaxed text-(--color-faq-ink-soft)">
              Choose a topic and draft both sides of the card. You can keep editing every field
              before publishing.
            </DialogDescription>
          </DialogHeader>

          <form id={formId} className="grid gap-5" onSubmit={submit} noValidate>
            <FieldShell
              label="Topic"
              htmlFor={`${formId}-topic`}
              error={errors.clusterId}
              hint="Choose where this question should appear."
            >
              <select
                id={`${formId}-topic`}
                value={draft.clusterId}
                disabled={addDisabled}
                aria-invalid={Boolean(errors.clusterId) || undefined}
                aria-describedby={`${formId}-topic-note`}
                className="min-h-11 w-full rounded-md border border-(--color-faq-line-strong) bg-(--color-faq-paper) px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
                onChange={(event) => update('clusterId', event.currentTarget.value)}
              >
                <option value="">Select a topic</option>
                {document.concernClusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell
              label="Question"
              htmlFor={`${formId}-question`}
              error={errors.displayedQuestion}
              hint="Write it as the audience would ask it."
            >
              <Textarea
                id={`${formId}-question`}
                rows={3}
                maxLength={limits.question.maxGraphemes}
                value={draft.displayedQuestion}
                disabled={addDisabled}
                aria-invalid={Boolean(errors.displayedQuestion) || undefined}
                aria-describedby={`${formId}-question-note`}
                className="resize-y border-(--color-faq-line-strong) bg-(--color-faq-paper)"
                onChange={(event) => update('displayedQuestion', event.currentTarget.value)}
              />
            </FieldShell>

            <FieldShell
              label="Short answer"
              htmlFor={`${formId}-short-answer`}
              error={errors.shortAnswer}
              hint={`${wordCount(draft.shortAnswer)} words · use ${limits['short-answer'].minWords}–${limits['short-answer'].maxWords} words for the card.`}
            >
              <Textarea
                id={`${formId}-short-answer`}
                rows={4}
                maxLength={limits['short-answer'].maxGraphemes}
                value={draft.shortAnswer}
                disabled={addDisabled}
                aria-invalid={Boolean(errors.shortAnswer) || undefined}
                aria-describedby={`${formId}-short-answer-note`}
                className="resize-y border-(--color-faq-line-strong) bg-(--color-faq-paper)"
                onChange={(event) => update('shortAnswer', event.currentTarget.value)}
              />
            </FieldShell>

            <FieldShell
              label="Detailed answer"
              htmlFor={`${formId}-detailed-answer`}
              error={errors.detailedAnswer}
              hint="Explain what we know, what we designed and what remains open."
            >
              <Textarea
                id={`${formId}-detailed-answer`}
                rows={7}
                maxLength={limits.body.maxGraphemes}
                value={draft.detailedAnswer}
                disabled={addDisabled}
                aria-invalid={Boolean(errors.detailedAnswer) || undefined}
                aria-describedby={`${formId}-detailed-answer-note`}
                className="resize-y border-(--color-faq-line-strong) bg-(--color-faq-paper)"
                onChange={(event) => update('detailedAnswer', event.currentTarget.value)}
              />
            </FieldShell>

            <FieldShell
              label="What still needs checking?"
              htmlFor={`${formId}-limitations`}
              error={errors.limitations}
              hint="Name the evidence gap or decision the team still needs to make."
            >
              <Textarea
                id={`${formId}-limitations`}
                rows={4}
                maxLength={limits.body.maxGraphemes}
                value={draft.limitations}
                disabled={addDisabled}
                aria-invalid={Boolean(errors.limitations) || undefined}
                aria-describedby={`${formId}-limitations-note`}
                className="resize-y border-(--color-faq-line-strong) bg-(--color-faq-paper)"
                onChange={(event) => update('limitations', event.currentTarget.value)}
              />
            </FieldShell>
            {formError ? (
              <p role="alert" className="text-sm text-(--color-faq-coral-ink)">
                {formError}
              </p>
            ) : null}
          </form>

          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={addDisabled}
                  className="min-h-11 border-(--color-faq-line-strong) bg-(--color-faq-surface)"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              form={formId}
              type="submit"
              size="lg"
              disabled={addDisabled}
              className="min-h-11 bg-(--color-faq-ink) text-(--color-faq-paper)"
            >
              Add FAQ card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {disabledReason ? (
        <p
          id={disabledNoteId}
          role="status"
          className="max-w-[42ch] text-xs leading-relaxed text-(--color-faq-ink-faint)"
        >
          {disabledReason}
        </p>
      ) : (
        <p className="max-w-[42ch] text-xs leading-relaxed text-(--color-faq-ink-faint)">
          Adds a new card to the selected topic. Save &amp; publish when the team is ready.
        </p>
      )}
    </div>
  )
}

function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
      <p
        id={`${htmlFor}-note`}
        role={error ? 'alert' : undefined}
        className={`text-xs leading-relaxed ${
          error ? 'text-(--color-faq-coral-ink)' : 'text-(--color-faq-ink-faint)'
        }`}
      >
        {error ?? hint}
      </p>
    </div>
  )
}

function validateDraft(
  draft: AddFaqQuestionDraft,
  limits: typeof FAQ_EDITORIAL_FIELD_LIMITS,
): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.clusterId) errors.clusterId = 'Choose a topic.'
  if (!draft.displayedQuestion.trim()) errors.displayedQuestion = 'Add the question.'
  if (graphemeCount(draft.displayedQuestion) > limits.question.maxGraphemes) {
    errors.displayedQuestion = `Use no more than ${limits.question.maxGraphemes} characters.`
  }
  const shortAnswerWords = wordCount(draft.shortAnswer)
  if (
    shortAnswerWords < limits['short-answer'].minWords ||
    shortAnswerWords > limits['short-answer'].maxWords
  ) {
    errors.shortAnswer = `Use ${limits['short-answer'].minWords}–${limits['short-answer'].maxWords} words.`
  } else if (graphemeCount(draft.shortAnswer) > limits['short-answer'].maxGraphemes) {
    errors.shortAnswer = `Use no more than ${limits['short-answer'].maxGraphemes} characters.`
  }
  if (!draft.detailedAnswer.trim()) errors.detailedAnswer = 'Add a detailed answer.'
  if (graphemeCount(draft.detailedAnswer) > limits.body.maxGraphemes) {
    errors.detailedAnswer = `Use no more than ${limits.body.maxGraphemes} characters.`
  }
  if (!draft.limitations.trim()) errors.limitations = 'Name what still needs checking.'
  if (graphemeCount(draft.limitations) > limits.body.maxGraphemes) {
    errors.limitations = `Use no more than ${limits.body.maxGraphemes} characters.`
  }
  return errors
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function graphemeCount(value: string): number {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].length
  }
  return [...value].length
}
