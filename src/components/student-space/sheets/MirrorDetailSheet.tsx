import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PageSurface,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetEyebrow,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetTitle,
  usePageEscape,
} from '~/components/ui/sheet'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'

/**
 * MirrorDetailSheet — full details view for a single mirror reflection.
 *
 * Opens at `/mirror/$id` from the History day-detail card's "Show more"
 * link. Reads the capture out of the engine's `captures` slice by
 * `backendMirrorEntryId`. Sidebar carries context (date, time, status);
 * the right pane shows the story reframe, validation, inferred meaning,
 * and the full transcript, plus Confirm / Forget actions for pending
 * reflections.
 */

interface MirrorCapture {
  id: string
  entryDate?: string
  kind: string
  text?: string
  title?: string
  validation?: string
  createdAt?: string
  backendMirrorEntryId?: number | string
  reviewStatus?: 'pending' | 'confirmed' | 'forgotten' | string
  contextType?: string
  reframe?: {
    headline?: string
    highlightPhrase?: string
    themes?: string[]
    needs?: string[]
    moods?: string[]
  }
}

interface MirrorEngineState {
  applyBackendSnapshot?: (snapshot: unknown) => void
  backend?: {
    updateReflectionReview?: (input: {
      entryId: number
      status: 'confirmed' | 'forgotten'
    }) => Promise<{
      reviewStatus?: string
      transcript?: string
      contextType?: string
      storyReframe?: string
      inferredMeaning?: string
      validation?: string
    }>
    refreshSnapshot?: () => Promise<unknown>
  }
  captures?: {
    entries?: MirrorCapture[]
    patch?: (id: string, updates: Record<string, unknown>) => unknown
  }
}

const CONTEXT_LABEL: Record<string, string> = {
  school: 'School',
  peer: 'Peer',
  civic: 'Civic',
  family: 'Family',
  hobby: 'Hobby',
}

type Subscribable = { subscribe: (cb: () => void) => () => void }

export function MirrorDetailSheet() {
  const engine = useEngine()
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }
  const entryId = Number(params.id)
  const entryIdValid = Number.isInteger(entryId) && entryId > 0

  const state = (
    engine as unknown as { state?: MirrorEngineState & { captures?: Subscribable } } | null
  )?.state
  useEngineSliceVersion(state?.captures ?? null)

  const entries = state?.captures?.entries
  const hydrated = Array.isArray(entries)

  const capture = useMemo<MirrorCapture | null>(() => {
    if (!entryIdValid) return null
    return (
      entries?.find(
        (entry) => Number(entry.backendMirrorEntryId) === entryId && entry.kind === 'ask',
      ) ?? null
    )
  }, [entries, entryId, entryIdValid])

  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const dismissToHistory = useCallback(() => navigate({ to: '/history' }), [navigate])
  usePageEscape(dismissToHistory)

  const notFoundCopy =
    !hydrated && entryIdValid
      ? 'Loading…'
      : 'We couldn’t find that mirror. It may have been let go.'

  return (
    <PageSurface>
      <SheetSidebar>
        <SheetIdentityHeader>
          <Link
            to="/history"
            className="-mx-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-(--color-sheet-ink-soft) transition-colors hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Back to history
          </Link>
          <SheetTitle>Mirror</SheetTitle>
          <SheetDescription>
            {capture
              ? formatLongDate(capture.entryDate ?? toEntryDate(capture.createdAt))
              : 'Reflection details'}
          </SheetDescription>
        </SheetIdentityHeader>
        {capture ? (
          <div className="space-y-4 px-7 pb-6">
            <SidebarMeta capture={capture} />
          </div>
        ) : null}
      </SheetSidebar>
      <SheetContent>
        {capture ? (
          <>
            <SheetPageHeader>
              <SheetEyebrow>Story reframe</SheetEyebrow>
              <SheetTitle>
                {capture.title?.trim() ||
                  capture.reframe?.headline?.trim() ||
                  capture.reframe?.highlightPhrase?.trim() ||
                  'Untitled mirror'}
              </SheetTitle>
              {capture.reframe?.highlightPhrase?.trim() ? (
                <p className="mt-1 text-base italic leading-relaxed text-(--color-sheet-ink-soft)">
                  “{capture.reframe.highlightPhrase.trim()}”
                </p>
              ) : null}
            </SheetPageHeader>
            <SheetBody>
              <MirrorBody capture={capture} engineState={state} />
            </SheetBody>
          </>
        ) : (
          <SheetBody>
            <p className="text-base leading-relaxed text-(--color-sheet-ink-soft)">
              {notFoundCopy}
            </p>
            <Link
              to="/history"
              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-(--color-sheet-ink) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-sheet-ink)/90"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back to history
            </Link>
          </SheetBody>
        )}
      </SheetContent>
    </PageSurface>
  )
}

function SidebarMeta({ capture }: { capture: MirrorCapture }) {
  const time = capture.createdAt
    ? new Date(capture.createdAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''
  const contextLabel = capture.contextType
    ? (CONTEXT_LABEL[capture.contextType] ?? capture.contextType)
    : null
  const moods = capture.reframe?.moods ?? []
  const status = capture.reviewStatus
  return (
    <dl className="space-y-3 text-sm">
      {time ? (
        <Meta label="Time">
          <span className="tabular-nums">{time}</span>
        </Meta>
      ) : null}
      {contextLabel ? (
        <Meta label="Context">
          <span className="inline-flex items-center rounded-full bg-(--color-onb-bg-cream) px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.04em] text-(--color-sheet-ink)">
            {contextLabel}
          </span>
        </Meta>
      ) : null}
      {status ? (
        <Meta label="Status">
          <span
            className={
              status === 'confirmed'
                ? 'text-xs font-semibold text-(--color-status-searching)'
                : status === 'forgotten'
                  ? 'text-xs font-semibold text-(--color-sheet-ink-soft)'
                  : 'text-xs font-semibold text-(--color-sheet-ink)'
            }
          >
            {status === 'confirmed'
              ? 'Confirmed'
              : status === 'forgotten'
                ? 'Let go'
                : 'Pending review'}
          </span>
        </Meta>
      ) : null}
      {moods.length > 0 ? (
        <Meta label="Moods">
          <div className="flex flex-wrap gap-1.5">
            {moods.map((mood) => (
              <span
                key={mood}
                className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-xs capitalize text-(--color-sheet-ink-soft)"
              >
                {mood}
              </span>
            ))}
          </div>
        </Meta>
      ) : null}
    </dl>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-(--color-sheet-ink-soft)">
        {label}
      </dt>
      <dd className="text-sm text-(--color-sheet-ink)">{children}</dd>
    </div>
  )
}

function MirrorBody({
  capture,
  engineState,
}: {
  capture: MirrorCapture
  engineState: MirrorEngineState | undefined
}) {
  const reframe = capture.reframe
  const validation = capture.validation?.trim() ?? ''
  const transcript = capture.text?.trim() ?? ''
  return (
    <div className="space-y-8">
      {reframe?.headline?.trim() ? (
        <Section eyebrow="Story" title="What this moment said">
          <p className="leading-relaxed text-(--color-sheet-ink)">{reframe.headline}</p>
        </Section>
      ) : null}
      {validation ? (
        <Section eyebrow="Validation" title="What Mirror noticed">
          <p className="leading-relaxed text-(--color-sheet-ink)">{validation}</p>
        </Section>
      ) : null}
      {reframe?.highlightPhrase?.trim() ? (
        <Section eyebrow="Inferred meaning" title="The shape underneath">
          <p className="leading-relaxed text-(--color-sheet-ink)">{reframe.highlightPhrase}</p>
        </Section>
      ) : null}
      {transcript ? (
        <Section eyebrow="Transcript" title="What you said">
          <p className="whitespace-pre-wrap leading-relaxed text-(--color-sheet-ink)">
            {transcript}
          </p>
        </Section>
      ) : null}
      <ReviewActions capture={capture} engineState={engineState} />
    </div>
  )
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-(--color-sheet-ink-soft)">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-base font-semibold text-(--color-sheet-ink)">{title}</h3>
      <div className="mt-2 text-base">{children}</div>
    </section>
  )
}

function ReviewActions({
  capture,
  engineState,
}: {
  capture: MirrorCapture
  engineState: MirrorEngineState | undefined
}) {
  const entryId = Number(capture.backendMirrorEntryId)
  const canReview = Number.isInteger(entryId) && entryId > 0 && capture.reviewStatus === 'pending'
  const [pendingStatus, setPendingStatus] = useState<'confirmed' | 'forgotten' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (status: 'confirmed' | 'forgotten') => {
      const update = engineState?.backend?.updateReflectionReview
      if (!update || pendingStatus !== null) return
      setPendingStatus(status)
      setError(null)
      try {
        const updated = await update({ entryId, status })
        const patch: Record<string, unknown> = { reviewStatus: updated?.reviewStatus || status }
        if (updated?.transcript) patch.text = updated.transcript
        if (updated?.validation) patch.validation = updated.validation
        if (updated?.contextType) patch.contextType = updated.contextType
        if (updated) {
          patch.reframe = {
            headline: updated.storyReframe || capture.reframe?.headline || '',
            highlightPhrase: updated.inferredMeaning || capture.reframe?.highlightPhrase || '',
            themes: updated.contextType ? [updated.contextType] : (capture.reframe?.themes ?? []),
            needs: capture.reframe?.needs ?? [],
            moods: capture.reframe?.moods ?? [],
          }
        }
        let patched = engineState.captures?.patch?.(`mirror:${entryId}`, patch)
        if (!patched && capture.id) {
          patched = engineState.captures?.patch?.(capture.id, patch)
        }
        try {
          const snapshot = await engineState.backend?.refreshSnapshot?.()
          if (snapshot) engineState.applyBackendSnapshot?.(snapshot)
        } catch (refreshErr) {
          console.warn('[MirrorDetailSheet] snapshot refresh failed', refreshErr)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[MirrorDetailSheet] review failed', err)
        setError(`Review update failed: ${message}`)
      } finally {
        setPendingStatus(null)
      }
    },
    [capture, engineState, entryId, pendingStatus],
  )

  if (!canReview) return null
  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendingStatus !== null}
          onClick={() => void run('confirmed')}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-full bg-(--color-sheet-ink) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-sheet-ink)/90 disabled:cursor-wait disabled:opacity-60"
        >
          {pendingStatus === 'confirmed' ? 'Confirming…' : 'Confirm'}
        </button>
        <button
          type="button"
          disabled={pendingStatus !== null}
          onClick={() => void run('forgotten')}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-(--color-sheet-divider) bg-white/70 px-4 text-sm font-semibold text-(--color-sheet-ink) transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-60"
        >
          {pendingStatus === 'forgotten' ? 'Forgetting…' : 'Forget'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function formatLongDate(ymd: string | undefined): string {
  if (!ymd) return ''
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ymd
  }
}

function toEntryDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
