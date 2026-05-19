/**
 * CaptureTagPicker — modal that appears after each capture submit and
 * asks the student which V/I/P/S dimension it represents, then
 * optionally a finer-grained sub-claim from the VIPS taxonomy.
 *
 * Tested in isolation with a fake game (the real engine isn't booted
 * because GLSL imports aren't loadable under vitest's happy-dom).
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CaptureTagPicker } from '~/components/CaptureTagPicker'
import type { Game } from '~/engine/student-space/Game'

type Entry = { id: string; dimension?: string | null; subClaimId?: string | null }
type CapturesListener = (entry: Entry) => void

interface FakeCaptures {
  entries: Entry[]
  listeners: Set<CapturesListener>
  subscribe(cb: CapturesListener): () => void
  emitAdd(entry: Entry): void
  patch(id: string, updates: { dimension?: string; subClaimId?: string | null }): void
}

interface FakeSprouts {
  setDimensionForFirstCapture: ReturnType<typeof vi.fn>
}

function makeFakeGame(): { game: Game; captures: FakeCaptures; sprouts: FakeSprouts } {
  const listeners = new Set<CapturesListener>()
  const captures: FakeCaptures = {
    entries: [],
    listeners,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emitAdd(entry) {
      captures.entries.push(entry)
      for (const cb of listeners) cb(entry)
    },
    patch(id, updates) {
      const entry = captures.entries.find((e) => e.id === id)
      if (!entry) return
      Object.assign(entry, updates)
      for (const cb of listeners) cb(entry)
    },
  }
  const sprouts: FakeSprouts = {
    setDimensionForFirstCapture: vi.fn().mockReturnValue(true),
  }
  const game = {
    state: { captures, sprouts },
    dispose() {},
  } as unknown as Game
  return { game, captures, sprouts }
}

afterEach(() => {})

describe('CaptureTagPicker', () => {
  it('renders nothing when no captures have arrived', () => {
    const { game } = makeFakeGame()
    render(<CaptureTagPicker game={game} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('step 1: appears on a new untagged capture and exposes the four V/I/P/S chips', () => {
    const { game, captures } = makeFakeGame()
    render(<CaptureTagPicker game={game} />)
    act(() => {
      captures.emitAdd({ id: 'cap-1' })
    })
    expect(screen.getByRole('dialog', { name: /what is this about/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^value/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^interest/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^personality/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^skill/i })).toBeInTheDocument()
  })

  it('ignores patch re-fires (entry already has a dimension)', () => {
    const { game, captures } = makeFakeGame()
    render(<CaptureTagPicker game={game} />)
    act(() => {
      captures.emitAdd({ id: 'cap-1', dimension: 'values' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('step 2: after picking dimension, sub-claim chips from VIPS_BY_FACET appear', () => {
    const { game, captures } = makeFakeGame()
    render(<CaptureTagPicker game={game} />)
    act(() => {
      captures.emitAdd({ id: 'cap-1' })
    })
    act(() => {
      screen.getByRole('button', { name: /^interest/i }).click()
    })
    // Step 2 heading
    expect(screen.getByRole('dialog')).toHaveAttribute('data-step', 'subClaim')
    // Interests facet has 6 RIASEC sub-claims
    expect(screen.getByRole('button', { name: /^realistic$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^investigative$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^artistic$/i })).toBeInTheDocument()
    // Skip affordance is present
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('sub-claim pick: patches dimension + subClaimId, calls sprouts.setDimensionForFirstCapture, closes', () => {
    const { game, captures, sprouts } = makeFakeGame()
    const patchSpy = vi.spyOn(captures, 'patch')
    render(<CaptureTagPicker game={game} />)
    act(() => {
      captures.emitAdd({ id: 'cap-1' })
    })
    act(() => {
      screen.getByRole('button', { name: /^interest/i }).click()
    })
    act(() => {
      screen.getByRole('button', { name: /^investigative$/i }).click()
    })
    expect(patchSpy).toHaveBeenCalledWith('cap-1', {
      dimension: 'interests',
      subClaimId: 'interests.investigative',
    })
    expect(sprouts.setDimensionForFirstCapture).toHaveBeenCalledWith('cap-1', 'interests')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('skip sub-claim: patches dimension only, no subClaimId, closes', () => {
    const { game, captures, sprouts } = makeFakeGame()
    const patchSpy = vi.spyOn(captures, 'patch')
    render(<CaptureTagPicker game={game} />)
    act(() => {
      captures.emitAdd({ id: 'cap-1' })
    })
    act(() => {
      screen.getByRole('button', { name: /^value/i }).click()
    })
    act(() => {
      screen.getByRole('button', { name: /skip/i }).click()
    })
    expect(patchSpy).toHaveBeenCalledWith('cap-1', { dimension: 'values' })
    expect(sprouts.setDimensionForFirstCapture).toHaveBeenCalledWith('cap-1', 'values')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('queues multiple rapid-fire captures and surfaces them one at a time', () => {
    const { game, captures } = makeFakeGame()
    render(<CaptureTagPicker game={game} />)
    act(() => {
      captures.emitAdd({ id: 'cap-1' })
      captures.emitAdd({ id: 'cap-2' })
      captures.emitAdd({ id: 'cap-3' })
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // First capture: pick Value → skip sub-claim.
    act(() => {
      screen.getByRole('button', { name: /^value/i }).click()
    })
    act(() => {
      screen.getByRole('button', { name: /skip/i }).click()
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // Second: pick Personality → pick a sub-claim.
    act(() => {
      screen.getByRole('button', { name: /^personality/i }).click()
    })
    act(() => {
      screen.getByRole('button', { name: /^extraversion$/i }).click()
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // Third: pick Skill → skip.
    act(() => {
      screen.getByRole('button', { name: /^skill/i }).click()
    })
    act(() => {
      screen.getByRole('button', { name: /skip/i }).click()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('survives a partial game with no captures slice (no crash, no dialog)', () => {
    const partial = { state: {}, dispose() {} } as unknown as Game
    expect(() => render(<CaptureTagPicker game={partial} />)).not.toThrow()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
