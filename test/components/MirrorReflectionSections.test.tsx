import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  MirrorEvalReviewBadge,
  MirrorEvalReviewPanel,
  parseMirrorEvalReview,
} from '~/components/MirrorEvalReview'
import { MirrorReflectionSections } from '~/components/MirrorReflectionSections'
import { MOCK_MIRROR_ENTRY } from '~/lib/wiki-mocks'

const REVIEW = {
  verdict: 'fail',
  risk_level: 'high',
  critique: 'This draft overclaims a stable trait from one moment.',
  findings: [
    {
      category: 'sycophancy',
      severity: 'high',
      issue: 'The wording flatters the student.',
      recommendation: 'Anchor the claim to the exact quote.',
    },
  ],
  suggestions: ['Reduce certainty.'],
  confidence: 'medium',
} as const

describe('Mirror reflection presentation', () => {
  it('renders validation, inferred meaning, and story reframe as distinct sections', () => {
    render(<MirrorReflectionSections entry={MOCK_MIRROR_ENTRY} />)

    expect(screen.getByTestId('mirror-section-validation')).toHaveTextContent('Validation')
    expect(screen.getByTestId('mirror-section-validation')).toHaveTextContent(
      MOCK_MIRROR_ENTRY.validation,
    )
    expect(screen.getByTestId('mirror-section-inferred_meaning')).toHaveTextContent(
      'Inferred meaning',
    )
    expect(screen.getByTestId('mirror-section-inferred_meaning')).toHaveTextContent(
      MOCK_MIRROR_ENTRY.inferred_meaning,
    )
    expect(screen.getByTestId('mirror-section-story_reframe')).toHaveTextContent('Story reframe')
    expect(screen.getByTestId('mirror-section-story_reframe')).toHaveTextContent(
      MOCK_MIRROR_ENTRY.story_reframe,
    )
  })

  it('parses and displays self-critique metadata from mirror raw output', () => {
    const review = parseMirrorEvalReview(
      JSON.stringify({
        validation: 'v',
        inferred_meaning: 'm',
        story_reframe: 's',
        eval_review: REVIEW,
      }),
    )

    expect(review).toMatchObject(REVIEW)

    render(
      <>
        <MirrorEvalReviewBadge review={review} />
        <MirrorEvalReviewPanel review={review} />
      </>,
    )

    expect(screen.getByTestId('mirror-eval-badge')).toHaveTextContent('self-critique: fail/high')
    expect(screen.getByTestId('mirror-eval-metadata')).toHaveTextContent('This draft overclaims')
    expect(screen.getByTestId('mirror-eval-metadata')).toHaveTextContent('Reduce certainty.')
  })

  it('shows an empty metadata state for older mirror entries', () => {
    render(<MirrorEvalReviewPanel review={null} showEmpty />)

    expect(screen.getByTestId('mirror-eval-metadata')).toHaveTextContent(
      'No self-critique review was recorded',
    )
  })
})
