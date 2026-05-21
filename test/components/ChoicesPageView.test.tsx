/**
 * ChoicesPageView — component coverage for U3 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  type ChangeIntention,
  type ChoicesActions,
  ChoicesPageView,
  type DecisionEntry,
} from '~/components/ChoicesPageView'

function makeActions(overrides: Partial<ChoicesActions> = {}): ChoicesActions {
  return {
    addDecision: vi.fn().mockReturnValue(null),
    removeDecision: vi.fn().mockReturnValue(null),
    tagDecisionPattern: vi.fn().mockReturnValue(null),
    addChangeIntention: vi.fn().mockReturnValue(null),
    removeChangeIntention: vi.fn().mockReturnValue(null),
    ...overrides,
  }
}

function makeDecision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: 'd_1',
    createdAt: new Date('2026-05-10').toISOString(),
    decision: 'CCA captain',
    options: ['stand for it', 'decline'],
    chose: 'declined',
    forces: ['peer-acceptance'],
    when: 'last term',
    note: null,
    patternTag: null,
    ...overrides,
  }
}

function renderView(overrides: {
  decisions?: DecisionEntry[]
  intentions?: ChangeIntention[]
  actions?: ChoicesActions
}) {
  const actions = overrides.actions ?? makeActions()
  render(
    <ChoicesPageView
      decisions={overrides.decisions ?? []}
      intentions={overrides.intentions ?? []}
      actions={actions}
    />,
  )
  return { actions }
}

describe('ChoicesPageView', () => {
  it('renders three sections with empty states by default', () => {
    renderView({})
    expect(screen.getByTestId('choices-page')).toBeInTheDocument()
    expect(screen.getByTestId('choices-section-decisions')).toBeInTheDocument()
    expect(screen.getByTestId('choices-section-patterns')).toBeInTheDocument()
    expect(screen.getByTestId('choices-section-intentions')).toBeInTheDocument()
    expect(screen.getByTestId('choices-decisions-empty')).toBeInTheDocument()
    expect(screen.getByTestId('choices-patterns-empty')).toBeInTheDocument()
    expect(screen.getByTestId('choices-intentions-empty')).toBeInTheDocument()
  })

  it('renders a decision card with chosen + rejected options + force chips', () => {
    renderView({ decisions: [makeDecision()] })
    const row = screen.getByTestId('choices-decision-entry-d_1')
    expect(within(row).getByText(/CCA captain/)).toBeInTheDocument()
    expect(within(row).getByText(/declined/)).toBeInTheDocument()
    // rejected option (stand for it) should appear as a chip
    expect(within(row).getByText(/stand for it/)).toBeInTheDocument()
    expect(within(row).getByText(/Peer acceptance/)).toBeInTheDocument()
  })

  it('patterns rollup with all decisions tagged deliberate shows correct counts and dominant highlight', () => {
    renderView({
      decisions: [
        makeDecision({ id: 'd_1', patternTag: 'deliberate' }),
        makeDecision({ id: 'd_2', patternTag: 'deliberate' }),
        makeDecision({ id: 'd_3', patternTag: 'avoidant' }),
      ],
    })
    expect(screen.getByTestId('choices-patterns-rollup')).toBeInTheDocument()
    expect(screen.getByTestId('choices-patterns-cell-deliberate')).toHaveTextContent('2')
    expect(screen.getByTestId('choices-patterns-cell-avoidant')).toHaveTextContent('1')
    expect(screen.getByTestId('choices-patterns-cell-impulsive')).toHaveTextContent('0')
  })

  it('patterns section shows untagged hint when decisions exist but none are tagged', () => {
    renderView({
      decisions: [makeDecision({ id: 'd_1' }), makeDecision({ id: 'd_2' })],
    })
    expect(screen.getByTestId('choices-patterns-untagged')).toBeInTheDocument()
    expect(screen.queryByTestId('choices-patterns-rollup')).not.toBeInTheDocument()
  })

  it('tagging a decision pattern calls tagDecisionPattern with the chosen tag', async () => {
    const user = userEvent.setup()
    const tagDecisionPattern = vi.fn().mockReturnValue(null)
    renderView({
      decisions: [makeDecision({ id: 'd_1', patternTag: null })],
      actions: makeActions({ tagDecisionPattern }),
    })
    await user.click(screen.getByTestId('choices-decision-tag-d_1-deliberate'))
    expect(tagDecisionPattern).toHaveBeenCalledWith('d_1', 'deliberate')
  })

  it('Add an intention pre-selects the dominant pattern from §2', async () => {
    const user = userEvent.setup()
    const addChangeIntention = vi.fn().mockReturnValue(null)
    renderView({
      decisions: [
        makeDecision({ id: 'd_1', patternTag: 'avoidant' }),
        makeDecision({ id: 'd_2', patternTag: 'avoidant' }),
        makeDecision({ id: 'd_3', patternTag: 'deliberate' }),
      ],
      actions: makeActions({ addChangeIntention }),
    })
    await user.click(screen.getByTestId('choices-intentions-add'))
    const select = screen.getByTestId('choices-intention-form-pattern') as HTMLSelectElement
    expect(select.value).toBe('avoidant')
    await user.type(screen.getByTestId('choices-intention-form-change'), 'Pause before declining')
    await user.click(screen.getByTestId('choices-intention-form-submit'))
    expect(addChangeIntention).toHaveBeenCalledTimes(1)
    expect(addChangeIntention.mock.calls[0]?.[0]).toMatchObject({
      change: 'Pause before declining',
      linkedPatternTag: 'avoidant',
    })
  })

  it('Add an intention with no dominant pattern uses no default', async () => {
    const user = userEvent.setup()
    renderView({
      decisions: [
        makeDecision({ id: 'd_1', patternTag: 'avoidant' }),
        makeDecision({ id: 'd_2', patternTag: 'deliberate' }),
      ],
    })
    await user.click(screen.getByTestId('choices-intentions-add'))
    const select = screen.getByTestId('choices-intention-form-pattern') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('Add an intention with no decisions still works without a pre-select', async () => {
    const user = userEvent.setup()
    const addChangeIntention = vi.fn().mockReturnValue(null)
    renderView({ actions: makeActions({ addChangeIntention }) })
    await user.click(screen.getByTestId('choices-intentions-add'))
    expect((screen.getByTestId('choices-intention-form-pattern') as HTMLSelectElement).value).toBe(
      '',
    )
    await user.type(screen.getByTestId('choices-intention-form-change'), 'Be braver')
    await user.click(screen.getByTestId('choices-intention-form-submit'))
    expect(addChangeIntention).toHaveBeenCalled()
    expect(addChangeIntention.mock.calls[0]?.[0] as object).toMatchObject({
      linkedPatternTag: null,
    })
  })

  it('Log a decision form submits with parsed options + selected forces', async () => {
    const user = userEvent.setup()
    const addDecision = vi.fn().mockReturnValue(null)
    renderView({ actions: makeActions({ addDecision }) })
    await user.click(screen.getByTestId('choices-decisions-add'))
    await user.type(screen.getByTestId('choices-decision-form-decision'), 'Subject combo')
    await user.type(
      screen.getByTestId('choices-decision-form-options'),
      'A levels triple sci, A levels arts',
    )
    await user.type(screen.getByTestId('choices-decision-form-chose'), 'A levels arts')
    await user.type(screen.getByTestId('choices-decision-form-when'), 'end of Sec 4')
    await user.click(screen.getByTestId('choices-decision-form-force-values'))
    await user.click(screen.getByTestId('choices-decision-form-force-family'))
    await user.click(screen.getByTestId('choices-decision-form-submit'))
    expect(addDecision).toHaveBeenCalledTimes(1)
    expect(addDecision.mock.calls[0]?.[0]).toMatchObject({
      decision: 'Subject combo',
      options: ['A levels triple sci', 'A levels arts'],
      chose: 'A levels arts',
      forces: ['values', 'family'],
      when: 'end of Sec 4',
    })
  })

  it('decision with empty forces does not render a forces label', () => {
    renderView({
      decisions: [makeDecision({ id: 'd_1', forces: [] })],
    })
    const row = screen.getByTestId('choices-decision-entry-d_1')
    expect(within(row).queryByText(/forces:/)).not.toBeInTheDocument()
  })
})
