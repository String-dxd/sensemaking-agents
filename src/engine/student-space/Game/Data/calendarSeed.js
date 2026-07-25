/**
 * Seed calendar events for v1.1 — one per kind so the Calendar grid has
 * something to render before any data accrues. Real events are out of scope
 * for v1.1; v1.2 will read these from a school timetable API.
 *
 * Dates are anchored to the current week so the seed always lands on the
 * visible month at boot.
 */

import { sgDateKey } from '../entry-date.constants.js'

const MS_PER_DAY = 86_400_000

// Offset in instant space, then read the Asia/Singapore day — SGT has no DST,
// so ±24h steps are exact and the seed lands on the same cells the calendar
// renders regardless of the device timezone.
const dateOffset = (n) => sgDateKey(new Date(Date.now() + n * MS_PER_DAY))

export const CALENDAR_SEED = [
    { id: 'ev_01', label: 'Mathematics — Sec 3.4',          kind: 'class', date: dateOffset(1)  },
    { id: 'ev_02', label: 'Library Volunteers (CCA)',       kind: 'cca',   date: dateOffset(2)  },
    { id: 'ev_03', label: 'Form Teacher chat — 1:1 with you', kind: 'note', date: dateOffset(5) },
]
