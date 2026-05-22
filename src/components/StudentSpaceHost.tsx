import { useEffect } from 'react'
import { useEngine } from '~/lib/student-space/use-engine'
import { IslandProgressionOverlay } from './IslandProgressionOverlay'

/**
 * World-route React composition. Mounts only when the home (`/`) route is
 * active — for routed sheet pages (Phase B), the routes own their own
 * content; for non-routed overlays (Phase C/E/F/G), this is where capture
 * sheets, HUDs, in-world labels, pickers, and the onboarding flow live.
 *
 * Engine boot, canvas DOM, backend bridge, and route-sync moved to
 * `<EngineHost>` in U2. This component reads the live engine through
 * `useEngine()` and stays a small composition surface.
 *
 * U13: the four engine HUDs (HourHud, StatusPreviewHud, ZoomHud, FpsOverlay)
 * are now constructed inside this React component via useEffect. Their DOM
 * + CSS still live in `src/engine/student-space/Game/View/*Hud.js`; only the
 * lifecycle owner changed. A full per-HUD React rewrite (Tailwind chrome +
 * useEngineSliceVersion) is follow-up work that can layer on this lifecycle.
 */
export function StudentSpaceHost() {
  const game = useEngine()

  useEffect(() => {
    if (!game) return
    type WidgetCtor = new (opts?: { mount?: HTMLElement }) => { dispose?: () => void }
    let widgets: Array<{ dispose?: () => void }> = []
    let cancelled = false
    void (async () => {
      const modules = (await Promise.all([
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/HourHud.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/StatusPreviewHud.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/ZoomHud.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/FpsOverlay.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/BirdPicker.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/TrackPicker.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/CaptureFab.js'),
      ])) as unknown as [
        { default?: WidgetCtor },
        { default?: WidgetCtor },
        { default?: WidgetCtor },
        { default?: WidgetCtor },
        { default?: WidgetCtor },
        { default?: WidgetCtor },
        { default?: WidgetCtor },
      ]
      if (cancelled) return
      const HourHud = modules[0].default
      const StatusPreviewHud = modules[1].default
      const ZoomHud = modules[2].default
      const FpsOverlay = modules[3].default
      const BirdPicker = modules[4].default
      const TrackPicker = modules[5].default
      const CaptureFab = modules[6].default
      if (
        !HourHud ||
        !StatusPreviewHud ||
        !ZoomHud ||
        !FpsOverlay ||
        !BirdPicker ||
        !TrackPicker ||
        !CaptureFab
      )
        return

      const hour = new HourHud()
      const status = new StatusPreviewHud()
      const zoom = new ZoomHud()
      // FpsOverlay is dev-only and historically mounted inside HourHud's root.
      const fps = new FpsOverlay({
        mount: (hour as unknown as { root?: HTMLElement }).root,
      })
      // U15: bird + track pickers are constructed after Kira / Sound exist;
      // by this point EngineHost has booted the engine so those deps are live.
      const bird = new BirdPicker()
      const track = new TrackPicker()
      // U10: CaptureFab owns its CaptureChooser internally; once constructed
      // we wire it to the engine's KiraNarrator so the capture-from-narrator
      // path keeps working.
      const fab = new CaptureFab() as { setKiraNarrator?: (n: unknown) => void; dispose?: () => void }
      const narrator = (game as unknown as { view?: { kiraNarrator?: unknown } } | null)?.view
        ?.kiraNarrator
      if (narrator) fab.setKiraNarrator?.(narrator)
      widgets = [hour, status, zoom, fps, bird, track, fab]
    })()

    return () => {
      cancelled = true
      for (const widget of widgets) {
        try {
          widget.dispose?.()
        } catch {
          // Engine widget dispose swallows errors; preserve that posture.
        }
      }
    }
  }, [game])

  if (!game) return null
  return <IslandProgressionOverlay game={game} />
}
