import { describe, expect, it } from 'vitest'
import { cn } from '~/lib/utils'

describe('U1 scaffold', () => {
  it('vitest + path aliases work', () => {
    expect(cn('a', 'b', 'c')).toContain('a')
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })
})
