import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PageSurface,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetTitle,
  usePageEscape,
} from '~/components/ui/sheet'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'
import { cn } from '~/lib/utils'

/**
 * Read-only inbox of letters from a form teacher. U3 React rewrite of
 * `src/engine/student-space/Game/View/LettersSheet.js`.
 *
 * Subscribes to the engine's `TeacherLetters` slice (`engine.state.letters`)
 * via `useEngineSliceVersion`; mutations are still owned by the slice
 * (`letters.markRead(id)`) so persistence behavior is unchanged.
 *
 * Open semantics: this component mounts when the `/letters` route renders.
 * Mount-time effect adds `body.has-overlay` (the visibility hook engine CSS
 * still uses); unmount clears it. Escape and clicks on the sidebar nav route
 * back via TanStack Router — there is no × button (PR #32 / U3 behavior).
 */
interface TeacherLetter {
  id: string
  from: string
  subject: string
  body: string
  sentAt: string
  read: boolean
  prompt?: string
}

interface LettersSlice {
  letters: TeacherLetter[]
  markRead: (id: string) => unknown
  subscribe: (cb: () => void) => () => void
}

export function LettersSheet() {
  const engine = useEngine()
  const navigate = useNavigate()

  // TeacherLetters is engine-internal — not part of the typed Game contract
  // (see src/engine/student-space/Game/index.d.ts comment). Cast to access it.
  const letters = ((engine?.state as unknown as { letters?: LettersSlice } | undefined)?.letters ??
    null) as LettersSlice | null
  useEngineSliceVersion(letters)

  // body.has-overlay drives the engine CSS that hides the world canvas and
  // other engine surfaces while a sheet is up. While the engine still owns
  // SideRail/HUDs, we set it from React so routed pages match the legacy
  // posture. Removed when the route unmounts.
  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const sorted = useMemo(() => {
    const list = letters?.letters ?? []
    return [...list].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))
  }, [letters])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Auto-select newest unread (or newest letter) on first paint and whenever
  // the current selection disappears from the list (e.g. backend hydration
  // pruning).
  useEffect(() => {
    if (sorted.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (selectedId && sorted.some((l) => l.id === selectedId)) return
    const first = sorted.find((l) => !l.read) ?? sorted[0]
    if (first) setSelectedId(first.id)
  }, [sorted, selectedId])

  const selected = useMemo(
    () => (selectedId ? (sorted.find((l) => l.id === selectedId) ?? null) : null),
    [sorted, selectedId],
  )

  const handleSelect = (id: string) => {
    setSelectedId(id)
    letters?.markRead(id)
  }

  const handleCapture = (prompt: string) => {
    // Open the React Ask flow through the compatibility OverlayController so
    // legacy in-world callers and routed React sheets share one handoff.
    type OverlayControllerLike = { open: (name: string, opts: unknown) => void }
    const overlay = (
      engine as unknown as { view?: { overlayController?: OverlayControllerLike } } | null
    )?.view?.overlayController
    overlay?.open('ask', { prompt, dismissOnBack: true, letterId: selectedId })
  }

  const dismissToHome = useCallback(() => navigate({ to: '/' }), [navigate])
  usePageEscape(dismissToHome)

  return (
    <PageSurface>
      <SheetSidebar>
        <SheetIdentityHeader>
          <SheetTitle>Letters</SheetTitle>
          <SheetDescription>
            Notes from your form teacher when they notice something worth saying.
          </SheetDescription>
        </SheetIdentityHeader>
        <div className="px-4 pb-6">
          {sorted.length === 0 ? (
            <p className="text-sm text-(--color-sheet-ink-soft)">
              No letters yet. Your teacher will write when they notice something.
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Letters">
              {sorted.map((letter) => (
                <LetterRow
                  key={letter.id}
                  letter={letter}
                  selected={letter.id === selectedId}
                  onSelect={handleSelect}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetSidebar>
      <SheetContent>
        {selected ? (
          <>
            <SheetPageHeader>
              <p className="text-sm text-(--color-sheet-ink-soft)">
                {selected.from} · <time>{formatSent(selected.sentAt)}</time>
              </p>
              <SheetTitle>{selected.subject}</SheetTitle>
            </SheetPageHeader>
            <SheetBody>
              <LetterBodyContent letter={selected} />
              {selected.prompt ? (
                <div className="mt-8 rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-5">
                  <p className="text-sm text-(--color-sheet-ink)">{selected.prompt}</p>
                  <button
                    type="button"
                    onClick={() => handleCapture(selected.prompt ?? '')}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-(--color-facet-personality-soft) px-4 py-2 text-sm font-semibold text-(--color-facet-personality-ink) transition-transform active:scale-[0.96]"
                  >
                    <CaptureIcon />
                    Capture
                  </button>
                </div>
              ) : null}
            </SheetBody>
          </>
        ) : (
          <SheetBody>
            <p className="text-sm text-(--color-sheet-ink-soft)">Tap a letter to read it.</p>
          </SheetBody>
        )}
      </SheetContent>
    </PageSurface>
  )
}

function LetterRow({
  letter,
  selected,
  onSelect,
}: {
  letter: TeacherLetter
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(letter.id)}
        data-selected={selected || undefined}
        data-unread={!letter.read || undefined}
        className={cn(
          'group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors',
          'hover:bg-[rgba(43,38,32,0.045)] data-[selected]:bg-(--color-sheet-tab-active)',
          'active:scale-[0.98] transition-transform',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-1.5 size-2 shrink-0 rounded-full bg-(--color-facet-personality-accent)',
            letter.read && 'opacity-0',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-(--color-sheet-ink)">
              {letter.from}
            </span>
            <span className="shrink-0 text-xs text-(--color-sheet-ink-soft)">
              {formatSent(letter.sentAt)}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-sm text-(--color-sheet-ink-soft)">
            {letter.subject}
          </span>
        </span>
      </button>
    </li>
  )
}

function LetterBodyContent({ letter }: { letter: TeacherLetter }) {
  const paragraphs = useMemo(() => (letter.body || '').split('\n\n'), [letter.body])
  return (
    <div className="prose max-w-prose text-(--color-sheet-ink)">
      {paragraphs.map((paragraph, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are derived from a static body string
        <p key={i} className="mb-4 leading-relaxed last:mb-0">
          {paragraph.split('\n').map((line, j, arr) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: line position is stable within a static paragraph
            <span key={j}>
              {line}
              {j < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}

function CaptureIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <title>Capture</title>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function formatSent(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
