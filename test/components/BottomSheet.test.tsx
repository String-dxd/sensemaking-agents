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
  it('renders panel contents only when open', () => {
    const { rerender } = render(<BottomSheet open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByTestId('bottom-sheet-panel')).toBeNull()
    rerender(
      <BottomSheet open={true} onOpenChange={vi.fn()}>
        <p>content</p>
      </BottomSheet>,
    )
    expect(screen.getByTestId('bottom-sheet-panel')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('clicking the close button invokes onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(<BottomSheet open={true} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId('drawer-close'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clicking the backdrop invokes onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(<BottomSheet open={true} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId('drawer-overlay'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('pressing Escape invokes onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(<BottomSheet open={true} onOpenChange={onOpenChange} />)
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens via parent state change', async () => {
    render(<Harness />)
    expect(screen.queryByTestId('bottom-sheet-panel')).toBeNull()
    await userEvent.click(screen.getByText('opener'))
    expect(screen.getByTestId('bottom-sheet-panel')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument()
  })

  it('can remove drawer padding for full-bleed sheet surfaces', () => {
    render(
      <BottomSheet open={true} onOpenChange={vi.fn()} fullBleed>
        <p>edge content</p>
      </BottomSheet>,
    )

    expect(screen.getByTestId('bottom-sheet-panel')).toHaveClass('p-0', 'sm:p-0')
  })
})
