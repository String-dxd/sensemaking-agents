import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnvironmentPanel } from '~/components/EnvironmentPanel'
import { DEFAULT_WORLD_ENVIRONMENT_CONTROLS } from '~/components/world/worldStyle'

describe('EnvironmentPanel', () => {
  it('renders the Student Space-style hour and weather controls', () => {
    render(<EnvironmentPanel controls={DEFAULT_WORLD_ENVIRONMENT_CONTROLS} onChange={vi.fn()} />)

    expect(screen.getByTestId('environment-panel')).toBeInTheDocument()
    expect(screen.getByLabelText('hour')).toHaveValue('10.5')
    expect(screen.getByRole('button', { name: /use real time/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'rain' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'aurora' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'rainbow' })).toHaveAttribute('aria-checked', 'false')
  })

  it('turns slider edits into manual hour controls', () => {
    const onChange = vi.fn()
    render(
      <EnvironmentPanel
        controls={{ ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS, useRealTime: true }}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('hour'), { target: { value: '14.2' } })

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
      hour: 14.2,
      useRealTime: false,
    })
  })

  it('toggles weather switches', () => {
    const onChange = vi.fn()
    render(<EnvironmentPanel controls={DEFAULT_WORLD_ENVIRONMENT_CONTROLS} onChange={onChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'rainbow' }))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
      rainbow: true,
    })
  })
})
