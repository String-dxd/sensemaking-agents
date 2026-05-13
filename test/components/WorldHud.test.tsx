import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

  it('voice fallback is disabled during voice mode', () => {
    render(<WorldHud voiceModeActive onVoicePressed={vi.fn()} />)
    expect(screen.getByTestId('voice-button')).toBeDisabled()
  })

  it('renders a supplied capture slot instead of the fallback voice button', () => {
    render(<WorldHud captureSlot={<button type="button">Capture</button>} />)
    expect(screen.getByRole('button', { name: 'Capture' })).toBeInTheDocument()
    expect(screen.queryByTestId('voice-button')).not.toBeInTheDocument()
  })

  it('does not render a chat input or "Only you" indicator', () => {
    render(<WorldHud />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/only you/i)).toBeNull()
  })
})
