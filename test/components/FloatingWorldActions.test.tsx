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

import { FloatingWorldActions } from '~/components/FloatingWorldActions'

describe('FloatingWorldActions', () => {
  it('renders sparse world navigation links', () => {
    render(<FloatingWorldActions />)
    expect(screen.getByTestId('floating-action-library')).toHaveAttribute('href', '/library')
    expect(screen.getByTestId('floating-action-compass')).toHaveAttribute(
      'href',
      '/library/trajectory',
    )
    expect(screen.getByTestId('floating-action-profile')).toHaveAttribute('href', '/me')
  })

  it('blocks navigation while voice mode is active', async () => {
    render(<FloatingWorldActions voiceModeActive />)
    const link = screen.getByTestId('floating-action-compass')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    let captured: MouseEvent | null = null
    const handler = (event: Event) => {
      captured = event as MouseEvent
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
})
