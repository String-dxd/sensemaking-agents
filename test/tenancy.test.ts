import { describe, expect, it } from 'vitest'
import { withStudentLegacy } from '~/server/tenancy.server'

describe('withStudentLegacy — single tenancy boundary helper (v0.1 sync passthrough)', () => {
  it('passes a non-empty studentId through to the inner fn', () => {
    const seen = withStudentLegacy('demo', (sid) => sid)
    expect(seen).toBe('demo')
  })

  it('returns whatever the inner fn returns', () => {
    const result = withStudentLegacy('demo', () => ({ rows: 3 }))
    expect(result).toEqual({ rows: 3 })
  })

  it('rejects an empty studentId at the boundary', () => {
    expect(() => withStudentLegacy('', () => 'unreachable')).toThrowError(/studentId/i)
  })

  it('rejects a whitespace-only studentId at the boundary', () => {
    expect(() => withStudentLegacy('   ', () => 'unreachable')).toThrowError(/studentId/i)
  })

  it('rejects a non-string studentId at the boundary', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately violating the type to assert the runtime guard
    expect(() => withStudentLegacy(undefined as any, () => 'unreachable')).toThrowError(
      /studentId/i,
    )
  })
})
