import Debug from './Debug/Debug.js'
import State from './State/State.js'
import View from './View/View.js'
import OverlayController from './View/OverlayController.js'
import MoodPins from './State/MoodPins.js'
import Captures from './State/Captures.js'
import Profile from './State/Profile.js'
import Onboarding from './State/Onboarding.js'
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
        this._running = false
        this._rafId = null
        this._onResize = () => this.resize()

        this.debug = new Debug()
        this.state = new State({ persistence: opts.persistence })
        this.view = new View()

        // Hand Bruno's Grass material a fake terrain texture sourced from our
        // static island heightmap, so it can sample heights + normals without
        // going through his Chunks/Terrain pipeline.
        this.view.grass.bindTerrain(this.view.island.terrainTexture, this.view.island.chunkSize)

        window.addEventListener('resize', this._onResize)

        this._running = true
        this.update()
    }

    update()
    {
        if(!this._running) return
        this.state.update()
        this.view.update()
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
        // Onboarding) — without these, the second createGame() after a
        // dispose would return the *old* slices from the static field,
        // leaving stale subscribers attached to a torn-down view.
        State.instance = null
        Debug.instance = null
        OverlayController.instance = null
        MoodPins.instance = null
        Captures.instance = null
        Profile.instance = null
        Onboarding.instance = null
        Game.instance = null
    }
}
