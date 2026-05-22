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
      ])) as unknown as [
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
      if (!HourHud || !StatusPreviewHud || !ZoomHud || !FpsOverlay) return

      const hour = new HourHud()
      const status = new StatusPreviewHud()
      const zoom = new ZoomHud()
      // FpsOverlay is dev-only and historically mounted inside HourHud's root.
      const fps = new FpsOverlay({
        mount: (hour as unknown as { root?: HTMLElement }).root,
      })
      widgets = [hour, status, zoom, fps]
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
