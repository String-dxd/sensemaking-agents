// The studio's single undo/redo history (plan 009, step 1). One stack for
// the whole app — sculpt strokes and lattice applies share it today; other
// panels migrate onto it in a follow-up. App.tsx wires ⌘Z / ⇧⌘Z to it.

import { useSyncExternalStore } from 'react'
import { type CommandStack, createCommandStack } from '../../core/commands'

export const studioCommands: CommandStack = createCommandStack()

// Console access for debugging/automation (mirrors __playStore).
declare global {
  interface Window {
    __studioCommands?: CommandStack
  }
}
if (typeof window !== 'undefined') window.__studioCommands = studioCommands

let version = 0
studioCommands.subscribe(() => {
  version++
})

/** Re-renders on every stack change; returns the live stack (read
 * canUndo/undoLabel/... directly — the version bump keeps them fresh). */
export function useStudioCommands(): CommandStack {
  useSyncExternalStore(
    (onChange) => studioCommands.subscribe(onChange),
    () => version,
  )
  return studioCommands
}
