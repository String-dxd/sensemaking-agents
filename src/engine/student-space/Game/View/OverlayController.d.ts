/**
 * Type declarations for the engine OverlayController singleton.
 *
 * The engine substrate stays vanilla JS (see CLAUDE.md / engine-substrate
 * doctrine). This .d.ts is the same pattern used by `profile-tokens.constants.d.ts`
 * and `statusHeuristics.d.ts` — a hand-maintained companion that lets TS-side
 * code import the JS module with proper types. Kept minimal: only the
 * surface area current TS consumers touch.
 */

export interface OverlayControllerSurface {
  open?: (opts?: unknown) => void
  close?: () => void
  root?: HTMLElement | null
}

export default class OverlayController {
  // Public static accessor used by tests to reset the singleton between runs.
  // The runtime class (OverlayController.js) sets this in its constructor and
  // serves as the source-of-truth for `getInstance()`. Widened to `null` here
  // because existing tests reset via `OverlayController.instance = null` between
  // runs; the runtime tolerates either nullish value.
  static instance: OverlayController | null | undefined
  static getInstance(): OverlayController | undefined
  constructor()
  surfaces: Map<string, OverlayControllerSurface>
  active: string | null
  register(name: string, surface: OverlayControllerSurface): void
  open(name: string, opts?: unknown): void
  close(name: string): void
  noteClosed(name: string): void
  isOpen(name: string): boolean
  getActiveRoot(): HTMLElement | null
}
