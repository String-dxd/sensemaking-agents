import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetSurface,
  SheetTitle,
} from '~/components/ui/sheet'
import { useEngine } from '~/lib/student-space/use-engine'

/**
 * Settings — bottom-of-rail catch-all. U4 React rewrite of
 * `src/engine/student-space/Game/View/SettingsSheet.js` (which had no live
 * View.js consumer pre-migration; this commit makes Settings a real routed
 * page reachable via `/settings`).
 *
 * The four admin pickers it hosts (HourHud, TrackPicker, BirdPicker,
 * StatusPreviewHud) are still engine-rendered until U13/U15 migrate them
 * to React. We mount each into a placeholder div via a useEffect that
 * imports the engine widget dynamically — same pattern the engine sheet
 * used (`new Widget({ mount: slotEl })`), transcribed to React.
 *
 * Restart Onboarding wipes `state.onboarding`, flushes persistence, and
 * reloads with `#onboarding` so the bootstrapping picks up the cleared slice.
 */
type EngineWidget = { dispose?: () => void; update?: () => void }
type EngineWidgetCtor = new (opts: { mount: HTMLElement }) => EngineWidget

export function SettingsSheet() {
  const engine = useEngine()
  const navigate = useNavigate()

  // body.has-overlay so engine CSS hides the world canvas behind the sheet.
  useEffect(() => {
    document.body.classList.add('has-overlay')
    return () => document.body.classList.remove('has-overlay')
  }, [])

  const hourRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const birdRef = useRef<HTMLDivElement | null>(null)
  const statusRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let widgets: EngineWidget[] = []
    let cancelled = false
    void (async () => {
      // Engine modules are intentionally untyped (vanilla JS substrate); cast
      // each dynamic import to the EngineWidget constructor shape.
      type EngineModule = { default?: EngineWidgetCtor }
      const modules = (await Promise.all([
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/HourHud.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/TrackPicker.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/BirdPicker.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/StatusPreviewHud.js'),
      ])) as unknown as [EngineModule, EngineModule, EngineModule, EngineModule]
      if (cancelled) return
      const mounts: Array<[EngineWidgetCtor | undefined, HTMLElement | null]> = [
        [modules[0].default, hourRef.current],
        [modules[1].default, trackRef.current],
        [modules[2].default, birdRef.current],
        [modules[3].default, statusRef.current],
      ]
      widgets = mounts
        .filter(
          (entry): entry is [EngineWidgetCtor, HTMLElement] =>
            entry[0] !== undefined && entry[1] !== null,
        )
        .map(([Ctor, mount]) => new Ctor({ mount }))
    })()

    return () => {
      cancelled = true
      for (const widget of widgets) {
        try {
          widget.dispose?.()
        } catch {
          // Engine widget disposal swallows errors in the original
          // SettingsSheet; preserve that posture here.
        }
      }
    }
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
      window.location.hash = '#onboarding'
      window.location.reload()
    }
  }

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(next) => {
        if (next === false) navigate({ to: '/' })
      }}
    >
      <SheetSurface>
        <SheetSidebar>
          <SheetIdentityHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Tools for adjusting how the world behaves.</SheetDescription>
          </SheetIdentityHeader>
          <div className="px-7 pb-6">
            <p className="text-[13.5px] leading-[1.55] text-(--color-sheet-ink-soft)">
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
              <div
                ref={hourRef}
                data-testid="settings-mount-hour"
                className="flex flex-wrap gap-3"
              />
            </SettingsGroup>
            <SettingsGroup
              title="Music"
              help="Cycle through ambient tracks. Right-click the chip to step back."
            >
              <div
                ref={trackRef}
                data-testid="settings-mount-track"
                className="flex flex-wrap gap-3"
              />
            </SettingsGroup>
            <SettingsGroup title="Companion" help="Try a different bird companion.">
              <div
                ref={birdRef}
                data-testid="settings-mount-bird"
                className="flex flex-wrap gap-3"
              />
            </SettingsGroup>
            <SettingsGroup
              title="Path Finder preview"
              help="Force the identity-status quadrant the Path Finder uses to skin itself."
            >
              <div
                ref={statusRef}
                data-testid="settings-mount-status"
                className="flex flex-wrap gap-3"
              />
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
      </SheetSurface>
    </Sheet>
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
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-(--color-sheet-ink-soft)">
        {title}
      </h2>
      <p className="mb-3 text-sm leading-[1.5] text-(--color-sheet-ink-soft)">{help}</p>
      {children}
    </section>
  )
}
