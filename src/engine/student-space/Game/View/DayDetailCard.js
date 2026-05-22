/**
 * DayDetailCard — inline content panel rendered alongside the Calendar
 * grid. Renders the mood pins, captures, and teacher events for a single
 * day in the same row idiom FacetView uses.
 *
 * History — this used to be a right-slide overlay that portaled into the
 * active sheet's root to fix z-stacking. Under the sidebar-nav-content-in-page
 * redesign the day detail is no longer an overlay: the calendar grid lives
 * in the right pane, and the day's detail content renders inline below it
 * (or beside it, depending on viewport). The owner (CalendarSheet) mounts
 * this card into a `data-role="day-detail-slot"` element inside the same
 * sheet's content area; the card has no fixed position and no slide
 * animation of its own.
 *
 * Lifetime is still owned by CalendarSheet — when History embeds the
 * Calendar's root DOM into its Timeline pane, the day-detail slot comes
 * along with it for free, so no portaling is needed.
 */

import State from '../State/State.js'

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

        const root = document.createElement('section')
        root.className = 'day-detail-card'
        root.setAttribute('aria-hidden', 'true')
        // No close × — the card lives inline alongside the calendar, so
        // there's nothing to dismiss. Picking another day swaps the content;
        // the empty placeholder paints itself when no day is selected.
        root.innerHTML = `
            <header class="day-detail-card__head">
                <p class="day-detail-card__eyebrow">Day</p>
                <h2 class="day-detail-card__title"></h2>
            </header>
            <p class="day-detail-card__placeholder">Pick a day to see what was captured.</p>
            <section class="day-detail-card__section" data-section="moods" hidden>
                <h3 class="day-detail-card__eyebrow">Moods</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <section class="day-detail-card__section" data-section="captures" hidden>
                <h3 class="day-detail-card__eyebrow">Reflections</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <section class="day-detail-card__section" data-section="events" hidden>
                <h3 class="day-detail-card__eyebrow">From school</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <p class="day-detail-card__empty" hidden>Nothing logged this day.</p>
        `
        // Don't mount yet — the parent CalendarSheet calls mount(slotEl) with
        // the inline slot inside its own contentSlot.
        this.root  = root
        this.placeholderEl = root.querySelector('.day-detail-card__placeholder')
        this.titleEl = root.querySelector('.day-detail-card__title')
        this.emptyEl = root.querySelector('.day-detail-card__empty')
        this.reviewInFlightEntryId = null
        this.reviewInFlightStatus = null
        this.reviewError = null

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
        }
        root.addEventListener('click', this._onRootClick)
    }

    /**
     * Mount the inline card into the parent calendar's day-detail slot.
     * Called once by the owner (CalendarSheet) right after constructing
     * the chrome — the slot lives inside the calendar's contentSlot, so
     * embedding moves with the calendar automatically.
     */
    mount(slotEl)
    {
        if(!slotEl || !this.root) return
        if(this.root.parentNode !== slotEl) slotEl.appendChild(this.root)
    }

    /**
     * Tear-down hook called from CalendarSheet.dispose() (since the
     * calendar owns this card's lifetime). No document/window listeners
     * are registered — just detach the root.
     */
    dispose()
    {
        if(this._swapTimer) { clearTimeout(this._swapTimer); this._swapTimer = null }
        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.titleEl = null
        this.emptyEl = null
        this.placeholderEl = null
    }

    /**
     * Show the day's detail inline. Replaces whatever day was previously
     * shown — there's no separate "close" because the card lives in the
     * calendar's content surface; picking another day swaps the content.
     *
     * Motion: when re-opening with a new date (card already `is-open`),
     * we briefly toggle the `.is-swapping` class so the CSS keyframe
     * re-fires the fade-up. Without this, swapping days while the card
     * is open looks instant because the open-state transition already
     * settled on the previous day.
     */
    open({ date } = {})
    {
        if(!date) return
        if(!this.root) return
        const wasOpen = this.isOpen
        this.date = date
        this.titleEl.textContent = formatDate(date)
        if(this.placeholderEl) this.placeholderEl.hidden = true
        this._render()
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
        if(wasOpen)
        {
            // Restart the entrance keyframe so the swap reads as motion, not
            // an instant content replacement. Force a reflow between class
            // removal and re-add or the browser collapses both into a no-op.
            this.root.classList.remove('is-swapping')
            // eslint-disable-next-line no-unused-expressions
            void this.root.offsetWidth
            this.root.classList.add('is-swapping')
            clearTimeout(this._swapTimer)
            this._swapTimer = setTimeout(() => this.root?.classList?.remove('is-swapping'), 240)
        }
    }

    /**
     * Reset the card back to the empty placeholder. Used when the calendar
     * sheet closes; left as a noop for symmetry with the prior overlay API.
     */
    close()
    {
        if(!this.isOpen) return
        // Cancel any in-flight swap animation timer so a fast open→close
        // sequence doesn't leave `.is-swapping` lingering on the detached
        // card after the timer fires (it would also no-op via the
        // root?.classList chain, but clearing is cleaner).
        if(this._swapTimer) { clearTimeout(this._swapTimer); this._swapTimer = null }
        this.root.classList.remove('is-open')
        this.root.classList.remove('is-swapping')
        this.root.setAttribute('aria-hidden', 'true')
        if(this.titleEl) this.titleEl.textContent = ''
        if(this.placeholderEl) this.placeholderEl.hidden = false
        const sections = this.root.querySelectorAll('.day-detail-card__section')
        for(const s of sections) s.hidden = true
        if(this.emptyEl) this.emptyEl.hidden = true
        this.isOpen = false
        this.date = null
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
                const reviewing = this.reviewInFlightEntryId === c.backendMirrorEntryId
                const confirmLabel = reviewing && this.reviewInFlightStatus === 'confirmed' ? 'Confirming...' : 'Confirm'
                const forgetLabel = reviewing && this.reviewInFlightStatus === 'forgotten' ? 'Forgetting...' : 'Forget'
                const disabled = reviewing ? ' disabled aria-busy="true"' : ''
                const actions = c.backendMirrorEntryId && c.reviewStatus === 'pending'
                    ? `<div class="day-detail-row__actions">
                        <button type="button" data-review-action="confirmed" data-entry-id="${c.backendMirrorEntryId}"${disabled}>${confirmLabel}</button>
                        <button type="button" data-review-action="forgotten" data-entry-id="${c.backendMirrorEntryId}"${disabled}>${forgetLabel}</button>
                      </div>`
                    : ''
                const retry = c.syncStatus === 'failed' && this.backend?.submitReflection
                    ? `<div class="day-detail-row__actions">
                        <button type="button" data-sync-action="retry" data-capture-id="${escapeAttr(c.id)}">Retry sync</button>
                      </div>`
                    : ''
                const reviewError = this.reviewError && this.reviewError.entryId === c.backendMirrorEntryId
                    ? `<div class="day-detail-row__error" role="alert">${escapeHtml(this.reviewError.message)}</div>`
                    : ''
                const sub = [status, sync, prompt, actions, retry, reviewError].filter(Boolean).join(' ')
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
        if(this.placeholderEl) this.placeholderEl.hidden = true
    }

    async _reviewReflection(button)
    {
        if(!this.backend?.updateReflectionReview) return
        const entryId = parseInt(button.dataset.entryId || '', 10)
        const status = button.dataset.reviewAction
        if(!Number.isInteger(entryId) || (status !== 'confirmed' && status !== 'forgotten')) return
        this.reviewInFlightEntryId = entryId
        this.reviewInFlightStatus = status
        this.reviewError = null
        this._render()
        try
        {
            const updated = await this.backend.updateReflectionReview({ entryId, status })
            this._patchReviewCapture(entryId, status, updated)
            try
            {
                const snapshot = await this.backend.refreshSnapshot?.()
                if(snapshot) this.state.applyBackendSnapshot?.(snapshot)
            }
            catch(refreshErr)
            {
                console.warn('[DayDetailCard] reflection review snapshot refresh failed', refreshErr)
            }
            this._render()
        }
        catch(err)
        {
            const message = err instanceof Error ? err.message : String(err)
            this.reviewError = { entryId, message: `Review update failed: ${message}` }
            console.warn('[DayDetailCard] reflection review failed', err)
            this._render()
        }
        finally
        {
            this.reviewInFlightEntryId = null
            this.reviewInFlightStatus = null
            this._render()
        }
    }

    _patchReviewCapture(entryId, status, updated)
    {
        const patch = {
            reviewStatus: updated?.reviewStatus || status,
            ...(updated?.transcript ? { text: updated.transcript } : {}),
            ...(updated?.contextType ? { contextType: updated.contextType } : {}),
            ...(updated
                ? {
                    reframe: {
                        headline: updated.storyReframe || '',
                        highlightPhrase: updated.inferredMeaning || '',
                        themes: updated.contextType ? [updated.contextType] : [],
                        needs: [],
                        moods: [],
                    },
                }
                : {}),
        }
        let patched = this.state.captures?.patch?.(`mirror:${entryId}`, patch)
        if(patched) return patched
        const capture = this.state.captures?.entries?.find?.((c) => c.backendMirrorEntryId === entryId)
        if(capture?.id) patched = this.state.captures?.patch?.(capture.id, patch)
        return patched
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
