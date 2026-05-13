import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorldStage } from '~/components/WorldStage'

describe('WorldStage', () => {
  it('renders the placeholder root with `data-testid="world-stage"`', () => {
    render(<WorldStage />)
    expect(screen.getByTestId('world-stage')).toBeInTheDocument()
  })

  it('marks itself as placeholder so tests can target placeholder mode unambiguously', () => {
    render(<WorldStage />)
    expect(screen.getByTestId('world-stage')).toHaveAttribute('data-placeholder', 'true')
  })

  it('renders a children slot passed in by parents', () => {
    render(
      <WorldStage>
        <span data-testid="hud-content">hud</span>
      </WorldStage>,
    )
    expect(screen.getByTestId('hud-content')).toBeInTheDocument()
  })
})
