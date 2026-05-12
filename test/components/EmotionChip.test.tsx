import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  EmotionChip,
  EmotionConnector,
  emotionConnectorVerdict,
} from '~/components/EmotionChip'

describe('EmotionChip', () => {
  it('renders the inferred variant with "Mirror sensed" eyebrow', () => {
    render(<EmotionChip mood="sadness" variant="inferred" />)
    const chip = screen.getByTestId('emotion-chip-inferred')
    expect(chip).toHaveAttribute('data-mood', 'sadness')
    expect(chip).toHaveTextContent(/Mirror sensed/i)
    expect(chip).toHaveTextContent(/Sadness/)
  })

  it('renders the user variant with "You felt" eyebrow', () => {
    render(<EmotionChip mood="joy" variant="user" />)
    const chip = screen.getByTestId('emotion-chip-user')
    expect(chip).toHaveTextContent(/You felt/i)
    expect(chip).toHaveTextContent(/Joy/)
  })

  it('renders a clickable button variant when asButton is true', async () => {
    const onClick = vi.fn()
    render(<EmotionChip mood="anxiety" variant="user" asButton onClick={onClick} />)
    await userEvent.click(screen.getByTestId('emotion-chip-user'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('emotionConnectorVerdict', () => {
  it('returns same when both moods are equal', () => {
    expect(emotionConnectorVerdict('joy', 'joy')).toBe('same')
  })
  it('returns aligned for neighbor-group pairs (sadness ↔ ennui)', () => {
    expect(emotionConnectorVerdict('sadness', 'ennui')).toBe('aligned')
    expect(emotionConnectorVerdict('fear', 'anxiety')).toBe('aligned')
  })
  it('returns different for distant pairs', () => {
    expect(emotionConnectorVerdict('joy', 'anger')).toBe('different')
  })
})

describe('EmotionConnector', () => {
  it('renders the verdict copy', () => {
    const { rerender } = render(<EmotionConnector inferred="joy" user="joy" />)
    expect(screen.getByTestId('emotion-connector')).toHaveAttribute('data-verdict', 'same')
    rerender(<EmotionConnector inferred="sadness" user="ennui" />)
    expect(screen.getByTestId('emotion-connector')).toHaveAttribute('data-verdict', 'aligned')
    rerender(<EmotionConnector inferred="joy" user="anger" />)
    expect(screen.getByTestId('emotion-connector')).toHaveAttribute('data-verdict', 'different')
  })
})
