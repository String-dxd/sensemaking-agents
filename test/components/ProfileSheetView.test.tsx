import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProfileSheetView } from '~/components/ProfileSheetView'

describe('ProfileSheetView', () => {
  it('uses the Student Space profile IA with identity, tabs, and active page summary', async () => {
    const onOpenSheet = vi.fn()
    render(
      <ProfileSheetView
        authMenu={{ status: 'signed-in', label: 'Demo account', detail: 'demo-a', kind: 'demo' }}
        openSheet="profile"
        onOpenSheet={onOpenSheet}
        pageOverviews={[
          {
            dimension: 'values',
            compiledTruth: 'You keep returning to dignity, trust, and careful help.',
            claimCount: 3,
            updatedAt: '2026-05-14T07:00:00.000Z',
          },
          {
            dimension: 'interests',
            compiledTruth: '',
            claimCount: 0,
            updatedAt: null,
          },
          {
            dimension: 'personality',
            compiledTruth: 'You notice emotional temperature quickly.',
            claimCount: 2,
            updatedAt: '2026-05-14T07:00:00.000Z',
          },
          {
            dimension: 'skills',
            compiledTruth: 'You can turn ambiguous material into working systems.',
            claimCount: 4,
            updatedAt: '2026-05-14T07:00:00.000Z',
          },
        ]}
        sheetPanelId="sheet-1"
      />,
    )

    expect(screen.getByTestId('profile-sheet')).toHaveTextContent('Student')
    expect(screen.getByTestId('profile-sheet')).toHaveTextContent('Sec 3B')
    expect(screen.getByTestId('profile-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('profile-tab-values')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('What you keep coming back to')).toBeInTheDocument()
    expect(screen.getByTestId('profile-active-summary')).toHaveTextContent(
      'You keep returning to dignity',
    )
    expect(screen.queryByTestId('sheet-trigger-reflections')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-trigger-trajectory')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('profile-tab-skills'))
    expect(onOpenSheet).toHaveBeenCalledWith('skills')

    await userEvent.click(screen.getByTestId('profile-open-library'))
    expect(onOpenSheet).toHaveBeenCalledWith('reflections')

    await userEvent.click(screen.getByTestId('profile-open-active-values'))
    expect(onOpenSheet).toHaveBeenCalledWith('values')
    const signOutButton = screen.getByRole('button', { name: 'sign out' })
    expect(signOutButton).toHaveAttribute('type', 'submit')
    expect(signOutButton.closest('form')).toHaveAttribute('action', '/api/auth/sign-out')
    expect(signOutButton.closest('form')).toHaveAttribute('method', 'post')
  })

  it('shows signed-out account actions in the sheet', () => {
    render(<ProfileSheetView openSheet="profile" onOpenSheet={vi.fn()} sheetPanelId="sheet-1" />)

    expect(screen.getByRole('link', { name: 'sign in' })).toHaveAttribute(
      'href',
      '/api/auth/sign-in?returnPathname=%2F%3Fsheet%3Dprofile',
    )
    expect(screen.getByRole('button', { name: 'use demo account' })).toBeInTheDocument()
  })
})
