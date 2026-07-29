import { render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '~/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog'
import { PortalContainerProvider } from '~/components/ui/portal-container'

describe('PortalContainerProvider', () => {
  it('keeps dialog content in the document body by default', () => {
    const renderRoot = document.createElement('div')
    document.body.append(renderRoot)

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Default dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
      { container: renderRoot },
    )

    const dialog = screen.getByRole('dialog', { name: 'Default dialog' })
    expect(document.body.contains(dialog)).toBe(true)
    expect(renderRoot.contains(dialog)).toBe(false)
  })

  it('mounts dialog content in a provided element', () => {
    const portalHost = document.createElement('div')
    document.body.append(portalHost)

    render(
      <PortalContainerProvider container={portalHost}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Protected dialog</DialogTitle>
          </DialogContent>
        </Dialog>
      </PortalContainerProvider>,
    )

    expect(within(portalHost).getByRole('dialog', { name: 'Protected dialog' })).toBeInTheDocument()
  })

  it('mounts alert dialog content in a provided ref', () => {
    const portalHost = document.createElement('div')
    document.body.append(portalHost)
    const portalHostRef = createRef<HTMLElement | ShadowRoot | null>()
    portalHostRef.current = portalHost

    render(
      <PortalContainerProvider container={portalHostRef}>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Protected alert</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      </PortalContainerProvider>,
    )

    expect(
      within(portalHost).getByRole('alertdialog', { name: 'Protected alert' }),
    ).toBeInTheDocument()
  })
})
