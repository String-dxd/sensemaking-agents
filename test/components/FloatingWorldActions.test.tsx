import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FloatingWorldActions } from '~/components/FloatingWorldActions'

describe('FloatingWorldActions', () => {
  it('renders sparse world navigation controls', async () => {
    const onOpenProfile = vi.fn()
    const onOpenTrajectory = vi.fn()
    render(
      <FloatingWorldActions
        showAgentDebug
        onOpenProfile={onOpenProfile}
        onOpenTrajectory={onOpenTrajectory}
      />,
    )
    expect(screen.getByTestId('floating-agent-debug-trigger')).toHaveAccessibleName(
      'Open agent debug',
    )
    await userEvent.click(screen.getByTestId('floating-agent-debug-trigger'))
    expect(screen.getByTestId('floating-agent-debug-menu')).toHaveTextContent('Mirror')
    expect(screen.getByTestId('floating-action-profile')).toHaveAccessibleName('Open profile')
    expect(screen.queryByTestId('floating-action-library')).not.toBeInTheDocument()
    expect(screen.getByTestId('floating-action-compass')).toHaveAccessibleName(
      'Open trajectory compass',
    )
    await userEvent.click(screen.getByTestId('floating-action-compass'))
    expect(onOpenTrajectory).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId('floating-action-profile'))
    expect(onOpenProfile).toHaveBeenCalledTimes(1)
  })

  it('uses signed-in profile details for the profile trigger', async () => {
    render(
      <FloatingWorldActions
        authMenu={{ status: 'signed-in', label: 'Demo account', detail: 'demo-a', kind: 'demo' }}
      />,
    )
    expect(screen.getByTestId('floating-action-profile')).toHaveAttribute('title', 'Demo account')
  })

  it('blocks profile navigation while voice mode is active', async () => {
    const onOpenProfile = vi.fn()
    const onOpenTrajectory = vi.fn()
    render(
      <FloatingWorldActions
        onOpenProfile={onOpenProfile}
        onOpenTrajectory={onOpenTrajectory}
        voiceModeActive
      />,
    )
    const profileButton = screen.getByTestId('floating-action-profile')
    const compassButton = screen.getByTestId('floating-action-compass')
    expect(profileButton).toBeDisabled()
    expect(compassButton).toBeDisabled()
    await userEvent.click(profileButton)
    await userEvent.click(compassButton)
    expect(onOpenProfile).not.toHaveBeenCalled()
    expect(onOpenTrajectory).not.toHaveBeenCalled()
  })
})
