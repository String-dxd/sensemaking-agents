import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SheetEntryRail } from '~/components/SheetEntryRail'

describe('SheetEntryRail', () => {
  it('renders profile dimension entries only', () => {
    render(<SheetEntryRail openSheet={null} onOpenSheet={vi.fn()} sheetPanelId="sheet-1" />)
    for (const key of ['values', 'interests', 'personality', 'skills']) {
      expect(screen.getByTestId(`sheet-trigger-${key}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('sheet-trigger-reflections')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet-trigger-trajectory')).not.toBeInTheDocument()
  })

  it('clicking a trigger fires onOpenSheet with its key', async () => {
    const onOpen = vi.fn()
    render(<SheetEntryRail openSheet={null} onOpenSheet={onOpen} sheetPanelId="sheet-1" />)
    await userEvent.click(screen.getByTestId('sheet-trigger-personality'))
    expect(onOpen).toHaveBeenCalledWith('personality')
  })

  it('reports aria-expanded="true" only on the open sheet trigger', () => {
    render(<SheetEntryRail openSheet="interests" onOpenSheet={vi.fn()} sheetPanelId="sheet-1" />)
    expect(screen.getByTestId('sheet-trigger-interests')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('sheet-trigger-values')).toHaveAttribute('aria-expanded', 'false')
  })

  it('wires aria-controls to the sheet panel id', () => {
    render(<SheetEntryRail openSheet={null} onOpenSheet={vi.fn()} sheetPanelId="sheet-xyz" />)
    expect(screen.getByTestId('sheet-trigger-values')).toHaveAttribute('aria-controls', 'sheet-xyz')
  })

  it('disabled rail is non-interactive (aria-disabled + native disabled)', async () => {
    const onOpen = vi.fn()
    render(<SheetEntryRail openSheet={null} onOpenSheet={onOpen} sheetPanelId="sheet-1" disabled />)
    const btn = screen.getByTestId('sheet-trigger-values')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(btn)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
