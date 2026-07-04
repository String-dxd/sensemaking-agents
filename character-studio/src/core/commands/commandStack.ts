// Undo/redo command stack (plan 009, step 1) — studio-generic: sculpt and
// lattice use it now; migrating the other panels onto it is a planned
// follow-up. Pure TS, no React (plan 000 §7 boundary).

import type { Command, CommandStack } from './types'

export const DEFAULT_HISTORY_LIMIT = 200

export function createCommandStack(limit = DEFAULT_HISTORY_LIMIT): CommandStack {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`createCommandStack: limit must be a positive integer, got ${limit}`)
  }

  const undoStack: Command[] = []
  const redoStack: Command[] = []
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) listener()
  }

  return {
    execute(cmd: Command): void {
      cmd.do()
      // New edits invalidate the redo branch (linear history).
      redoStack.length = 0
      const top = undoStack[undoStack.length - 1]
      if (!top || !top.tryCoalesce(cmd)) {
        undoStack.push(cmd)
        if (undoStack.length > limit) undoStack.shift() // evict oldest
      }
      notify()
    },
    undo(): void {
      const cmd = undoStack.pop()
      if (!cmd) return
      cmd.undo()
      redoStack.push(cmd)
      notify()
    },
    redo(): void {
      const cmd = redoStack.pop()
      if (!cmd) return
      cmd.do()
      undoStack.push(cmd)
      notify()
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undoLabel: () => undoStack[undoStack.length - 1]?.label ?? null,
    redoLabel: () => redoStack[redoStack.length - 1]?.label ?? null,
    depth: () => undoStack.length,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    clear(): void {
      undoStack.length = 0
      redoStack.length = 0
      notify()
    },
  }
}
