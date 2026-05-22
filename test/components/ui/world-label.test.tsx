import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { WorldLabel } from '~/components/ui/world-label'

describe('WorldLabel primitive', () => {
  it('starts hidden (opacity 0, pointer-events none) so useWorldPosition takes over on first frame', () => {
    render(<WorldLabel>Mailbox</WorldLabel>)
    const el = screen.getByTestId('world-label') as HTMLDivElement
    expect(el.style.opacity).toBe('0')
    expect(el.style.pointerEvents).toBe('none')
  })

  it('forwards refs to the underlying element', () => {
    const ref = createRef<HTMLDivElement>()
    render(<WorldLabel ref={ref}>Mailbox</WorldLabel>)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.dataset.testid).toBe('world-label')
  })

  it('renders children', () => {
    render(<WorldLabel>Telescope</WorldLabel>)
    expect(screen.getByText('Telescope')).toBeInTheDocument()
  })

  it('merges custom style without dropping the initial hidden state', () => {
    render(<WorldLabel style={{ background: 'red' }}>x</WorldLabel>)
    const el = screen.getByTestId('world-label') as HTMLDivElement
    expect(el.style.background).toBe('red')
    expect(el.style.opacity).toBe('0')
  })
})
