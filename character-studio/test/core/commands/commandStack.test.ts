import { describe, expect, it } from 'vitest'
import { createCommandStack } from '../../../src/core/commands'
import type { Command } from '../../../src/core/commands'

/**
 * Test double mirroring the sculpt-stroke shape: a register holds a value;
 * each command records before/after and coalesces with same-stroke ids
 * (keep first `before`, adopt last `after` — the three.js-editor
 * `updatable` pattern).
 */
function makeRegister() {
  const state = { value: 0 }
  function setCommand(strokeId: string | null, next: number): Command & { before: number; after: number } {
    const cmd = {
      label: `set ${next}`,
      strokeId,
      before: state.value,
      after: next,
      do() {
        state.value = cmd.after
      },
      undo() {
        state.value = cmd.before
      },
      tryCoalesce(other: Command): boolean {
        const o = other as typeof cmd
        if (strokeId === null || o.strokeId !== strokeId) return false
        cmd.after = o.after
        cmd.label = o.label
        return true
      },
    }
    return cmd
  }
  return { state, setCommand }
}

describe('createCommandStack', () => {
  it('do/undo/redo restore state in order', () => {
    const { state, setCommand } = makeRegister()
    const stack = createCommandStack()
    stack.execute(setCommand(null, 1))
    stack.execute(setCommand(null, 2))
    stack.execute(setCommand(null, 3))
    expect(state.value).toBe(3)

    stack.undo()
    expect(state.value).toBe(2)
    stack.undo()
    expect(state.value).toBe(1)
    stack.redo()
    expect(state.value).toBe(2)
    stack.redo()
    expect(state.value).toBe(3)
    expect(stack.canRedo()).toBe(false)
  })

  it('undo/redo on empty stacks are safe no-ops', () => {
    const stack = createCommandStack()
    expect(() => {
      stack.undo()
      stack.redo()
    }).not.toThrow()
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(false)
    expect(stack.undoLabel()).toBeNull()
  })

  it('a new execute clears the redo branch', () => {
    const { state, setCommand } = makeRegister()
    const stack = createCommandStack()
    stack.execute(setCommand(null, 1))
    stack.execute(setCommand(null, 2))
    stack.undo()
    expect(stack.canRedo()).toBe(true)

    stack.execute(setCommand(null, 9))
    expect(stack.canRedo()).toBe(false)
    stack.redo() // no-op
    expect(state.value).toBe(9)
    stack.undo()
    expect(state.value).toBe(1)
  })

  it('coalesces same-stroke commands into ONE history entry (first before, last after)', () => {
    const { state, setCommand } = makeRegister()
    const stack = createCommandStack()
    stack.execute(setCommand(null, 10)) // separate entry
    stack.execute(setCommand('stroke-a', 11))
    stack.execute(setCommand('stroke-a', 12))
    stack.execute(setCommand('stroke-a', 13))
    expect(state.value).toBe(13)
    expect(stack.depth()).toBe(2)

    stack.undo() // whole stroke unwinds to the pre-stroke value
    expect(state.value).toBe(10)
    stack.redo() // and redoes to the stroke's final value
    expect(state.value).toBe(13)
  })

  it('does NOT coalesce across different stroke ids', () => {
    const { state, setCommand } = makeRegister()
    const stack = createCommandStack()
    stack.execute(setCommand('stroke-a', 1))
    stack.execute(setCommand('stroke-b', 2))
    expect(stack.depth()).toBe(2)
    stack.undo()
    expect(state.value).toBe(1)
  })

  it('does not coalesce into an undone-then-redone boundary incorrectly after undo', () => {
    // After an undo, a new same-stroke command must start a NEW entry (the
    // old top is on the redo stack, which execute() clears).
    const { state, setCommand } = makeRegister()
    const stack = createCommandStack()
    stack.execute(setCommand('stroke-a', 1))
    stack.undo()
    expect(state.value).toBe(0)
    stack.execute(setCommand('stroke-a', 5))
    expect(stack.depth()).toBe(1)
    stack.undo()
    expect(state.value).toBe(0)
  })

  it('evicts the oldest entry beyond the limit', () => {
    const { state, setCommand } = makeRegister()
    const stack = createCommandStack(3)
    for (const v of [1, 2, 3, 4]) stack.execute(setCommand(null, v))
    expect(stack.depth()).toBe(3)
    stack.undo()
    stack.undo()
    stack.undo()
    // The `set 1` entry was evicted — history bottoms out at its `after`.
    expect(state.value).toBe(1)
    expect(stack.canUndo()).toBe(false)
  })

  it('notifies subscribers on execute/undo/redo/clear and honors unsubscribe', () => {
    const { setCommand } = makeRegister()
    const stack = createCommandStack()
    let calls = 0
    const off = stack.subscribe(() => {
      calls++
    })
    stack.execute(setCommand(null, 1))
    stack.undo()
    stack.redo()
    stack.clear()
    expect(calls).toBe(4)
    expect(stack.canUndo()).toBe(false)
    off()
    stack.execute(setCommand(null, 2))
    expect(calls).toBe(4)
  })
})
