import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import {
  BirdPicker,
  EnvironmentHud,
  type GameLike,
  StatusPreviewHud,
  TrackPicker,
} from '~/components/student-space/hud/StudentSpaceHud'
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

/**
 * Settings — bottom-of-rail catch-all. U4 React rewrite of
 * `src/engine/student-space/Game/View/SettingsSheet.js` (which had no live
 * View.js consumer pre-migration; this commit makes Settings a real routed
 * page reachable via `/settings`).
 *
 * Restart Onboarding wipes `state.onboarding`, flushes persistence, and
 * reloads at `/onboarding` so the bootstrapping picks up the cleared slice.
 */
export function SettingsSheet() {
  const engine = useEngine()
  const navigate = useNavigate()
  const typedEngine = engine as GameLike | null

  // body.has-overlay so engine CSS hides the world canvas behind the sheet.
  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const handleRestart = () => {
    try {
      const state = (
        engine as unknown as {
          state?: { onboarding?: { reset?: () => void }; persistence?: { flush?: () => void } }
        } | null
      )?.state
      state?.onboarding?.reset?.()
      state?.persistence?.flush?.()
    } catch {
      // best-effort wipe; reload still picks up the hash
    }
    if (typeof window !== 'undefined') {
      window.location.assign('/onboarding')
    }
  }

  const dismissToHome = useCallback(() => navigate({ to: '/' }), [navigate])
  usePageEscape(dismissToHome)

  return (
    <PageSurface>
      <SheetSidebar>
        <SheetIdentityHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Tools for adjusting how the world behaves.</SheetDescription>
        </SheetIdentityHeader>
        <div className="px-7 pb-6">
          <p className="text-base leading-relaxed text-(--color-sheet-ink-soft)">
            Adjust how the world behaves and replay the first-run ceremony. Changes apply
            immediately and persist across sessions.
          </p>
        </div>
      </SheetSidebar>
      <SheetContent>
        <SheetPageHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetPageHeader>
        <SheetBody>
          <SettingsGroup
            title="World & weather"
            help="Scrub the time of day and force weather effects."
          >
            <div data-testid="settings-mount-hour" className="flex flex-wrap gap-3">
              {typedEngine ? <EnvironmentHud game={typedEngine} inline /> : null}
            </div>
          </SettingsGroup>
          <SettingsGroup
            title="Music"
            help="Cycle through ambient tracks. Right-click the chip to step back."
          >
            <div data-testid="settings-mount-track" className="flex flex-wrap gap-3">
              {typedEngine ? <TrackPicker game={typedEngine} inline /> : null}
            </div>
          </SettingsGroup>
          <SettingsGroup title="Companion" help="Try a different bird companion.">
            <div data-testid="settings-mount-bird" className="flex flex-wrap gap-3">
              {typedEngine ? <BirdPicker game={typedEngine} inline /> : null}
            </div>
          </SettingsGroup>
          <SettingsGroup
            title="Path Finder preview"
            help="Force the identity-status quadrant the Path Finder uses to skin itself."
          >
            <div data-testid="settings-mount-status" className="flex flex-wrap gap-3">
              {typedEngine ? <StatusPreviewHud game={typedEngine} inline /> : null}
            </div>
          </SettingsGroup>
          <SettingsGroup
            title="Onboarding"
            help="Replay the first-run ceremony from the beginning."
          >
            <button
              type="button"
              onClick={handleRestart}
              data-testid="settings-restart-onboarding"
              className="inline-flex items-center rounded-[10px] border border-(--color-frame-border) bg-white px-4 py-2.5 text-sm font-medium text-(--color-sheet-ink) transition-colors hover:bg-(--color-onb-bg-cream) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-onb-accent)"
            >
              Restart onboarding
            </button>
          </SettingsGroup>
        </SheetBody>
      </SheetContent>
    </PageSurface>
  )
}

function SettingsGroup({
  title,
  help,
  children,
}: {
  title: string
  help: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-(--color-sheet-divider) py-6 last:border-b-0">
      <h2 className="mb-1.5 text-xs font-semibold text-(--color-sheet-ink-soft)">{title}</h2>
      <p className="mb-3 text-sm leading-[1.5] text-(--color-sheet-ink-soft)">{help}</p>
      {children}
    </section>
  )
}
