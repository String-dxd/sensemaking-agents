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
import SheetChrome from './SheetChrome.js'
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
        this.backend  = this.state.backend || null

        const now = new Date()
        this.viewYear  = now.getFullYear()
        this.viewMonth = now.getMonth()

        // DayDetailCard is a sibling overlay (not a child) — registered with
        // OverlayController under its own name. It's owned by CalendarSheet
        // for lifetime but portals into whatever sheet is currently active
        // at open time (history when embedded, calendar when standalone).
        this.dayDetail = new DayDetailCard()
        OverlayController.getInstance().register('dayDetail', this.dayDetail)

        // SheetChrome owns backdrop, blur, fade, z-tier, the × button, and
        // the Escape-to-close listener. Calendar's grid/header content lives
        // inside chrome.contentSlot. When embedded inside History (Timeline
        // tab), `.calendar-sheet--embedded` CSS overrides chrome's fixed
        // position to make Calendar a normal block child of History.
        // See CLAUDE.md "Sheet chrome contract".
        this.chrome = new SheetChrome({
            key:            'calendar',
            sheetClassName: 'calendar-sheet',
            withCloseButton: true,
            closeOnBackdrop: false,
        })
        this.chrome.contentSlot.innerHTML = `
            <header class="calendar-sheet__head">
                <button class="cal-nav" data-dir="-1" type="button" aria-label="Previous month">‹</button>
                <h2 class="cal-title"></h2>
                <button class="cal-nav" data-dir="1"  type="button" aria-label="Next month">›</button>
                <button class="cal-today" type="button" hidden>Today</button>
                <button class="cal-connector" type="button">Run Connector</button>
            </header>
            <div class="calendar-sheet__weekdays">
                ${DAY_LABELS.map((d) => `<span>${d}</span>`).join('')}
            </div>
            <div class="calendar-sheet__grid" role="grid"></div>
        `
        const root = this.chrome.root
        this.root      = root
        this.titleEl   = root.querySelector('.cal-title')
        this.todayBtn  = root.querySelector('.cal-today')
        this.connectorBtn = root.querySelector('.cal-connector')
        this.gridEl    = root.querySelector('.calendar-sheet__grid')
        this.connectorRunning = false
        this.connectorStatusText = ''

        // Content-level click handler — month nav, today button, connector,
        // day-cell taps. × button and Escape are owned by SheetChrome.
        this._onRootClick = (event) => this._onClick(event)
        root.addEventListener('click', this._onRootClick)
    }

    /**
     * Tear-down hook called from View.dispose(). Disposes DayDetailCard,
     * then disposes the chrome (which removes the sheet root from DOM).
     */
    dispose()
    {
        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        try { this.dayDetail?.dispose?.() } catch(_) {}
        this.dayDetail = null
        try { this.chrome?.dispose?.() } catch(_) {}
        this.chrome = null
        this.root = null
    }

    open(opts = {})
    {
        if(!this.chrome) return
        const targetCapture = this._targetCapture(opts)
        const anchorDate = targetCapture?.entryDate || (this.state.backendActive ? this._latestActivityDate() : null)
        const now = anchorDate ? new Date(`${anchorDate}T00:00:00`) : new Date()
        // Whenever the sheet opens, snap to the route target if provided;
        // otherwise bridged mode lands on the latest backend activity month.
        this.viewYear  = now.getFullYear()
        this.viewMonth = now.getMonth()
        this._render()
        this.chrome.open(opts)
        this.isOpen = true
        if(targetCapture?.entryDate) this._openDayDetail(targetCapture.entryDate)
    }

    close()
    {
        if(!this.isOpen) return
        this.isOpen = false
        // Closing Calendar also closes any open DayDetailCard — they share
        // semantic scope (day detail only makes sense over a month grid).
        if(this.dayDetail?.isOpen) this.dayDetail.close()
        try { this.chrome?.close?.() } catch(_) {}
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

        this._renderConnectorButton()
    }

    _onClick(event)
    {
        // × button and Escape are owned by SheetChrome — no per-sheet close
        // handling needed here.
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

        if(event.target.closest('.cal-connector'))
        {
            this._runConnector()
            return
        }

        const cell = event.target.closest('.calendar-day')
        if(cell && !cell.classList.contains('is-otherm'))
        {
            const date = cell.dataset.date
            this._openDayDetail(date)
            return
        }
    }

    _openDayDetail(date)
    {
        if(!date) return
        this.dayDetail?.open?.({ date })
    }

    _targetCapture(opts = {})
    {
        const entries = Array.isArray(this.captures?.entries)
            ? this.captures.entries.filter((capture) => capture.kind === 'ask')
            : []
        if(opts.entryId)
        {
            const id = Number(opts.entryId)
            return entries.find((capture) =>
                capture.backendMirrorEntryId === id || capture.id === `mirror:${id}`,
            ) || null
        }
        if(opts.filter === 'need-review')
        {
            return entries
                .filter((capture) => capture.reviewStatus === 'pending')
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null
        }
        return null
    }

    _latestActivityDate()
    {
        const dates = []
        for(const c of this.captures?.entries || [])
        {
            if(c.entryDate) dates.push(c.entryDate)
        }
        for(const p of this.moodPins?.pins || [])
        {
            if(p.entryDate) dates.push(p.entryDate)
        }
        for(const e of this.calendar?.events || [])
        {
            if(e.date) dates.push(e.date)
        }
        return dates.sort().at(-1) || null
    }

    _shiftMonth(dir)
    {
        this.viewMonth += dir
        if(this.viewMonth < 0)  { this.viewMonth = 11; this.viewYear -= 1 }
        if(this.viewMonth > 11) { this.viewMonth = 0;  this.viewYear += 1 }
        this._render()
    }

    async _runConnector()
    {
        if(!this.backend?.runConnector || this.connectorRunning) return
        this.connectorRunning = true
        this.connectorBtn.disabled = true
        this.connectorBtn.textContent = 'Connecting...'
        try
        {
            const result = await this.backend.runConnector()
            const snapshot = await this.backend.refreshSnapshot?.()
            if(snapshot) this.state.applyBackendSnapshot?.(snapshot)
            this.connectorStatusText = connectorResultCopy(result)
            this.connectorRunning = false
            this._render()
        }
        catch(err)
        {
            console.warn('[CalendarSheet] connector run failed', err)
            this.connectorStatusText = 'Connector failed'
            this.connectorRunning = false
            this._renderConnectorButton()
        }
        finally
        {
            setTimeout(() =>
            {
                if(!this.connectorBtn) return
                this.connectorStatusText = ''
                this._renderConnectorButton()
            }, 1600)
        }
    }

    _renderConnectorButton()
    {
        if(!this.connectorBtn) return
        if(!this.backend?.runConnector)
        {
            this.connectorBtn.hidden = true
            return
        }
        this.connectorBtn.hidden = false
        if(this.connectorRunning)
        {
            this.connectorBtn.disabled = true
            this.connectorBtn.textContent = 'Connecting...'
            return
        }
        const confirmed = this._confirmedReflectionCount()
        this.connectorBtn.disabled = confirmed === 0
        this.connectorBtn.textContent = this.connectorStatusText
            || (confirmed === 0 ? 'Log a reflection to begin' : 'Run Connector')
    }

    _confirmedReflectionCount()
    {
        const entries = Array.isArray(this.captures?.entries) ? this.captures.entries : []
        return entries.filter((capture) =>
            capture.kind === 'ask' && capture.reviewStatus === 'confirmed' && capture.backendMirrorEntryId,
        ).length
    }
}

function connectorResultCopy(result)
{
    if(!result || typeof result !== 'object') return 'Connector done'
    if(result.status === 'nothing_to_run') return 'Nothing to connect'
    const processed = Number.isFinite(result.processed) ? result.processed : 0
    const succeeded = Number.isFinite(result.succeeded) ? result.succeeded : 0
    const failed = Number.isFinite(result.failed) ? result.failed : 0
    const remaining = Number.isFinite(result.remaining) ? result.remaining : 0
    if(failed > 0) return `Connector: ${succeeded}/${processed} applied, ${failed} failed`
    if(remaining > 0) return `Connector: ${succeeded}/${processed} applied, ${remaining} left`
    return processed > 0 ? `Connector: ${succeeded}/${processed} applied` : 'Connector done'
}
