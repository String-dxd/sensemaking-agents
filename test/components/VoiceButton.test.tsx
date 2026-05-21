import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VoiceButton } from '~/components/VoiceButton'

describe('VoiceButton', () => {
  it('renders the mic icon and "Start voice" label in idle phase', () => {
    render(<VoiceButton phase="idle" onPress={vi.fn()} />)
    const btn = screen.getByTestId('voice-button')
    expect(btn).toHaveAttribute('aria-label', 'Start voice')
    expect(btn).toHaveAttribute('data-phase', 'idle')
    expect(btn).not.toBeDisabled()
  })

  it('renders the stop icon, "Stop recording" label, and a volume halo in recording phase', () => {
    render(<VoiceButton phase="recording" amplitude={0.5} onPress={vi.fn()} />)
    expect(screen.getByTestId('voice-button')).toHaveAttribute('aria-label', 'Stop recording')
    const halo = screen.getByTestId('voice-button-halo')
    expect(halo).toBeInTheDocument()
    // 1 + 0.5 * 0.18 = 1.09
    expect(halo.style.transform).toBe('scale(1.09)')
  })

  it('scales halo with amplitude', () => {
    const { rerender } = render(<VoiceButton phase="recording" amplitude={0} onPress={vi.fn()} />)
    expect(screen.getByTestId('voice-button-halo').style.transform).toBe('scale(1)')
    rerender(<VoiceButton phase="recording" amplitude={1} onPress={vi.fn()} />)
    expect(screen.getByTestId('voice-button-halo').style.transform).toBe('scale(1.18)')
  })

  it('is disabled in working phase', () => {
    render(<VoiceButton phase="working" onPress={vi.fn()} />)
    expect(screen.getByTestId('voice-button')).toBeDisabled()
  })

  it('is disabled when no onPress handler is supplied', () => {
    render(<VoiceButton phase="idle" />)
    expect(screen.getByTestId('voice-button')).toBeDisabled()
  })

  it('clicking fires onPress (idle and recording)', async () => {
    const onPress = vi.fn()
    const { rerender } = render(<VoiceButton phase="idle" onPress={onPress} />)
    await userEvent.click(screen.getByTestId('voice-button'))
    rerender(<VoiceButton phase="recording" onPress={onPress} />)
    await userEvent.click(screen.getByTestId('voice-button'))
    expect(onPress).toHaveBeenCalledTimes(2)
  })
})
