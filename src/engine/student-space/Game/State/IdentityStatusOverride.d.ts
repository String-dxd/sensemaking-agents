// Companion declarations for IdentityStatusOverride.js — singleton slice
// that holds the Path Finder status preview override
// (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).

import type { IdentityStatusId } from '../View/statusHeuristics.js'

export type OverrideEvent =
  | { kind: 'set'; overrideId: IdentityStatusId | null }
  | { kind: 'hydrate' }

export interface IdentityStatusOverrideSnapshot {
  overrideId: IdentityStatusId | null
}

export default class IdentityStatusOverride {
  static instance: IdentityStatusOverride | null
  static getInstance(): IdentityStatusOverride | null

  overrideId: IdentityStatusId | null

  constructor()

  get isActive(): boolean
  get current(): IdentityStatusId | null

  setOverride(id: IdentityStatusId | 'auto' | null | undefined): IdentityStatusId | null
  clear(): IdentityStatusId | null

  subscribe(
    cb: (event: OverrideEvent, self: IdentityStatusOverride) => void,
  ): () => void

  hydrate(
    snapshot: IdentityStatusOverrideSnapshot | IdentityStatusId | null | undefined,
  ): void
  serialize(): IdentityStatusOverrideSnapshot
  dispose(): void
}
