import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ProfileSheet close button CSS', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/engine/student-space/style.css'), 'utf8')

  it('keeps the close button out of the ProfileSheet stacking-context rule', () => {
    expect(css).toContain('.profile-sheet > :not(.profile-sheet__hero):not(.profile-sheet__close)')
    expect(css).not.toContain('.profile-sheet > :not(.profile-sheet__hero)\n{')
  })

  it('keeps ProfileSheet on the shared full-sheet close position', () => {
    const closeRule = css.match(
      /\.capture-chooser__close,[\s\S]*?\.trajectory-sheet__close\s*\{[\s\S]*?\}/,
    )?.[0]

    expect(closeRule).toContain('.profile-sheet__close')
    expect(closeRule).toContain('position: fixed')
    expect(closeRule).toContain('top: 14px')
    expect(closeRule).toContain('right: 14px')
  })
})
