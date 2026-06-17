// Generic undo/redo command stack.
// push() records an ALREADY-APPLIED command — does NOT call cmd.do().
// undo() calls the top command's undo() and moves it to the redo stack.
// redo() calls the top redo command's do() and moves it back to the undo stack.
// Capacity caps the undo stack; when exceeded the oldest entry is evicted.
//
// Copied verbatim from island-editor/src/editor/commandStack.ts — the
// standalone studios share the same editor primitive shape.

export interface Command {
  label?: string
  do: () => void
  undo: () => void
}

export interface CommandStack {
  /** Record an already-applied command. Clears the redo stack. */
  push(cmd: Command): void
  /** Undo the last command. Returns false if nothing to undo. */
  undo(): boolean
  /** Redo the last undone command. Returns false if nothing to redo. */
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
  /** Number of currently-undoable commands. */
  size(): number
}

/** @param capacity Max undo stack depth (default 200). Oldest entry is evicted when exceeded. */
export function createCommandStack(capacity = 200): CommandStack {
  const undoStack: Command[] = []
  const redoStack: Command[] = []

  return {
    push(cmd) {
      undoStack.push(cmd)
      if (undoStack.length > capacity) {
        undoStack.shift()
      }
      redoStack.length = 0
    },

    undo() {
      const cmd = undoStack.pop()
      if (cmd === undefined) return false
      cmd.undo()
      redoStack.push(cmd)
      return true
    },

    redo() {
      const cmd = redoStack.pop()
      if (cmd === undefined) return false
      cmd.do()
      undoStack.push(cmd)
      return true
    },

    canUndo() {
      return undoStack.length > 0
    },

    canRedo() {
      return redoStack.length > 0
    },

    clear() {
      undoStack.length = 0
      redoStack.length = 0
    },

    size() {
      return undoStack.length
    },
  }
}
