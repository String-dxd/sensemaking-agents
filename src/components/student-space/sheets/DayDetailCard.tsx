import { useMemo } from 'react'

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

interface DayDetailEngineState {
  moodPins?: {
    pins?: Array<{ entryDate: string; emotion?: string; intensity?: number; note?: string }>
  }
  captures?: {
    entries?: Array<{
      id: string
      entryDate: string
      kind: string
      text?: string
      createdAt?: string
    }>
  }
  calendar?: { events?: Array<{ entryDate: string; kind?: string; title?: string }> }
}

export function DayDetailCard({
  date,
  engineState,
}: {
  date: string | null
  engineState: DayDetailEngineState | undefined
}) {
  const moods = useMemo(() => {
    if (!date) return []
    return (engineState?.moodPins?.pins ?? []).filter((p) => p.entryDate === date)
  }, [date, engineState])

  const captures = useMemo(() => {
    if (!date) return []
    return (engineState?.captures?.entries ?? []).filter((c) => c.entryDate === date)
  }, [date, engineState])

  const events = useMemo(() => {
    if (!date) return []
    return (engineState?.calendar?.events ?? []).filter((e) => e.entryDate === date)
  }, [date, engineState])

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
        <p className="text-sm text-(--color-sheet-ink-soft)">Nothing logged on this day.</p>
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
                      {cap.kind}
                    </p>
                    {cap.text ? <p className="mt-1 leading-relaxed">{cap.text}</p> : null}
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
                    {ev.title ?? ev.kind ?? 'Event'}
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
