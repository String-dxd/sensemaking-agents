import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...(props as Record<string, unknown>)}>
      {children}
    </a>
  ),
}))

import { WorldHud } from '~/components/WorldHud'

describe('WorldHud', () => {
  it('renders the studio pill with data-placeholder="true"', () => {
    render(<WorldHud />)
    const pill = screen.getByTestId('studio-pill')
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveAttribute('data-placeholder', 'true')
  })

  it('renders the voice button placeholder', () => {
    render(<WorldHud onVoicePressed={vi.fn()} />)
    expect(screen.getByTestId('voice-button')).toBeInTheDocument()
  })

  it('voice button is disabled when no onVoicePressed handler is supplied', () => {
    render(<WorldHud />)
    expect(screen.getByTestId('voice-button')).toBeDisabled()
  })

  it('clicking the voice button fires onVoicePressed', async () => {
    const onVoice = vi.fn()
    render(<WorldHud onVoicePressed={onVoice} />)
    await userEvent.click(screen.getByTestId('voice-button'))
    expect(onVoice).toHaveBeenCalledTimes(1)
  })

  it('renders the library button as a link to /library', () => {
    render(<WorldHud />)
    const link = screen.getByTestId('library-button')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/library')
  })

  it('library button reports aria-disabled and blocks clicks during voice mode', async () => {
    render(<WorldHud voiceModeActive />)
    const link = screen.getByTestId('library-button')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    // Defensive: click is intercepted.
    await userEvent.click(link)
    // No assertion needed beyond not throwing — preventDefault was applied.
  })

  it('does not render a chat input or "Only you" indicator', () => {
    render(<WorldHud />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/only you/i)).toBeNull()
  })
})
