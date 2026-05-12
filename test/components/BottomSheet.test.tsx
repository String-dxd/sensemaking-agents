import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '~/components/BottomSheet'

afterEach(() => vi.restoreAllMocks())

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <BottomSheet open={open} onOpenChange={setOpen}>
        <p data-testid="sheet-body">hello</p>
      </BottomSheet>
    </>
  )
}

describe('BottomSheet', () => {
  it('renders content with data-state reflecting the open prop', () => {
    const { rerender } = render(<BottomSheet open={false} onOpenChange={vi.fn()} />)
    expect(screen.getByTestId('bottom-sheet')).toHaveAttribute('data-state', 'closed')
    rerender(
      <BottomSheet open={true} onOpenChange={vi.fn()}>
        <p>content</p>
      </BottomSheet>,
    )
    expect(screen.getByTestId('bottom-sheet')).toHaveAttribute('data-state', 'open')
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('flips the panel transform between translateY(100%) and translateY(0) on open change', () => {
    const { rerender } = render(<BottomSheet open={false} onOpenChange={vi.fn()} />)
    const panelClosed = screen.getByTestId('bottom-sheet-panel')
    expect(panelClosed.style.transform).toBe('translateY(100%)')
    expect(panelClosed.style.transitionDuration).toBe('200ms')
    rerender(<BottomSheet open={true} onOpenChange={vi.fn()} />)
    const panelOpen = screen.getByTestId('bottom-sheet-panel')
    expect(panelOpen.style.transform).toBe('translateY(0)')
  })

  it('clicking the close X invokes onOpenChange(false) exactly once', async () => {
    const onOpenChange = vi.fn()
    render(<BottomSheet open={true} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId('bottom-sheet-close'))
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clicking the backdrop invokes onOpenChange(false) exactly once', async () => {
    const onOpenChange = vi.fn()
    render(<BottomSheet open={true} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('pressing Escape invokes onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(<BottomSheet open={true} onOpenChange={onOpenChange} />)
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('focus lands on the close button when open transitions to true', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('opener'))
    expect(screen.getByTestId('bottom-sheet-close')).toHaveFocus()
  })
})
