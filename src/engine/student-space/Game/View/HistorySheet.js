/**
 * History sheet — combined Timeline + Growth surface.
 *
 * Replaces the previous separate Calendar and Growth chips in TopNav with
 * a single "History" entry point. The sheet hosts two tabs:
 *
 *   - **Timeline** — chronological feed of recent voice reflections
 *     (server-side `mirror_entries`, most recent first).
 *   - **Growth** — year scrubber + central historical island view (fed by
 *     SproutsView.setTimelapseSubset) + quantitative summary panel.
 *
 * Both tabs share the same overlay slot; switching tabs swaps which body
 * is visible without unmounting the sheet. Deep links `?sheet=growth` and
 * `?sheet=calendar` both route here — Calendar opens with the Timeline
 * tab active, Growth opens with the Growth tab active.
 *
 * Read paths:
 *   - /api/growth/timeline        — voice reflections, most recent 50
 *   - /api/growth/summary         — per-year stats and templated narrative
 *   - /api/growth/island-state-at — bloomed-trees payload for the year
 *
 * The sheet NEVER writes to engine state. setTimelapseSubset(null) is
 * called on close to restore the live present-day island.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import State from '../State/State.js'
import View from './View.js'
import SheetChrome from './SheetChrome.js'

const HISTORY_API = {
    summary:       '/api/growth/summary',
    islandStateAt: '/api/growth/island-state-at',
    yearEntries:   '/api/growth/year-entries',
}

const TABS = ['timeline', 'growth']

// Stat-row kinds in display order. Each kind maps to a slice of the
// year-entries payload and its own drill-down render path.
const STAT_KINDS = ['reflections', 'crystallised', 'forgotten', 'dominant']

const STAT_LABELS = {
    reflections:  'Voice reflections',
    crystallised: 'Claims crystallised',
    forgotten:    'Claims let go',
    dominant:     'Dominant dimension',
}

// Mirrors the four hex `accent` / `soft` / `ink` values from
// `PROFILE_THEMES` in `src/components/ProfileSheetChrome.tsx`. The canonical
// source is TSX; this is a deliberate mirror (engine JS can't import TSX
// constants) — keep in sync if the Profile palette changes.
const DIMENSION_COLORS = {
    values:      { accent: '#A07659', soft: '#EAD7BE', ink: '#6A4A26' },
    interests:   { accent: '#FF8E8E', soft: '#FDE0E0', ink: '#A84D4D' },
    personality: { accent: '#8E6FB8', soft: '#E8DDF2', ink: '#4C3470' },
    skills:      { accent: '#82B16A', soft: '#DDEDC6', ink: '#3F6F2A' },
}

const DIMENSION_LABEL = {
    values: 'Values',
    interests: 'Interests',
    personality: 'Personality',
    skills: 'Skills',
}

const STRENGTH_LEVEL = { low: 1, medium: 2, high: 3 }

function escapeHtml(input)
{
    if(input === null || input === undefined) return ''
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function formatShortDate(iso)
{
    if(!iso) return ''
    try
    {
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    }
    catch(_) { return '' }
}

function monthsBetween(startIso, endIso)
{
    if(!startIso || !endIso) return null
    const a = new Date(startIso)
    const b = new Date(endIso)
    if(Number.isNaN(a.valueOf()) || Number.isNaN(b.valueOf())) return null
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
    return Math.max(0, months)
}

export default class HistorySheet
{
    constructor()
    {
        this.state = State.getInstance()
        this.view  = View.getInstance()

        // SheetChrome owns backdrop, blur, fade, z-tier, the × button, the
        // Escape-to-close listener, AND the shared header (eyebrow + title +
        // subtitle). History only owns its tab/embed/year logic inside
        // chrome.bodySlot. See CLAUDE.md "Sheet chrome contract".
        this.chrome = new SheetChrome({
            key:            'history',
            sheetClassName: 'history-sheet',
            withCloseButton: true,
            closeOnBackdrop: false,
            header: {
                eyebrow:  'HISTORY',
                title:    'Look back',
                subtitle: 'A chronological feed of what you recorded, and a year-by-year read on how it\'s adding up.',
            },
        })
        this.chrome.bodySlot.innerHTML = `
            <nav class="history-sheet__tabs" role="tablist">
                <button type="button" class="history-sheet__tab" data-tab="timeline" role="tab">Timeline</button>
                <button type="button" class="history-sheet__tab" data-tab="growth" role="tab">Growth</button>
            </nav>

            <section class="history-sheet__pane history-sheet__pane--timeline" data-pane="timeline" hidden>
                <div class="history-sheet__timeline-slot" data-timeline-slot></div>
            </section>

            <section class="history-sheet__pane history-sheet__pane--growth" data-pane="growth" hidden>
                <nav class="history-sheet__scrubber" role="tablist" aria-label="Year">
                    <div class="history-sheet__scrubber-pills" data-pills></div>
                </nav>
                <div class="history-sheet__body-grid">
                    <div class="history-sheet__island" data-island>
                        <div class="history-sheet__island-art-slot" data-island-art hidden></div>
                        <p class="history-sheet__island-placeholder" data-island-placeholder hidden></p>
                        <div class="history-sheet__source-label" data-source hidden></div>
                    </div>
                    <aside class="history-sheet__summary" data-summary>
                        <p class="history-sheet__narrative" data-narrative></p>
                        <ul class="history-sheet__stats" data-stats></ul>
                    </aside>
                </div>
                <p class="history-sheet__footnote" data-footnote>
                    Year-by-year tracking fills in after each <em>voice</em> reflection. Mood pins and photo / ask captures live only on this device and don't appear here.
                </p>
            </section>
        `
        const root = this.chrome.root
        this.root = root

        this.tabEls            = Array.from(root.querySelectorAll('.history-sheet__tab'))
        this.paneTimelineEl    = root.querySelector('[data-pane="timeline"]')
        this.paneGrowthEl      = root.querySelector('[data-pane="growth"]')
        this.timelineSlotEl    = root.querySelector('[data-timeline-slot]')
        this.pillsEl           = root.querySelector('[data-pills]')
        this.islandPlaceholder = root.querySelector('[data-island-placeholder]')
        this.islandArtSlot     = root.querySelector('[data-island-art]')
        this.sourceLabelEl     = root.querySelector('[data-source]')
        this.narrativeEl       = root.querySelector('[data-narrative]')
        this.statsEl           = root.querySelector('[data-stats]')

        // CalendarSheet embedding — when Timeline tab is active we reparent
        // the existing CalendarSheet's root DOM into this sheet's timeline
        // slot so we get the full day-grid + day-detail UI for free without
        // duplicating its logic. Original parent is captured here so the
        // restore-on-close path always returns the calendar to its native
        // overlay position.
        this._calendarOriginalParent = null

        this.isOpen       = false
        this.activeTab    = 'timeline'
        this.activeYear   = null
        this.years        = []
        this.yearsWithData = new Set()
        this._inFlight    = false

        // Drill-down state. `expandedStats` is a Set of currently-open stat
        // kinds. Multi-open is allowed so an empty year can default to all
        // four preview cards stacked (the user can collapse rows they don't
        // want). `_yearEntriesCache` keys per-year detail payloads;
        // `_yearEntriesInFlight` dedupes overlapping fetches per year.
        // `_defaultsAppliedFor` tracks which year's expand-defaults have
        // already been seeded so re-renders don't fight the user's choices.
        this.expandedStats       = new Set()
        this._yearEntriesCache   = new Map()
        this._yearEntriesInFlight = new Map()
        this._defaultsAppliedFor = null

        // Content-level click handler — tab switching, year pills, stat
        // drilldowns, etc. The × button and Escape are owned by SheetChrome
        // and route through OverlayController.close('history') which calls
        // this.close() (see View.js registration override of chrome).
        this._onClick = (event) => this._handleClick(event)
        root.addEventListener('click', this._onClick)
    }

    dispose()
    {
        if(this.isOpen) this._restoreLiveIsland()
        this._restoreCalendarToOverlay()
        this._disposePreviewView()
        try { this.root?.removeEventListener?.('click', this._onClick) } catch(_) {}
        try { this.chrome?.dispose?.() } catch(_) {}
        this.chrome = null
        this.root = null
    }

    /**
     * Open the sheet. opts.tab (== 'timeline' | 'growth') sets the initial
     * tab; defaults to 'timeline' so the chip's default landing is the
     * Calendar grid. Deep-link `?sheet=growth` (via Game.openSurface) passes
     * 'growth' explicitly to land on the year-buckets view instead.
     */
    open(opts = {})
    {
        if(!this.chrome) return
        this.chrome.open(opts)
        this.isOpen = true

        const tab = opts.tab && TABS.includes(opts.tab) ? opts.tab : 'timeline'
        this._setTab(tab)
    }

    close()
    {
        if(!this.isOpen) return
        this.isOpen = false
        // Chrome closes the DOM (drops .is-open, sets aria-hidden, calls
        // OverlayController.noteClosed). History only handles its own
        // post-close cleanup.
        try { this.chrome?.close?.() } catch(_) {}
        this._restoreLiveIsland()
        this._restoreCalendarToOverlay()
        this._disposePreviewView()
    }

    _setTab(tab)
    {
        if(!TABS.includes(tab)) return
        this.activeTab = tab
        for(const el of this.tabEls)
        {
            const isActive = el.dataset.tab === tab
            el.classList.toggle('is-active', isActive)
            el.setAttribute('aria-selected', String(isActive))
        }
        this.paneTimelineEl.hidden = tab !== 'timeline'
        this.paneGrowthEl.hidden   = tab !== 'growth'

        if(tab === 'timeline') this._embedCalendar()
        else this._restoreCalendarToOverlay()

        if(tab === 'growth')
        {
            if(!this._yearsLoaded)
            {
                this._yearsLoaded = true
                this._loadYears().catch(() => { this._yearsLoaded = false })
            }
            this._initPreviewView()
        }
    }

    // ── Calendar embed (Timeline tab) ───────────────────────────────────
    //
    // The Timeline tab shows the full calendar grid by reparenting the
    // existing CalendarSheet's root DOM into the timeline slot. This gives
    // us the day-grid, mood pins, capture markers, and DayDetailCard for
    // free. When the tab switches away or this sheet closes, the calendar
    // is moved back to its original parent (document.body) and closed.

    _embedCalendar()
    {
        const calendarSheet = this.view?.calendarSheet
        if(!calendarSheet?.root || !this.timelineSlotEl) return
        if(this._calendarOriginalParent) return  // already embedded

        this._calendarOriginalParent = calendarSheet.root.parentNode || document.body
        calendarSheet.root.classList.add('calendar-sheet--embedded')
        try { calendarSheet.open() } catch(_) {}
        this.timelineSlotEl.appendChild(calendarSheet.root)
    }

    _restoreCalendarToOverlay()
    {
        if(!this._calendarOriginalParent) return
        const calendarSheet = this.view?.calendarSheet
        if(calendarSheet?.root)
        {
            try { calendarSheet.close() } catch(_) {}
            calendarSheet.root.classList.remove('calendar-sheet--embedded')
            try { this._calendarOriginalParent.appendChild(calendarSheet.root) } catch(_) {}
        }
        this._calendarOriginalParent = null
    }

    _handleClick(event)
    {
        // × button and Escape are owned by SheetChrome — no per-sheet close
        // handling needed here.
        const tabEl = event.target.closest?.('.history-sheet__tab')
        if(tabEl && tabEl.dataset?.tab)
        {
            event.preventDefault()
            this._setTab(tabEl.dataset.tab)
            return
        }
        const pill = event.target.closest?.('.history-sheet__pill')
        if(pill && pill.dataset?.year)
        {
            const year = Number.parseInt(pill.dataset.year, 10)
            if(Number.isFinite(year)) this._selectYear(year)
            return
        }
        const statBtn = event.target.closest?.('.history-sheet__stat-toggle')
        if(statBtn && statBtn.dataset?.statKind)
        {
            event.preventDefault()
            this._toggleStat(statBtn.dataset.statKind)
        }
    }

    // ── Growth tab ──────────────────────────────────────────────────────

    async _loadYears()
    {
        const currentYear = new Date().getUTCFullYear()
        const candidates = []
        for(let y = currentYear - 4; y <= currentYear; y++) candidates.push(y)

        // Always render the full 5-year pill strip up front so the interface
        // is visible even before fetches resolve and even if no year holds
        // data yet. A subtle dot marks pills whose year has activity.
        this.years = candidates
        this.yearsWithData = new Set()
        this.activeYear = currentYear
        this._renderPills()

        // Optimistic empty paint of the right-hand panels so the layout is
        // visible immediately while the summary fetch is in flight.
        this._renderSummary({ kind: 'no_data', year: currentYear })
        this._renderIsland(null)

        const results = await Promise.all(
            candidates.map(year => this._fetchSummary(year).catch(() => null)),
        )

        const withData = new Set()
        let latestWithData = null
        for(let i = 0; i < candidates.length; i++)
        {
            const summary = results[i]
            if(summary && summary.kind === 'ok')
            {
                withData.add(candidates[i])
                latestWithData = candidates[i]
            }
        }
        this.yearsWithData = withData
        this._renderPills()

        // If any year actually has activity, jump to the most recent one so
        // the panels paint real data; otherwise stay on the current year and
        // leave the placeholder layout up. Bypass _selectYear's same-year
        // short-circuit by clearing activeYear first when re-selecting.
        if(latestWithData !== null)
        {
            this.activeYear = null
            this._selectYear(latestWithData)
        }
        else
        {
            // No year has summary data; still try to reconstruct an island
            // for the current year (claims may exist without voice reflections).
            this._fetchIslandState(currentYear)
                .then(state => { if(this.activeYear === currentYear) this._renderIsland(state) })
                .catch(() => {})
        }
    }

    _renderPills()
    {
        this.pillsEl.innerHTML = this.years.map(year =>
        {
            const isActive = year === this.activeYear
            const hasData  = this.yearsWithData.has(year)
            const classes  = [
                'history-sheet__pill',
                isActive ? 'is-active' : '',
                hasData  ? 'has-data' : 'is-empty',
            ].filter(Boolean).join(' ')
            return `
                <button type="button" class="${classes}" data-year="${year}" role="tab" aria-selected="${isActive}">
                    <span class="history-sheet__pill-year">${year}</span>
                    <span class="history-sheet__pill-dot" aria-hidden="true"></span>
                </button>
            `
        }).join('')
    }

    _selectYear(year)
    {
        if(this.activeYear === year) return
        this.activeYear = year
        // Year switch resets expand-defaults; _renderStatsList will re-apply
        // the "all-expanded in empty year" rule on the next paint.
        this.expandedStats = new Set()
        this._defaultsAppliedFor = null
        this._renderPills()

        Promise.allSettled([
            this._fetchSummary(year),
            this._fetchIslandState(year),
        ]).then(([summaryResult, islandResult]) =>
        {
            if(this.activeYear !== year) return
            if(summaryResult.status === 'fulfilled') this._renderSummary(summaryResult.value)
            else
            {
                console.warn('[HistorySheet] summary load failed', summaryResult.reason)
                this._renderSummaryError()
            }
            if(islandResult.status === 'fulfilled') this._renderIsland(islandResult.value)
            else
            {
                console.warn('[HistorySheet] island-state load failed', islandResult.reason)
                this._renderIsland({
                    source: 'empty',
                    capturedAt: null,
                    year,
                    bloomedTrees: [],
                    unavailable: true,
                })
            }
        })
    }

    async _fetchSummary(year)
    {
        const url = `${HISTORY_API.summary}?year=${year}`
        const response = await fetch(url, { credentials: 'same-origin' })
        if(!response.ok) throw new Error(`growth-summary ${response.status}`)
        return response.json()
    }

    async _fetchIslandState(year)
    {
        const url = `${HISTORY_API.islandStateAt}?year=${year}`
        const response = await fetch(url, { credentials: 'same-origin' })
        if(!response.ok) throw new Error(`island-state-at ${response.status}`)
        return response.json()
    }

    _renderSummary(summary)
    {
        const isEmpty = !summary || summary.kind === 'no_data'
        if(isEmpty)
        {
            this.narrativeEl.textContent = 'Nothing to summarise here yet — try a voice reflection to fill this year in.'
            this.narrativeEl.classList.add('is-placeholder')
        }
        else
        {
            this.narrativeEl.textContent = summary.narrative || ''
            this.narrativeEl.classList.remove('is-placeholder')
        }
        this._lastSummary = summary || null
        this._renderStatsList()
    }

    _renderStatsList()
    {
        const summary = this._lastSummary
        const isEmpty = !summary || summary.kind === 'no_data'

        // Default expand-state per year: empty years pre-open all four rows
        // so the preview cards stack visibly without interaction; years with
        // data start collapsed. Apply exactly once per (activeYear, kind),
        // then respect any user toggles.
        if(this._defaultsAppliedFor !== this.activeYear)
        {
            this.expandedStats = isEmpty ? new Set(STAT_KINDS) : new Set()
            this._defaultsAppliedFor = this.activeYear
        }

        const values = {
            reflections:  isEmpty ? 0 : summary.voiceReflections,
            crystallised: isEmpty ? 0 : summary.claimsCrystallised,
            forgotten:    isEmpty ? 0 : summary.claimsForgotten,
            dominant:     !isEmpty && summary.dominantDimension
                ? (DIMENSION_LABEL[summary.dominantDimension] || summary.dominantDimension)
                : '—',
        }
        const yearData = this._yearEntriesCache.get(this.activeYear) || null

        this.statsEl.innerHTML = STAT_KINDS.map(kind =>
        {
            const isOpen = this.expandedStats.has(kind)
            const detailsId = `history-sheet__details--${kind}`
            const value = escapeHtml(values[kind])
            const detailsHtml = isOpen ? this._renderStatDetails(kind, yearData) : ''
            return `
                <li class="history-sheet__stat${isOpen ? ' is-open' : ''}">
                    <button type="button"
                            class="history-sheet__stat-toggle"
                            data-stat-kind="${kind}"
                            aria-expanded="${isOpen}"
                            aria-controls="${detailsId}">
                        <span class="history-sheet__stat-label">${STAT_LABELS[kind]}</span>
                        <span class="history-sheet__stat-value">${value}</span>
                        <span class="history-sheet__stat-chevron" aria-hidden="true">›</span>
                    </button>
                    <div class="history-sheet__stat-details"
                         id="${detailsId}"
                         role="region"
                         aria-label="${STAT_LABELS[kind]} details"
                         ${isOpen ? '' : 'hidden'}>
                        ${detailsHtml}
                    </div>
                </li>
            `
        }).join('')
    }

    _toggleStat(kind)
    {
        if(!STAT_KINDS.includes(kind)) return
        if(this.expandedStats.has(kind)) this.expandedStats.delete(kind)
        else this.expandedStats.add(kind)
        this._renderStatsList()
        if(this.expandedStats.size > 0 && this.activeYear !== null)
        {
            // Lazy-fetch entries only when at least one stat is open for the
            // active year. Cached result re-renders synchronously; first
            // time triggers a fetch and we re-render once it resolves.
            const year = this.activeYear
            if(!this._yearEntriesCache.has(year))
            {
                this._fetchYearEntries(year).then(() =>
                {
                    if(this.activeYear === year && this.expandedStats.size > 0)
                    {
                        this._renderStatsList()
                    }
                }).catch(() => {})
            }
        }
    }

    async _fetchYearEntries(year)
    {
        if(this._yearEntriesCache.has(year)) return this._yearEntriesCache.get(year)
        if(this._yearEntriesInFlight.has(year)) return this._yearEntriesInFlight.get(year)

        const promise = (async () =>
        {
            const url = `${HISTORY_API.yearEntries}?year=${year}`
            const response = await fetch(url, { credentials: 'same-origin' })
            if(!response.ok) throw new Error(`year-entries ${response.status}`)
            const result = await response.json()
            this._yearEntriesCache.set(year, result)
            return result
        })().finally(() =>
        {
            this._yearEntriesInFlight.delete(year)
        })

        this._yearEntriesInFlight.set(year, promise)
        return promise
    }

    _renderStatDetails(kind, yearData)
    {
        // While the fetch is in flight (yearData null and a year is selected),
        // show the preview/skeleton card. Once data arrives, we re-render.
        const isLoading = yearData === null && this._yearEntriesInFlight.has(this.activeYear)
        if(isLoading) return this._renderLoadingCard(kind)

        const hasData = yearData && yearData.kind === 'ok'
        if(!hasData) return this._renderPreviewCard(kind)

        if(kind === 'reflections')  return this._renderReflectionList(yearData.reflections, yearData.reflectionsTotal)
        if(kind === 'crystallised') return this._renderClaimList(yearData.crystallised, yearData.crystallisedTotal, 'crystallised')
        if(kind === 'forgotten')    return this._renderClaimList(yearData.forgotten, yearData.forgottenTotal, 'forgotten')
        if(kind === 'dominant')     return this._renderDimensionBars(yearData.dimensionCounts, yearData.crystallisedTotal)
        return ''
    }

    _renderLoadingCard()
    {
        return `<div class="history-sheet__entry-card history-sheet__entry-card--loading">Loading…</div>`
    }

    _renderPreviewCard(kind)
    {
        // Designed empty state — a dotted skeleton card showing the shape of
        // a populated row, plus a one-line caption naming the action that
        // would fill it.
        if(kind === 'reflections')
        {
            return `
                <div class="history-sheet__entry-card history-sheet__entry-card--preview">
                    <div class="history-sheet__entry-meta">
                        <span class="history-sheet__entry-date">18 Mar</span>
                        <span class="history-sheet__entry-ctx">school</span>
                    </div>
                    <p class="history-sheet__entry-quote">"I felt tired today, but the chemistry lab made me realise…"</p>
                </div>
                <p class="history-sheet__preview-caption">Your first voice reflection will appear like this.</p>
            `
        }
        if(kind === 'crystallised')
        {
            return `
                <div class="history-sheet__entry-card history-sheet__entry-card--preview">
                    <div class="history-sheet__entry-meta">
                        <span class="history-sheet__entry-date">12 Apr</span>
                        ${this._renderDimensionChip('values', true)}
                        <span class="history-sheet__strength" data-strength="medium" aria-label="medium strength">
                            <span></span><span></span><span></span>
                        </span>
                    </div>
                    <p class="history-sheet__entry-quote">"I value honesty most when it costs me something."</p>
                </div>
                <p class="history-sheet__preview-caption">Claims crystallise when the Connector commits a pattern from your reflections.</p>
            `
        }
        if(kind === 'forgotten')
        {
            return `
                <div class="history-sheet__entry-card history-sheet__entry-card--preview">
                    <div class="history-sheet__entry-meta">
                        <span class="history-sheet__entry-date">2 Jun</span>
                        ${this._renderDimensionChip('interests', true)}
                        <span class="history-sheet__entry-held">held 4 months</span>
                    </div>
                    <p class="history-sheet__entry-quote">"I thought I cared about debate, but it's the prep I love."</p>
                </div>
                <p class="history-sheet__preview-caption">Claims you let go land here, with how long you held them.</p>
            `
        }
        if(kind === 'dominant')
        {
            const counts = { values: 0, interests: 0, personality: 0, skills: 0 }
            return this._renderDimensionBars(counts, 0, /* preview */ true)
        }
        return ''
    }

    _renderReflectionList(rows, total)
    {
        if(!rows || rows.length === 0) return this._renderPreviewCard('reflections')
        const cap = 6
        const shown = rows.slice(0, cap)
        const moreCount = Math.max(0, (total || rows.length) - shown.length)
        const items = shown.map(r => `
            <div class="history-sheet__entry-card">
                <div class="history-sheet__entry-meta">
                    <span class="history-sheet__entry-date">${escapeHtml(formatShortDate(r.createdAt))}</span>
                    <span class="history-sheet__entry-ctx">${escapeHtml(r.contextType || '')}</span>
                </div>
                <p class="history-sheet__entry-quote">${escapeHtml(this._truncate(r.transcript, 160))}</p>
            </div>
        `).join('')
        const more = moreCount > 0
            ? `<p class="history-sheet__more">+ ${moreCount} more this year</p>`
            : ''
        return items + more
    }

    _renderClaimList(rows, total, mode)
    {
        if(!rows || rows.length === 0) return this._renderPreviewCard(mode)
        const cap = 6
        const shown = rows.slice(0, cap)
        const moreCount = Math.max(0, (total || rows.length) - shown.length)
        const items = shown.map(r =>
        {
            const date = mode === 'forgotten' ? r.forgottenAt : r.committedAt
            let held = ''
            if(mode === 'forgotten')
            {
                const months = monthsBetween(r.committedAt, r.forgottenAt)
                if(months !== null) held = `<span class="history-sheet__entry-held">held ${months} month${months === 1 ? '' : 's'}</span>`
            }
            return `
                <div class="history-sheet__entry-card">
                    <div class="history-sheet__entry-meta">
                        <span class="history-sheet__entry-date">${escapeHtml(formatShortDate(date))}</span>
                        ${this._renderDimensionChip(r.dimension)}
                        ${held || this._renderStrengthDots(r.strength)}
                    </div>
                    <p class="history-sheet__entry-quote">${escapeHtml(this._truncate(r.verbatimQuote, 200))}</p>
                </div>
            `
        }).join('')
        const more = moreCount > 0
            ? `<p class="history-sheet__more">+ ${moreCount} more this year</p>`
            : ''
        return items + more
    }

    _renderDimensionChip(dimension, isPreview = false)
    {
        const colors = DIMENSION_COLORS[dimension]
        if(!colors) return ''
        const label = DIMENSION_LABEL[dimension] || dimension
        const style = `background: ${colors.soft}; color: ${colors.ink}; border-color: ${colors.accent};`
        const cls = isPreview ? 'history-sheet__dim-chip is-preview' : 'history-sheet__dim-chip'
        return `<span class="${cls}" style="${style}">${escapeHtml(label)}</span>`
    }

    _renderStrengthDots(strength)
    {
        const n = STRENGTH_LEVEL[strength] || 0
        return `<span class="history-sheet__strength" data-strength="${escapeHtml(strength || '')}" aria-label="${escapeHtml(strength || 'unknown')} strength">
            <span class="${n >= 1 ? 'is-filled' : ''}"></span>
            <span class="${n >= 2 ? 'is-filled' : ''}"></span>
            <span class="${n >= 3 ? 'is-filled' : ''}"></span>
        </span>`
    }

    _renderDimensionBars(counts, total, isPreview = false)
    {
        const safeCounts = counts || { values: 0, interests: 0, personality: 0, skills: 0 }
        const max = Math.max(1, safeCounts.values, safeCounts.interests, safeCounts.personality, safeCounts.skills)
        const dominantDim = !isPreview && (this._lastSummary && this._lastSummary.kind === 'ok')
            ? this._lastSummary.dominantDimension
            : null
        const dims = ['values', 'interests', 'personality', 'skills']
        const bars = dims.map(dim =>
        {
            const count = safeCounts[dim] || 0
            const pct = isPreview ? 0 : Math.round((count / max) * 100)
            const colors = DIMENSION_COLORS[dim]
            const isDominant = dim === dominantDim
            return `
                <div class="history-sheet__dim-row${isDominant ? ' is-dominant' : ''}">
                    <span class="history-sheet__dim-row-label" style="color: ${colors.ink};">${DIMENSION_LABEL[dim]}</span>
                    <span class="history-sheet__dim-row-bar">
                        <span class="history-sheet__dim-row-fill" style="width: ${pct}%; background: ${colors.accent};"></span>
                    </span>
                    <span class="history-sheet__dim-row-count">${count}</span>
                </div>
            `
        }).join('')
        const caption = isPreview
            ? '<p class="history-sheet__preview-caption">Your dominant dimension reflects which kind of claim you crystallise most.</p>'
            : ''
        return `<div class="history-sheet__dim-bars">${bars}</div>${caption}`
    }

    _truncate(text, max)
    {
        if(!text) return ''
        const trimmed = String(text).replace(/\s+/g, ' ').trim()
        if(trimmed.length <= max) return trimmed
        return trimmed.slice(0, max - 1).trimEnd() + '…'
    }

    _renderSummaryError()
    {
        this.narrativeEl.textContent = 'Could not load this year yet.'
        this.statsEl.innerHTML = ''
    }

    _renderIsland(islandState)
    {
        const sproutsView = this.view?.sprouts
        const trees = Array.isArray(islandState?.bloomedTrees) ? islandState.bloomedTrees : []
        const isEmpty = !islandState || trees.length === 0

        // The island slot is a transparent passthrough — the live engine
        // canvas behind it is what users actually see. We never inject a
        // fallback SVG anymore; the canvas already renders a meaningful
        // base island even when no claims have bloomed yet. We just toggle
        // setTimelapseSubset to swap between live and historical states.
        if(this.islandArtSlot)
        {
            this.islandArtSlot.hidden = true
            this.islandArtSlot.innerHTML = ''
        }

        if(isEmpty)
        {
            this._restoreLiveIsland()
            if(this.islandPlaceholder)
            {
                this.islandPlaceholder.textContent = islandState
                    ? 'Nothing bloomed this year yet · drag to look around'
                    : 'Drag · scroll · pick a year above'
                this.islandPlaceholder.hidden = false
            }
            this.sourceLabelEl.hidden = true
            // Re-render the preview so the empty/base island reflects in
            // the slot right away (after the subset reset above lands).
            if(typeof requestAnimationFrame === 'function')
            {
                requestAnimationFrame(() => this._renderPreview())
            }
            return
        }

        if(this.islandPlaceholder)
        {
            this.islandPlaceholder.textContent = 'Drag · scroll'
            this.islandPlaceholder.hidden = false
        }
        try { sproutsView?.setTimelapseSubset?.(trees) }
        catch(err) { console.warn('[HistorySheet] setTimelapseSubset failed', err) }
        // Re-render the preview after the bloomed-tree subset has applied
        // so the slot captures the new year as a frozen moment.
        if(typeof requestAnimationFrame === 'function')
        {
            requestAnimationFrame(() => this._renderPreview())
        }

        if(islandState.unavailable)
        {
            this.sourceLabelEl.textContent = 'Island snapshot unavailable'
            this.sourceLabelEl.hidden = false
        }
        else if(islandState.source === 'snapshot')
        {
            const date = islandState.capturedAt
                ? new Date(islandState.capturedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                : ''
            this.sourceLabelEl.textContent = date ? `Snapshot from ${date}` : 'Snapshot'
            this.sourceLabelEl.hidden = false
        }
        else if(islandState.source === 'reconstructed')
        {
            this.sourceLabelEl.textContent = 'Reconstructed from your claims'
            this.sourceLabelEl.hidden = false
        }
        else
        {
            this.sourceLabelEl.hidden = true
        }
    }

    _restoreLiveIsland()
    {
        const sproutsView = this.view?.sprouts
        try { sproutsView?.setTimelapseSubset?.(null) } catch(_) {}
    }

    // ── Contained island preview (Growth tab) ───────────────────────────
    //
    // A self-contained Three.js viewport mounted inside the island slot.
    // Shares the engine's `view.scene` so `setTimelapseSubset` already
    // drives which bloomed trees are visible per year. Renders through its
    // own camera + OrbitControls so the main game camera stays put.
    //
    // The view is meant to read as a "captured moment" the student can
    // inspect — not a second live window. Two design choices enforce that:
    //   1. Animated subsystems (kira, butterflies, fireflies, ambient
    //      particles) are hidden from the preview camera via Three.js
    //      layers — they stay on layer 2; the preview camera sees only
    //      layer 0 (static island, grass, trees, bloomed sprouts). The
    //      main camera is moved to see both layers so the live game looks
    //      unchanged.
    //   2. No continuous rAF — we render on `controls.change` events
    //      (drag / zoom) and on year-change. Between interactions the
    //      canvas freezes on the last frame.

    _initPreviewView()
    {
        if(this._previewRenderer) return
        if(!this.root || !this.view?.scene) return
        const slot = this.root.querySelector('[data-island]')
        if(!slot) return

        this._hideAnimatedFromPreview()

        const canvas = document.createElement('canvas')
        canvas.className = 'history-sheet__island-canvas'
        // Insert as first child so the placeholder caption + source label
        // (positioned absolutely) stay on top of the canvas.
        slot.insertBefore(canvas, slot.firstChild)
        this._previewCanvas = canvas

        const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            premultipliedAlpha: false,
        })
        renderer.setClearAlpha(0)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        this._previewRenderer = renderer

        // Bird's-eye 3/4 framing — clearly distinct from the main game's
        // shoulder-height POV so the preview reads as a snapshot, not a
        // second live window.
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200)
        camera.position.set(0, 16, 22)
        camera.layers.set(0)
        this._previewCamera = camera

        const controls = new OrbitControls(camera, canvas)
        controls.enableDamping = false
        controls.enablePan = false
        controls.minDistance = 8
        controls.maxDistance = 45
        controls.minPolarAngle = 0.15
        controls.maxPolarAngle = Math.PI * 0.48
        controls.target.set(0, 1.2, 0)
        controls.update()
        this._previewControls = controls

        this._onPreviewControlsChange = () => this._renderPreview()
        controls.addEventListener('change', this._onPreviewControlsChange)

        this._resizePreviewView()
        try
        {
            this._previewResizeObserver = new ResizeObserver(() => this._resizePreviewView())
            this._previewResizeObserver.observe(slot)
        }
        catch(_) { /* defensive: older browsers without ResizeObserver */ }

        // Initial paint — one frame's delay so any pending setTimelapseSubset
        // has applied before we capture.
        if(typeof requestAnimationFrame === 'function')
        {
            requestAnimationFrame(() => this._renderPreview())
        }
        else
        {
            this._renderPreview()
        }
    }

    _renderPreview()
    {
        if(!this._previewRenderer || !this.isOpen) return
        if(this.activeTab !== 'growth') return
        try
        {
            this._previewRenderer.render(this.view.scene, this._previewCamera)
        }
        catch(err) { console.warn('[HistorySheet] preview render failed', err) }
    }

    _resizePreviewView()
    {
        if(!this._previewRenderer || !this._previewCanvas) return
        const parent = this._previewCanvas.parentNode
        if(!parent) return
        const rect = parent.getBoundingClientRect()
        const w = Math.max(2, Math.floor(rect.width))
        const h = Math.max(2, Math.floor(rect.height))
        this._previewRenderer.setSize(w, h, false)
        this._previewCamera.aspect = w / h
        this._previewCamera.updateProjectionMatrix()
        this._renderPreview()
    }

    // Mark animated subsystems' Object3D roots as layer-2-only so the
    // preview camera (layer 0) skips them. The main camera (this.view
    // .camera.instance) is upgraded to see both layers so the live game
    // looks unchanged. Capture references on `this` so dispose can revert
    // exactly the objects we touched — never assume what other code may
    // have added or removed since.
    _hideAnimatedFromPreview()
    {
        if(this._previewHiddenObjects) return  // already applied
        const v = this.view
        const candidates = [
            v?.kira?.group,
            v?.butterflies?.group,
            v?.fireflies?.group,
            v?.particles?.points,
            v?.aurora?.group,
            v?.rain?.group,
        ].filter(Boolean)
        const hidden = []
        for(const root of candidates)
        {
            const touched = []
            root.traverse((obj) =>
            {
                touched.push({ obj, prevMask: obj.layers.mask })
                obj.layers.set(2)
            })
            hidden.push({ root, touched })
        }
        this._previewHiddenObjects = hidden

        // Keep the main camera seeing both layers.
        const mainCam = v?.camera?.instance
        if(mainCam)
        {
            this._previewMainCamPrevMask = mainCam.layers.mask
            mainCam.layers.enable(2)
        }
    }

    _restoreAnimatedToScene()
    {
        if(!this._previewHiddenObjects) return
        for(const { touched } of this._previewHiddenObjects)
        {
            for(const { obj, prevMask } of touched)
            {
                obj.layers.mask = prevMask
            }
        }
        this._previewHiddenObjects = null

        const mainCam = this.view?.camera?.instance
        if(mainCam && this._previewMainCamPrevMask !== undefined)
        {
            mainCam.layers.mask = this._previewMainCamPrevMask
            this._previewMainCamPrevMask = undefined
        }
    }

    _disposePreviewView()
    {
        if(this._previewControls && this._onPreviewControlsChange)
        {
            try { this._previewControls.removeEventListener('change', this._onPreviewControlsChange) } catch(_) {}
        }
        this._onPreviewControlsChange = null
        if(this._previewResizeObserver)
        {
            try { this._previewResizeObserver.disconnect() } catch(_) {}
            this._previewResizeObserver = null
        }
        if(this._previewControls)
        {
            try { this._previewControls.dispose() } catch(_) {}
            this._previewControls = null
        }
        if(this._previewRenderer)
        {
            try { this._previewRenderer.dispose() } catch(_) {}
            this._previewRenderer = null
        }
        if(this._previewCanvas)
        {
            try { this._previewCanvas.remove() } catch(_) {}
            this._previewCanvas = null
        }
        this._previewCamera = null
        this._restoreAnimatedToScene()
    }

    update() {}
}
