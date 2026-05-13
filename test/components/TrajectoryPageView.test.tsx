import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CartographerPathwayDraft } from '~/agents/schemas'
import { TrajectoryPageView } from '~/components/TrajectoryPageView'

const pathways: CartographerPathwayDraft[] = [
  {
    label: 'Operational coach',
    trait_combination: [
      { claim_id: 'values.contribution', dimension: 'values', timeline_entry_id: 1 },
      { claim_id: 'skills.communication', dimension: 'skills', timeline_entry_id: 2 },
    ],
    ecg_region_tags: ['cluster.education'],
    risks_tradeoffs: 'May over-index on helping before checking capacity.',
    exploration_prompt: 'Ask a CCA teacher what coaching looks like week to week.',
  },
  {
    label: 'Applied builder',
    trait_combination: [{ claim_id: 'interests.realistic', dimension: 'interests' }],
    ecg_region_tags: ['cluster.engineering'],
    risks_tradeoffs: 'Hands-on work may still require long written documentation.',
    exploration_prompt: 'Shadow a poly project team or lab session.',
  },
]

describe('TrajectoryPageView', () => {
  it('renders pathway data as compass bearings plus existing cards', () => {
    render(
      <TrajectoryPageView
        trajectoryParagraph="Three bearings are worth following."
        pathways={pathways}
        openQuestions={['Which environment keeps this sustainable?']}
        disclaimer="Use this as a conversation starter."
      />,
    )

    expect(screen.getByTestId('trajectory-compass')).toBeInTheDocument()
    expect(screen.getByTestId('compass-bearing-operational-coach')).toHaveAttribute(
      'href',
      '#pathway-operational-coach',
    )
    expect(screen.getByTestId('pathway-card-operational-coach')).toBeInTheDocument()
    expect(screen.getByTestId('trait-chip-values.contribution')).toHaveAttribute(
      'href',
      '/library/values#entry-1',
    )
    expect(screen.getByTestId('trajectory-open-questions')).toHaveTextContent(/sustainable/i)
  })
})
