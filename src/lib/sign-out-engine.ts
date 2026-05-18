/**
 * Synchronously tears down the Student Space engine if one is mounted. Use
 * this from any sign-out surface BEFORE clearing the engine's `ss:v1:*`
 * localStorage keys, otherwise Persistence's debounced writes (250ms) can
 * race the clear and re-create the keys we just deleted.
 *
 * dispose() synchronously:
 *   - drains Persistence's debounce queue (flush())
 *   - removes the window listeners (resize, visibilitychange)
 *   - revokes the rAF loop
 *   - disposes the renderer + Sound's AudioContext
 *   - clears every engine singleton so a subsequent createGame() boots clean
 *
 * Safe to call when no engine is mounted (no-op), and safe from SSR (guards
 * on `typeof window`).
 *
 * Reaches the live Game instance through `window.__studentSpaceGame`, which
 * `StudentSpaceHost` sets when it boots the engine. The indirection (vs a
 * static `~/engine/student-space/Game` import) keeps server bundles free of
 * WebGL/audio engine code; the sign-out path runs only client-side, where
 * the host has already loaded the engine module.
 */
declare global {
  interface Window {
    __studentSpaceGame?: { dispose(): void } | null
  }
}

export function signOutEngine(): void {
  if (typeof window === 'undefined') return
  try {
    const game = window.__studentSpaceGame
    if (game) game.dispose()
    window.__studentSpaceGame = null
  } catch (err) {
    console.warn('[sign-out] engine dispose failed', err)
  }
}
