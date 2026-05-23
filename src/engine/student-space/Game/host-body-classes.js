/**
 * The body classes the engine writes to `document.body`. Page-level
 * by design — the host should treat these as engine-owned: do not
 * overwrite `document.body.className` (use `classList.add/remove`
 * for any host-owned classes). The engine strips this set on
 * `game.dispose()`.
 *
 * Lives in its own module so engine internals (`Game.js`) can import
 * it without pulling in the public barrel `./index.js`, which would
 * create an import cycle (Game ↔ index) and trip a TDZ error when
 * the SSR bundler picks the wrong evaluation order.
 */
export const HOST_BODY_CLASSES = Object.freeze([
    'is-onboarding',       // ceremony active; chrome suppressed
    'is-onb-landing',      // edupass landing; live island visible behind
    'is-night',            // night palette (genuinely page-level)
    'has-overlay',         // any full-screen sheet open
    'has-capture-sheet',   // capture-flow sheet open
    'has-chooser',         // React capture chooser open
])
