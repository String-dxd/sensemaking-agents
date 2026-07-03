// Command vocabulary for the studio-wide undo/redo stack (plan 009, step 1).
//
// Modeled on the three.js-editor command pattern: every mutation an editor
// tool makes is a Command object routed through one `execute()`. Rapid
// same-gesture updates (a sculpt drag emits one command per pointermove)
// COALESCE into a single history entry via `tryCoalesce` — the editor's
// `updatable` pattern: keep the first command's `before` state, adopt the
// newest command's `after` state, so one drag = one undo step.

export interface Command {
  /** Human-readable history label (panel tooltips, debugging). */
  label: string
  /** Apply the command's effect. Must be idempotent: `do()` after `do()`
   * (or after the tool already applied the same state live) is a no-op. */
  do(): void
  /** Restore the state captured before `do()`. */
  undo(): void
  /**
   * Attempt to absorb `next` into this command (same-gesture merge). Return
   * true when absorbed — the stack then discards `next` instead of pushing
   * it. Implementations must keep their own `before` and adopt `next`'s
   * `after`. Return false for unrelated commands.
   */
  tryCoalesce(next: Command): boolean
}

export interface CommandStack {
  /** Run `cmd.do()` and record it (or coalesce it into the newest entry). */
  execute(cmd: Command): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  /** Labels for UI affordances (null when the respective stack is empty). */
  undoLabel(): string | null
  redoLabel(): string | null
  /** History depth (undo side) — mainly for tests and debug UI. */
  depth(): number
  /** Notified after every execute/undo/redo/clear. Returns unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Drop all history (e.g. loading a different character). */
  clear(): void
}
