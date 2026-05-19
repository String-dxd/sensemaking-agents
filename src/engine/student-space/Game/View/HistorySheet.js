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

import State from '../State/State.js'
import View from './View.js'

const HISTORY_API = {
    timeline:      '/api/growth/timeline',
    summary:       '/api/growth/summary',
    islandStateAt: '/api/growth/island-state-at',
}

const TABS = ['timeline', 'growth']

export default class HistorySheet
{
    constructor()
    {
        this.state = State.getInstance()
        this.view  = View.getInstance()

        const root = document.createElement('div')
        root.className = 'history-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-labelledby', 'history-sheet-title')
        root.innerHTML = `
            <button class="history-sheet__close" type="button" aria-label="Close">×</button>
            <header class="history-sheet__header">
                <span class="history-sheet__eyebrow">History</span>
                <h1 class="history-sheet__title" id="history-sheet-title">Look back</h1>
                <p class="history-sheet__subtitle">A chronological feed of what you recorded, and a year-by-year read on how it's adding up.</p>
            </header>

            <nav class="history-sheet__tabs" role="tablist">
                <button type="button" class="history-sheet__tab" data-tab="timeline" role="tab">Timeline</button>
                <button type="button" class="history-sheet__tab" data-tab="growth" role="tab">Growth</button>
            </nav>

            <section class="history-sheet__pane history-sheet__pane--timeline" data-pane="timeline" hidden>
                <div class="history-sheet__timeline-empty" data-timeline-empty hidden>
                    <p>Your first <em>voice</em> reflection will show up here.</p>
                    <p class="history-sheet__hint">Mood pins and photo / ask captures live on this device and don't show in History yet.</p>
                </div>
                <ul class="history-sheet__timeline" data-timeline-list></ul>
            </section>

            <section class="history-sheet__pane history-sheet__pane--growth" data-pane="growth" hidden>
                <nav class="history-sheet__scrubber" role="tablist" aria-label="Year">
                    <div class="history-sheet__scrubber-empty" data-empty hidden>
                        <p>Year-by-year tracking starts after your first <em>voice</em> reflection.</p>
                        <p class="history-sheet__hint">Mood pins and photo / ask captures don't count yet — they live only on this device. Voice reflections persist on the server, which is what this view needs to look across time.</p>
                    </div>
                    <div class="history-sheet__scrubber-pills" data-pills></div>
                </nav>
                <div class="history-sheet__body">
                    <div class="history-sheet__island" data-island>
                        <div class="history-sheet__source-label" data-source hidden></div>
                    </div>
                    <aside class="history-sheet__summary" data-summary>
                        <p class="history-sheet__narrative" data-narrative></p>
                        <ul class="history-sheet__stats" data-stats></ul>
                    </aside>
                </div>
            </section>
        `
        document.body.appendChild(root)
        this.root = root

        this.closeBtn          = root.querySelector('.history-sheet__close')
        this.tabEls            = Array.from(root.querySelectorAll('.history-sheet__tab'))
        this.paneTimelineEl    = root.querySelector('[data-pane="timeline"]')
        this.paneGrowthEl      = root.querySelector('[data-pane="growth"]')
        this.timelineEmptyEl   = root.querySelector('[data-timeline-empty]')
        this.timelineListEl    = root.querySelector('[data-timeline-list]')
        this.emptyEl           = root.querySelector('[data-empty]')
        this.pillsEl           = root.querySelector('[data-pills]')
        this.sourceLabelEl     = root.querySelector('[data-source]')
        this.narrativeEl       = root.querySelector('[data-narrative]')
        this.statsEl           = root.querySelector('[data-stats]')

        this.isOpen       = false
        this.activeTab    = 'growth'
        this.activeYear   = null
        this.years        = []
        this._inFlight    = false
        this._timelineLoaded = false

        this._onClick = (event) => this._handleClick(event)
        root.addEventListener('click', this._onClick)

        this._onKeyDown = (event) =>
        {
            if(this.isOpen && event.key === 'Escape') this.close()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    dispose()
    {
        if(this.isOpen) this._restoreLiveIsland()
        try { this.root.removeEventListener('click', this._onClick) } catch(_) {}
        try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
        try { this.root.remove() } catch(_) {}
        this.root = null
    }

    /**
     * Open the sheet. opts.tab (== 'timeline' | 'growth') sets the initial
     * tab; defaults to 'growth' so the chip's default landing is the
     * year-buckets view. `?sheet=calendar` deep link passes 'timeline'.
     */
    open(opts = {})
    {
        if(!this.root) return
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true

        const tab = opts.tab && TABS.includes(opts.tab) ? opts.tab : 'growth'
        this._setTab(tab)
    }

    close()
    {
        if(!this.isOpen) return
        this.root.setAttribute('aria-hidden', 'true')
        this.root.classList.remove('is-open')
        this.isOpen = false
        this._restoreLiveIsland()
        try { this.view?.overlayController?.noteClosed?.('history') } catch(_) {}
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

        if(tab === 'timeline' && !this._timelineLoaded) this._loadTimeline().catch(() => {})
        if(tab === 'growth' && this.years.length === 0) this._loadYears().catch(() => {})
    }

    _handleClick(event)
    {
        if(event.target === this.closeBtn || event.target.closest?.('.history-sheet__close'))
        {
            event.preventDefault()
            this.close()
            return
        }
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
        }
    }

    // ── Timeline tab ────────────────────────────────────────────────────

    async _loadTimeline()
    {
        try
        {
            const response = await fetch(HISTORY_API.timeline, { credentials: 'same-origin' })
            if(!response.ok) throw new Error(`timeline ${response.status}`)
            const payload = await response.json()
            this._timelineLoaded = true
            this._renderTimeline(payload)
        }
        catch(err)
        {
            console.warn('[HistorySheet] loadTimeline failed', err)
            this._renderTimeline({ kind: 'empty' })
        }
    }

    _renderTimeline(payload)
    {
        if(!payload || payload.kind === 'empty')
        {
            this.timelineEmptyEl.hidden = false
            this.timelineListEl.innerHTML = ''
            return
        }
        this.timelineEmptyEl.hidden = true
        const entries = Array.isArray(payload.entries) ? payload.entries : []
        this.timelineListEl.innerHTML = entries.map(entry =>
        {
            const date = entry.createdAt
                ? new Date(entry.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : ''
            const ctx = entry.contextType ? `<span class="history-sheet__timeline-ctx">${entry.contextType}</span>` : ''
            const text = String(entry.storyReframe || '').slice(0, 240)
            return `
                <li class="history-sheet__timeline-item">
                    <div class="history-sheet__timeline-meta">
                        <span class="history-sheet__timeline-date">${date}</span>
                        ${ctx}
                    </div>
                    <p class="history-sheet__timeline-text">${text}</p>
                </li>
            `
        }).join('')
    }

    // ── Growth tab ──────────────────────────────────────────────────────

    async _loadYears()
    {
        const currentYear = new Date().getUTCFullYear()
        const candidates = []
        for(let y = currentYear - 4; y <= currentYear; y++) candidates.push(y)

        const results = await Promise.all(
            candidates.map(year => this._fetchSummary(year).catch(() => null)),
        )

        const years = []
        for(let i = 0; i < candidates.length; i++)
        {
            const summary = results[i]
            if(summary && summary.kind === 'ok') years.push(candidates[i])
        }

        this.years = years
        this._renderPills()

        if(years.length > 0)
        {
            this._selectYear(years[years.length - 1])
        }
        else
        {
            this.emptyEl.hidden = false
        }
    }

    _renderPills()
    {
        this.pillsEl.innerHTML = this.years.map(year =>
        {
            const isActive = year === this.activeYear ? ' is-active' : ''
            return `
                <button type="button" class="history-sheet__pill${isActive}" data-year="${year}" role="tab" aria-selected="${year === this.activeYear}">
                    ${year}
                </button>
            `
        }).join('')
    }

    _selectYear(year)
    {
        if(this.activeYear === year) return
        this.activeYear = year
        this._renderPills()

        if(this._inFlight) return
        this._inFlight = true

        Promise.all([
            this._fetchSummary(year),
            this._fetchIslandState(year),
        ]).then(([summary, islandState]) =>
        {
            if(this.activeYear !== year) return
            this._renderSummary(summary)
            this._renderIsland(islandState)
        }).catch(err =>
        {
            console.warn('[HistorySheet] year load failed', err)
        }).finally(() =>
        {
            this._inFlight = false
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
        if(!summary || summary.kind === 'no_data')
        {
            this.narrativeEl.textContent = 'No activity this year.'
            this.statsEl.innerHTML = ''
            return
        }
        this.narrativeEl.textContent = summary.narrative || ''
        const stats = [
            { label: 'Voice reflections',   value: summary.voiceReflections },
            { label: 'Claims crystallised', value: summary.claimsCrystallised },
            { label: 'Claims let go',       value: summary.claimsForgotten },
        ]
        if(summary.dominantDimension)
        {
            stats.push({ label: 'Dominant dimension', value: summary.dominantDimension })
        }
        this.statsEl.innerHTML = stats.map(stat => `
            <li class="history-sheet__stat">
                <span class="history-sheet__stat-label">${stat.label}</span>
                <span class="history-sheet__stat-value">${stat.value}</span>
            </li>
        `).join('')
    }

    _renderIsland(islandState)
    {
        if(!islandState)
        {
            this._restoreLiveIsland()
            return
        }
        const sproutsView = this.view?.sprouts
        try { sproutsView?.setTimelapseSubset?.(islandState.bloomedTrees || []) }
        catch(err) { console.warn('[HistorySheet] setTimelapseSubset failed', err) }

        if(islandState.source === 'snapshot')
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

    update() {}
}
