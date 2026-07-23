import { Link, useNavigate } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { EMOTION_BY_ID, shapeDataUri } from '~/lib/student-space/mood-shapes'
import { cn } from '~/lib/utils'

/**
 * DayDetailCard — inline content panel rendered alongside the Calendar grid
 * (post-PR-33 layout; no overlay). Lists mood pins, captures, and teacher
 * events for the selected day. Renders an empty placeholder when no day is
 * selected.
 */
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
  title?: string
  validation?: string
  createdAt?: string
  prompt?: string | null
  backendMirrorEntryId?: number | string
  reviewStatus?: 'pending' | 'confirmed' | 'forgotten' | string
  syncStatus?: 'local' | 'syncing' | 'synced' | 'failed' | string
  syncError?: string
  contextType?: string
  caption?: string
  reframe?: {
    headline?: string
    highlightPhrase?: string
    themes?: string[]
    needs?: string[]
    moods?: string[]
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
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
  const moods = date ? (engineState?.moodPins?.pins ?? []).filter((p) => p.entryDate === date) : []
  const captures = date
    ? (engineState?.captures?.entries ?? []).filter((c) => c.entryDate === date)
    : []
  const events = date
    ? (engineState?.calendar?.events ?? []).filter((e) => eventDate(e) === date)
    : []

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
        <p className="text-xs font-semibold text-(--color-sheet-ink-soft)">Day</p>
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
              <p className="mb-2 text-xs font-semibold text-(--color-sheet-ink-soft)">Moods</p>
              <ul className="space-y-1.5">
                {moods.map((mood, i) => {
                  const emotion = EMOTION_BY_ID[mood.emotion ?? '']
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: mood pins on a single day are positionally stable
                      key={i}
                      className="flex items-center gap-2 text-sm"
                    >
                      {emotion ? (
                        <img
                          src={shapeDataUri(emotion)}
                          alt=""
                          aria-hidden
                          className="size-5 shrink-0"
                          draggable={false}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="size-2 rounded-full bg-(--color-sheet-ink-soft)"
                        />
                      )}
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
                  )
                })}
              </ul>
            </div>
          ) : null}
          {captures.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-(--color-sheet-ink-soft)">
                Reflections
              </p>
              <ul className="space-y-2">
                {captures.map((cap) => {
                  if (cap.kind !== 'ask') {
                    return (
                      <li
                        key={cap.id}
                        className="rounded-lg bg-white/40 px-3 py-2 text-sm text-(--color-sheet-ink)"
                      >
                        {cap.text ? (
                          <p className="leading-relaxed">{cap.text.slice(0, 180)}</p>
                        ) : cap.caption ? (
                          <p className="leading-relaxed">{cap.caption}</p>
                        ) : null}
                      </li>
                    )
                  }
                  const title = cap.title?.trim() ?? ''
                  const headline = cap.reframe?.headline?.trim() ?? ''
                  const time = formatTime(cap.createdAt)
                  const entryId = Number(cap.backendMirrorEntryId)
                  const hasBackendId = Number.isInteger(entryId) && entryId > 0
                  const cardClasses =
                    'block rounded-lg bg-white/40 px-3 py-2 text-sm text-(--color-sheet-ink) transition-colors'
                  // Simplified card: highlighted title, time, one-line summary.
                  // The full transcript lives in the mirror detail sheet.
                  const body = (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold leading-snug text-(--color-sheet-ink)">
                          <mark className="rounded-sm bg-(--color-onb-bg-cream) box-decoration-clone px-1 py-0.5 text-(--color-sheet-ink)">
                            {title || headline || 'Reflection'}
                          </mark>
                        </p>
                        {time ? (
                          <span className="shrink-0 text-xs tabular-nums text-(--color-sheet-ink-soft)">
                            {time}
                          </span>
                        ) : null}
                      </div>
                      {title && headline ? (
                        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-(--color-sheet-ink-soft)">
                          {headline}
                        </p>
                      ) : null}
                    </>
                  )
                  return (
                    <li key={cap.id}>
                      {hasBackendId ? (
                        <Link
                          to="/history"
                          search={(prev: Record<string, unknown>) => ({ ...prev, entry: entryId })}
                          data-testid={`mirror-card-${entryId}`}
                          className={cn(
                            cardClasses,
                            'cursor-pointer hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          )}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={cardClasses}>{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          {events.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-(--color-sheet-ink-soft)">Events</p>
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
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-(--color-sheet-ink) px-4 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-(--color-sheet-ink)/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-status-searching) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-sheet-pane-left) active:scale-[0.96]"
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
