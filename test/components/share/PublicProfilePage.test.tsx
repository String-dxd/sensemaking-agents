import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PublicProfilePage } from '~/components/share/PublicProfilePage'
import { NotFoundShareCard, RevokedShareCard } from '~/components/share/RevokedShareCard'
import type { PublicProfileBody } from '~/server/load-public-profile.handler.server'

function makeProfile(overrides: Partial<PublicProfileBody> = {}): PublicProfileBody {
  return {
    nameSnapshot: 'Alice Lin',
    showQuotes: false,
    lastSyncedAt: '2026-05-18T08:00:00Z',
    dimensions: [
      {
        dimension: 'values',
        compiledTruth: 'You keep coming back to learning out loud.',
        openQuestion: 'What makes a moment of learning feel finished to you?',
        updatedAt: '2026-05-18T08:00:00Z',
        claimCount: 2,
        recentEntries: [
          {
            id: 1,
            canonicalLabel: 'Learning',
            quote: 'I read past the syllabus because I wanted to.',
            strength: 'medium',
            committedAt: '2026-05-17T08:00:00Z',
          },
        ],
      },
      {
        dimension: 'interests',
        compiledTruth: '',
        openQuestion: '',
        updatedAt: null,
        claimCount: 0,
        recentEntries: [],
      },
      {
        dimension: 'personality',
        compiledTruth: 'You energise the room.',
        openQuestion: '',
        updatedAt: '2026-05-18T08:00:00Z',
        claimCount: 1,
        recentEntries: [],
      },
      {
        dimension: 'skills',
        compiledTruth: '',
        openQuestion: '',
        updatedAt: null,
        claimCount: 0,
        recentEntries: [],
      },
    ],
    ...overrides,
  }
}

describe('PublicProfilePage', () => {
  it('renders the name snapshot, dimensions, and last-synced timestamp', () => {
    render(<PublicProfilePage profile={makeProfile()} isOwner={false} />)
    expect(screen.getByText('Alice Lin')).toBeInTheDocument()
    expect(screen.getByText(/last synced 18 May 2026/)).toBeInTheDocument()
    expect(screen.getByText('You keep coming back to learning out loud.')).toBeInTheDocument()
  })

  it('renders viewer-addressed empty-state copy for dimensions with no compiled truth', () => {
    render(<PublicProfilePage profile={makeProfile()} isOwner={false} />)
    const empty = screen.getAllByTestId('share-empty-dimension')
    expect(empty.length).toBeGreaterThan(0)
    const first = empty[0]
    // Empty copy addresses the viewer ("{name} hasn't surfaced..."), not the student.
    expect(first?.textContent).toMatch(/Alice Lin hasn['’]t surfaced any/)
  })

  it('hides verbatim quotes when showQuotes is false', () => {
    render(<PublicProfilePage profile={makeProfile()} isOwner={false} />)
    expect(screen.queryByText(/I read past the syllabus/)).not.toBeInTheDocument()
    // The canonical-claim chip still appears, even without the quote.
    expect(screen.getAllByText('Learning')[0]).toBeInTheDocument()
  })

  it('renders the verbatim quote when showQuotes is true', () => {
    render(<PublicProfilePage profile={makeProfile({ showQuotes: true })} isOwner={false} />)
    expect(screen.getByText(/I read past the syllabus/)).toBeInTheDocument()
  })

  it('renders the owner preview banner only when isOwner is true', () => {
    const { rerender } = render(<PublicProfilePage profile={makeProfile()} isOwner={false} />)
    expect(screen.queryByTestId('owner-preview-banner')).not.toBeInTheDocument()
    rerender(<PublicProfilePage profile={makeProfile()} isOwner={true} />)
    expect(screen.getByTestId('owner-preview-banner')).toBeInTheDocument()
  })
})

describe('Terminal share cards', () => {
  it('RevokedShareCard renders the revoked terminal state', () => {
    render(<RevokedShareCard />)
    expect(screen.getByTestId('share-revoked-card')).toBeInTheDocument()
    expect(screen.getByText(/no longer active/i)).toBeInTheDocument()
  })

  it('NotFoundShareCard renders the not-found terminal state', () => {
    render(<NotFoundShareCard />)
    expect(screen.getByTestId('share-not-found-card')).toBeInTheDocument()
    expect(screen.getByText(/couldn['’]t find/i)).toBeInTheDocument()
  })
})
