import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProfileSheetView } from '~/components/ProfileSheetView'

describe('ProfileSheetView', () => {
  it('keeps profile dimensions inside the profile sheet', async () => {
    const onOpenSheet = vi.fn()
    render(
      <ProfileSheetView
        authMenu={{ status: 'signed-in', label: 'Demo account', detail: 'demo-a', kind: 'demo' }}
        openSheet="profile"
        onOpenSheet={onOpenSheet}
        sheetPanelId="sheet-1"
      />,
    )

    expect(screen.getByTestId('profile-sheet')).toHaveTextContent('Demo account')
    expect(screen.getByTestId('sheet-trigger-values')).toBeInTheDocument()
    expect(screen.queryByTestId('sheet-trigger-reflections')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-trigger-trajectory')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('sheet-trigger-skills'))
    expect(onOpenSheet).toHaveBeenCalledWith('skills')
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
