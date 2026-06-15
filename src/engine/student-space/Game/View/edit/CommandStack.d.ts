export interface Command {
  do: () => void
  undo: () => void
}

export default class CommandStack {
  readonly undoCount: number
  readonly redoCount: number

  /** Record a command (caller has already executed the forward action). Clears redo stack. */
  push(cmd: Command): void

  /** Undo the most recent command. No-op if history is empty. */
  undo(): void

  /** Redo the most recently undone command. No-op if redo stack is empty. */
  redo(): void

  /** Clear all history. */
  clear(): void
}
