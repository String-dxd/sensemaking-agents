import Debug from './Debug/Debug.js'
import State from './State/State.js'
import View from './View/View.js'
import OverlayController from './View/OverlayController.js'
import OnboardingFlow from './View/Onboarding/OnboardingFlow.js'
import MoodPins from './State/MoodPins.js'
import Captures from './State/Captures.js'
import Profile from './State/Profile.js'
import Onboarding from './State/Onboarding.js'
import CalendarEvents from './State/CalendarEvents.js'
import TeacherLetters from './State/TeacherLetters.js'
import Sprouts from './State/Sprouts.js'
import Relationships from './State/Relationships.js'
import Choices from './State/Choices.js'
import IdentityStatusOverride from './State/IdentityStatusOverride.js'
import IslandSnapshotBridge from './State/IslandSnapshotBridge.js'
import Auth from './State/Auth.js'
import { HOST_BODY_CLASSES } from './index.js'

/**
 * Engine composition root. Owns the rAF loop, the resize listener, and
 * the wire-up between Bruno's Grass material and our static heightmap.
 *
 * Construction is host-pluggable through the `opts` argument so a
 * React / TanStack Start host can:
 *   - pass `persistence: { storage }` to swap localStorage for a
 *     backend-backed adapter (idb, fetch, server-tied store, …)
 *   - call `dispose()` on unmount to revoke the rAF loop, remove the
 *     window listener, drain pending persistence writes, and clear
 *     every singleton so a subsequent `new Game(...)` starts clean.
 *
 * Singletons (`Game.instance`, `State.instance`, `View.instance`,
 * `Debug.instance`, `Persistence.instance`, `OverlayController.instance`)
 * are preserved for now — the engine assumes one game per page.
 * `dispose()` clears them so HMR / React StrictMode double-mount works
 * without returning a stale handle from the next constructor call.
 *
 * @typedef {object} GameOptions
 * @property {{ storage?: import('./State/Persistence.js').StorageAdapter }} [persistence]
 * @property {import('../../../lib/student-space/backend-bridge.ts').StudentSpaceBackendBridge} [backend]
 * @property {{ status: 'signed-out' } | { status: 'signed-in', label: string, detail: string | null, kind: 'workos' | 'demo' | 'dev-bypass' } | null} [authMenu]
 */
export default class Game
{
    static instance

    static getInstance()
    {
        return Game.instance
    }

    /** @param {GameOptions} [opts] */
    constructor(opts = {})
    {
        if(Game.instance)
            return Game.instance

        Game.instance = this

        this.seed = 'ss-v1'
        this._opts = opts
        this.backend = opts.backend || null
        this._running = false
        this._rafId = null
        this._onResize = () => this.resize()
        // Background-tab tracker. When `document.hidden` flips true we tear
        // down the rAF loop AND suspend the AudioContext so a tabbed-away
        // island stops burning GPU/CPU and stops playing music into a tab
        // the user can't hear. On visible we re-prime both.
        this._hidden = typeof document !== 'undefined' && document.hidden === true
        this._onVisibilityChange = () => this._handleVisibilityChange()
        // Host-injected navigation callback. In-engine click sources call
        // `game.navigate(href)` and the host wires it to its router so the
        // URL is the source of truth for which overlay is open.
        this._onNavigate = typeof opts.onNavigate === 'function' ? opts.onNavigate : null
        // Render-loop gate. Mirrors `_hidden`: when the host sets this to
        // false (because the URL is not `/`), `update()` short-circuits and
        // the rAF schedule is cancelled. The visibilitychange path remains
        // orthogonal — both can suspend independently.
        this._renderActive = true

        // If View construction throws (asset loader misconfig, WebGL context
        // refused, etc.) the Game.instance handle is already set above. Clear
        // it so the host's error boundary can call createGame() again after
        // fixing the host environment instead of hitting the
        // "one Game instance per page" guard on every retry.
        try
        {
            this.debug = new Debug()
            this.state = new State({
                persistence: opts.persistence,
                backend: this.backend,
                authMenu: opts.authMenu ?? null,
            })
            this.view = new View()
        }
        catch(err)
        {
            Game.instance = null
            throw err
        }

        // Hand Bruno's Grass material a fake terrain texture sourced from our
        // static island heightmap, so it can sample heights + normals without
        // going through his Chunks/Terrain pipeline.
        this.view.grass.bindTerrain(this.view.island.terrainTexture, this.view.island.chunkSize)

        window.addEventListener('resize', this._onResize)
        if(typeof document !== 'undefined')
            document.addEventListener('visibilitychange', this._onVisibilityChange)

        this._running = true
        // Boot snapshot — fire-and-forget. Throttled inside the bridge so
        // rapid reloads don't spam the server. Server-side WorkOS gating
        // means demo / dev-bypass sessions silently 403, which the bridge
        // swallows.
        try { this.state?.islandSnapshots?.captureNow?.('boot') } catch(_) {}
        // If the engine mounts while the tab is already backgrounded, skip
        // the first rAF — the visibilitychange listener will resume the loop
        // when the user comes back. Without this, hidden-tab mounts would
        // still chew GPU on the first few frames.
        if(!this._hidden) this.update()
    }

    _handleVisibilityChange()
    {
        const hidden = typeof document !== 'undefined' && document.hidden === true
        if(hidden === this._hidden) return
        this._hidden = hidden
        if(hidden)
        {
            // Suspend the rAF loop. The flag below tells update() not to
            // schedule a follow-up frame; the in-flight rAF (if any) drops
            // its body on next entry. AudioContext suspend stops the music
            // graph from running into a tab the user isn't listening to.
            if(this._rafId != null) { cancelAnimationFrame(this._rafId); this._rafId = null }
            try { this.view?.sound?.ctx?.suspend?.() } catch(_) {}
        }
        else if(this._running)
        {
            // Re-prime audio + restart the rAF loop. Resume returns a
            // promise; we don't need to await it (next frame's update will
            // tick the music scheduler off ctx.currentTime regardless).
            try { this.view?.sound?.ctx?.resume?.() } catch(_) {}
            this.update()
        }
    }

    update()
    {
        if(!this._running) return
        // The visibilitychange handler nulls _rafId when the tab is hidden;
        // bail here too so a late-firing rAF from before the suspension
        // doesn't sneak through and tick state/view once more.
        if(this._hidden) return
        // Route-driven render gate. When the host navigates away from `/`
        // the engine pauses so the Three.js scene doesn't keep ticking
        // behind a sheet. Same shape as the hidden-tab path above.
        if(!this._renderActive) return
        // Frame-error isolation: a throw inside state.update() / view.update()
        // would otherwise propagate to the rAF callback and prevent the next
        // requestAnimationFrame schedule below — freezing the world for the
        // user. Drop the frame, log once, and keep the loop alive so the
        // island remains interactive (sheets, navigation, sign-out, etc.).
        try { this.state.update() }
        catch(err) { console.error('[engine] frame error (state)', err) }
        try { this.view.update() }
        catch(err) { console.error('[engine] frame error (view)', err) }
        // Re-check `_running` before scheduling the next frame: a state or
        // view tick can synchronously trigger dispose (e.g. a subscriber
        // calling teardown). Without this guard the cancelAnimationFrame
        // in dispose() would have cleared the stale id, but the assignment
        // below would re-populate it — leaking one frame per dispose.
        if(this._running)
            this._rafId = window.requestAnimationFrame(() => this.update())
    }

    resize()
    {
        this.state.resize()
        this.view.resize()
    }

    openSurface(input = {})
    {
        const surface = input.surface
        if(!surface || !this.view?.overlayController) return
        // Reflections and Calendar both legacy-route into the History sheet's
        // Timeline tab (event-stream view). The Calendar grid is the v1
        // primary affordance for that data; we keep its open path alive but
        // tunnel through History so the IA stays unified.
        if(surface === 'reflections' || surface === 'calendar')
        {
            this.view.overlayController.open('history', { ...input, tab: 'timeline' })
            return
        }
        if(surface === 'trajectory')
        {
            this.view.overlayController.open('trajectory', input)
            return
        }
        if(surface === 'letters')
        {
            this.view.overlayController.open('letters', input)
            return
        }
        if(surface === 'profile')
        {
            this.view.overlayController.open('profile', input)
            return
        }
        if(surface === 'growth')
        {
            this.view.overlayController.open('history', { ...input, tab: 'growth' })
            return
        }
        if(surface === 'history')
        {
            // Honor the caller's tab when provided (e.g. `/history/timeline`
            // routes pass `tab: 'timeline'`). Default to timeline when no tab
            // is supplied — matches HistorySheet.open() default.
            const tab = input.tab === 'growth' ? 'growth' : 'timeline'
            this.view.overlayController.open('history', { ...input, tab })
            return
        }
        if(['values', 'interests', 'personality', 'skills', 'relationships', 'choices'].includes(surface))
        {
            this.view.overlayController.open('profile', { ...input, tab: surface })
        }
    }

    /**
     * Close whichever full-viewport sheet is currently active. No-op when
     * no overlay is open. Used by the router to "go back to the world"
     * when the URL transitions to `/`.
     */
    closeActiveSurface()
    {
        const controller = this.view?.overlayController
        if(!controller?.active) return
        controller.close(controller.active)
    }

    /**
     * Ask the host to navigate to a canonical pathname. In-engine click
     * sources (SideRail, Escape-to-close, sign-in flows) call this instead
     * of touching OverlayController directly so the URL stays the single
     * source of truth for which overlay is open.
     *
     * Falls back to direct controller action when no host router is wired:
     * `/` closes the active surface (matches the router-driven close path).
     * Other paths no-op — SideRail has its own open-fallback for the
     * harness case.
     */
    navigate(href)
    {
        if(this._onNavigate)
        {
            this._onNavigate(href)
            return
        }
        if(href === '/') this.closeActiveSurface()
    }

    /**
     * Gate the rAF render loop. Pass `false` to suspend (host sets this
     * when the route is non-`/`); pass `true` to resume. Mirrors the
     * `_handleVisibilityChange` pattern — cancel any pending rAF on
     * flip-false; schedule one on flip-true.
     */
    setRenderActive(active)
    {
        const next = !!active
        if(this._renderActive === next) return
        this._renderActive = next
        if(!next)
        {
            if(this._rafId != null) { cancelAnimationFrame(this._rafId); this._rafId = null }
            return
        }
        // Resume only if the engine isn't otherwise suspended (running and
        // not hidden). update() guards both internally, but starting the
        // schedule manually here is the simpler invariant — same shape as
        // the visibility-resume branch.
        if(this._running && !this._hidden) this.update()
    }

    /**
     * Tear down the engine. Revokes the rAF loop, removes the resize
     * listener, drains persistence, disposes the WebGL renderer + every
     * state/view subsystem that owns disposable GPU/audio resources, strips
     * the engine-owned body classes, and clears every engine singleton so
     * the next `new Game(...)` builds fresh handles.
     *
     * Safe to call multiple times — subsequent calls no-op.
     */
    dispose()
    {
        if(!Game.instance) return
        this._running = false
        if(this._rafId != null) { cancelAnimationFrame(this._rafId); this._rafId = null }
        window.removeEventListener('resize', this._onResize)
        if(typeof document !== 'undefined')
            document.removeEventListener('visibilitychange', this._onVisibilityChange)

        try { this.state?.persistence?.dispose?.() } catch(_) {}
        try { this.view?.dispose?.() } catch(_) {}

        // Strip the engine-owned body classes so a re-mount doesn't inherit
        // chrome-suppressing state from a torn-down session.
        try
        {
            const body = typeof document !== 'undefined' ? document.body : null
            if(body) for(const cls of HOST_BODY_CLASSES) body.classList.remove(cls)
        }
        catch(_) {}

        // Clear every engine singleton. View.dispose() handles renderer +
        // its own subsystems; the singleton handles themselves live here
        // so layering stays clean (Game owns the singleton graph; View
        // owns the GPU graph).
        //
        // Includes the state-slice singletons (MoodPins/Captures/Profile/
        // Onboarding/CalendarEvents/TeacherLetters) and the view-level
        // OnboardingFlow — without these, the second createGame() after a
        // dispose would return the *old* slices from the static field,
        // leaving stale subscribers attached to a torn-down view.
        State.instance = null
        Debug.instance = null
        OverlayController.instance = null
        OnboardingFlow.instance = null
        MoodPins.instance = null
        Captures.instance = null
        Profile.instance = null
        Onboarding.instance = null
        CalendarEvents.instance = null
        TeacherLetters.instance = null
        Sprouts.instance = null
        Relationships.instance = null
        Choices.instance = null
        Auth.instance = null
        IdentityStatusOverride.instance = null
        try { this.state?.islandSnapshots?.dispose?.() } catch(_) {}
        IslandSnapshotBridge.instance = null
        Game.instance = null
    }
}
