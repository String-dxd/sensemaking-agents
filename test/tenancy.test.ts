import { describe, expect, it } from 'vitest'
import { withStudent } from '~/server/tenancy.server'

describe('withStudent — single tenancy boundary helper', () => {
  it('passes a non-empty studentId through to the inner fn', () => {
    const seen = withStudent('demo', (sid) => sid)
    expect(seen).toBe('demo')
  })

  it('returns whatever the inner fn returns', () => {
    const result = withStudent('demo', () => ({ rows: 3 }))
    expect(result).toEqual({ rows: 3 })
  })

  it('rejects an empty studentId at the boundary', () => {
    expect(() => withStudent('', () => 'unreachable')).toThrowError(/studentId/i)
  })

  it('rejects a whitespace-only studentId at the boundary', () => {
    expect(() => withStudent('   ', () => 'unreachable')).toThrowError(/studentId/i)
  })

  it('rejects a non-string studentId at the boundary', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately violating the type to assert the runtime guard
    expect(() => withStudent(undefined as any, () => 'unreachable')).toThrowError(/studentId/i)
  })
})
