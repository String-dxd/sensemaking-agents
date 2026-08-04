import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { Textarea } from '~/components/ui/textarea'
import {
  deleteMyWorldFaqFeedback,
  loadMyWorldFaqPublicFeedback,
  type SubmitMyWorldFaqFeedbackInput,
  submitMyWorldFaqFeedback,
} from '~/server/my-world-faq-feedback.functions'
import type { MyWorldFaqFeedbackItem } from '~/server/my-world-faq-feedback-repository.server'

const FEEDBACK_KINDS = [
  { value: 'question', label: 'Question' },
  { value: 'concern', label: 'Concern' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'compliment', label: 'Compliment' },
] as const

const REMOVAL_KEYS_STORAGE = 'my-world-faq-feedback-removal-keys-v1'

type SubmissionState = 'idle' | 'sending' | 'sent' | 'error'

export interface FeedbackPanelProps {
  initialItems?: MyWorldFaqFeedbackItem[]
}

export function FeedbackPanel({ initialItems }: FeedbackPanelProps) {
  const [kind, setKind] = useState<SubmitMyWorldFaqFeedbackInput['kind']>('question')
  const [message, setMessage] = useState('')
  const [submission, setSubmission] = useState<SubmissionState>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [availability, setAvailability] = useState<'loading' | 'ready' | 'unavailable'>(
    initialItems === undefined ? 'loading' : 'ready',
  )
  const [items, setItems] = useState(initialItems ?? [])
  const [removalKeys, setRemovalKeys] = useState<Record<string, string>>({})
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removalError, setRemovalError] = useState<{ id: string; message: string } | null>(null)
  const feedbackRequestGeneration = useRef(0)

  useEffect(() => {
    setRemovalKeys(readRemovalKeys())
  }, [])

  const loadFeedback = useCallback(() => {
    if (initialItems !== undefined) {
      setItems(initialItems)
      setAvailability('ready')
      return
    }

    const generation = ++feedbackRequestGeneration.current
    setAvailability('loading')
    void loadMyWorldFaqPublicFeedback()
      .then((response) => {
        if (feedbackRequestGeneration.current !== generation) return
        if (response.status === 'ready') {
          setItems(response.items)
          setAvailability('ready')
        } else {
          setAvailability('unavailable')
        }
      })
      .catch(() => {
        if (feedbackRequestGeneration.current === generation) setAvailability('unavailable')
      })
  }, [initialItems])

  useEffect(() => {
    loadFeedback()
    return () => {
      feedbackRequestGeneration.current += 1
    }
  }, [loadFeedback])

  useEffect(() => {
    if (initialItems !== undefined) return

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) loadFeedback()
    }

    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [initialItems, loadFeedback])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanMessage = message.trim()
    if (!cleanMessage || submission === 'sending') return

    setSubmission('sending')
    setNotice(null)
    try {
      const response = await submitMyWorldFaqFeedback({
        data: { kind, message: cleanMessage },
      })
      if (!response.ok) {
        setSubmission('error')
        setNotice(response.message)
        return
      }

      const nextRemovalKeys = {
        ...removalKeys,
        [response.item.id]: response.deleteToken,
      }
      const removalKeySaved = writeRemovalKeys(nextRemovalKeys)
      setRemovalKeys(nextRemovalKeys)
      setItems((current) => [
        response.item,
        ...current.filter((item) => item.id !== response.item.id),
      ])
      setSubmission('sent')
      setMessage('')
      setNotice(
        removalKeySaved
          ? 'Shared. You can remove it later from this browser.'
          : 'Shared. This browser could not save the private removal key.',
      )
    } catch {
      setSubmission('error')
      setNotice('Your feedback could not be saved right now. Please try again.')
    }
  }

  const remove = async (id: string) => {
    const deleteToken = removalKeys[id]
    if (!deleteToken || removing !== null) return

    setRemoving(id)
    setRemovalError(null)
    try {
      const response = await deleteMyWorldFaqFeedback({
        data: { id, deleteToken },
      })
      if (!response.ok) {
        setRemovalError({ id, message: response.message })
        return
      }

      setItems((current) => current.filter((item) => item.id !== id))
      const nextRemovalKeys = { ...removalKeys }
      delete nextRemovalKeys[id]
      writeRemovalKeys(nextRemovalKeys)
      setRemovalKeys(nextRemovalKeys)
      setConfirmingRemoval(null)
      setNotice('Your feedback was removed.')
    } catch {
      setRemovalError({
        id,
        message: 'Your feedback could not be removed right now. Please try again.',
      })
    } finally {
      setRemoving(null)
    }
  }

  // Availability remains fail-closed: the form appears only after the feedback
  // store confirms it is ready. The FAQ itself has already rendered by then.
  if (availability === 'loading') {
    return (
      <p role="status" className="text-sm text-(--color-faq-ink-soft)">
        Loading shared feedback…
      </p>
    )
  }

  if (availability === 'unavailable') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-(--color-faq-ink-soft)">Feedback is unavailable right now.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            loadFeedback()
          }}
          className="min-h-11 border-(--color-faq-ink)"
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-10">
      <form
        onSubmit={(event) => void submit(event)}
        className="rounded-[2rem_0.7rem_2rem_0.7rem] border border-(--color-faq-ink) bg-(--color-faq-paper) p-5 sm:p-7"
      >
        <fieldset>
          <legend className="text-sm font-semibold">What are you sharing?</legend>
          <RadioGroup
            value={kind}
            onValueChange={(value) => {
              if (
                value === 'question' ||
                value === 'concern' ||
                value === 'suggestion' ||
                value === 'compliment'
              ) {
                setKind(value)
              }
            }}
            className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {FEEDBACK_KINDS.map((item) => (
              <RadioGroupItem
                key={item.value}
                value={item.value}
                className="min-h-11 border-(--color-faq-ink) bg-transparent px-3 font-semibold data-[checked]:bg-(--color-faq-yellow) data-[checked]:ring-(--color-faq-ink)"
              >
                {item.label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="my-world-anonymous-feedback">Your feedback</Label>
            <span className="text-xs tabular-nums text-(--color-faq-ink-faint)">
              {message.length} / 2000
            </span>
          </div>
          <Textarea
            id="my-world-anonymous-feedback"
            value={message}
            onChange={(event) => {
              setMessage(event.currentTarget.value)
              if (submission !== 'sending') {
                setSubmission('idle')
                setNotice(null)
              }
            }}
            maxLength={2000}
            required
            rows={5}
            placeholder="What should we explain, change or keep?"
            className="mt-2 min-h-36 resize-y border-(--color-faq-ink) bg-(--color-faq-surface) text-base focus-visible:ring-(--color-faq-focus)"
          />
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[58ch] text-xs leading-relaxed text-(--color-faq-ink-soft)">
            Your feedback appears below without a name. Do not include personal information. This
            browser saves a private key so you can remove your submission.
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={!message.trim() || submission === 'sending'}
            className="faq-button-primary min-h-12 shrink-0 border border-(--color-faq-ink) bg-(--color-faq-ink) px-6 text-(--color-faq-paper)"
          >
            {submission === 'sending' ? 'Sharing…' : 'Share without a name'}
          </Button>
        </div>

        <p
          aria-live="polite"
          className={`mt-4 min-h-5 text-sm font-semibold ${
            submission === 'error' ? 'text-(--color-faq-coral-ink)' : 'text-(--color-faq-stage-ink)'
          }`}
        >
          {notice}
        </p>
      </form>

      <section aria-labelledby="faq-shared-feedback-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-(--color-faq-ink) pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em]">From this page</p>
            <h3
              id="faq-shared-feedback-title"
              className="mt-1 text-2xl font-semibold tracking-[-0.035em]"
            >
              Shared feedback
            </h3>
          </div>
          <p className="text-sm tabular-nums text-(--color-faq-ink-soft)">
            {items.length} {items.length === 1 ? 'submission' : 'submissions'}
          </p>
        </div>

        {items.length > 0 ? (
          <ol>
            {items.map((item) => {
              const canRemove = Boolean(removalKeys[item.id])
              const isConfirming = confirmingRemoval === item.id
              const isRemoving = removing === item.id
              const itemRemovalError = removalError?.id === item.id ? removalError.message : null

              return (
                <li
                  key={item.id}
                  className="border-b border-(--color-faq-line-strong) py-6 first:pt-5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant="outline"
                      className="border-(--color-faq-ink) bg-(--color-faq-paper) capitalize"
                    >
                      {item.kind}
                    </Badge>
                    <span className="text-xs font-semibold">Anonymous</span>
                    <time
                      dateTime={item.createdAt}
                      className="text-xs text-(--color-faq-ink-faint)"
                    >
                      {formatSingaporeDate(item.createdAt)}
                    </time>
                  </div>
                  <p className="mt-3 max-w-[72ch] whitespace-pre-wrap text-base leading-relaxed">
                    {item.message}
                  </p>

                  {canRemove ? (
                    <div className="mt-4">
                      {isConfirming ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mr-1 text-xs font-semibold">
                            Remove this feedback permanently?
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isRemoving}
                            onClick={() => setConfirmingRemoval(null)}
                            className="min-h-10 border-(--color-faq-ink)"
                          >
                            Keep it
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isRemoving}
                            onClick={() => void remove(item.id)}
                            className="min-h-10 bg-(--color-faq-ink) text-(--color-faq-paper)"
                          >
                            {isRemoving ? 'Removing…' : 'Remove'}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setConfirmingRemoval(item.id)
                            setRemovalError(null)
                          }}
                          className="min-h-10 gap-2 px-2 text-(--color-faq-ink-soft)"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          Remove your feedback
                        </Button>
                      )}
                      {itemRemovalError ? (
                        <p
                          aria-live="polite"
                          className="mt-2 text-sm font-semibold text-(--color-faq-coral-ink)"
                        >
                          {itemRemovalError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="py-7 text-sm text-(--color-faq-ink-soft)">
            No feedback has been shared yet.
          </p>
        )}
      </section>
    </div>
  )
}

function readRemovalKeys(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(REMOVAL_KEYS_STORAGE)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, token]) =>
          /^[0-9a-f-]{36}$/i.test(id) &&
          typeof token === 'string' &&
          /^[A-Za-z0-9_-]{43}$/.test(token),
      ),
    )
  } catch {
    return {}
  }
}

function writeRemovalKeys(keys: Record<string, string>): boolean {
  try {
    window.localStorage.setItem(REMOVAL_KEYS_STORAGE, JSON.stringify(keys))
    return true
  } catch {
    return false
  }
}

function formatSingaporeDate(value: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(value))
}
