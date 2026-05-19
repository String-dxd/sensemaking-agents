/**
 * Growth sheet — year-over-year monitoring surface.
 *
 * Layout: year-pill scrubber at the top, central historical island view (the
 * existing SproutsView fed via setTimelapseSubset), summary panel below
 * (mobile) or alongside (desktop). Source-mode label tells the student
 * whether the year's island is a real snapshot or a claim-history
 * reconstruction.
 *
 * Read paths:
 *   - /api/growth/summary           — voice reflections, claim counts, dominant dimension
 *   - /api/growth/island-state-at   — bloomed-trees payload for the year
 *
 * The sheet NEVER writes to the Sprouts slice. setTimelapseSubset is the
 * only entry into the view; on sheet close it is called with null to
 * restore the live present-day island.
 *
 * Reduced motion: scrub transitions become crossfades and the bob/pulse
 * tweens on the historical island pause via the existing
 * .sprout reduced-motion CSS rule.
 */

import State from '../State/State.js'
import View from './View.js'

const GROWTH_API = {
    summary: '/api/growth/summary',
    islandStateAt: '/api/growth/island-state-at',
}

export default class GrowthSheet
{
    constructor()
    {
        this.state = State.getInstance()
        this.view  = View.getInstance()

        const root = document.createElement('div')
        root.className = 'growth-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-labelledby', 'growth-sheet-title')
        root.innerHTML = `
            <button class="growth-sheet__close" type="button" aria-label="Close">×</button>
            <header class="growth-sheet__header">
                <span class="growth-sheet__eyebrow">Growth</span>
                <h1 class="growth-sheet__title" id="growth-sheet-title">Your island, year by year</h1>
                <p class="growth-sheet__subtitle">Scrub through the years to see what you collected, planted, and let go of.</p>
            </header>

            <nav class="growth-sheet__scrubber" role="tablist" aria-label="Year">
                <div class="growth-sheet__scrubber-empty" data-empty hidden>
                    <p>Year-by-year tracking starts after your first <em>voice</em> reflection.</p>
                    <p class="growth-sheet__scrubber-empty-hint">Mood pins and photo / ask captures don't count yet — they live only on this device. Voice reflections persist on the server, which is what this view needs to look across time.</p>
                </div>
                <div class="growth-sheet__scrubber-pills" data-pills></div>
            </nav>

            <div class="growth-sheet__body">
                <div class="growth-sheet__island" data-island>
                    <div class="growth-sheet__source-label" data-source hidden></div>
                </div>
                <aside class="growth-sheet__summary" data-summary>
                    <p class="growth-sheet__narrative" data-narrative></p>
                    <ul class="growth-sheet__stats" data-stats></ul>
                </aside>
            </div>
        `
        document.body.appendChild(root)
        this.root = root

        this.closeBtn       = root.querySelector('.growth-sheet__close')
        this.emptyEl        = root.querySelector('[data-empty]')
        this.pillsEl        = root.querySelector('[data-pills]')
        this.sourceLabelEl  = root.querySelector('[data-source]')
        this.narrativeEl    = root.querySelector('[data-narrative]')
        this.statsEl        = root.querySelector('[data-stats]')

        this.isOpen      = false
        this.activeYear  = null
        this.years       = []
        this._yearsFetch = null
        this._inFlight   = false

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

    open()
    {
        if(!this.root) return
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true

        this._loadYears().catch(err =>
        {
            console.warn('[GrowthSheet] loadYears failed', err)
        })
    }

    close()
    {
        if(!this.isOpen) return
        this.root.setAttribute('aria-hidden', 'true')
        this.root.classList.remove('is-open')
        this.isOpen = false
        this._restoreLiveIsland()
        try { this.view?.overlayController?.noteClosed?.('growth') } catch(_) {}
    }

    _handleClick(event)
    {
        if(event.target === this.closeBtn || event.target.closest?.('.growth-sheet__close'))
        {
            event.preventDefault()
            this.close()
            return
        }
        const pill = event.target.closest?.('.growth-sheet__pill')
        if(pill && pill.dataset?.year)
        {
            const year = Number.parseInt(pill.dataset.year, 10)
            if(Number.isFinite(year)) this._selectYear(year)
        }
    }

    /**
     * Fetch the years where this student has any activity. We derive them
     * from a single summary lookup against the latest year as a probe;
     * a real implementation could expose a dedicated `/api/growth/years`
     * endpoint, but for v1 we use a small client-side year range as a
     * starting set and let the server confirm which buckets have data.
     */
    async _loadYears()
    {
        // Probe the last 5 years + current year. Years that return
        // `no_data` are dropped from the scrubber.
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
                <button type="button" class="growth-sheet__pill${isActive}" data-year="${year}" role="tab" aria-selected="${year === this.activeYear}">
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
            if(this.activeYear !== year) return  // user scrubbed away mid-flight
            this._renderSummary(summary)
            this._renderIsland(islandState)
        }).catch(err =>
        {
            console.warn('[GrowthSheet] year load failed', err)
        }).finally(() =>
        {
            this._inFlight = false
        })
    }

    async _fetchSummary(year)
    {
        const url = `${GROWTH_API.summary}?year=${year}`
        const response = await fetch(url, { credentials: 'same-origin' })
        if(!response.ok) throw new Error(`growth-summary ${response.status}`)
        return response.json()
    }

    async _fetchIslandState(year)
    {
        const url = `${GROWTH_API.islandStateAt}?year=${year}`
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
            <li class="growth-sheet__stat">
                <span class="growth-sheet__stat-label">${stat.label}</span>
                <span class="growth-sheet__stat-value">${stat.value}</span>
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
        catch(err) { console.warn('[GrowthSheet] setTimelapseSubset failed', err) }

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
