/**
 * Shared timing helpers. Every onboarding surface had its own copy of
 * `wait(ms)` — lift it once.
 */

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Yield to the next animation frame. Useful when DOM has changed and
 *  you want a layout flush before adding a transition class. */
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/**
 * Force a layout reflow on an element so the immediately-following
 * class addition triggers a CSS transition. Without this, browsers
 * coalesce the style change into the same paint and skip the
 * transition. Mirrors the `el.offsetWidth` trick that's scattered
 * through the codebase.
 */
export const reflow = (el) =>
{
    if(!el) return
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth
}
