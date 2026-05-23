import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PageCloseButton,
  PageSurface,
  SheetBody,
  SheetContent,
  SheetIdentityHeader,
  SheetPageHeader,
  SheetSidebar,
  SheetSidenav,
  SheetTitle,
  usePageEscape,
} from '~/components/ui/sheet'

afterEach(() => vi.restoreAllMocks())

function Harness({
  onClose = () => {},
  showClose = false,
}: {
  onClose?: () => void
  showClose?: boolean
}) {
  usePageEscape(onClose)
  return (
    <PageSurface>
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
      {showClose ? <PageCloseButton onClick={onClose} /> : null}
    </PageSurface>
  )
}

describe('PageSurface primitive', () => {
  it('renders the split-pane surface', () => {
    render(<Harness />)
    expect(screen.getByTestId('page-surface')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-page-header')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('body content')).toBeInTheDocument()
  })

  it('does NOT render the × close button by default', () => {
    render(<Harness />)
    expect(screen.queryByTestId('page-close')).toBeNull()
  })

  it('renders the × close button when PageCloseButton is included', () => {
    render(<Harness showClose />)
    expect(screen.getByTestId('page-close')).toBeInTheDocument()
  })

  it('clicking the × invokes onClose', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} showClose />)
    await userEvent.click(screen.getByTestId('page-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pressing Escape invokes usePageEscape callback', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
