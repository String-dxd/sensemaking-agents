/**
 * Plan 046 — CalendarPane cells are Asia/Singapore day keys.
 *
 * The whole file runs under Pacific/Auckland. That is deliberate: the bug this
 * suite pins only appears east of UTC+8, where the device's local midnight of
 * day D is still D−1 in Singapore. Under the old device-local cell
 * construction the grid shifted a day there, so the rendered day number, the
 * accessible label, `aria-current` and the click payload all disagreed with
 * the SGT key the read side files entries under.
 *
 * March 2026 is the reference month: its 1st is a Sunday, so the month grid
 * starts exactly at 2026-03-01. 2026-03-15 is a Sunday, 2026-03-21 a Saturday.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CalendarPane,
  type CalendarPaneEngineState,
} from '~/components/student-space/sheets/CalendarPane'
import { sgToday } from '~/lib/entry-date'

const ORIGINAL_TZ = process.env.TZ

beforeEach(() => {
  process.env.TZ = 'Pacific/Auckland'
})

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
})

/**
 * Either locale ordering of "15 March 2026" / "March 15, 2026". Anchored at
 * both ends so `1 March` cannot also match 11, 21 or 31 March.
 */
function dayCell(day: number, month = 'March', year = 2026) {
  return screen.getByRole('button', {
    name: new RegExp(`(?:^|\\s)${day} ${month} ${year}$|${month} ${day}, ${year}$`),
  })
}

function renderPane(
  props: Partial<React.ComponentProps<typeof CalendarPane>> = {},
  engineState?: CalendarPaneEngineState,
) {
  const onSelectDate = vi.fn()
  render(
    <CalendarPane
      engineState={engineState}
      selectedDate="2026-03-15"
      onSelectDate={onSelectDate}
      viewMode="month"
      {...props}
    />,
  )
  return { onSelectDate }
}

describe('CalendarPane under a UTC+12 device timezone', () => {
  it('emits the day key of the cell it renders when clicked', async () => {
    // The regression test: the cell labelled the 15th must select the 15th.
    // Under the old device-local construction this emitted '2026-03-14' here.
    // The anchor day is deliberately NOT the clicked one: Base UI's
    // ToggleGroup treats a click on the already-pressed toggle as a
    // deselection and emits an empty value, which predates this change.
    const { onSelectDate } = renderPane({ selectedDate: '2026-03-10' })
    await userEvent.click(dayCell(15))
    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(onSelectDate).toHaveBeenCalledWith('2026-03-15')
  })

  it('renders a 42-cell month grid spanning 1 March to 11 April 2026', () => {
    renderPane()
    const grid = screen.getByRole('group', { name: 'History calendar dates' })
    expect(within(grid).getAllByRole('button')).toHaveLength(42)
    expect(dayCell(1)).toBeTruthy()
    expect(dayCell(11, 'April')).toBeTruthy()
  })

  it('puts aria-current="date" on exactly the Singapore today', () => {
    const today = sgToday()
    renderPane({ selectedDate: today })
    const current = screen
      .getAllByRole('button')
      .filter((el) => el.getAttribute('aria-current') === 'date')
    expect(current).toHaveLength(1)
    // The highlighted cell is the one whose own label matches today's key —
    // under the old code the device zone pushed this onto the wrong cell.
    const [year, month, day] = today.split('-').map(Number)
    const label = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).toLocaleDateString(
      undefined,
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
    )
    expect(current[0]?.getAttribute('aria-label')).toBe(label)
  })

  it('renders 7 cells in week view and selects the clicked day', async () => {
    const { onSelectDate } = renderPane({ viewMode: 'week', selectedDate: '2026-03-18' })
    const grid = screen.getByRole('group', { name: 'History calendar dates' })
    expect(within(grid).getAllByRole('button')).toHaveLength(7)
    await userEvent.click(dayCell(21))
    expect(onSelectDate).toHaveBeenCalledWith('2026-03-21')
  })

  it('lands a capture chip inside the cell matching its entryDate', () => {
    renderPane(
      {},
      {
        captures: {
          entries: [{ entryDate: '2026-03-15', kind: 'ask', title: 'Chip on the fifteenth' }],
        },
      },
    )
    expect(within(dayCell(15)).getByText('Chip on the fifteenth')).toBeTruthy()
  })
})
