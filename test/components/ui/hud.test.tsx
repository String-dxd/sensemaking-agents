import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hud } from '~/components/ui/hud'

describe('Hud primitive', () => {
  it('renders with default top-right dock and role=status', () => {
    render(<Hud>content</Hud>)
    const hud = screen.getByTestId('hud')
    expect(hud).toBeInTheDocument()
    expect(hud.getAttribute('data-dock')).toBe('top-right')
    expect(hud.getAttribute('role')).toBe('status')
    expect(hud.getAttribute('aria-live')).toBe('polite')
  })

  it.each([
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ] as const)('positions with dock=%s', (dock) => {
    render(<Hud dock={dock}>x</Hud>)
    const hud = screen.getByTestId('hud')
    expect(hud.getAttribute('data-dock')).toBe(dock)
  })

  it('omits role when role={null} is passed', () => {
    // role={null} is the documented opt-out for decorative HUDs.
    // biome-ignore lint/a11y/useValidAriaRole: testing the explicit-null opt-out
    render(<Hud role={null}>x</Hud>)
    const hud = screen.getByTestId('hud')
    expect(hud.hasAttribute('role')).toBe(false)
    expect(hud.hasAttribute('aria-live')).toBe(false)
  })

  it('includes motion-reduce override classes', () => {
    render(<Hud>x</Hud>)
    const hud = screen.getByTestId('hud')
    expect(hud.className).toMatch(/motion-reduce:transition-none/)
  })
})
