// Studio-side zustand store for the live CharacterSpec (plan 004, step 5).
//
// Mutation always goes through `patch` — a shallow-copy-on-write helper (no
// immer): `patch` clones the top-level spec object, hands the clone to the
// updater as a mutable draft, and the updater is responsible for
// shallow-copying any nested object it touches before mutating it (the same
// pattern React's `setState` update-function callers already use). In dev
// mode every patch is re-validated against `CharacterSpecSchema` and throws
// on an invalid result — panels can never persist a corrupt spec. The
// `import.meta.env.DEV` guard means this check compiles out of production
// builds (perf).

import { create } from 'zustand'
import { type CharacterSpec, CharacterSpecSchema } from '../../core/spec/schema'
import { createCharacterFromSpecies } from '../../core/species/registry'

function assertValidSpec(spec: CharacterSpec): void {
  const result = CharacterSpecSchema.safeParse(spec)
  if (!result.success) {
    throw new Error(`characterStore: patch produced an invalid CharacterSpec — ${result.error.message}`)
  }
}

export interface CharacterStoreState {
  spec: CharacterSpec
  /** True once the spec has diverged from the last `setSpec`/load. */
  dirty: boolean
  /** Replace the whole spec (e.g. loading a file). Validated in dev mode. */
  setSpec(spec: CharacterSpec): void
  /** Shallow-copy-on-write mutation: receives a top-level-cloned draft to mutate in place. */
  patch(updater: (draft: CharacterSpec) => void): void
  markClean(): void
  // Reserved for plan 009's undo/redo command stack — no-ops today.
  undo(): void
  redo(): void
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => ({
  spec: createCharacterFromSpecies('robin'),
  dirty: false,
  setSpec(spec) {
    if (import.meta.env.DEV) assertValidSpec(spec)
    set({ spec, dirty: false })
  },
  patch(updater) {
    const draft: CharacterSpec = { ...get().spec }
    updater(draft)
    if (import.meta.env.DEV) assertValidSpec(draft)
    set({ spec: draft, dirty: true })
  },
  markClean() {
    set({ dirty: false })
  },
  undo() {},
  redo() {},
}))
