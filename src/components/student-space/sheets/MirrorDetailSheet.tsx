import { X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { SheetEyebrow } from '~/components/ui/sheet'
import { sgDateKey } from '~/lib/entry-date'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'

/**
 * Mirror reflection detail — rendered as a right column inside the History
 * sheet (`/history?entry=<id>`, Slack-style). Reads the capture out of the
 * engine's `captures` slice by `backendMirrorEntryId` and shows the story
 * reframe, validation, inferred meaning, and the full transcript, plus
 * Confirm / Forget actions for pending reflections. The legacy `/mirror/$id`
 * route redirects here.
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

/**
 * MirrorDetailPane — the mirror detail view as a single scroll column with
 * its own close affordance, rendered inside the History sheet's right pane.
 */
export function MirrorDetailPane({ entryId, onClose }: { entryId: number; onClose: () => void }) {
  const engine = useEngine()
  const state = (
    engine as unknown as { state?: MirrorEngineState & { captures?: Subscribable } } | null
  )?.state
  useEngineSliceVersion(state?.captures ?? null)

  const entries = state?.captures?.entries
  const hydrated = Array.isArray(entries)
  const capture = useMemo<MirrorCapture | null>(
    () =>
      entries?.find(
        (entry) => Number(entry.backendMirrorEntryId) === entryId && entry.kind === 'ask',
      ) ?? null,
    [entries, entryId],
  )

  return (
    <div data-testid="mirror-detail-pane" className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-(--color-sheet-divider) px-7 pt-8 pb-5 max-[640px]:px-5 max-[640px]:pt-5">
        <div className="min-w-0">
          <SheetEyebrow>Story reframe</SheetEyebrow>
          <h2 className="mt-1 text-xl font-semibold leading-snug tracking-[-0.01em] text-(--color-sheet-ink)">
            {capture
              ? capture.title?.trim() ||
                capture.reframe?.headline?.trim() ||
                capture.reframe?.highlightPhrase?.trim() ||
                'Untitled mirror'
              : hydrated
                ? 'Mirror not found'
                : 'Loading…'}
          </h2>
          {capture ? (
            <p className="mt-1 text-sm text-(--color-sheet-ink-soft)">
              {formatLongDate(capture.entryDate ?? toEntryDate(capture.createdAt))}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close reflection"
          data-testid="mirror-pane-close"
          onClick={onClose}
          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--color-sheet-ink-soft) transition-[background-color,color,transform] hover:bg-black/5 hover:text-(--color-sheet-ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6 max-[640px]:px-5">
        {capture ? (
          <div className="space-y-6">
            {capture.reframe?.highlightPhrase?.trim() ? (
              <p className="text-base italic leading-relaxed text-(--color-sheet-ink-soft)">
                “{capture.reframe.highlightPhrase.trim()}”
              </p>
            ) : null}
            <SidebarMeta capture={capture} />
            <MirrorBody capture={capture} engineState={state} />
          </div>
        ) : (
          <p className="text-base leading-relaxed text-(--color-sheet-ink-soft)">
            {hydrated ? 'We couldn’t find that mirror. It may have been let go.' : 'Loading…'}
          </p>
        )}
      </div>
    </div>
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
  return sgDateKey(iso) ?? ''
}
