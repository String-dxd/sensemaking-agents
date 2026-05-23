import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  FacetSheetCard,
  type FacetSheetState,
  INITIAL_FACET_SHEET,
} from '~/components/student-space/world/FacetSheetCard'

function open(overrides: Partial<FacetSheetState> = {}): FacetSheetState {
  return {
    ...INITIAL_FACET_SHEET,
    open: true,
    facetId: 'interests',
    eyebrow: 'WHAT PULLS YOUR ATTENTION',
    tag: 'Interests',
    title: 'Daisy',
    subtitle: 'A pattern across your touchstones',
    accent: '#FF8E8E',
    soft: '#FDE0E0',
    ink: '#A84D4D',
    mostCommonLabel: 'Conventional',
    quietlyEmergingLabel: 'Investigative',
    detailTitle: 'Conventional',
    detailBody: '“I like when the table of contents is correct.”',
    bentoRows: [
      { label: 'Claim', value: 'Conventional' },
      { label: 'Evidence', value: '1 noticing' },
    ],
    moodPins: [],
    ctaLabel: 'See all your interests →',
    ctaVisible: true,
    ...overrides,
  }
}

describe('FacetSheetCard', () => {
  it('does not render content when closed', () => {
    const { queryByText } = render(
      <FacetSheetCard
        state={INITIAL_FACET_SHEET}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    expect(queryByText('WHAT PULLS YOUR ATTENTION')).toBeNull()
  })

  it('renders eyebrow, pill, title, subtitle, and the two ranked rows when open', () => {
    render(
      <FacetSheetCard
        state={open()}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    expect(screen.getByText('WHAT PULLS YOUR ATTENTION')).toBeTruthy()
    expect(screen.getByText('Interests')).toBeTruthy()
    expect(screen.getByText('Daisy')).toBeTruthy()
    expect(screen.getByText('A pattern across your touchstones')).toBeTruthy()
    expect(screen.getByText('Most common')).toBeTruthy()
    expect(screen.getByText('Quietly emerging')).toBeTruthy()
    // "Conventional" appears in mostCommon row AND detailTitle (latter is hidden in half mode).
    const mostCommonRows = screen.getAllByText('Conventional')
    expect(mostCommonRows.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Investigative')).toBeTruthy()
  })

  it('applies inline facet theme variables on the popup root', () => {
    render(
      <FacetSheetCard
        state={open({ accent: '#82B16A', soft: '#DDEDC6', ink: '#3F6F2A' })}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    const popup = document.querySelector('[data-facet-sheet]') as HTMLElement | null
    expect(popup).not.toBeNull()
    expect(popup?.style.getPropertyValue('--facet-accent')).toBe('#82B16A')
    expect(popup?.style.getPropertyValue('--facet-soft')).toBe('#DDEDC6')
    expect(popup?.style.getPropertyValue('--facet-ink')).toBe('#3F6F2A')
  })

  it('emits data-facet-sheet so click-outside selectors can target it', () => {
    render(
      <FacetSheetCard
        state={open()}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    expect(document.querySelector('[data-facet-sheet]')).not.toBeNull()
  })

  it('fires onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <FacetSheetCard
        state={open()}
        onClose={onClose}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('fires onToggleFull when the drag handle is clicked', async () => {
    const onToggleFull = vi.fn()
    render(
      <FacetSheetCard
        state={open()}
        onClose={() => {}}
        onToggleFull={onToggleFull}
        onOpenProfile={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Expand to full page' }))
    expect(onToggleFull).toHaveBeenCalled()
  })

  it('toggles full on ArrowUp when half-open and on ArrowDown when full-open', async () => {
    const onToggleFull = vi.fn()
    const { rerender } = render(
      <FacetSheetCard
        state={open({ isFull: false })}
        onClose={() => {}}
        onToggleFull={onToggleFull}
        onOpenProfile={() => {}}
      />,
    )
    const popup = document.querySelector('[data-facet-sheet]') as HTMLElement
    popup.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onToggleFull).toHaveBeenCalledTimes(1)

    rerender(
      <FacetSheetCard
        state={open({ isFull: true })}
        onClose={() => {}}
        onToggleFull={onToggleFull}
        onOpenProfile={() => {}}
      />,
    )
    await userEvent.keyboard('{ArrowDown}')
    expect(onToggleFull).toHaveBeenCalledTimes(2)
  })

  it('renders the CTA when ctaVisible and fires onOpenProfile on click', async () => {
    const onOpenProfile = vi.fn()
    render(
      <FacetSheetCard
        state={open({ isFull: true })}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={onOpenProfile}
      />,
    )
    const cta = screen.getByRole('button', { name: /See all your interests/i })
    await userEvent.click(cta)
    expect(onOpenProfile).toHaveBeenCalled()
  })

  it('hides the CTA for mood and shows mood pins instead of bento rows', () => {
    render(
      <FacetSheetCard
        state={open({
          facetId: 'mood',
          eyebrow: 'HOW TODAY IS LANDING',
          tag: 'Mood',
          ctaVisible: false,
          bentoRows: [],
          moodPins: [
            { emotion: 'joy', intensity: 3, entryDate: '2026-05-23', color: '#FFD66B' },
            { emotion: 'sadness', intensity: 2, entryDate: '2026-05-22', color: '#7FB3D9' },
          ],
          isFull: true,
        })}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /See all/i })).toBeNull()
    // Mood pin emotions render lowercased; CSS capitalize handles display.
    expect(screen.getByText('joy')).toBeTruthy()
    expect(screen.getByText('sadness')).toBeTruthy()
  })

  it('renders the empty mood state when there are no pins', () => {
    render(
      <FacetSheetCard
        state={open({
          facetId: 'mood',
          ctaVisible: false,
          bentoRows: [],
          moodPins: [],
          isFull: true,
        })}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    expect(screen.getByText(/No mood pins yet/i)).toBeTruthy()
  })

  it('marks the detail section as aria-hidden when not full', () => {
    render(
      <FacetSheetCard
        state={open({ isFull: false })}
        onClose={() => {}}
        onToggleFull={() => {}}
        onOpenProfile={() => {}}
      />,
    )
    const popup = document.querySelector('[data-facet-sheet]') as HTMLElement
    const detail = within(popup).getByText('“I like when the table of contents is correct.”')
    // Walk up to the section element to confirm aria-hidden.
    const section = detail.closest('section')
    expect(section?.getAttribute('aria-hidden')).toBe('true')
  })
})
