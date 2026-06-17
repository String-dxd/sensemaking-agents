import { describe, expect, it, vi } from 'vitest'
import { createCommandStack } from '../src/editor/commandStack'

describe('commandStack', () => {
  it('push records an already-applied command without calling do()', () => {
    const stack = createCommandStack()
    const cmd = { do: vi.fn(), undo: vi.fn() }
    stack.push(cmd)
    expect(cmd.do).not.toHaveBeenCalled()
    expect(stack.canUndo()).toBe(true)
    expect(stack.canRedo()).toBe(false)
    expect(stack.size()).toBe(1)
  })

  it('undo/redo move the command between stacks', () => {
    const stack = createCommandStack()
    const cmd = { do: vi.fn(), undo: vi.fn() }
    stack.push(cmd)
    expect(stack.undo()).toBe(true)
    expect(cmd.undo).toHaveBeenCalledOnce()
    expect(stack.canRedo()).toBe(true)
    expect(stack.redo()).toBe(true)
    expect(cmd.do).toHaveBeenCalledOnce()
    expect(stack.canUndo()).toBe(true)
  })

  it('undo/redo on empty stacks return false', () => {
    const stack = createCommandStack()
    expect(stack.undo()).toBe(false)
    expect(stack.redo()).toBe(false)
  })

  it('push clears the redo stack', () => {
    const stack = createCommandStack()
    stack.push({ do: vi.fn(), undo: vi.fn() })
    stack.undo()
    expect(stack.canRedo()).toBe(true)
    stack.push({ do: vi.fn(), undo: vi.fn() })
    expect(stack.canRedo()).toBe(false)
  })

  it('evicts the oldest entry past capacity', () => {
    const stack = createCommandStack(2)
    stack.push({ do: vi.fn(), undo: vi.fn() })
    stack.push({ do: vi.fn(), undo: vi.fn() })
    stack.push({ do: vi.fn(), undo: vi.fn() })
    expect(stack.size()).toBe(2)
  })

  it('clear empties both stacks', () => {
    const stack = createCommandStack()
    stack.push({ do: vi.fn(), undo: vi.fn() })
    stack.undo()
    stack.clear()
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(false)
  })
})
