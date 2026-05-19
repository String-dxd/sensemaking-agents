/**
 * Profile sheet — the written face of the student. Full-viewport, slides
 * up from below in 420 ms, four tabs (Values / Interests / Personality /
 * Skills), each tab showing:
 *
 *   1. Title + paragraph + "Open question" callout + "last refined" meta
 *   2. COLLECTION bento — one tile per canonical claim in the facet
 *      (8 / 6 / 2 / 6). Tapping a tile filters the TIMELINE below to that
 *      claim's quotes only; tapping again clears the filter.
 *   3. TIMELINE — vertical list of quote cards (italic quote + claim chip +
 *      confidence chip + two-tap forget + see-source-reflection link).
 *
 * The "forget" button uses a two-tap arm/confirm pattern instead of a modal,
 * per DESIGN.md's "no modal-as-first-thought" rule. First tap re-labels the
 * button to "tap again to forget" and tints it with the facet accent. A
 * second tap within 3.2s collapses the card and removes the quote through
 * Profile.forgetQuote (which writes through to localStorage). After 3.2s of
 * no second tap the button reverts to "forget".
 *
 * Source-reflection routing: each quote may carry a `sourceCaptureId` that
 * matches a row in Captures or MoodPins. The link opens the matching sheet
 * in read-only mode through OverlayController. Quotes without a source id
 * render the link as disabled with an explanatory tooltip — most v1.1 seed
 * quotes are "distilled from many" and have no single source.
 */

import State from '../State/State.js'
import { VIPS_BY_FACET, claimLabel, FACET_IDS } from '../Data/vipsTaxonomy.js'
import { FACET_THEMES, FACET_HEADERS, applyFacetVars } from './facets.js'
import { iconForClaim } from './claimIcons.js'
import ThumbnailRenderer from './ThumbnailRenderer.js'
import OverlayController from './OverlayController.js'

const TAB_ORDER = ['values', 'interests', 'personality', 'skills', 'relationships', 'choices']

// First-pass strategy for the two non-VIPS Profile tabs: close the engine
// sheet and navigate to the React route. Native engine panels for these
// surfaces are deferred to a follow-up plan (see
// docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md
// — Scope Boundaries → Deferred to Follow-Up Work).
const TAB_DEEP_LINKS = {
    relationships: '/library/relationships',
    choices:       '/library/choices',
}
const TAB_LABELS_EXTRA = {
    relationships: 'Relationships',
    choices:       'Choices',
}

const ARM_TIMEOUT_MS  = 3200
const FORGET_FADE_MS  = 200
const TAB_FADE_MS     = 110         // half of the 220ms total cross-fade

const formatRefined = (iso) =>
{
    if(!iso) return ''
    try
    {
        const d = new Date(iso)
        if(Number.isNaN(d.getTime())) return ''
        const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        return `last refined ${date}, ${time}`
    }
    catch(_) { return '' }
}

export default class ProfileSheet
{
    constructor()
    {
        this.state    = State.getInstance()
        this.profile  = this.state.profile
        this.backend  = this.state.backend || null

        this.activeFacet     = 'values'
        this.selectedClaimId = null
        this._armTimer       = null
        this._panelTimer     = null

        // Renders mini 3D thumbnails of each canonical claim's on-island
        // object once, cached as data URLs. The SVG silhouettes from
        // claimIcons.js stay as a safety fallback when the renderer can't
        // produce a thumbnail (eg. missing object mapping).
        try { this._thumbs = new ThumbnailRenderer() }
        catch(err)
        {
            console.warn('[ProfileSheet] thumbnail renderer init failed; falling back to SVG icons', err)
            this._thumbs = null
        }

        const root = document.createElement('div')
        root.className = 'profile-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="profile-sheet__close" type="button" aria-label="Close">×</button>
            <header class="profile-id">
                <div class="profile-id__avatar" role="img" aria-label="Profile picture">
                    <span class="profile-id__initial"></span>
                </div>
                <div class="profile-id__text">
                    <h1 class="profile-id__name"></h1>
                    <p  class="profile-id__class"></p>
                </div>
            </header>
            <nav class="profile-sheet__tabs" role="tablist">
                ${TAB_ORDER.map((f) => {
                    const label = FACET_THEMES[f]
                        ? (FACET_THEMES[f].eyebrow.split(' — ')[1] || f)
                        : (TAB_LABELS_EXTRA[f] || f)
                    return `
                    <button type="button"
                            class="profile-tab${f === 'values' ? ' is-active' : ''}"
                            role="tab"
                            data-facet="${f}">${label}</button>
                `}).join('')}
            </nav>
            <section class="profile-sheet__panel">
                <header class="profile-sheet__header">
                    <div class="profile-sheet__eyebrow-row">
                        <span class="profile-sheet__panel-eyebrow"></span>
                        <span class="profile-sheet__panel-tag"></span>
                    </div>
                    <h2 class="profile-sheet__title"></h2>
                    <p  class="profile-sheet__panel-subtitle"></p>
                    <ul class="vips-rows vips-rows--profile" role="list">
                        <li class="vips-row">
                            <span class="vips-row__label">Most common</span>
                            <p class="vips-row__body" data-row="most"></p>
                        </li>
                        <li class="vips-row">
                            <span class="vips-row__label">Quietly emerging</span>
                            <p class="vips-row__body" data-row="emerge"></p>
                        </li>
                    </ul>
                    <p  class="profile-sheet__summary"></p>
                    <aside class="profile-sheet__open-question">
                        <span class="profile-sheet__open-eyebrow">Open question</span>
                        <p class="profile-sheet__open-text"></p>
                    </aside>
                    <p class="profile-sheet__meta"></p>
                </header>

                <h3 class="profile-sheet__eyebrow">COLLECTION</h3>
                <ul class="profile-sheet__bento" role="list"></ul>

                <h3 class="profile-sheet__eyebrow profile-sheet__timeline-eyebrow">
                    TIMELINE<span class="profile-sheet__timeline-filter"></span>
                </h3>
                <ul class="profile-sheet__quote-list" role="list"></ul>
                <p class="profile-sheet__empty" hidden>No noticings here yet — capture a few from the island.</p>
            </section>
        `
        document.body.appendChild(root)
        this.root = root

        this.idAvatarEl  = root.querySelector('.profile-id__avatar')
        this.idInitialEl = root.querySelector('.profile-id__initial')
        this.idNameEl    = root.querySelector('.profile-id__name')
        this.idClassEl   = root.querySelector('.profile-id__class')

        this.titleEl     = root.querySelector('.profile-sheet__title')
        this.eyebrowEl   = root.querySelector('.profile-sheet__panel-eyebrow')
        this.tagEl       = root.querySelector('.profile-sheet__panel-tag')
        this.subtitleEl  = root.querySelector('.profile-sheet__panel-subtitle')
        this.rowMostEl   = root.querySelector('.profile-sheet__panel [data-row="most"]')
        this.rowEmergeEl = root.querySelector('.profile-sheet__panel [data-row="emerge"]')
        this.summaryEl   = root.querySelector('.profile-sheet__summary')
        this.openTextEl  = root.querySelector('.profile-sheet__open-text')
        this.metaEl      = root.querySelector('.profile-sheet__meta')
        this.bentoEl     = root.querySelector('.profile-sheet__bento')
        this.filterEl    = root.querySelector('.profile-sheet__timeline-filter')
        this.quoteListEl = root.querySelector('.profile-sheet__quote-list')
        this.emptyEl     = root.querySelector('.profile-sheet__empty')
        this.panelEl     = root.querySelector('.profile-sheet__panel')

        // Listener refs held on `this` so dispose() can detach them. The
        // document-level keydown is the leak risk; the root-attached click
        // would be GC'd with the detached root, but tracking it keeps the
        // teardown pattern uniform across sheets.
        this._onRootClick = (event) => this._onClick(event)
        root.addEventListener('click', this._onRootClick)

        this._onKeyDown = (event) =>
        {
            if(this.isOpen && event.key === 'Escape') this.close()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Removes the page-level
     * keydown listener (the root.remove() drops the bubbled click handler
     * with it) so a remount doesn't leak a closure tied to the old root.
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
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
    }

    // ── Open / close ──────────────────────────────────────────────────────

    /**
     * @param {Object} [opts]
     * @param {string} [opts.tab]      jump to a specific facet (values | …)
     * @param {string} [opts.claimId]  pre-select a specific claim's tile
     */
    open(opts = {})
    {
        const targetTab = opts.tab && FACET_IDS.includes(opts.tab) ? opts.tab : this.activeFacet
        this.activeFacet     = targetTab
        this.selectedClaimId = opts.claimId || null
        this._render(true)

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
        this._disarmForget()
        OverlayController.getInstance().noteClosed('profile')
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    _render(syncTabs = false)
    {
        const facet = this.profile.getFacet(this.activeFacet)
        if(!facet) return

        applyFacetVars(this.root, this.activeFacet)
        this._renderIdentity()

        const header = FACET_HEADERS[this.activeFacet] || {}
        this.eyebrowEl.textContent  = header.eyebrow ?? ''
        this.tagEl.textContent      = header.tag     ?? ''
        this.titleEl.textContent    = header.title   ?? this.activeFacet
        this.subtitleEl.textContent = header.subtitle ?? ''

        this._renderBreakdownRows()

        this.summaryEl.textContent  = facet.paragraph
        this.openTextEl.textContent = facet.openQuestion
        this.metaEl.textContent     = formatRefined(facet.lastRefinedAt)

        if(syncTabs)
        {
            for(const tab of this.root.querySelectorAll('.profile-tab'))
                tab.classList.toggle('is-active', tab.dataset.facet === this.activeFacet)
        }

        this._renderBento()
        this._renderTimeline()
    }

    /**
     * Most common / Right alongside / Quietly emerging — three ranked
     * canonical claims for the active facet. Same shape as the half-sheet
     * (FacetView) so the breakdown reads consistently across surfaces.
     */
    /**
     * Render the identity header — name, class, and avatar. When no avatar
     * dataUrl is set the avatar shows the student's initial on a cream/coral
     * circle (the existing palette) so the slot still reads as a person.
     */
    _renderIdentity()
    {
        const id = this.profile.identity ?? {}
        const name = (id.name && id.name.trim()) || 'Student'
        const klass = (id.className && id.className.trim()) || ''

        this.idNameEl.textContent  = name
        this.idClassEl.textContent = klass

        if(id.avatarDataUrl)
        {
            this.idAvatarEl.classList.add('has-photo')
            this.idAvatarEl.style.backgroundImage = `url(${id.avatarDataUrl})`
            this.idInitialEl.textContent = ''
        }
        else
        {
            this.idAvatarEl.classList.remove('has-photo')
            this.idAvatarEl.style.backgroundImage = ''
            this.idInitialEl.textContent = name.charAt(0).toUpperCase()
        }
    }

    _renderBreakdownRows()
    {
        const canonical = VIPS_BY_FACET[this.activeFacet] ?? []
        if(canonical.length === 0)
        {
            this.rowMostEl.textContent = this.rowEmergeEl.textContent = ''
            return
        }
        const counts = this.profile.countByClaim(this.activeFacet)
        const ranked = canonical
            .map((c) => ({ id: c.id, label: c.label, count: counts[c.id] ?? 0 }))
            .sort((a, b) => b.count - a.count)

        const used = new Set()
        const take = (candidate) =>
        {
            if(!candidate || used.has(candidate.id)) return null
            used.add(candidate.id)
            return candidate
        }
        const seen   = ranked.filter((c) => c.count > 0)
        const unseen = ranked.filter((c) => c.count === 0)

        const mostCommon = take(ranked[0])
        const quietlyEmerging = take(unseen.find((c) => !used.has(c.id)))
                             ?? take([...seen].reverse().find((c) => !used.has(c.id)))
                             ?? take(ranked.find((c) => !used.has(c.id)))
                             ?? mostCommon

        this.rowMostEl.textContent   = mostCommon?.label   ?? ''
        this.rowEmergeEl.textContent = quietlyEmerging?.label ?? ''
    }

    _renderBento()
    {
        const claims = VIPS_BY_FACET[this.activeFacet] || []
        const counts = this.profile.countByClaim(this.activeFacet)
        this.bentoEl.innerHTML = claims.map((c) =>
        {
            const count = counts[c.id] || 0
            const isSel = c.id === this.selectedClaimId
            const thumbUrl = this._thumbs ? this._thumbs.getThumbnail(c.id) : ''
            const icon = thumbUrl
                ? `<img class="bento-tile__thumb" src="${thumbUrl}" alt="" loading="lazy"/>`
                : iconForClaim(c.id)
            return `
                <li class="bento-tile${isSel ? ' is-selected' : ''}${count === 0 ? ' is-empty' : ''}"
                    data-claim-id="${c.id}"
                    role="listitem">
                    <span class="bento-tile__icon">${icon}</span>
                    <span class="bento-tile__label">${c.label}</span>
                    <span class="bento-tile__count">${count === 0 ? 'no noticings yet' : `${count} noticing${count === 1 ? '' : 's'}`}</span>
                </li>
            `
        }).join('')
    }

    _renderTimeline()
    {
        const facet = this.profile.getFacet(this.activeFacet)
        if(!facet) return

        const quotes = this.selectedClaimId
            ? facet.quotes.filter((q) => q.canonicalClaimId === this.selectedClaimId)
            : facet.quotes

        // newest first — quotes are stored in the order they were captured.
        const sorted = quotes.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

        if(this.selectedClaimId)
        {
            this.filterEl.textContent = ` · ${claimLabel(this.selectedClaimId)}`
        }
        else
        {
            this.filterEl.textContent = ''
        }

        if(sorted.length === 0)
        {
            this.quoteListEl.innerHTML = ''
            this.emptyEl.hidden = false
            return
        }

        this.emptyEl.hidden = true
        this.quoteListEl.innerHTML = sorted.map((q) =>
        {
            const conf = (q.confidence || 'medium').toUpperCase()
            const source = q.sourceCaptureId
                ? `<a class="quote-card__source" href="#" data-capture-id="${q.sourceCaptureId}">see source reflection →</a>`
                : `<span class="quote-card__source is-disabled" title="No source reflection — this insight was distilled from many.">see source reflection →</span>`
            return `
                <li class="quote-card" data-quote-id="${q.id}" ${q.backendTimelineEntryId ? `data-backend-timeline-entry-id="${q.backendTimelineEntryId}"` : ''}>
                    <p class="quote-card__text">${this._renderQuoteText(q.text)}</p>
                    <div class="quote-card__chips">
                        <span class="chip chip--claim">${claimLabel(q.canonicalClaimId)}</span>
                        <span class="chip chip--confidence chip--conf-${q.confidence || 'medium'}">${conf}</span>
                    </div>
                    <div class="quote-card__actions">
                        <button class="quote-card__forget" type="button" data-state="idle">forget</button>
                        ${source}
                    </div>
                </li>
            `
        }).join('')
    }

    _renderQuoteText(text)
    {
        if(!text) return ''
        const safe = text.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch])
        return `“${safe}”`
    }

    // ── Click delegation ──────────────────────────────────────────────────

    _onClick(event)
    {
        const target = event.target

        if(target.closest('.profile-sheet__close')) { this.close(); return }

        const tab = target.closest('.profile-tab')
        if(tab)
        {
            const facet = tab.dataset.facet
            if(!facet) return
            // Non-VIPS tabs (relationships, choices) deep-link out to the
            // React route. Close the sheet first so the engine doesn't render
            // a half-state in the background after navigation. Idempotent:
            // double-clicks during the close → navigate sequence are absorbed
            // by the `isOpen` guard in close() and the synchronous nav.
            if(TAB_DEEP_LINKS[facet])
            {
                if(this._navigatingAway) return
                this._navigatingAway = true
                this.close()
                try
                {
                    if(typeof window !== 'undefined' && window.location)
                        window.location.assign(TAB_DEEP_LINKS[facet])
                }
                catch(err)
                {
                    console.warn('[ProfileSheet] deep-link nav failed', err)
                    this._navigatingAway = false
                }
                return
            }
            if(facet !== this.activeFacet) this._switchTab(facet)
            return
        }

        const tile = target.closest('.bento-tile')
        if(tile)
        {
            const claimId = tile.dataset.claimId
            if(claimId === this.selectedClaimId) this.selectedClaimId = null
            else this.selectedClaimId = claimId
            this._renderBento()
            this._renderTimeline()
            return
        }

        const forget = target.closest('.quote-card__forget')
        if(forget)
        {
            event.preventDefault()
            this._onForgetClick(forget)
            return
        }

        const source = target.closest('.quote-card__source')
        if(source && !source.classList.contains('is-disabled'))
        {
            event.preventDefault()
            this._openSource(source.dataset.captureId)
            return
        }
    }

    _switchTab(facet)
    {
        // 220ms total cross-fade. We can't tween from the current panel to
        // the new one without two copies in the DOM; the simpler pattern is
        // to fade out, swap content in place, fade back in.
        this.panelEl.style.transition = `opacity ${TAB_FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        this.panelEl.style.opacity = '0'

        clearTimeout(this._panelTimer)
        this._panelTimer = setTimeout(() =>
        {
            this.activeFacet     = facet
            this.selectedClaimId = null
            this._disarmForget()
            this._render(true)
            this.panelEl.style.opacity = '1'
        }, TAB_FADE_MS)
    }

    // ── Forget ─────────────────────────────────────────────────────────────

    _onForgetClick(btn)
    {
        if(btn.dataset.state === 'idle')
        {
            this._disarmForget()      // disarm whatever else might be armed
            btn.dataset.state = 'armed'
            btn.textContent   = 'tap again to forget'
            btn.classList.add('is-armed')
            this._armedButton = btn
            this._armTimer = setTimeout(() => this._disarmForget(), ARM_TIMEOUT_MS)
            return
        }
        // Armed → execute.
        const card = btn.closest('.quote-card')
        if(!card) return
        const quoteId = card.dataset.quoteId
        const backendTimelineEntryId = parseInt(card.dataset.backendTimelineEntryId || '', 10)
        card.classList.add('is-forgotten')
        clearTimeout(this._armTimer)
        this._armedButton = null
        setTimeout(() =>
        {
            this._forgetQuote({ quoteId, backendTimelineEntryId })
        }, FORGET_FADE_MS)
    }

    async _forgetQuote({ quoteId, backendTimelineEntryId })
    {
        const hasBackendId = Number.isInteger(backendTimelineEntryId) && backendTimelineEntryId > 0
        if(hasBackendId && this.backend?.forgetEvidence)
        {
            let refreshed = false
            try
            {
                await this.backend.forgetEvidence({ timelineEntryId: backendTimelineEntryId })
                const snapshot = await this.backend.refreshSnapshot?.()
                if(snapshot)
                {
                    this.state.applyBackendSnapshot?.(snapshot)
                    refreshed = true
                }
            }
            catch(err)
            {
                console.warn('[ProfileSheet] backend evidence forget failed', err)
                this._render(false)
                return
            }
            if(!refreshed) this.profile.forgetQuote(this.activeFacet, quoteId)
        }
        else
        {
            this.profile.forgetQuote(this.activeFacet, quoteId)
        }
        // Re-render the whole panel so the bento count badge updates too.
        this._render(false)
    }

    _disarmForget()
    {
        clearTimeout(this._armTimer)
        if(this._armedButton)
        {
            this._armedButton.dataset.state = 'idle'
            this._armedButton.textContent   = 'forget'
            this._armedButton.classList.remove('is-armed')
            this._armedButton = null
        }
    }

    // ── Source reflection routing ─────────────────────────────────────────

    _openSource(captureId)
    {
        if(!captureId) return
        const capture = this.state.captures.findById?.(captureId)
        const controller = OverlayController.getInstance()
        if(capture)
        {
            if(capture.kind === 'ask')   controller.open('ask',   { readOnly: true, capture })
            if(capture.kind === 'photo') controller.open('photo', { readOnly: true, capture })
            return
        }
        // Maybe it's a mood pin id.
        const pin = this.state.moodPins.pins.find((p) => p.id === captureId)
        if(pin) controller.open('mood', { readOnly: true, pin })
    }
}
