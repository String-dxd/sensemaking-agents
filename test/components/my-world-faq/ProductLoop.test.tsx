import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductLoop } from '~/components/my-world-faq/ProductLoop'

describe('ProductLoop media controls', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('plays only after a user action and offers pause and replay controls', async () => {
    const user = userEvent.setup()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    render(<ProductLoop />)

    const video = screen.getByTestId('faq-product-video')
    expect(video).not.toHaveAttribute('autoplay')
    expect(play).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Play Capture clip' }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Pause Capture clip' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause Capture clip' }))
    expect(pause).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Resume Capture clip' })).toBeInTheDocument()

    fireEvent.ended(video)
    await user.click(screen.getByRole('button', { name: 'Replay Capture clip' }))
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('pauses the previous clip and leaves only the selected clip mounted', async () => {
    const user = userEvent.setup()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    render(<ProductLoop />)

    await user.click(screen.getByRole('tab', { name: 'History' }))

    expect(pause).toHaveBeenCalledTimes(1)
    expect(screen.getAllByTestId('faq-product-video')).toHaveLength(1)
    expect(screen.getByTestId('faq-product-video')).toHaveAttribute(
      'src',
      '/my-world-faq/product/history-desktop.webm',
    )
    expect(screen.getByRole('button', { name: 'Play History clip' })).toBeInTheDocument()
  })
})
