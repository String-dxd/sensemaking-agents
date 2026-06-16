import { describe, it, expect } from 'vitest'
import { createCommandStack } from '../src/editor/commandStack'
import type { Command } from '../src/editor/commandStack'

// Helper: build a command that appends a label to a log on do/undo.
function makeCmd(log: string[], doLabel: string, undoLabel: string): Command {
  return {
    label: doLabel,
    do: () => log.push(doLabel),
    undo: () => log.push(undoLabel),
  }
}

describe('commandStack', () => {
  describe('push then undo', () => {
    it('runs the correct undo function and flips canUndo / canRedo', () => {
      const stack = createCommandStack()
      const log: string[] = []
      const cmd = makeCmd(log, 'do-a', 'undo-a')

      stack.push(cmd)
      expect(stack.canUndo()).toBe(true)
      expect(stack.canRedo()).toBe(false)
      expect(log).toEqual([]) // push must NOT call do()

      const result = stack.undo()
      expect(result).toBe(true)
      expect(log).toEqual(['undo-a'])
      expect(stack.canUndo()).toBe(false)
      expect(stack.canRedo()).toBe(true)
    })

    it('returns false when there is nothing to undo', () => {
      const stack = createCommandStack()
      expect(stack.undo()).toBe(false)
    })
  })

  describe('redo', () => {
    it('runs the correct do function and moves the command back to the undo stack', () => {
      const stack = createCommandStack()
      const log: string[] = []
      const cmd = makeCmd(log, 'do-b', 'undo-b')

      stack.push(cmd)
      stack.undo()
      log.length = 0 // reset log to isolate redo

      const result = stack.redo()
      expect(result).toBe(true)
      expect(log).toEqual(['do-b'])
      expect(stack.canUndo()).toBe(true)
      expect(stack.canRedo()).toBe(false)
    })

    it('returns false when there is nothing to redo', () => {
      const stack = createCommandStack()
      expect(stack.redo()).toBe(false)
    })
  })

  describe('push clears the redo stack', () => {
    it('discards redo entries when a new command is pushed', () => {
      const stack = createCommandStack()
      const log: string[] = []
      const a = makeCmd(log, 'do-a', 'undo-a')
      const b = makeCmd(log, 'do-b', 'undo-b')
      const c = makeCmd(log, 'do-c', 'undo-c')

      stack.push(a)
      stack.push(b)
      stack.undo() // b moves to redo
      expect(stack.canRedo()).toBe(true)

      stack.push(c) // should clear redo
      expect(stack.canRedo()).toBe(false)
      expect(stack.size()).toBe(2) // a and c
    })
  })

  describe('capacity eviction', () => {
    it('evicts the oldest undo entry when capacity is exceeded', () => {
      const stack = createCommandStack(2)
      const log: string[] = []
      const a = makeCmd(log, 'do-a', 'undo-a')
      const b = makeCmd(log, 'do-b', 'undo-b')
      const c = makeCmd(log, 'do-c', 'undo-c')

      stack.push(a)
      stack.push(b)
      stack.push(c) // exceeds capacity of 2; a should be evicted

      expect(stack.size()).toBe(2)

      // Undo twice: should see c then b, NOT a
      stack.undo()
      stack.undo()
      expect(log).toEqual(['undo-c', 'undo-b'])
      expect(stack.canUndo()).toBe(false)
    })
  })

  describe('clear', () => {
    it('empties both the undo and redo stacks', () => {
      const stack = createCommandStack()
      const log: string[] = []
      const a = makeCmd(log, 'do-a', 'undo-a')
      const b = makeCmd(log, 'do-b', 'undo-b')

      stack.push(a)
      stack.push(b)
      stack.undo() // b → redo

      stack.clear()

      expect(stack.canUndo()).toBe(false)
      expect(stack.canRedo()).toBe(false)
      expect(stack.size()).toBe(0)
      expect(stack.undo()).toBe(false)
      expect(stack.redo()).toBe(false)
    })
  })

  describe('multi-command undo/redo ordering', () => {
    it('undoes commands in LIFO order and redoes in the reverse of that', () => {
      const stack = createCommandStack()
      const log: string[] = []
      const a = makeCmd(log, 'do-a', 'undo-a')
      const b = makeCmd(log, 'do-b', 'undo-b')
      const c = makeCmd(log, 'do-c', 'undo-c')

      stack.push(a)
      stack.push(b)
      stack.push(c)

      stack.undo() // c
      stack.undo() // b
      expect(log).toEqual(['undo-c', 'undo-b'])

      log.length = 0
      stack.redo() // b
      stack.redo() // c
      expect(log).toEqual(['do-b', 'do-c'])
    })
  })

  describe('size', () => {
    it('reflects the number of undoable commands', () => {
      const stack = createCommandStack()
      const cmd = makeCmd([], 'do', 'undo')

      expect(stack.size()).toBe(0)
      stack.push(cmd)
      expect(stack.size()).toBe(1)
      stack.push(cmd)
      expect(stack.size()).toBe(2)
      stack.undo()
      expect(stack.size()).toBe(1)
      stack.redo()
      expect(stack.size()).toBe(2)
    })
  })
})
