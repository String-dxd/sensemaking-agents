import * as THREE from 'three'

import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Noises from './Noises.js'
import Sky from './Sky.js'
import CssSky from './CssSky.js'
import Island from './Island.js'
import Grass from './Grass.js'
import Tree from './Tree.js'
import Flowers from './Flowers.js'
import Fruits from './Fruits.js'
import Sprouts from './Sprouts.js'
import Butterflies from './Butterflies.js'
import Fireflies from './Fireflies.js'
import Particles from './Particles.js'
import Kira from './Kira.js'
import Aurora from './Aurora.js'
import Rainbow from './Rainbow.js'
import Rain from './Rain.js'
import Sound from './Sound.js'
import Mailbox from './Mailbox.js'
import Telescope from './Telescope.js'
import OverlayController from './OverlayController.js'
import State from '../State/State.js'
// OnboardingFlow lifecycle moved to React (U16–U19) — see
// `src/components/student-space/EngineHost.tsx`. The ceremony surfaces
// (Greeting / EggHatcher / FirstChat / FirstMood / IslandReveal /
// EdupassLogin) now render from React components.

export default class View
{
    static instance

    static getInstance()
    {
        return View.instance
    }

    constructor()
    {
        if(View.instance)
            return View.instance

        View.instance = this

        this.state = State.getInstance()
        this.scene = new THREE.Scene()

        // Order matters: Camera before Renderer (Renderer reads it), Renderer
        // before Noises (Noises renders to a target via the renderer instance),
        // Sky before Island/Grass (uses cloned camera and renderer).
        this.camera   = new Camera()
        this.renderer = new Renderer()
        this.camera.bindControls(this.renderer.instance.domElement)
        this.noises   = new Noises()
        this.sky      = new Sky()
        this.cssSky   = new CssSky()
        this.island   = new Island()
        this.grass    = new Grass()
        this.tree        = new Tree()
        this.flowers     = new Flowers()
        this.fruits      = new Fruits()
        this.sprouts     = new Sprouts()
        this.butterflies = new Butterflies()
        this.fireflies   = new Fireflies()
        this.particles   = new Particles()
        this.kira        = new Kira()
        // Restore the chosen companion species on every boot — Kira's
        // constructor defaults to 'flame', so without this a returning
        // user (or a mid-ceremony resume at egg-hatch / first-chat /
        // later) would see the wrong plumage until the next picker tap.
        const persistedSpecies = this.state.profile?.identity?.companionSpecies
        if(persistedSpecies) this.kira.setSpecies(persistedSpecies)
        // Mailbox is a small static prop that sits on the plateau and acts
        // as the on-island door into LettersSheet. Constructed after Kira
        // so the two interactables share a built-time origin frame.
        this.mailbox     = new Mailbox()
        // Telescope sits on the NE rim of the plateau — the on-island door
        // into the TrajectorySheet (Path Finder). Same handoff pattern as
        // mailbox: HoverProbe picks it, KiraNarrator narrates the click,
        // and the CTA opens 'trajectory'.
        this.telescope   = new Telescope()
        this.aurora      = new Aurora()
        this.rainbow     = new Rainbow()
        this.rain        = new Rain()
        // HourHud, StatusPreviewHud, ZoomHud, FpsOverlay moved to React-owned
        // lifecycle in U13 — see `src/components/StudentSpaceHost.tsx`.
        this.sound       = new Sound()
        // OverlayController stays as the compatibility bridge for legacy
        // in-world callers. React capture surfaces register proxy handlers in
        // StudentSpaceHost so old `open('ask'|'mood')` calls still work.
        this.overlayController = new OverlayController()
        // CaptureFab + CaptureChooser + AskSheet + MoodSheet moved to React
        // (U8–U10) — see `src/components/StudentSpaceHost.tsx`.
        // FacetView migrated to React (FacetSheetCard + FacetSheetController in
        // WorldInteractions.tsx). React assigns view.facetView there.
        // ProfileSheet migrated to React route at /profile (U7).
        // No engine registration needed — the route owns rendering.
        // ObjectPeek + HoverCta + HoverProbe lifecycle moved to React
        // (U14). React assigns view.objectPeek, view.hoverCta, view.hoverProbe
        // so engine code (HoverProbe internals, KiraNarrator) still finds them.
        // Vertical icon rail lifecycle moved to React (U20) — see
        // `src/components/student-space/EngineHost.tsx` (rail is mounted at
        // engine-host scope so it's visible across every route, matching
        // legacy posture).
        // KiraDialogue + KiraNarrator lifecycle moved to React (U12) — see
        // `src/components/StudentSpaceHost.tsx`. The React owner assigns
        // `view.kiraDialogue` + `view.kiraNarrator` so engine code (HoverProbe,
        // KiraNarrator internals) keeps finding them at those refs.
        // BirdPicker + TrackPicker lifecycle moved to React (U15) — see
        // `src/components/StudentSpaceHost.tsx`.

        // First-run ceremony (Greeting → EggHatcher → FirstChat → FirstMood →
        // IslandReveal, plus the EdupassLogin side-branch) is mounted by
        // React (U16–U19). EngineHost owns the OnboardingFlow lifecycle and
        // calls the same `view.flowers/tree/fruits.hideAll()` reveal-prep
        // pass that this constructor previously ran. The flow construction
        // is intentionally NOT re-attached to `view.onboardingFlow` — React
        // disposes it directly on cleanup, so we avoid a double-dispose
        // through View.dispose()'s SUBSYSTEMS loop.
    }

    resize()
    {
        this.camera.resize()
        this.renderer.resize()
        this.sky.resize()
    }

    update()
    {
        this.sky.update()
        this.cssSky.update()
        this.island.update()
        this.grass.update()
        this.tree.update()
        this.flowers.update()
        this.fruits.update()
        this.sprouts.update()
        const tickAmbient = this.state.performance?.shouldTickAmbient?.() ?? true
        if(tickAmbient)
        {
            this.butterflies.update()
            this.fireflies.update()
            this.particles.update()
        }
        this.kira.update()
        this.mailbox.update()
        this.telescope.update()
        // Narrator after kira so its yaw-tween wins over any Kira-driven
        // rotation, then dialogue (which reads Kira's screen position).
        // Both widgets are React-owned (U12); they're attached to `this`
        // via the React useEffect so engine code (and this update loop)
        // still finds them.
        this.kiraNarrator?.update?.()
        this.kiraDialogue?.update?.()
        this.objectPeek?.update?.()
        if(tickAmbient)
            this.aurora.update()
        this.rainbow.update()
        this.rain.update()
        this.hoverProbe?.update?.()
        // HourHud / FpsOverlay per-frame ticks moved with the widgets to
        // React-owned lifecycle (U13). The React HUD wrappers in
        // StudentSpaceHost call .update() themselves.
        // SideRail per-frame .update() moved with the widget (U20).
        this.sound.update()
        this.camera.update()
        this.renderer.update()
    }

    /**
     * Tear down GPU/audio resources and clear the View singleton handle
     * so the next `new Game(...)` can construct a fresh view.
     *
     * Each subsystem that owns disposable resources (OrbitControls,
     * AudioContext, in-flight loader fetches, ceremony state) implements
     * its own `dispose()` and is called below. Subsystems without a
     * dispose() are intentional v1 holdovers — their DOM/listener leaks
     * are bounded per remount and documented in ENGINE.md "Known
     * portability constraints."
     *
     * Game.instance / State.instance / Debug.instance / etc. are nulled
     * by Game.dispose(), not here — View doesn't own the singleton graph.
     */
    dispose()
    {
        // First, give every subsystem a chance to clean up its own
        // listeners / timers / DOM. Defensive `?.` so a subsystem
        // can opt into the contract without forcing every other one
        // to grow a dispose() at the same time.
        //
        // Every chrome subsystem that registers a document- or window-level
        // listener, a state-store subscription, or a Three.js scene addition
        // now implements dispose(). React owns capture surfaces; CalendarSheet
        // cascades to DayDetailCard. The handful of subsystems still without
        // a dispose() either don't appendChild to body (their DOM is owned
        // by a parent surface) or are pure scene-graph nodes torn down by
        // Renderer.dispose() — both bounded per remount.
        const SUBSYSTEMS = [
            // onboardingFlow is owned by React (EngineHost) and disposed there.
            // facetView is owned by React (WorldInteractions.tsx) and disposed there.
            this.camera,
            this.sound,
            this.mailbox,
            this.telescope,
            this.sprouts,
        ]
        for(const sub of SUBSYSTEMS)
        {
            try { sub?.dispose?.() } catch(_) {}
        }

        // Renderer last — disposing it before its consumers can race
        // with a final draw if a subsystem dispose triggers an update.
        try { this.renderer?.instance?.dispose?.() } catch(_) {}
        try { this.renderer?.instance?.forceContextLoss?.() } catch(_) {}

        View.instance = null
    }
}
