/**
 * Public engine entry. Host code (TanStack Start, plain Vite, anything
 * with a DOM + WebGL2) imports from here:
 *
 *   import { createGame, memoryAdapter } from './sources/Game'
 *
 *   const game = createGame({
 *     container,                       // HTMLElement that will host the canvas
 *     persistence: { storage },        // optional; defaults to localStorage
 *     backend,                         // optional app-owned domain bridge
 *   })
 *
 *   game.dispose()                     // tear down on unmount
 *
 * The engine still assumes one game per page (singletons inside live
 * for the page's lifetime). `dispose()` is the escape hatch for clean
 * remount (React StrictMode, HMR, route changes). Calling createGame()
 * twice without an intermediate dispose() throws.
 *
 * Host contract (DOM the host must provide):
 *   - `container`        — element that will receive the WebGL canvas.
 *   - `document.body`    — engine writes a small set of state classes
 *                          to body (see HOST_BODY_CLASSES). These are
 *                          page-level by design (CSS uses them to gate
 *                          chrome visibility while overlays are open).
 *   - `#sky-haze`,
 *     `#sky-rays`        — optional CSS sky atmosphere divs. Engine
 *                          tolerates their absence; see CssSky.update.
 *
 * Asset paths (relative to base):
 *   - `trees/oakTreesVisual.glb`
 *   - `trees/cherryTreesVisual.glb`
 *   - `trees/foliageSDF.png`
 *   - DRACO decoder from https://www.gstatic.com/draco/v1/decoders/
 *
 * Backend ports:
 *   - persistence.storage    StorageAdapter — host-pluggable byte store.
 *                            Default: localStorageAdapter().
 *   - backend                Named app-domain operations (Mirror capture,
 *                            review, profile forget, trajectory). This is
 *                            intentionally separate from persistence storage.
 *   - (future) auth          per-request identity; wire into Profile.
 *   - (future) moodPinSync   server-side mood pin reconciliation.
 *   - (future) capturesSync  server-side captures sync.
 *
 * See ENGINE.md for the full host contract + roadmap.
 */

import Game from './Game.js'

export { default as Game } from './Game.js'
export {
    default as Persistence,
    localStorageAdapter,
    memoryAdapter,
} from './State/Persistence.js'

/**
 * The body classes the engine writes to `document.body`. Page-level
 * by design — the host should treat these as engine-owned: do not
 * overwrite `document.body.className` (use `classList.add/remove`
 * for any host-owned classes). The engine strips this set on
 * `game.dispose()`.
 */
export const HOST_BODY_CLASSES = Object.freeze([
    'is-onboarding',       // ceremony active; chrome suppressed
    'is-onb-landing',      // edupass landing; live island visible behind
    'is-night',            // night palette (genuinely page-level)
    'has-overlay',         // any full-screen sheet open
    'has-capture-sheet',   // capture-flow sheet open
    'has-chooser',         // capture-chooser open
])

/**
 * Factory — builds a Game instance bound to the host's container. The
 * canvas is automatically appended to the container after construction
 * so the host doesn't have to reach into engine internals.
 *
 * Throws if a Game is already mounted. The engine is one-instance-per-
 * page; the second mount must call `game.dispose()` first.
 *
 * `initialOverlay` opens a registered surface immediately after the game
 * boots — used by hosts to land users on a specific sheet after a redirect
 * (e.g. `/me` → `/?sheet=profile`). Only honored when onboarding has
 * finished; during onboarding the OverlayController is owned by the
 * ceremony and any host-supplied initial overlay would fight it.
 *
 * @param {{
 *   container?: HTMLElement,
 *   persistence?: { storage?: import('./State/Persistence.js').StorageAdapter },
 *   initialOverlay?: { name: string },
 *   backend?: import('../../../lib/student-space/backend-bridge.ts').StudentSpaceBackendBridge,
 *   authMenu?: { status: 'signed-out' } | { status: 'signed-in', label: string, detail: string | null, kind: 'workos' | 'demo' | 'dev-bypass' } | null,
 *   initialOverlay?: string,
 * }} [opts]
 * @returns {Game}
 */
export function createGame(opts = {})
{
    if(Game.instance)
    {
        throw new Error(
            '[engine] createGame: a Game instance is already mounted. ' +
            'Call game.dispose() before creating another. The engine ' +
            'is one-instance-per-page (see ENGINE.md).',
        )
    }

    // `hooks` is reserved for a future named-event surface but does
    // nothing today; warn loudly so hosts don't ship dead wiring.
    if(opts.hooks)
    {
        console.warn(
            '[engine] createGame opts.hooks is reserved and currently a ' +
            'no-op. Subscribe via game.state.onboarding.subscribe / ' +
            'game.state.moodPins.subscribe / etc. until the named-hook ' +
            'surface lands.',
        )
    }

    const game = new Game({
        persistence: opts.persistence,
        backend: opts.backend,
        authMenu: opts.authMenu ?? null,
    })

    // Deep-link surface open on mount. Hosts pass `initialOverlay: 'growth'`
    // (read from a `?sheet=growth` URL param) and the engine routes through
    // the existing OverlayController.open path — same effect as tapping the
    // chip, just driven from the URL. Unknown overlay names silently no-op
    // so a stale URL doesn't surface a console error to the student.
    if(opts.initialOverlay)
    {
        try
        {
            const overlayController = game.view?.overlayController
            if(overlayController?.surfaces?.has?.(opts.initialOverlay))
            {
                overlayController.open(opts.initialOverlay)
            }
        }
        catch(_) { /* defensive: never block boot on a deep-link failure */ }
    }

    // Mount the canvas. If the host passed a container, use it; otherwise
    // fall back to `.game` (the v1 default container in index.html) for
    // backward compat.
    const container = opts.container || document.querySelector('.game')
    if(container && game.view?.renderer?.instance?.domElement)
    {
        container.appendChild(game.view.renderer.instance.domElement)
    }
    else if(!container)
    {
        console.warn(
            '[engine] createGame: no container passed and no `.game` ' +
            'fallback found in DOM — canvas was constructed but is not ' +
            'mounted. The rAF loop is running into a detached canvas.',
        )
    }

    // Honor `initialOverlay` only when onboarding has finished — during
    // onboarding the ceremony owns the overlay surface. The open() call is
    // deferred a microtask so any synchronous boot-time overlay opens
    // settle first.
    const overlayName = opts.initialOverlay?.name
    if(overlayName)
    {
        const onb = game.state?.onboarding
        if(onb && onb.stage === 'done' && game.view?.overlayController)
        {
            queueMicrotask(() =>
            {
                try { game.view.overlayController.open(overlayName) }
                catch(err)
                {
                    console.warn(
                        `[engine] initialOverlay '${overlayName}' failed to open`,
                        err,
                    )
                }
            })
        }
    }

    return game
}

export default createGame
