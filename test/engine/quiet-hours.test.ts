import { describe, expect, it } from 'vitest'
import { isStudentQuietHour } from '~/engine/student-space/Game/State/quietHours'

describe('isStudentQuietHour', () => {
  it.each([
    [22, true],
    [23.9, true],
    [0, true],
    [5.99, true],
    [6, false],
    [12, false],
    [21.99, false],
  ])('classifies %s:00 against the 22:00–06:00 quiet window', (hour, expected) => {
    expect(isStudentQuietHour(hour)).toBe(expected)
  })

  it('normalises out-of-range hours and rejects non-finite values', () => {
    expect(isStudentQuietHour(25)).toBe(true)
    expect(isStudentQuietHour(-1)).toBe(true)
    expect(isStudentQuietHour(Number.NaN)).toBe(false)
  })
})
