/**
 * Engine ProfileSheet — TLDR hero per tab.
 *
 * Plan: docs/plans/2026-05-20-003-refactor-profile-path-finder-tldr-progressive-disclosure-plan.md (U2)
 *
 * The hero sits between the panel header and the COLLECTION bento on the
 * four imperative VIPS tabs. It surfaces the top voiced claims as chips
 * and routes chip clicks through the same filter path as the bento.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ instance: null as unknown }))

vi.mock('~/engine/student-space/Game/State/State.js', () => ({
  default: {
    getInstance: () => state.instance,
  },
}))

vi.mock('~/engine/student-space/Game/View/ThumbnailRenderer.js', () => ({
  default: class StubThumbnailRenderer {
    getThumbnail() {
      return ''
    }
  },
}))

const bridge = vi.hoisted(() => ({
  mount: vi.fn(),
  unmount: vi.fn(),
}))

vi.mock('~/engine/student-space/profile-tab-react-bridge.tsx', () => ({
  mountProfileTabReactPanel: bridge.mount,
  unmountProfileTabReactPanel: bridge.unmount,
}))

import OverlayController from '~/engine/student-space/Game/View/OverlayController.js'
// @ts-expect-error — engine modules are plain JS without bundled type defs
import ProfileSheet from '~/engine/student-space/Game/View/ProfileSheet.js'

interface ProfileSheetHandle {
  open: (opts?: unknown) => void
  dispose?: () => void
}

/**
 * Build a profile stub that returns the given quote counts for the
 * `values` facet. Any claim ID not in `counts` defaults to 0.
 */
function profileWithValuesCounts(counts: Record<string, number>) {
  return {
    identity: { name: 'Mei', className: 'Sec 3B', avatarDataUrl: null },
    getFacet: () => ({
      paragraph: 'Some paragraph copy',
      openQuestion: 'An open question',
      lastRefinedAt: '2026-05-19T08:11:00Z',
      quotes: [],
    }),
    countByClaim: (facetId: string) => (facetId === 'values' ? counts : {}),
    forgetQuote: () => null,
  }
}

/** Build a profile with the given number of quotes on the values facet. */
function profileWithValuesQuotes(n: number) {
  const quotes = Array.from({ length: n }, (_, i) => ({
    id: `q-${i + 1}`,
    text: `Quote number ${i + 1}`,
    canonicalClaimId: 'values.contribution',
    confidence: 'medium' as const,
    createdAt: new Date(2026, 4, 20 - i).toISOString(),
    sourceCaptureId: null,
    backendTimelineEntryId: null,
  }))
  return {
    identity: { name: 'Mei', className: 'Sec 3B', avatarDataUrl: null },
    getFacet: (facetId: string) => {
      if (facetId !== 'values')
        return { paragraph: '', openQuestion: '', lastRefinedAt: '', quotes: [] }
      return { paragraph: '', openQuestion: '', lastRefinedAt: '', quotes }
    },
    countByClaim: (facetId: string) => (facetId === 'values' ? { 'values.contribution': n } : {}),
    forgetQuote: () => null,
  }
}

afterEach(() => {
  state.instance = null
  OverlayController.instance = null
  bridge.mount.mockClear()
  bridge.unmount.mockClear()
  document.body.innerHTML = ''
  document.body.className = ''
})

describe('ProfileSheet — TLDR hero', () => {
  it('hides the hero when a facet has zero noticings', async () => {
    state.instance = { profile: profileWithValuesCounts({}), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const slot = document.querySelector<HTMLElement>('.profile-sheet__tldr-slot')
      expect(slot?.hidden).toBe(true)
      expect(slot?.querySelector('.tldr-hero')).toBeNull()
    } finally {
      sheet.dispose?.()
    }
  })

  it('shows empty-state copy when 1-2 claims are voiced', async () => {
    // Two voiced claims — below the 3-claim threshold.
    state.instance = {
      profile: profileWithValuesCounts({ 'values.contribution': 2, 'values.learning': 1 }),
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const slot = document.querySelector<HTMLElement>('.profile-sheet__tldr-slot')
      expect(slot?.hidden).toBe(false)
      const hero = slot?.querySelector('.tldr-hero')
      expect(hero).not.toBeNull()
      expect(hero?.querySelector('.tldr-hero__chips')).toBeNull()
      const title = hero?.querySelector('.tldr-hero__title')?.textContent || ''
      expect(title.toLowerCase()).toContain('few noticings yet')
    } finally {
      sheet.dispose?.()
    }
  })

  it('shows up to 5 chips ordered by quote count when 3+ claims are voiced', async () => {
    state.instance = {
      profile: profileWithValuesCounts({
        'values.contribution': 5,
        'values.achievement': 4,
        'values.tradition': 3,
        'values.security': 2,
        'values.independence': 1,
        'values.relationships': 6, // highest — should be first
        'values.wellbeing': 0, // zero — excluded
      }),
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const chips = Array.from(
        document.querySelectorAll<HTMLElement>('.profile-sheet__tldr-slot .tldr-chip'),
      )
      // Capped at 5; ordered by count desc.
      expect(chips.length).toBe(5)
      const ids = chips.map((c) => c.dataset.tldrChipId)
      expect(ids[0]).toBe('values.relationships')
      // Excluded the 0-count claim entirely.
      expect(ids).not.toContain('values.wellbeing')
      // Each chip carries the facet accent for dot color.
      expect(chips.every((c) => c.dataset.accent === 'values')).toBe(true)
    } finally {
      sheet.dispose?.()
    }
  })

  it('clicking a TLDR chip filters the timeline like a bento tile click', async () => {
    state.instance = {
      profile: profileWithValuesCounts({
        'values.contribution': 3,
        'values.achievement': 2,
        'values.tradition': 1,
      }),
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const chip = document.querySelector<HTMLElement>(
        '.profile-sheet__tldr-slot .tldr-chip[data-tldr-chip-id="values.contribution"]',
      )
      expect(chip).not.toBeNull()
      chip?.click()
      // Selected chip gains the is-selected class.
      const selected = document.querySelector<HTMLElement>(
        '.profile-sheet__tldr-slot .tldr-chip.is-selected',
      )
      expect(selected?.dataset.tldrChipId).toBe('values.contribution')
      // The bento tile for the same claim is also selected (filter is shared state).
      const tile = document.querySelector<HTMLElement>(
        '.bento-tile[data-claim-id="values.contribution"]',
      )
      expect(tile?.classList.contains('is-selected')).toBe(true)
      // Clicking again clears the filter.
      const chip2 = document.querySelector<HTMLElement>(
        '.profile-sheet__tldr-slot .tldr-chip[data-tldr-chip-id="values.contribution"]',
      )
      chip2?.click()
      expect(
        document.querySelector<HTMLElement>('.profile-sheet__tldr-slot .tldr-chip.is-selected'),
      ).toBeNull()
    } finally {
      sheet.dispose?.()
    }
  })

  it('expands the "More about this dimension" disclosure on first tab visit', async () => {
    state.instance = {
      profile: profileWithValuesCounts({ 'values.contribution': 1 }),
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const more = document.querySelector<HTMLElement>('[data-role="more-disclosure"]')
      expect(more?.getAttribute('data-expanded')).toBe('true')
      const toggle = more?.querySelector<HTMLElement>('.disclosure__toggle')
      expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    } finally {
      sheet.dispose?.()
    }
  })

  it('collapses the "More" disclosure on second visit to the same tab within one open', async () => {
    state.instance = {
      profile: profileWithValuesCounts({ 'values.contribution': 1 }),
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      // Switch away then back; the visit memory now flags 'values' as seen.
      const interestsTab = document.querySelector<HTMLElement>(
        '.profile-tab[data-facet="interests"]',
      )
      interestsTab?.click()
      await new Promise((r) => setTimeout(r, 150))
      const valuesTab = document.querySelector<HTMLElement>('.profile-tab[data-facet="values"]')
      valuesTab?.click()
      await new Promise((r) => setTimeout(r, 150))
      const more = document.querySelector<HTMLElement>('[data-role="more-disclosure"]')
      expect(more?.getAttribute('data-expanded')).toBe('false')
    } finally {
      sheet.dispose?.()
    }
  })

  it('applies the facet accent to the embedded Open Question callout strip', async () => {
    state.instance = {
      profile: profileWithValuesCounts({ 'values.contribution': 1 }),
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const callout = document.querySelector<HTMLElement>(
        '[data-role="more-disclosure"] .callout-strip',
      )
      expect(callout?.getAttribute('data-accent')).toBe('values')
    } finally {
      sheet.dispose?.()
    }
  })

  it('caps the TIMELINE at 3 cards by default when there are more than 3 quotes', async () => {
    state.instance = { profile: profileWithValuesQuotes(8), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const cards = document.querySelectorAll<HTMLElement>('.profile-sheet__quote-list .quote-card')
      expect(cards.length).toBe(3)
      const expandBtn = document.querySelector<HTMLElement>(
        '.timeline-expand-btn[data-action="timeline-expand"]',
      )
      expect(expandBtn?.textContent).toContain('Show all 5 more noticings')
      // Eyebrow shows the count.
      const filterEl = document.querySelector<HTMLElement>('.profile-sheet__timeline-filter')
      expect(filterEl?.textContent).toContain('showing 3 of 8')
    } finally {
      sheet.dispose?.()
    }
  })

  it('expands to show all quotes when the "Show all" button is clicked', async () => {
    state.instance = { profile: profileWithValuesQuotes(8), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      const expand = document.querySelector<HTMLElement>(
        '.timeline-expand-btn[data-action="timeline-expand"]',
      )
      expand?.click()
      const cards = document.querySelectorAll<HTMLElement>('.profile-sheet__quote-list .quote-card')
      expect(cards.length).toBe(8)
      const collapse = document.querySelector<HTMLElement>(
        '.timeline-expand-btn[data-action="timeline-collapse"]',
      )
      expect(collapse?.textContent).toContain('Show fewer')
    } finally {
      sheet.dispose?.()
    }
  })

  it('renders all quotes without a button when total is at or below 3', async () => {
    state.instance = { profile: profileWithValuesQuotes(2), backend: null }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      expect(
        document.querySelectorAll<HTMLElement>('.profile-sheet__quote-list .quote-card').length,
      ).toBe(2)
      expect(document.querySelector<HTMLElement>('.timeline-expand-btn')).toBeNull()
    } finally {
      sheet.dispose?.()
    }
  })

  it('re-renders the hero when switching tabs', async () => {
    state.instance = {
      profile: {
        identity: { name: 'Mei', className: 'Sec 3B', avatarDataUrl: null },
        getFacet: () => ({
          paragraph: '',
          openQuestion: '',
          lastRefinedAt: '',
          quotes: [],
        }),
        countByClaim: (facetId: string) => {
          if (facetId === 'values') {
            return {
              'values.contribution': 3,
              'values.achievement': 2,
              'values.tradition': 1,
            }
          }
          if (facetId === 'interests') {
            return {
              'interests.social': 4,
              'interests.investigative': 3,
              'interests.realistic': 2,
            }
          }
          return {}
        },
        forgetQuote: () => null,
      },
      backend: null,
    }
    OverlayController.instance = new OverlayController()
    const sheet = new ProfileSheet() as ProfileSheetHandle
    try {
      sheet.open({ tab: 'values' })
      await Promise.resolve()
      let chips = Array.from(
        document.querySelectorAll<HTMLElement>('.profile-sheet__tldr-slot .tldr-chip'),
      )
      expect(chips[0]?.dataset.tldrChipId).toBe('values.contribution')

      // Switch to interests — wait out the cross-fade timer (TAB_FADE_MS=110ms).
      const interestsTab = document.querySelector<HTMLElement>(
        '.profile-tab[data-facet="interests"]',
      )
      interestsTab?.click()
      await new Promise((r) => setTimeout(r, 150))

      chips = Array.from(
        document.querySelectorAll<HTMLElement>('.profile-sheet__tldr-slot .tldr-chip'),
      )
      expect(chips.length).toBeGreaterThan(0)
      // No stale data from values facet.
      expect(chips.every((c) => c.dataset.accent === 'interests')).toBe(true)
      const firstId = chips[0]?.dataset.tldrChipId || ''
      expect(firstId.startsWith('interests.')).toBe(true)
    } finally {
      sheet.dispose?.()
    }
  })
})
