/**
 * CalendarSheet — full-viewport month grid that surfaces what the app
 * already has: mood pins (small colored dots per day), captures (dotted
 * square = ask, filled square = photo), and stub teacher events (single
 * soft "·"). Tapping a day opens DayDetailCard from the right.
 *
 * Header has month nav (‹ Month YYYY ›) and a Today button (hidden on the
 * current month). The "today" cell wears a thin lavender outline so it's
 * visually anchored without dominating.
 */

import State from '../State/State.js'
import OverlayController from './OverlayController.js'
import DayDetailCard from './DayDetailCard.js'

const MOOD_HEX = {
    joy:           '#FFD66B',
    sadness:       '#7FB3D9',
    anger:         '#E36A55',
    fear:          '#B49AD6',
    disgust:       '#9CC36E',
    anxiety:       '#F1A04E',
    envy:          '#6FC2B3',
    embarrassment: '#F0A6B5',
    ennui:         '#A8A5BD',
}

const DAY_LABELS  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Build a 6×7 grid of Date objects covering the visible month and edges. */
function buildMonthCells(year, month0)
{
    const first = new Date(year, month0, 1)
    const startOffset = first.getDay()
    const cells = []
    for(let i = 0; i < 42; i++)
    {
        const day = new Date(year, month0, 1 + (i - startOffset))
        cells.push(day)
    }
    return cells
}

export default class CalendarSheet
{
    constructor()
    {
        this.state    = State.getInstance()
        this.moodPins = this.state.moodPins
        this.captures = this.state.captures
        this.calendar = this.state.calendar

        const now = new Date()
        this.viewYear  = now.getFullYear()
        this.viewMonth = now.getMonth()

        // DayDetailCard is a sibling overlay (not a child) — registered with
        // OverlayController under its own name. It's owned by CalendarSheet
        // for lifetime but called via the controller for visibility.
        this.dayDetail = new DayDetailCard()
        OverlayController.getInstance().register('dayDetail', this.dayDetail)

        const root = document.createElement('div')
        root.className = 'calendar-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="calendar-sheet__close" type="button" aria-label="Close">×</button>
            <header class="calendar-sheet__head">
                <button class="cal-nav" data-dir="-1" type="button" aria-label="Previous month">‹</button>
                <h2 class="cal-title"></h2>
                <button class="cal-nav" data-dir="1"  type="button" aria-label="Next month">›</button>
                <button class="cal-today" type="button" hidden>Today</button>
            </header>
            <div class="calendar-sheet__weekdays">
                ${DAY_LABELS.map((d) => `<span>${d}</span>`).join('')}
            </div>
            <div class="calendar-sheet__grid" role="grid"></div>
        `
        document.body.appendChild(root)
        this.root      = root
        this.titleEl   = root.querySelector('.cal-title')
        this.todayBtn  = root.querySelector('.cal-today')
        this.gridEl    = root.querySelector('.calendar-sheet__grid')

        this._onRootClick = (event) => this._onClick(event)
        root.addEventListener('click', this._onRootClick)

        this._onKeyDown = (event) =>
        {
            if(this.isOpen && event.key === 'Escape') this.close()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Drops the document-level
     * keydown listener, disposes the owned DayDetailCard (no other surface
     * owns its lifetime), and detaches the sheet root.
     */
    dispose()
    {
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        try { this.dayDetail?.dispose?.() } catch(_) {}
        this.dayDetail = null
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
    }

    open()
    {
        // Whenever the sheet opens, snap back to current month so the user
        // always lands on "today" first — month nav remembers across opens
        // would be more powerful but easy to lose track of in v1.1.
        const now = new Date()
        this.viewYear  = now.getFullYear()
        this.viewMonth = now.getMonth()
        this._render()
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
        this.isOpen = false
        // Closing Calendar also closes any open DayDetailCard — they share
        // semantic scope (day detail only makes sense over a month grid).
        if(this.dayDetail.isOpen) OverlayController.getInstance().close('dayDetail')
        OverlayController.getInstance().noteClosed('calendar')
    }

    _render()
    {
        this.titleEl.textContent = `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`

        const now = new Date()
        const isCurrentMonth = (now.getFullYear() === this.viewYear && now.getMonth() === this.viewMonth)
        this.todayBtn.hidden = isCurrentMonth

        const cells = buildMonthCells(this.viewYear, this.viewMonth)
        const todayYMD = ymd(now)

        // Pre-index data for fast cell rendering.
        const moodByDate = {}
        for(const p of this.moodPins.pins)
        {
            if(!moodByDate[p.entryDate]) moodByDate[p.entryDate] = []
            moodByDate[p.entryDate].push(p)
        }
        const capByDate = {}
        for(const c of this.captures.entries)
        {
            if(!capByDate[c.entryDate]) capByDate[c.entryDate] = []
            capByDate[c.entryDate].push(c)
        }
        const eventByDate = {}
        for(const e of this.calendar.events)
        {
            if(!eventByDate[e.date]) eventByDate[e.date] = []
            eventByDate[e.date].push(e)
        }

        this.gridEl.innerHTML = cells.map((d) =>
        {
            const date    = ymd(d)
            const inMonth = d.getMonth() === this.viewMonth
            const isToday = date === todayYMD
            const pins    = moodByDate[date]   || []
            const caps    = capByDate[date]    || []
            const events  = eventByDate[date]  || []

            // Build a typed list of markers in priority order:
            // photo → ask → mood. Each marker is large enough to read at a
            // glance (≥14px) — replacing the small dots that were too easy
            // to miss. Up to MARK_MAX per day, then a `+n` overflow chip.
            const markers = []
            for(const c of caps)
            {
                if(c.kind === 'photo')
                {
                    const url = c.dataUrl
                        ? c.dataUrl
                        : (this.captures.getPhoto?.(c.id) ?? '')
                    markers.push(`
                        <span class="calendar-day__mark calendar-day__mark--photo"
                              role="img"
                              aria-label="Photo capture"
                              ${url ? `style="background-image:url(${url})"` : ''}></span>
                    `)
                }
                else if(c.kind === 'ask')
                {
                    markers.push(`
                        <span class="calendar-day__mark calendar-day__mark--ask"
                              role="img"
                              aria-label="Ask capture">
                            <svg viewBox="0 0 14 14" aria-hidden="true">
                                <path d="M2 3.2a1.6 1.6 0 0 1 1.6-1.6h6.8A1.6 1.6 0 0 1 12 3.2v5.2a1.6 1.6 0 0 1-1.6 1.6H6.2L3.4 12V10H3.6A1.6 1.6 0 0 1 2 8.4Z"
                                      fill="currentColor" />
                            </svg>
                        </span>
                    `)
                }
            }
            for(const p of pins)
            {
                markers.push(`
                    <span class="calendar-day__mark calendar-day__mark--mood"
                          role="img"
                          aria-label="${p.emotion}"
                          title="${p.emotion}"
                          style="background:${MOOD_HEX[p.emotion] || '#888'}"></span>
                `)
            }

            const MARK_MAX = 3
            const visible = markers.slice(0, MARK_MAX).join('')
            const hidden  = markers.length - MARK_MAX
            const overflow = hidden > 0
                ? `<span class="calendar-day__overflow" aria-label="${hidden} more captures hidden">+${hidden}</span>` : ''
            const teacher = events.length > 0
                ? `<span class="calendar-day__teacher" title="${events.map(e=>e.label).join(' · ')}">·</span>` : ''

            return `
                <button type="button"
                        class="calendar-day${inMonth ? '' : ' is-otherm'}${isToday ? ' is-today' : ''}"
                        data-date="${date}"
                        ${(pins.length + caps.length + events.length) === 0 && !isToday ? 'tabindex="-1"' : ''}>
                    <span class="calendar-day__num">${d.getDate()}</span>
                    <span class="calendar-day__marks">${visible}${overflow}</span>
                    ${teacher}
                </button>
            `
        }).join('')
    }

    _onClick(event)
    {
        if(event.target.closest('.calendar-sheet__close')) { this.close(); return }

        const nav = event.target.closest('.cal-nav')
        if(nav)
        {
            const dir = parseInt(nav.dataset.dir, 10)
            this._shiftMonth(dir)
            return
        }

        if(event.target.closest('.cal-today'))
        {
            const now = new Date()
            this.viewYear  = now.getFullYear()
            this.viewMonth = now.getMonth()
            this._render()
            return
        }

        const cell = event.target.closest('.calendar-day')
        if(cell && !cell.classList.contains('is-otherm'))
        {
            const date = cell.dataset.date
            OverlayController.getInstance().open('dayDetail', { date })
            return
        }
    }

    _shiftMonth(dir)
    {
        this.viewMonth += dir
        if(this.viewMonth < 0)  { this.viewMonth = 11; this.viewYear -= 1 }
        if(this.viewMonth > 11) { this.viewMonth = 0;  this.viewYear += 1 }
        this._render()
    }
}
