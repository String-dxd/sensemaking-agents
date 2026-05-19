/**
 * DayDetailCard — right-slide overlay child of CalendarSheet. Opens when
 * the student taps a day cell; renders the mood pins, captures, and teacher
 * events for that day in the same row idiom FacetView uses.
 *
 * Lives at z 32 so it lands above CalendarSheet (z 30). Closing this card
 * does NOT close the parent calendar — they are independent overlays
 * sharing semantic scope. Closing the calendar closes both.
 */

import State from '../State/State.js'
import OverlayController from './OverlayController.js'

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

const formatDate = (ymd) =>
{
    if(!ymd) return ''
    try
    {
        const d = new Date(`${ymd}T00:00:00`)
        return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }
    catch(_) { return ymd }
}

export default class DayDetailCard
{
    constructor()
    {
        this.state = State.getInstance()
        this.backend = this.state.backend || null

        const root = document.createElement('aside')
        root.className = 'day-detail-card'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="day-detail-card__close" type="button" aria-label="Close">×</button>
            <header class="day-detail-card__head">
                <p class="day-detail-card__eyebrow">Day</p>
                <h2 class="day-detail-card__title"></h2>
            </header>
            <section class="day-detail-card__section" data-section="moods">
                <h3 class="day-detail-card__eyebrow">Moods</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <section class="day-detail-card__section" data-section="captures">
                <h3 class="day-detail-card__eyebrow">Reflections</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <section class="day-detail-card__section" data-section="events">
                <h3 class="day-detail-card__eyebrow">From school</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <p class="day-detail-card__empty" hidden>Nothing logged this day.</p>
        `
        document.body.appendChild(root)
        this.root  = root
        this.titleEl = root.querySelector('.day-detail-card__title')
        this.emptyEl = root.querySelector('.day-detail-card__empty')

        this._onRootClick = (event) =>
        {
            const review = event.target.closest?.('[data-review-action]')
            if(review)
            {
                event.preventDefault()
                this._reviewReflection(review)
                return
            }
            const retry = event.target.closest?.('[data-sync-action="retry"]')
            if(retry)
            {
                event.preventDefault()
                this._retryReflectionSync(retry)
                return
            }
            if(event.target.closest('.day-detail-card__close')) this.close()
        }
        root.addEventListener('click', this._onRootClick)
    }

    /**
     * Tear-down hook called from CalendarSheet.dispose() (since the
     * calendar owns this card's lifetime). No document/window listeners
     * are registered — just detach the root.
     */
    dispose()
    {
        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.titleEl = null
        this.emptyEl = null
    }

    open({ date } = {})
    {
        if(!date) return
        this.date = date
        this.titleEl.textContent = formatDate(date)
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
        OverlayController.getInstance().noteClosed('dayDetail')
    }

    _render()
    {
        const moods = this.state.moodPins.pins.filter((p) => p.entryDate === this.date)
        const caps  = this.state.captures.entries.filter((c) => c.entryDate === this.date)
        const evs   = this.state.calendar.events.filter((e) => e.date === this.date)

        const sectionEls = this.root.querySelectorAll('.day-detail-card__section')

        const renderRow = (left, primary, sub) =>
            `<div class="day-detail-row">
                <span class="day-detail-row__dot">${left}</span>
                <div class="day-detail-row__body">
                    <div class="day-detail-row__primary">${primary}</div>
                    ${sub ? `<div class="day-detail-row__sub">${sub}</div>` : ''}
                </div>
            </div>`

        // Moods
        sectionEls[0].querySelector('.day-detail-card__rows').innerHTML = moods.map((p) =>
        {
            const col = MOOD_HEX[p.emotion] || '#888'
            const dot = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${col}"></span>`
            const cause = p.cause ? ` · ${escapeHtml(p.cause)}` : ''
            const note = p.note ? ` · "${escapeHtml(p.note)}"` : ''
            return renderRow(dot, escapeHtml(`${p.emotion} (${p.intensity}/4)`), cause + note)
        }).join('')

        // Captures
        sectionEls[1].querySelector('.day-detail-card__rows').innerHTML = caps.map((c) =>
        {
            if(c.kind === 'ask')
            {
                const text = escapeHtml((c.text || '').slice(0, 120))
                const status = c.reviewStatus ? `status: ${c.reviewStatus}` : ''
                const sync = syncLine(c)
                const prompt = c.prompt ? `prompt: ${escapeHtml(c.prompt)}` : ''
                const actions = c.backendMirrorEntryId && c.reviewStatus === 'pending'
                    ? `<div class="day-detail-row__actions">
                        <button type="button" data-review-action="confirmed" data-entry-id="${c.backendMirrorEntryId}">Confirm</button>
                        <button type="button" data-review-action="forgotten" data-entry-id="${c.backendMirrorEntryId}">Forget</button>
                      </div>`
                    : ''
                const retry = c.syncStatus === 'failed' && this.backend?.submitReflection
                    ? `<div class="day-detail-row__actions">
                        <button type="button" data-sync-action="retry" data-capture-id="${escapeAttr(c.id)}">Retry sync</button>
                      </div>`
                    : ''
                const sub = [status, sync, prompt, actions, retry].filter(Boolean).join(' ')
                return renderRow('✎', text || '<i>(empty)</i>', sub)
            }
            if(c.kind === 'photo')
            {
                const cap = c.caption ? escapeHtml(c.caption.slice(0, 120)) : '<i>(photo, no caption)</i>'
                return renderRow('📷', cap, '')
            }
            return renderRow('•', escapeHtml(c.kind), '')
        }).join('')

        // Events
        sectionEls[2].querySelector('.day-detail-card__rows').innerHTML = evs.map((e) =>
            renderRow('·', escapeHtml(e.label), escapeHtml(e.kind))
        ).join('')

        // Hide empty sections and decide whether to show the global empty msg.
        sectionEls[0].hidden = moods.length === 0
        sectionEls[1].hidden = caps.length  === 0
        sectionEls[2].hidden = evs.length   === 0
        this.emptyEl.hidden = (moods.length + caps.length + evs.length) !== 0
    }

    async _reviewReflection(button)
    {
        if(!this.backend?.updateReflectionReview) return
        const entryId = parseInt(button.dataset.entryId || '', 10)
        const status = button.dataset.reviewAction
        if(!Number.isInteger(entryId) || (status !== 'confirmed' && status !== 'forgotten')) return
        try
        {
            await this.backend.updateReflectionReview({ entryId, status })
            const snapshot = await this.backend.refreshSnapshot?.()
            if(snapshot) this.state.applyBackendSnapshot?.(snapshot)
            else this.state.captures?.patch?.(`mirror:${entryId}`, { reviewStatus: status })
            this._render()
        }
        catch(err)
        {
            console.warn('[DayDetailCard] reflection review failed', err)
        }
    }

    async _retryReflectionSync(button)
    {
        if(!this.backend?.submitReflection) return
        const captureId = button.dataset.captureId
        if(!captureId) return
        const capture = this.state.captures.findById?.(captureId)
        if(!capture || capture.kind !== 'ask') return
        try
        {
            this.state.captures.patch?.(capture.id, { syncStatus: 'syncing', syncError: '' })
            const result = await this.backend.submitReflection({
                localCaptureId: capture.id,
                transcript: capture.text || '',
                contextType: capture.contextType || 'school',
            })
            const mirror = result?.mirrorEntry
            if(mirror)
            {
                this.state.captures.patch?.(capture.id, {
                    backendMirrorEntryId: mirror.id,
                    reviewStatus: mirror.reviewStatus || 'pending',
                    syncStatus: 'synced',
                    syncError: '',
                    contextType: mirror.contextType || 'school',
                    reframe: {
                        headline: mirror.storyReframe || '',
                        highlightPhrase: mirror.inferredMeaning || '',
                        themes: [],
                        needs: [],
                        moods: [],
                    },
                })
            }
            this._render()
        }
        catch(err)
        {
            const message = err instanceof Error ? err.message : String(err)
            console.warn('[DayDetailCard] reflection sync retry failed', err)
            this.state.captures.patch?.(capture.id, { syncStatus: 'failed', syncError: message })
            this._render()
        }
    }
}

function escapeHtml(value)
{
    return String(value || '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch])
}

function escapeAttr(value) { return escapeHtml(value) }

function syncLine(c)
{
    if(c.syncStatus === 'failed') return `sync failed${c.syncError ? `: ${escapeHtml(c.syncError)}` : ''}`
    if(c.syncStatus === 'syncing') return 'syncing...'
    return ''
}
