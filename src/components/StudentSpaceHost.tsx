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
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/KiraDialogue.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/KiraNarrator.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/ObjectPeek.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/HoverCta.js'),
        // @ts-expect-error untyped engine module
        import('~/engine/student-space/Game/View/HoverProbe.js'),
      ])) as unknown as Array<{ default?: WidgetCtor }>
      if (cancelled) return
      const HourHud = modules[0]?.default
      const StatusPreviewHud = modules[1]?.default
      const ZoomHud = modules[2]?.default
      const FpsOverlay = modules[3]?.default
      const BirdPicker = modules[4]?.default
      const TrackPicker = modules[5]?.default
      const CaptureFab = modules[6]?.default
      const KiraDialogue = modules[7]?.default
      const KiraNarrator = modules[8]?.default
      const ObjectPeek = modules[9]?.default
      const HoverCta = modules[10]?.default
      const HoverProbe = modules[11]?.default
      if (
        !HourHud ||
        !StatusPreviewHud ||
        !ZoomHud ||
        !FpsOverlay ||
        !BirdPicker ||
        !TrackPicker ||
        !CaptureFab ||
        !KiraDialogue ||
        !KiraNarrator ||
        !ObjectPeek ||
        !HoverCta ||
        !HoverProbe
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
      // U12: KiraDialogue + KiraNarrator must be constructed before
      // CaptureFab (which reads view.kiraNarrator in setKiraNarrator) and
      // re-attached to the view so engine code (HoverProbe, KiraNarrator
      // internals) still finds them at view.kiraNarrator / view.kiraDialogue.
      const dialogue = new KiraDialogue()
      const narrator = new KiraNarrator()
      // U14: ObjectPeek + HoverCta + HoverProbe must be constructed before
      // HoverProbe references them via view.* refs in its update loop.
      // Construct in dependency order and attach to view.
      const peek = new ObjectPeek()
      const cta = new HoverCta()
      const view = (game as unknown as { view?: Record<string, unknown> } | null)?.view
      if (view) {
        view.kiraDialogue = dialogue
        view.kiraNarrator = narrator
        view.objectPeek = peek
        view.hoverCta = cta
      }
      // HoverProbe reads view.objectPeek / view.hoverCta on construction (or
      // shortly after); attach to view BEFORE its update tick fires.
      const probe = new HoverProbe()
      if (view) view.hoverProbe = probe
      // U10: CaptureFab owns its CaptureChooser internally; once constructed
      // we wire it to the engine's KiraNarrator so the capture-from-narrator
      // path keeps working.
      const fab = new CaptureFab() as { setKiraNarrator?: (n: unknown) => void; dispose?: () => void }
      fab.setKiraNarrator?.(narrator)
      widgets = [hour, status, zoom, fps, bird, track, dialogue, narrator, peek, cta, probe, fab]
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
