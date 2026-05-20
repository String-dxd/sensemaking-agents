/**
 * RelationshipsPageView — component coverage for U2 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 *
 * The view is presentational: state is passed in, mutations are dispatched
 * through `actions`. This test mocks actions so we can verify exactly what
 * the form submits without touching the engine slice.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  type BelongingEntry,
  type OutsidePerspectiveEntry,
  type RelationshipMapEntry,
  type RelationshipsActions,
  RelationshipsPageView,
  type VipsSelfSideClaim,
} from '~/components/RelationshipsPageView'

function makeActions(overrides: Partial<RelationshipsActions> = {}): RelationshipsActions {
  return {
    addPerson: vi.fn().mockReturnValue(null),
    removePerson: vi.fn().mockReturnValue(null),
    addBelonging: vi.fn().mockReturnValue(null),
    removeBelonging: vi.fn().mockReturnValue(null),
    addPerspective: vi.fn().mockReturnValue(null),
    removePerspective: vi.fn().mockReturnValue(null),
    ...overrides,
  }
}

function renderView(overrides: {
  map?: RelationshipMapEntry[]
  belonging?: BelongingEntry[]
  perspectives?: OutsidePerspectiveEntry[]
  selfSide?: VipsSelfSideClaim[]
  actions?: RelationshipsActions
}) {
  const actions = overrides.actions ?? makeActions()
  render(
    <RelationshipsPageView
      map={overrides.map ?? []}
      belonging={overrides.belonging ?? []}
      perspectives={overrides.perspectives ?? []}
      selfSide={overrides.selfSide}
      actions={actions}
    />,
  )
  return { actions }
}

describe('RelationshipsPageView', () => {
  it('renders three sections with empty states when no data is present', () => {
    renderView({})
    expect(screen.getByTestId('relationships-page')).toBeInTheDocument()
    expect(screen.getByTestId('relationships-section-map')).toBeInTheDocument()
    expect(screen.getByTestId('relationships-section-belonging')).toBeInTheDocument()
    expect(screen.getByTestId('relationships-section-perspectives')).toBeInTheDocument()
    expect(screen.getByTestId('relationships-map-empty')).toBeInTheDocument()
    expect(screen.getByTestId('relationships-belonging-empty')).toBeInTheDocument()
    expect(screen.getByTestId('relationships-perspectives-empty')).toBeInTheDocument()
  })

  it('renders a relationship-map entry with name, category, and quality', () => {
    renderView({
      map: [
        {
          id: 'rel_a',
          createdAt: new Date('2026-05-10').toISOString(),
          name: 'Ms Tan',
          category: 'teacher',
          quality: 'rely-on',
          note: null,
        },
      ],
    })
    const row = screen.getByTestId('relationships-map-entry-rel_a')
    expect(within(row).getByText('Ms Tan')).toBeInTheDocument()
    expect(within(row).getByText('Teacher')).toBeInTheDocument()
    expect(within(row).getByText('I rely on them')).toBeInTheDocument()
  })

  it('renders a belonging entry with group + level pill', () => {
    renderView({
      belonging: [
        {
          id: 'b_1',
          createdAt: new Date('2026-05-10').toISOString(),
          groupKind: 'cca',
          groupName: 'Robotics',
          belongLevel: 'belong',
          note: null,
        },
      ],
    })
    const row = screen.getByTestId('relationships-belonging-entry-b_1')
    expect(within(row).getByText('Robotics')).toBeInTheDocument()
    expect(within(row).getByText('Belong')).toBeInTheDocument()
  })

  it('renders a perspective entry with observation + agreement', () => {
    renderView({
      perspectives: [
        {
          id: 'p_1',
          createdAt: new Date('2026-05-10').toISOString(),
          source: 'peer',
          sourceLabel: 'Aiden',
          observation: 'You explain things calmly',
          vipsDimensionRef: 'skills',
          agreementSelf: 'differs',
        },
      ],
    })
    expect(screen.getByText(/You explain things calmly/)).toBeInTheDocument()
    expect(screen.getByText(/Differs from how I see myself/)).toBeInTheDocument()
    expect(screen.getByText(/Peer — Aiden/)).toBeInTheDocument()
  })

  it('self-side column renders placeholder when no VIPS data is present', () => {
    renderView({})
    expect(screen.getByTestId('relationships-perspectives-self-side')).toHaveTextContent(
      /No VIPS signal yet/i,
    )
  })

  it('self-side column renders one card per VIPS dimension when data is present', () => {
    renderView({
      selfSide: [
        { dimension: 'values', topClaimLabel: 'Contribution' },
        { dimension: 'interests', topClaimLabel: 'Social' },
        { dimension: 'personality', topClaimLabel: 'Extraversion' },
        { dimension: 'skills', topClaimLabel: 'Communication' },
      ],
    })
    expect(screen.getByTestId('relationships-self-side-values')).toHaveTextContent('Contribution')
    expect(screen.getByTestId('relationships-self-side-interests')).toHaveTextContent('Social')
    expect(screen.getByTestId('relationships-self-side-personality')).toHaveTextContent(
      'Extraversion',
    )
    expect(screen.getByTestId('relationships-self-side-skills')).toHaveTextContent('Communication')
  })

  it('Add a person → fill form → Save calls addPerson with the right payload', async () => {
    const user = userEvent.setup()
    const addPerson = vi.fn().mockReturnValue(null)
    const { actions } = renderView({ actions: makeActions({ addPerson }) })

    await user.click(screen.getByTestId('relationships-map-add'))
    await user.type(screen.getByTestId('relationships-map-form-name'), 'Mum')
    await user.selectOptions(screen.getByTestId('relationships-map-form-category'), 'family')
    await user.selectOptions(screen.getByTestId('relationships-map-form-quality'), 'mutual')
    await user.click(screen.getByTestId('relationships-map-form-submit'))

    expect(addPerson).toHaveBeenCalledTimes(1)
    expect(addPerson.mock.calls[0]?.[0]).toMatchObject({
      name: 'Mum',
      category: 'family',
      quality: 'mutual',
    })
    // Save closes the form
    expect(screen.queryByTestId('relationships-map-form')).not.toBeInTheDocument()
    void actions
  })

  it('Save is disabled until name is non-empty', async () => {
    const user = userEvent.setup()
    renderView({})
    await user.click(screen.getByTestId('relationships-map-add'))
    expect(screen.getByTestId('relationships-map-form-submit')).toBeDisabled()
    await user.type(screen.getByTestId('relationships-map-form-name'), 'A')
    expect(screen.getByTestId('relationships-map-form-submit')).not.toBeDisabled()
  })

  it('remove button calls removePerson with the entry id', async () => {
    const user = userEvent.setup()
    const removePerson = vi.fn().mockReturnValue('rel_a')
    renderView({
      map: [
        {
          id: 'rel_a',
          createdAt: new Date().toISOString(),
          name: 'A',
          category: 'family',
          quality: null,
          note: null,
        },
      ],
      actions: makeActions({ removePerson }),
    })
    await user.click(screen.getByTestId('relationships-map-remove-rel_a'))
    expect(removePerson).toHaveBeenCalledWith('rel_a')
  })
})
