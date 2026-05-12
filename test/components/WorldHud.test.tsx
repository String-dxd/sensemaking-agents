import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...(props as Record<string, unknown>)}>
      {children}
    </a>
  ),
}))

import { WorldHud } from '~/components/WorldHud'

describe('WorldHud', () => {
  it('does not render the studio pill (removed)', () => {
    render(<WorldHud />)
    expect(screen.queryByTestId('studio-pill')).toBeNull()
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
    // Capture the click event at the document level so we can assert that
    // WorldHud's onClick called preventDefault — otherwise this test would
    // have asserted nothing about the click-blocking behavior.
    let captured: MouseEvent | null = null
    const handler = (e: Event) => {
      captured = e as MouseEvent
    }
    document.addEventListener('click', handler, true)
    try {
      await userEvent.click(link)
    } finally {
      document.removeEventListener('click', handler, true)
    }
    expect(captured).not.toBeNull()
    expect((captured as unknown as MouseEvent).defaultPrevented).toBe(true)
  })

  it('does not render a chat input or "Only you" indicator', () => {
    render(<WorldHud />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/only you/i)).toBeNull()
  })
})
