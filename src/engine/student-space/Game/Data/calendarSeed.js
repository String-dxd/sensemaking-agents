/**
 * Seed calendar events for v1.1 — one per kind so the Calendar grid has
 * something to render before any data accrues. Real events are out of scope
 * for v1.1; v1.2 will read these from a school timetable API.
 *
 * Dates are anchored to the current week so the seed always lands on the
 * visible month at boot.
 */

const dateOffset = (n) =>
{
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const CALENDAR_SEED = [
    { id: 'ev_01', label: 'Mathematics — Sec 3.4',          kind: 'class', date: dateOffset(1)  },
    { id: 'ev_02', label: 'Library Volunteers (CCA)',       kind: 'cca',   date: dateOffset(2)  },
    { id: 'ev_03', label: 'Form Teacher chat — 1:1 with you', kind: 'note', date: dateOffset(5) },
]
