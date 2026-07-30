import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMyWorldFaqAuthoringShortcut,
  MY_WORLD_FAQ_EDITOR_PATH,
} from '~/components/my-world-faq/faq-authoring-shortcut'

function dispatchShortcut({
  init,
  target = document.body,
  navigate = vi.fn(),
}: {
  init: KeyboardEventInit
  target?: Element
  navigate?: ReturnType<typeof vi.fn>
}) {
  const handler = createMyWorldFaqAuthoringShortcut(navigate)
  const listener: EventListener = (event) => handler(event as KeyboardEvent)
  target.addEventListener('keydown', listener)
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  target.removeEventListener('keydown', listener)
  return { event, navigate }
}

describe('My World FAQ authoring shortcut', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it.each([
    ['Meta+K', { metaKey: true }],
    ['Ctrl+K', { ctrlKey: true }],
  ])('opens the protected editor with %s', (_label, init) => {
    const { event, navigate } = dispatchShortcut({ init })

    expect(event.defaultPrevented).toBe(true)
    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith(MY_WORLD_FAQ_EDITOR_PATH)
  })

  it.each([
    ['no command modifier', {}],
    ['another key', { metaKey: true, key: 'j' }],
    ['Alt', { metaKey: true, altKey: true }],
    ['Shift', { ctrlKey: true, shiftKey: true }],
    ['repeat', { metaKey: true, repeat: true }],
  ])('ignores %s', (_label, init) => {
    const { event, navigate } = dispatchShortcut({ init })

    expect(event.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each(['input', 'textarea', 'select'])('does not interrupt a focused %s', (tagName) => {
    const target = document.createElement(tagName)
    document.body.append(target)

    const { event, navigate } = dispatchShortcut({ init: { metaKey: true }, target })

    expect(event.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not interrupt descendants of a contenteditable region', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const target = document.createElement('span')
    editable.append(target)
    document.body.append(editable)

    const { event, navigate } = dispatchShortcut({ init: { ctrlKey: true }, target })

    expect(event.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
