import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AskSheet live chat layout CSS', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/engine/student-space/style.css'), 'utf8')

  it('keeps live voice bubbles compact instead of pill-shaped', () => {
    const bubbleRule = css.match(/\.ask-live-chat__bubble\s*\{[\s\S]*?\}/)?.[0]

    expect(bubbleRule).toContain('max-width: min(82%, 460px)')
    expect(bubbleRule).toContain('border-radius: 18px')
    expect(bubbleRule).toContain('overflow-wrap: anywhere')
    expect(bubbleRule).not.toContain('border-radius: 999px')
  })

  it('keeps speaker labels in normal bubble flow', () => {
    const nameRule = css.match(/\.ask-live-chat__name\s*\{[\s\S]*?\}/)?.[0]

    expect(nameRule).toContain('position: static')
    expect(nameRule).toContain('justify-self: start')
    expect(nameRule).not.toContain('position: absolute')
  })
})
