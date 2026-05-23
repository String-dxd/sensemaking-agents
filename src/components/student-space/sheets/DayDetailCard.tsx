import { useNavigate } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'

/**
 * DayDetailCard — inline content panel rendered alongside the Calendar grid
 * (post-PR-33 layout; no overlay). Lists mood pins, captures, and teacher
 * events for the selected day. Renders an empty placeholder when no day is
 * selected.
 */
const MOOD_HEX: Record<string, string> = {
  joy: '#FFD66B',
  sadness: '#7FB3D9',
  anger: '#E36A55',
  fear: '#B49AD6',
  disgust: '#9CC36E',
  anxiety: '#F1A04E',
  envy: '#6FC2B3',
  embarrassment: '#F0A6B5',
  ennui: '#A8A5BD',
}

function formatLongDate(ymd: string | null): string {
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

interface DayDetailCapture {
  id: string
  entryDate: string
  kind: string
  text?: string
  createdAt?: string
  prompt?: string | null
  backendMirrorEntryId?: number | string
  reviewStatus?: 'pending' | 'confirmed' | 'forgotten' | string
  syncStatus?: 'local' | 'syncing' | 'synced' | 'failed' | string
  syncError?: string
  contextType?: string
  caption?: string
}

interface DayDetailEngineState {
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
    }>
    refreshSnapshot?: () => Promise<unknown>
    submitReflection?: (input: Record<string, unknown>) => Promise<{
      mirrorEntry?: {
        id?: string | number
        transcript?: string
        reviewStatus?: string
        contextType?: string
        storyReframe?: string
        inferredMeaning?: string
      }
    }>
  }
  moodPins?: {
    pins?: Array<{ entryDate: string; emotion?: string; intensity?: number; note?: string }>
  }
  captures?: {
    findById?: (id: string) => DayDetailCapture | null
    patch?: (id: string, updates: Record<string, unknown>) => unknown
    entries?: DayDetailCapture[]
  }
  calendar?: {
    events?: Array<{
      entryDate?: string
      date?: string
      kind?: string
      title?: string
      label?: string
    }>
  }
}

export function DayDetailCard({
  date,
  engineState,
}: {
  date: string | null
  engineState: DayDetailEngineState | undefined
}) {
  const [reviewInFlight, setReviewInFlight] = useState<{
    entryId: number
    status: 'confirmed' | 'forgotten'
  } | null>(null)
  const [reviewError, setReviewError] = useState<{ entryId: number; message: string } | null>(null)
  const [retryInFlightId, setRetryInFlightId] = useState<string | null>(null)

  const moods = date ? (engineState?.moodPins?.pins ?? []).filter((p) => p.entryDate === date) : []
  const captures = date
    ? (engineState?.captures?.entries ?? []).filter((c) => c.entryDate === date)
    : []
  const events = date
    ? (engineState?.calendar?.events ?? []).filter((e) => eventDate(e) === date)
    : []

  async function reviewCapture(capture: DayDetailCapture, status: 'confirmed' | 'forgotten') {
    const entryId = Number(capture.backendMirrorEntryId)
    if (!Number.isInteger(entryId) || !engineState?.backend?.updateReflectionReview) return
    setReviewInFlight({ entryId, status })
    setReviewError(null)
    try {
      const updated = await engineState.backend.updateReflectionReview({ entryId, status })
      patchReviewCapture(capture, entryId, status, updated)
      try {
        const snapshot = await engineState.backend.refreshSnapshot?.()
        if (snapshot) engineState.applyBackendSnapshot?.(snapshot)
      } catch (refreshErr) {
        console.warn('[DayDetailCard] reflection review snapshot refresh failed', refreshErr)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[DayDetailCard] reflection review failed', err)
      setReviewError({ entryId, message: `Review update failed: ${message}` })
    } finally {
      setReviewInFlight(null)
    }
  }

  async function retryCaptureSync(capture: DayDetailCapture) {
    if (!capture.id || capture.kind !== 'ask' || !engineState?.backend?.submitReflection) return
    setRetryInFlightId(capture.id)
    engineState.captures?.patch?.(capture.id, { syncStatus: 'syncing', syncError: '' })
    try {
      const result = await engineState.backend.submitReflection({
        localCaptureId: capture.id,
        transcript: capture.text || '',
        contextType: capture.contextType || 'school',
      })
      const mirror = result?.mirrorEntry
      if (mirror) {
        engineState.captures?.patch?.(capture.id, {
          backendMirrorEntryId: mirror.id,
          text: mirror.transcript || capture.text || '',
          reviewStatus: mirror.reviewStatus || 'pending',
          syncStatus: 'synced',
          syncError: '',
          contextType: mirror.contextType || 'school',
          reframe: {
            headline: mirror.storyReframe || '',
            highlightPhrase: mirror.inferredMeaning || '',
            themes: mirror.contextType ? [mirror.contextType] : [],
            needs: [],
            moods: [],
          },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[DayDetailCard] reflection sync retry failed', err)
      engineState.captures?.patch?.(capture.id, { syncStatus: 'failed', syncError: message })
    } finally {
      setRetryInFlightId(null)
    }
  }

  function patchReviewCapture(
    capture: DayDetailCapture,
    entryId: number,
    status: 'confirmed' | 'forgotten',
    updated:
      | {
          reviewStatus?: string
          transcript?: string
          contextType?: string
          storyReframe?: string
          inferredMeaning?: string
        }
      | undefined,
  ) {
    const patch = {
      reviewStatus: updated?.reviewStatus || status,
      ...(updated?.transcript ? { text: updated.transcript } : {}),
      ...(updated?.contextType ? { contextType: updated.contextType } : {}),
      ...(updated
        ? {
            reframe: {
              headline: updated.storyReframe || '',
              highlightPhrase: updated.inferredMeaning || '',
              themes: updated.contextType ? [updated.contextType] : [],
              needs: [],
              moods: [],
            },
          }
        : {}),
    }
    let patched = engineState?.captures?.patch?.(`mirror:${entryId}`, patch)
    if (patched) return
    if (capture.id) patched = engineState?.captures?.patch?.(capture.id, patch)
  }

  if (!date) {
    return (
      <section
        data-testid="day-detail-card"
        className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-6"
      >
        <p className="text-sm text-(--color-sheet-ink-soft)">Pick a day to see its detail.</p>
      </section>
    )
  }

  const isEmpty = moods.length === 0 && captures.length === 0 && events.length === 0

  return (
    <section
      data-testid="day-detail-card"
      className="rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5"
    >
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
          Day
        </p>
        <h3 className="mt-0.5 text-base font-semibold text-(--color-sheet-ink)">
          {formatLongDate(date)}
        </h3>
      </header>
      {isEmpty ? (
        <EmptyDay date={date} />
      ) : (
        <div className="space-y-5">
          {moods.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
                Moods
              </p>
              <ul className="space-y-1.5">
                {moods.map((mood, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: mood pins on a single day are positionally stable
                    key={i}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: MOOD_HEX[mood.emotion ?? ''] ?? '#bbb' }}
                    />
                    <span className="font-medium capitalize text-(--color-sheet-ink)">
                      {mood.emotion}
                    </span>
                    {typeof mood.intensity === 'number' ? (
                      <span className="text-xs text-(--color-sheet-ink-soft)">
                        · intensity {mood.intensity}
                      </span>
                    ) : null}
                    {mood.note ? (
                      <span className="text-xs text-(--color-sheet-ink-soft)">— {mood.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {captures.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
                Captures
              </p>
              <ul className="space-y-2">
                {captures.map((cap) => (
                  <li
                    key={cap.id}
                    className="rounded-lg bg-white/40 px-3 py-2 text-sm text-(--color-sheet-ink)"
                  >
                    <p className="text-xs uppercase tracking-[0.12em] text-(--color-sheet-ink-soft)">
                      {cap.kind === 'ask' ? 'Reflection' : cap.kind}
                    </p>
                    {cap.text ? (
                      <p className="mt-1 leading-relaxed">{cap.text.slice(0, 180)}</p>
                    ) : cap.caption ? (
                      <p className="mt-1 leading-relaxed">{cap.caption}</p>
                    ) : null}
                    {cap.kind === 'ask' ? (
                      <CaptureActions
                        capture={cap}
                        reviewInFlight={reviewInFlight}
                        reviewError={reviewError}
                        retryInFlight={retryInFlightId === cap.id}
                        onReview={(status) => void reviewCapture(cap, status)}
                        onRetry={() => void retryCaptureSync(cap)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {events.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
                Events
              </p>
              <ul className="space-y-1.5 text-sm">
                {events.map((ev, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: events on a single day are positionally stable
                  <li key={i} className="text-(--color-sheet-ink)">
                    {eventLabel(ev)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function CaptureActions({
  capture,
  reviewInFlight,
  reviewError,
  retryInFlight,
  onReview,
  onRetry,
}: {
  capture: DayDetailCapture
  reviewInFlight: { entryId: number; status: 'confirmed' | 'forgotten' } | null
  reviewError: { entryId: number; message: string } | null
  retryInFlight: boolean
  onReview: (status: 'confirmed' | 'forgotten') => void
  onRetry: () => void
}) {
  const entryId = Number(capture.backendMirrorEntryId)
  const reviewing = Number.isInteger(entryId) && reviewInFlight?.entryId === entryId
  const canReview = Number.isInteger(entryId) && capture.reviewStatus === 'pending'
  const failed = capture.syncStatus === 'failed'
  return (
    <div className="mt-2 space-y-2 text-xs text-(--color-sheet-ink-soft)">
      {capture.reviewStatus ? <p>status: {capture.reviewStatus}</p> : null}
      {syncLine(capture) ? <p>{syncLine(capture)}</p> : null}
      {capture.prompt ? <p>prompt: {capture.prompt}</p> : null}
      {canReview ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={reviewing}
            onClick={() => onReview('confirmed')}
            className="min-h-8 cursor-pointer rounded-full border border-(--color-sheet-divider) bg-white/70 px-3 font-semibold text-(--color-sheet-ink) disabled:cursor-wait disabled:opacity-60"
          >
            {reviewing && reviewInFlight?.status === 'confirmed' ? 'Confirming...' : 'Confirm'}
          </button>
          <button
            type="button"
            disabled={reviewing}
            onClick={() => onReview('forgotten')}
            className="min-h-8 cursor-pointer rounded-full border border-(--color-sheet-divider) bg-white/70 px-3 font-semibold text-(--color-sheet-ink) disabled:cursor-wait disabled:opacity-60"
          >
            {reviewing && reviewInFlight?.status === 'forgotten' ? 'Forgetting...' : 'Forget'}
          </button>
        </div>
      ) : null}
      {failed ? (
        <button
          type="button"
          disabled={retryInFlight}
          onClick={onRetry}
          className="min-h-8 cursor-pointer rounded-full border border-(--color-sheet-divider) bg-white/70 px-3 font-semibold text-(--color-sheet-ink) disabled:cursor-wait disabled:opacity-60"
        >
          {retryInFlight ? 'Retrying...' : 'Retry sync'}
        </button>
      ) : null}
      {reviewError?.entryId === entryId ? (
        <p role="alert" className="text-red-700">
          {reviewError.message}
        </p>
      ) : null}
    </div>
  )
}

function EmptyDay({ date }: { date: string }) {
  const navigate = useNavigate()
  const today = ymd(new Date())
  const isFuture = date > today
  const isToday = date === today
  const headline = isFuture
    ? 'Nothing here yet — this day is still ahead.'
    : isToday
      ? 'Nothing logged today.'
      : 'Nothing was logged this day.'
  const hint = isFuture
    ? 'Moods, reflections, and photos you capture on the island will show up on the day you make them.'
    : 'When you capture a moment on the island, it lands here on the day it happened.'

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-(--color-sheet-ink)">{headline}</p>
      <p className="max-w-[40ch] text-xs leading-5 text-(--color-sheet-ink-soft)">{hint}</p>
      {!isFuture ? (
        <button
          type="button"
          onClick={() => navigate({ to: '/' })}
          className="inline-flex min-h-9 items-center gap-2 rounded-full bg-(--color-sheet-ink) px-4 text-xs font-semibold text-white transition-colors hover:bg-(--color-sheet-ink)/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-status-searching) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-sheet-pane-left)"
        >
          <Sparkles aria-hidden className="size-3.5" />
          Capture on the island
        </button>
      ) : null}
    </div>
  )
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function eventDate(event: { entryDate?: string; date?: string }) {
  return event.entryDate || event.date || ''
}

function eventLabel(event: { title?: string; label?: string; kind?: string }) {
  return event.title ?? event.label ?? event.kind ?? 'Event'
}

function syncLine(capture: DayDetailCapture) {
  if (capture.syncStatus === 'failed')
    return `sync failed${capture.syncError ? `: ${capture.syncError}` : ''}`
  if (capture.syncStatus === 'syncing') return 'syncing...'
  return ''
}
