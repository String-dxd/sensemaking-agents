/**
 * Coverage for the shared visual primitives used by full-viewport
 * engine sheets — TLDR hero, disclosure, stat tile row, callout strip.
 *
 * Plan: docs/plans/2026-05-20-003-refactor-profile-path-finder-tldr-progressive-disclosure-plan.md (U1)
 *
 * These are template helpers (return HTML strings) plus a binder that
 * wires chevron clicks. The tests assert structure, ARIA attributes,
 * empty-state behaviour, and toggle correctness — they do not assert
 * computed styles (CSS lives in `style.css` and is verified visually
 * via the design system page).
 */
import { describe, it, expect } from 'vitest'
import {
  tldrHeroHTML,
  disclosureHTML,
  statTileRowHTML,
  calloutStripHTML,
  bindDisclosureToggles,
// @ts-expect-error — engine module is plain JS without bundled type defs
} from '~/engine/student-space/Game/View/visualPrimitives.js'

/** Mount an HTML string into a detached DOM element for inspection. */
function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('visualPrimitives — tldrHeroHTML', () => {
  it('renders eyebrow, title, chips, and meta when all are present', () => {
    const root = mount(
      tldrHeroHTML({
        eyebrow: 'TOP VOICES',
        title: 'Curiosity keeps surfacing',
        chips: [
          { label: 'BELONGING', id: 'c.belonging', accent: 'values' },
          { label: 'CURIOSITY', id: 'c.curiosity', accent: 'values' },
        ],
        meta: '12 noticings · last refined today',
        accent: 'values',
      }),
    )
    expect(root.querySelector('.tldr-hero')?.getAttribute('data-accent')).toBe('values')
    expect(root.querySelector('.tldr-hero__eyebrow')?.textContent).toBe('TOP VOICES')
    expect(root.querySelector('.tldr-hero__title')?.textContent).toBe('Curiosity keeps surfacing')
    const chips = root.querySelectorAll('.tldr-chip')
    expect(chips.length).toBe(2)
    expect(chips[0]?.getAttribute('data-tldr-chip-id')).toBe('c.belonging')
    expect(chips[0]?.getAttribute('data-accent')).toBe('values')
    expect(chips[0]?.querySelector('.tldr-chip__label')?.textContent).toBe('BELONGING')
    expect(root.querySelector('.tldr-hero__meta')?.textContent).toBe('12 noticings · last refined today')
  })

  it('renders without chips when chips array is empty', () => {
    const root = mount(
      tldrHeroHTML({
        eyebrow: 'EYEBROW',
        title: 'Title',
        chips: [],
      }),
    )
    expect(root.querySelector('.tldr-hero__chips')).toBeNull()
    expect(root.querySelectorAll('.tldr-chip').length).toBe(0)
  })

  it('escapes hostile input in chip labels and meta', () => {
    const root = mount(
      tldrHeroHTML({
        title: '<script>alert("title")</script>',
        chips: [{ label: '<img src=x onerror=alert(1)>', id: 'x' }],
        meta: '"&\'<>',
      }),
    )
    // The literal <script> string lands in the title element's textContent
    // (the angle brackets were escaped, so the browser never sees a tag).
    expect(root.querySelector('.tldr-hero__title')?.textContent).toContain('<script>')
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('img')).toBeNull()
  })
})

describe('visualPrimitives — disclosureHTML', () => {
  it('renders a collapsed disclosure by default', () => {
    const root = mount(
      disclosureHTML({
        id: 'about-values',
        summary: 'More about this dimension',
        content: '<p>Hidden body</p>',
      }),
    )
    const section = root.querySelector('.disclosure')
    expect(section?.getAttribute('data-expanded')).toBe('false')
    expect(section?.getAttribute('data-disclosure-id')).toBe('about-values')

    const toggle = section?.querySelector('.disclosure__toggle')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.querySelector('.disclosure__summary')?.textContent).toBe('More about this dimension')

    const panel = section?.querySelector('.disclosure__panel')
    expect(panel?.innerHTML).toContain('Hidden body')
  })

  it('renders expanded when expanded=true', () => {
    const root = mount(
      disclosureHTML({
        id: 'x',
        summary: 's',
        content: '<p>body</p>',
        expanded: true,
      }),
    )
    expect(root.querySelector('.disclosure')?.getAttribute('data-expanded')).toBe('true')
    expect(root.querySelector('.disclosure__toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('returns empty string when content is empty', () => {
    expect(disclosureHTML({ summary: 's', content: '' })).toBe('')
    expect(disclosureHTML({})).toBe('')
  })
})

describe('visualPrimitives — bindDisclosureToggles', () => {
  it('flips data-expanded and aria-expanded on chevron click', () => {
    const root = mount(
      disclosureHTML({
        id: 'a',
        summary: 'click me',
        content: '<p>body</p>',
      }),
    )
    const teardown = bindDisclosureToggles(root)
    const section = root.querySelector('.disclosure') as HTMLElement
    const toggle = root.querySelector('.disclosure__toggle') as HTMLButtonElement

    expect(section.getAttribute('data-expanded')).toBe('false')
    toggle.click()
    expect(section.getAttribute('data-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    toggle.click()
    expect(section.getAttribute('data-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    teardown()
    toggle.click()
    // After teardown the listener is detached → state stays put.
    expect(section.getAttribute('data-expanded')).toBe('false')
  })

  it('handles multiple disclosures independently within the same root', () => {
    const root = mount(`
      ${disclosureHTML({ id: 'a', summary: 'A', content: '<p>A body</p>' })}
      ${disclosureHTML({ id: 'b', summary: 'B', content: '<p>B body</p>' })}
    `)
    bindDisclosureToggles(root)
    const sections = Array.from(root.querySelectorAll('.disclosure'))
    const togglesA = sections[0]?.querySelector('.disclosure__toggle') as HTMLButtonElement
    togglesA.click()
    expect(sections[0]?.getAttribute('data-expanded')).toBe('true')
    expect(sections[1]?.getAttribute('data-expanded')).toBe('false')
  })

  it('is a no-op when bound to a null root', () => {
    const teardown = bindDisclosureToggles(null)
    expect(typeof teardown).toBe('function')
    expect(() => teardown()).not.toThrow()
  })
})

describe('visualPrimitives — statTileRowHTML', () => {
  it('renders a 2-tile row with values, labels, and icons', () => {
    const root = mount(
      statTileRowHTML([
        { value: 12, label: 'Noticings', icon: '✶' },
        { value: 5, label: 'Voiced claims' },
      ]),
    )
    const row = root.querySelector('.stat-tile-row')
    expect(row?.getAttribute('data-count')).toBe('2')

    const tiles = Array.from(row?.querySelectorAll('.stat-tile') ?? [])
    expect(tiles.length).toBe(2)
    expect(tiles[0]?.querySelector('.stat-tile__value')?.textContent).toBe('12')
    expect(tiles[0]?.querySelector('.stat-tile__label')?.textContent).toBe('Noticings')
    expect(tiles[0]?.querySelector('.stat-tile__icon')?.textContent).toBe('✶')
    // Second tile has no icon → no icon element rendered.
    expect(tiles[1]?.querySelector('.stat-tile__icon')).toBeNull()
  })

  it('renders a single-tile row with data-count=1', () => {
    const root = mount(statTileRowHTML([{ value: 0, label: 'Quiet so far' }]))
    expect(root.querySelector('.stat-tile-row')?.getAttribute('data-count')).toBe('1')
  })

  it('returns empty string for an empty list', () => {
    expect(statTileRowHTML([])).toBe('')
    expect(statTileRowHTML()).toBe('')
  })

  it('coerces nullish values to empty strings without crashing', () => {
    const html = statTileRowHTML([{ value: null as unknown as string, label: 'x' }])
    expect(html).toContain('class="stat-tile__value"')
  })
})

describe('visualPrimitives — calloutStripHTML', () => {
  it('renders eyebrow and body with accent attribute', () => {
    const root = mount(
      calloutStripHTML({
        eyebrow: 'OPEN QUESTION',
        body: 'What energised you this week?',
        accent: 'values',
      }),
    )
    const strip = root.querySelector('.callout-strip')
    expect(strip?.getAttribute('data-accent')).toBe('values')
    expect(strip?.querySelector('.callout-strip__eyebrow')?.textContent).toBe('OPEN QUESTION')
    expect(strip?.querySelector('.callout-strip__body')?.textContent).toBe(
      'What energised you this week?',
    )
  })

  it('omits the eyebrow when not provided', () => {
    const root = mount(calloutStripHTML({ body: 'Just a body' }))
    expect(root.querySelector('.callout-strip__eyebrow')).toBeNull()
    expect(root.querySelector('.callout-strip__body')?.textContent).toBe('Just a body')
  })

  it('returns empty string when body is missing', () => {
    expect(calloutStripHTML({ eyebrow: 'X' })).toBe('')
    expect(calloutStripHTML({})).toBe('')
  })
})
