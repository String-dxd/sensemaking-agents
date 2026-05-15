import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/components/world/WorldScene', () => ({
  WorldScene: () => <div data-testid="mock-world-scene" />,
}))

import { WorldStage } from '~/components/WorldStage'

describe('WorldStage', () => {
  it('renders the stage root with `data-testid="world-stage"`', () => {
    render(<WorldStage />)
    expect(screen.getByTestId('world-stage')).toBeInTheDocument()
  })

  it('marks itself as no longer being the placeholder surface', () => {
    render(<WorldStage />)
    expect(screen.getByTestId('world-stage')).toHaveAttribute('data-placeholder', 'false')
    expect(screen.queryByText('world')).not.toBeInTheDocument()
  })

  it('uses the full-screen stage treatment instead of a visible frame', () => {
    render(<WorldStage />)
    const stage = screen.getByTestId('world-stage')
    expect(stage).toHaveAttribute('data-fullscreen', 'true')
    expect(stage.className).toContain('overflow-hidden')
    expect(stage.className).not.toContain('rounded-')
    expect(stage.className).not.toContain('border')
  })

  it('mounts the decorative world scene', () => {
    render(<WorldStage />)
    expect(screen.getByTestId('mock-world-scene')).toBeInTheDocument()
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
