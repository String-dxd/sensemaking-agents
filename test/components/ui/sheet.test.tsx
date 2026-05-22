import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetSidenav,
  SheetSurface,
  SheetTitle,
} from '~/components/ui/sheet'

afterEach(() => vi.restoreAllMocks())

function Harness({
  initialOpen = true,
  showClose = false,
}: {
  initialOpen?: boolean
  showClose?: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <SheetSurface showClose={showClose}>
          <SheetSidebar>
            <SheetIdentityHeader>identity</SheetIdentityHeader>
            <SheetSidenav>nav</SheetSidenav>
          </SheetSidebar>
          <SheetContent>
            <SheetPageHeader>
              <SheetTitle>Hello</SheetTitle>
            </SheetPageHeader>
            <SheetBody>
              <p>body content</p>
            </SheetBody>
          </SheetContent>
        </SheetSurface>
      </Sheet>
    </>
  )
}

describe('Sheet primitive', () => {
  it('renders the split-pane surface when open', () => {
    render(<Harness />)
    expect(screen.getByTestId('sheet-surface')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-page-header')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('body content')).toBeInTheDocument()
  })

  it('does not render the surface when closed', () => {
    render(<Harness initialOpen={false} />)
    expect(screen.queryByTestId('sheet-surface')).toBeNull()
  })

  it('does NOT render the × close button by default', () => {
    render(<Harness />)
    expect(screen.queryByTestId('sheet-close')).toBeNull()
  })

  it('renders the × close button when showClose is set', () => {
    render(<Harness showClose />)
    expect(screen.getByTestId('sheet-close')).toBeInTheDocument()
  })

  it('clicking the × invokes onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open={true} onOpenChange={onOpenChange} modal={false}>
        <SheetSurface showClose>
          <SheetContent>
            <SheetBody>x</SheetBody>
          </SheetContent>
        </SheetSurface>
      </Sheet>,
    )
    await userEvent.click(screen.getByTestId('sheet-close'))
    expect(onOpenChange).toHaveBeenCalled()
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })

  it('pressing Escape invokes onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open={true} onOpenChange={onOpenChange} modal={false}>
        <SheetSurface>
          <SheetContent>
            <SheetBody>x</SheetBody>
          </SheetContent>
        </SheetSurface>
      </Sheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalled()
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })
})
