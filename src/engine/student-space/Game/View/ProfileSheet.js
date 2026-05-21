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
import SheetChrome from './SheetChrome.js'
import { tldrHeroHTML, bindDisclosureToggles, statTileRowHTML } from './visualPrimitives.js'
import {
    mountProfileTabReactPanel,
    unmountProfileTabReactPanel,
} from '../../profile-tab-react-bridge.tsx'
import ShareDialog from './ShareDialog.js'

const TAB_ORDER = ['values', 'interests', 'personality', 'skills', 'relationships', 'choices']

// Tabs that render via a React subtree mounted into the engine sheet (instead
// of the imperative VIPS bento + timeline). The bridge module owns mount /
// unmount lifecycle and wires the engine state slices into the React views.
const REACT_BACKED_TABS = new Set(['relationships', 'choices'])
const TAB_LABELS_EXTRA = {
    relationships: 'Relationships',
    choices:       'Choices',
}

const ARM_TIMEOUT_MS  = 3200
const FORGET_FADE_MS  = 200
const TAB_FADE_MS     = 110         // half of the 220ms total cross-fade

/**
 * Build a fresh hidden form on `document.body` and submit it. The body
 * survives engine `dispose()` (which removes the in-engine sheet root
 * containing the original form). Without this indirection, a form-scoped
 * native POST can be aborted by the browser when its ancestor is removed
 * mid-handler — the documented DevPalette pattern at
 * `src/components/DevPalette.tsx` lines 79-86.
 *
 * `extras` lets the caller include additional inputs (e.g. CSRF tokens
 * in a future iteration). Right now no auth route needs them.
 */
function submitBodyScopedAuthForm(action, method = 'post', extras = null)
{
    if(typeof document === 'undefined') return
    const form = document.createElement('form')
    form.method = method
    form.action = action
    // Hide it visually so the in-flight POST does not flash a stale form
    // while the navigation is in flight.
    form.style.display = 'none'
    if(extras && typeof extras === 'object')
    {
        for(const [name, value] of Object.entries(extras))
        {
            const input = document.createElement('input')
            input.type = 'hidden'
            input.name = name
            input.value = String(value)
            form.appendChild(input)
        }
    }
    document.body.appendChild(form)
    form.submit()
}

/**
 * Inline twin of `~/lib/clear-student-space-local-state.ts`. The TS helper
 * lives outside the engine module graph and pulling it in here would couple
 * vendored JS to host TS. Sign-out flows that originate from this sheet
 * still need to drain `ss:v1:*` keys before the cookie clear, so we inline
 * the same six lines here.
 */
function clearStudentSpaceLocalStateInline()
{
    if(typeof window === 'undefined') return
    try
    {
        const storage = window.localStorage
        if(!storage) return
        const keys = []
        for(let i = 0; i < storage.length; i++)
        {
            const key = storage.key(i)
            if(key && key.indexOf('ss:v1:') === 0) keys.push(key)
        }
        for(const key of keys) storage.removeItem(key)
    }
    catch(_) { /* unavailable (private mode); nothing to clear */ }
}

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

        // SheetChrome owns backdrop, blur, fade, z-tier, the × button, the
        // Escape-to-close listener, AND the shared header (eyebrow + title +
        // subtitle). Profile's identity card / tabs / panels render inside
        // chrome.bodySlot. The atmospheric hero is also moved into bodySlot
        // so it overlays only the identity + tabs region, not the new
        // page-title header. See CLAUDE.md "Sheet chrome contract".
        this.chrome = new SheetChrome({
            key:            'profile',
            sheetClassName: 'profile-sheet',
            withCloseButton: true,
            closeOnBackdrop: false,
            header: {
                eyebrow:  'PROFILE',
                title:    'Your identity',
                subtitle: 'The shape of your reflections so far — values, interests, personality, and skills.',
            },
        })
        this.chrome.bodySlot.innerHTML = `
            <div class="profile-sheet__hero" aria-hidden="true">
                <div class="profile-sheet__hero-wash"></div>
                <div class="profile-sheet__hero-shimmer"></div>
            </div>
            <header class="profile-id">
                <div class="profile-id__avatar" role="img" aria-label="Profile picture">
                    <span class="profile-id__initial"></span>
                </div>
                <div class="profile-id__text">
                    <h1 class="profile-id__name"></h1>
                    <p  class="profile-id__class"></p>
                </div>
                <div class="profile-id__actions">
                    <span class="profile-id__share-slot" data-share-slot></span>
                    <span class="profile-id__auth-slot" data-auth-slot></span>
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
                    <div class="profile-sheet__more disclosure" data-role="more-disclosure" data-expanded="true">
                        <button class="disclosure__toggle profile-sheet__more-toggle"
                                type="button"
                                aria-expanded="true">
                            <span class="disclosure__chevron" aria-hidden="true"></span>
                            <span class="disclosure__summary">More about this dimension</span>
                        </button>
                        <div class="disclosure__panel">
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
                            <aside class="callout-strip profile-sheet__open-question" data-accent="">
                                <p class="callout-strip__eyebrow profile-sheet__open-eyebrow">OPEN QUESTION</p>
                                <p class="callout-strip__body profile-sheet__open-text"></p>
                            </aside>
                        </div>
                    </div>
                    <p class="profile-sheet__meta"></p>
                </header>

                <div class="profile-sheet__tldr-slot" data-role="tldr-slot" hidden></div>

                <div class="profile-sheet__vips-body">
                    <div class="profile-sheet__dimension-empty" hidden data-testid="profile-dimension-empty">
                        <p class="profile-sheet__dimension-empty-text"></p>
                    </div>

                    <h3 class="profile-sheet__eyebrow profile-sheet__collection-eyebrow">COLLECTION</h3>
                    <ul class="profile-sheet__bento" role="list"></ul>

                    <h3 class="profile-sheet__eyebrow profile-sheet__timeline-eyebrow">
                        TIMELINE<span class="profile-sheet__timeline-filter"></span>
                    </h3>
                    <ul class="profile-sheet__quote-list" role="list"></ul>
                    <p class="profile-sheet__empty" hidden>No noticings here yet — capture a few from the island.</p>
                </div>
                <div class="profile-sheet__react-mount" hidden></div>
            </section>
        `
        const root = this.chrome.root
        this.root = root

        this.headerEl    = root.querySelector('.profile-sheet__header')
        this.vipsBodyEl  = root.querySelector('.profile-sheet__vips-body')
        this.reactMountEl = root.querySelector('.profile-sheet__react-mount')

        this.idAvatarEl  = root.querySelector('.profile-id__avatar')
        this.idInitialEl = root.querySelector('.profile-id__initial')
        this.idNameEl    = root.querySelector('.profile-id__name')
        this.idClassEl   = root.querySelector('.profile-id__class')
        this.shareSlotEl = root.querySelector('[data-share-slot]')
        this.authSlotEl  = root.querySelector('[data-auth-slot]')
        this._mountShareButton()
        this._renderAuthButton()
        // Re-render the auth slot whenever the host updates state.auth (sign-
        // in or sign-out reflected back into the engine). Stored on `this`
        // so dispose() can detach it.
        this._unsubAuth = this.state?.auth?.subscribe?.(() => this._renderAuthButton())

        this.titleEl     = root.querySelector('.profile-sheet__title')
        this.eyebrowEl   = root.querySelector('.profile-sheet__panel-eyebrow')
        this.tagEl       = root.querySelector('.profile-sheet__panel-tag')
        this.subtitleEl  = root.querySelector('.profile-sheet__panel-subtitle')
        this.rowMostEl   = root.querySelector('.profile-sheet__panel [data-row="most"]')
        this.rowEmergeEl = root.querySelector('.profile-sheet__panel [data-row="emerge"]')
        this.summaryEl   = root.querySelector('.profile-sheet__summary')
        this.openTextEl  = root.querySelector('.profile-sheet__open-text')
        this.metaEl      = root.querySelector('.profile-sheet__meta')
        this.tldrSlotEl  = root.querySelector('[data-role="tldr-slot"]')
        this.moreDisclosureEl = root.querySelector('[data-role="more-disclosure"]')
        this.bentoEl     = root.querySelector('.profile-sheet__bento')

        /**
         * Per-tab visit memory for the "More about this dimension" disclosure.
         * On the first visit to a tab in a given sheet open, the disclosure
         * stays expanded so the student sees the prose at least once. On the
         * second visit (and beyond, in the same open), it defaults collapsed.
         * Reset on dispose().
         */
        this._tabVisits = new Map()

        /**
         * Per-tab TIMELINE expand memory. Default behaviour: show the first
         * 3 quote cards + a "Show all N more noticings" button. Once the
         * student expands, the tab id is added to this set and stays expanded
         * for the rest of the sheet open. Cleared on dispose().
         */
        this._timelineExpanded = new Set()

        // Wire chevron toggles for the "More about this dimension" disclosure
        // and any future disclosures rendered into the sheet's root.
        this._unbindDisclosure = bindDisclosureToggles(root)
        this.collectionEyebrowEl = root.querySelector('.profile-sheet__collection-eyebrow')
        this.dimensionEmptyEl = root.querySelector('.profile-sheet__dimension-empty')
        this.dimensionEmptyTextEl = root.querySelector('.profile-sheet__dimension-empty-text')
        this.filterEl    = root.querySelector('.profile-sheet__timeline-filter')
        this.quoteListEl = root.querySelector('.profile-sheet__quote-list')
        this.emptyEl     = root.querySelector('.profile-sheet__empty')
        this.panelEl     = root.querySelector('.profile-sheet__panel')

        // Content-level click handler — tabs, bento tiles, quote actions,
        // forget arming. × button and Escape are owned by SheetChrome.
        this._onRootClick = (event) => this._onClick(event)
        root.addEventListener('click', this._onRootClick)

        this._onKeyDown = (event) =>
        {
            if(!this.isOpen || event.key !== 'Escape') return
            if(this._authMenuIsOpen())
            {
                this._setAuthMenuOpen(false)
                return
            }
            this.close()
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
        // Cancel any deferred timers before tearing down the DOM. Without
        // this, the 110ms _switchTab fade callback can fire against a null
        // root and — worse, since this branch added the React mount —
        // attempt to spin up createRoot + QueryClient on a detached node.
        if(this._panelTimer) { clearTimeout(this._panelTimer); this._panelTimer = null }
        if(this._armTimer)   { clearTimeout(this._armTimer);   this._armTimer   = null }

        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        if(this._unsubAuth)
        {
            try { this._unsubAuth() } catch(_) {}
            this._unsubAuth = null
        }
        if(this._unbindDisclosure)
        {
            try { this._unbindDisclosure() } catch(_) {}
            this._unbindDisclosure = null
        }
        this._tabVisits?.clear?.()
        this._timelineExpanded?.clear?.()
        this._unmountReactPanel()
        try { this.shareDialog?.dispose?.() } catch(_) {}
        this.shareDialog = null
        try { this.chrome?.dispose?.() } catch(_) {}
        this.chrome = null
        this.root = null
    }

    /**
     * Constructs the Share button inside the identity header slot. Lazy-
     * creates the ShareDialog on first click so the dialog's DOM doesn't
     * sit in the document until the student actually wants to share.
     */
    _mountShareButton()
    {
        if(!this.shareSlotEl) return
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'profile-share-button'
        btn.dataset.testid = 'profile-share-button'
        btn.innerHTML = `
            <span class="profile-share-button__icon" aria-hidden="true">↗</span>
            <span class="profile-share-button__label">Share</span>
        `
        btn.addEventListener('click', () => this._openShareDialog())
        this.shareSlotEl.appendChild(btn)
        this.shareButtonEl = btn
    }

    /**
     * Mount or refresh the auth slot. Reads the live `state.auth.menu` and
     * renders either:
     *   - a More menu (signed-in) whose Sign out item drains the engine,
     *     wipes the `ss:v1:*` localStorage, then POSTs to `/api/auth/sign-out`.
     *   - a Sign-in link (signed-out) that drains the engine and navigates
     *     to the onboarding login surface, preserving the profile return
     *     path for the WorkOS/demo actions inside that surface.
     *
     * Idempotent — replaces the slot contents on every call so re-renders
     * triggered by Auth.subscribe() don't pile up stale nodes.
     */
    _renderAuthButton()
    {
        if(!this.authSlotEl) return
        this.authSlotEl.innerHTML = ''
        // Reset the per-flow navigation guard whenever the slot is rebuilt —
        // a previous click that started a sign-in / sign-out flow may have
        // left this true even though the browser ended up not navigating
        // (network failure, captive portal, server 500). Re-rendering means
        // the user is back and clicks should work again.
        this._authNavigating = false
        const menu = this.state?.auth?.menu
        if(!menu) return
        if(menu.status === 'signed-in')
        {
            // We render the form purely for visual layout and accessibility.
            // The actual POST goes through a fresh `document.body`-scoped
            // form built at click time so engine dispose (which removes the
            // .profile-sheet root and detaches this form) cannot abort the
            // navigation. See `_onSignOutClick` for the choreography.
            const wrap = document.createElement('div')
            wrap.className = 'profile-auth-menu'
            wrap.dataset.testid = 'profile-auth-menu'

            const more = document.createElement('button')
            more.type = 'button'
            more.className = 'profile-auth-more'
            more.dataset.action = 'auth-more'
            more.dataset.testid = 'profile-auth-more'
            more.setAttribute('aria-label', 'More profile actions')
            more.setAttribute('aria-expanded', 'false')
            more.setAttribute('aria-controls', 'profile-auth-popover')
            more.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" fill="currentColor"></circle>
                    <circle cx="12" cy="12" r="1.8" fill="currentColor"></circle>
                    <circle cx="19" cy="12" r="1.8" fill="currentColor"></circle>
                </svg>
            `

            const popover = document.createElement('div')
            popover.id = 'profile-auth-popover'
            popover.className = 'profile-auth-popover'
            popover.dataset.testid = 'profile-auth-popover'
            popover.hidden = true

            const form = document.createElement('form')
            form.action = '/api/auth/sign-out'
            form.method = 'post'
            form.className = 'profile-auth-form'
            form.dataset.testid = 'profile-auth-signout-form'
            const btn = document.createElement('button')
            btn.type = 'submit'
            btn.className = 'profile-auth-menu-item profile-auth-menu-item--signout'
            btn.dataset.testid = 'profile-auth-signout'
            btn.textContent = 'Sign out'
            // Intercept BOTH paths: pointer click and keyboard Enter that
            // dispatches submit. Both must route through the body-scoped
            // POST so the form detachment can't abort the navigation.
            btn.addEventListener('click', (event) => this._onSignOutAction(event))
            form.addEventListener('submit', (event) => this._onSignOutAction(event))
            form.appendChild(btn)
            popover.appendChild(form)
            wrap.appendChild(more)
            wrap.appendChild(popover)
            this.authSlotEl.appendChild(wrap)
        }
        else
        {
            const link = document.createElement('a')
            const profileReturnPathname = encodeURIComponent('/?sheet=profile')
            link.href = `/?auth=sign-in&returnPathname=${profileReturnPathname}#sign-in`
            link.className = 'profile-auth-button profile-auth-button--signin'
            link.dataset.testid = 'profile-auth-signin'
            link.textContent = 'Sign in'
            link.addEventListener('click', (event) => this._onSignInClick(event, link))
            this.authSlotEl.appendChild(link)
        }
    }

    _onSignInClick(_event, link)
    {
        if(this._authNavigating) return
        this._authNavigating = true
        try { window.__studentSpaceGame?.dispose?.() } catch(_) {}
        // Honor the link's default navigation. Engine dispose runs synchronously
        // before the browser leaves; Persistence has already flushed.
        try { link.classList.add('is-loading') } catch(_) {}
    }

    _authMenuIsOpen()
    {
        const more = this.authSlotEl?.querySelector('[data-action="auth-more"]')
        return more?.getAttribute('aria-expanded') === 'true'
    }

    _setAuthMenuOpen(open)
    {
        const more = this.authSlotEl?.querySelector('[data-action="auth-more"]')
        const popover = this.authSlotEl?.querySelector('.profile-auth-popover')
        if(!more || !popover) return
        more.setAttribute('aria-expanded', open ? 'true' : 'false')
        more.classList.toggle('is-open', open)
        popover.hidden = !open
    }

    _onSignOutAction(event)
    {
        // Single entry point for click + keyboard-submit. preventDefault the
        // in-place form so a browser-native POST does not race with our
        // synchronous engine dispose (which removes this form from the DOM
        // mid-handler and would otherwise cancel the navigation, leaving the
        // user with wiped `ss:v1:*` state but a live auth cookie). The
        // body-scoped form below survives dispose.
        try { event.preventDefault?.() } catch(_) {}
        if(this._authNavigating) return
        this._authNavigating = true
        try { window.__studentSpaceGame?.dispose?.() } catch(_) {}
        clearStudentSpaceLocalStateInline()
        submitBodyScopedAuthForm('/api/auth/sign-out', 'post')
    }

    _openShareDialog()
    {
        if(!this.shareDialog) this.shareDialog = new ShareDialog()
        this.shareDialog.open()
    }

    // ── Open / close ──────────────────────────────────────────────────────

    /**
     * @param {Object} [opts]
     * @param {string} [opts.tab]      jump to a specific facet (values | …)
     * @param {string} [opts.claimId]  pre-select a specific claim's tile
     */
    open(opts = {})
    {
        if(!this.chrome) return
        const allowedTabs = new Set([...FACET_IDS, ...REACT_BACKED_TABS])
        const targetTab = opts.tab && allowedTabs.has(opts.tab) ? opts.tab : this.activeFacet
        this.activeFacet     = targetTab
        this.selectedClaimId = opts.claimId || null
        this._render(true)

        this.chrome.open(opts)
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this.isOpen = false
        this._disarmForget()
        try { this.chrome?.close?.() } catch(_) {}
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    _render(syncTabs = false)
    {
        this._renderIdentity()

        if(syncTabs)
        {
            for(const tab of this.root.querySelectorAll('.profile-tab'))
                tab.classList.toggle('is-active', tab.dataset.facet === this.activeFacet)
        }

        if(REACT_BACKED_TABS.has(this.activeFacet))
        {
            this._renderReactPanel(this.activeFacet)
            return
        }

        const facet = this.profile.getFacet(this.activeFacet)
        if(!facet) return

        this._unmountReactPanel()
        applyFacetVars(this.root, this.activeFacet)

        // The engine-managed header + VIPS body show again after the
        // React-backed tab is swapped out.
        if(this.headerEl)   this.headerEl.hidden   = false
        if(this.vipsBodyEl) this.vipsBodyEl.hidden = false

        const header = FACET_HEADERS[this.activeFacet] || {}
        this.eyebrowEl.textContent  = header.eyebrow ?? ''
        this.tagEl.textContent      = header.tag     ?? ''
        this.titleEl.textContent    = header.title   ?? this.activeFacet
        this.subtitleEl.textContent = header.subtitle ?? ''

        this._renderBreakdownRows()

        this.summaryEl.textContent  = facet.paragraph
        this.openTextEl.textContent = facet.openQuestion
        this._renderMetaTiles(facet)

        this._renderTldrHero()
        this._applyMoreDisclosureState(this.activeFacet)
        this._renderBento()
        this._renderTimeline()
    }

    /**
     * Replace the flat meta line with a stat-tile-row (noticings + voiced
     * claims). The original "last refined" date now lives in the TLDR
     * hero's meta footer. The bottom meta is two stat tiles that anchor
     * the panel header visually.
     */
    _renderMetaTiles(facet)
    {
        if(!this.metaEl) return
        const claims = VIPS_BY_FACET[this.activeFacet] || []
        const counts = this.profile.countByClaim(this.activeFacet)
        const total  = claims.reduce((sum, c) => sum + (counts[c.id] || 0), 0)
        const voiced = claims.filter((c) => (counts[c.id] || 0) > 0).length

        const refined = formatRefined(facet?.lastRefinedAt)
        this.metaEl.innerHTML = statTileRowHTML([
            { value: String(total),  label: total === 1 ? 'Noticing' : 'Noticings' },
            { value: String(voiced), label: voiced === 1 ? 'Voiced claim' : 'Voiced claims' },
        ]) + (refined ? `<span class="sr-only">${refined}</span>` : '')
    }

    /**
     * Set the "More about this dimension" disclosure's expanded state for
     * the active facet. First-visit expanded; subsequent visits collapsed.
     * Records the visit so the next render sees this tab as "seen".
     */
    _applyMoreDisclosureState(facet)
    {
        if(!this.moreDisclosureEl) return
        const seen = this._tabVisits.get(facet) === true
        const expanded = !seen
        this.moreDisclosureEl.setAttribute('data-expanded', expanded ? 'true' : 'false')
        const toggle = this.moreDisclosureEl.querySelector('.disclosure__toggle')
        toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false')

        // Apply facet accent to the embedded callout strip.
        const callout = this.moreDisclosureEl.querySelector('.callout-strip')
        callout?.setAttribute('data-accent', facet)

        // Record the visit.
        this._tabVisits.set(facet, true)
    }

    /**
     * TLDR hero — top voiced claims at a glance. Sits between the panel
     * header and the COLLECTION bento for the four imperative VIPS tabs.
     *
     *   - 0 noticings on the facet → hero hidden (`.dimension-empty` handles it)
     *   - 1-2 voiced claims        → hero shows empty-state copy, no chips
     *   - 3+ voiced claims         → hero shows up to 5 chips (highest count first)
     *
     * Each chip carries the active claim id; clicking one routes through the
     * same bento-tile click path so the TIMELINE filters identically.
     */
    _renderTldrHero()
    {
        if(!this.tldrSlotEl) return

        const facet = this.activeFacet
        const claims = VIPS_BY_FACET[facet] || []
        const counts = this.profile.countByClaim(facet)
        const total  = claims.reduce((sum, c) => sum + (counts[c.id] || 0), 0)

        // Zero-noticings state is owned by .dimension-empty inside the bento.
        if(total === 0)
        {
            this.tldrSlotEl.hidden = true
            this.tldrSlotEl.innerHTML = ''
            return
        }

        const facetData = this.profile.getFacet?.(facet) || {}
        const tagLabel  = FACET_HEADERS[facet]?.tag || facet
        const refined   = formatRefined(facetData.lastRefinedAt)
        const metaParts = [`${total} noticing${total === 1 ? '' : 's'}`]
        if(refined) metaParts.push(refined)

        const voiced = claims
            .map((c) => ({ id: c.id, label: c.label, count: counts[c.id] || 0 }))
            .filter((c) => c.count > 0)
            .sort((a, b) => b.count - a.count)

        if(voiced.length < 3)
        {
            this.tldrSlotEl.hidden = false
            this.tldrSlotEl.innerHTML = tldrHeroHTML({
                eyebrow: `IN YOUR ${tagLabel.toUpperCase()}`,
                title:   'Few noticings yet — capture a moment on the island to see what shows up.',
                meta:    metaParts.join(' · '),
                accent:  facet,
            })
            return
        }

        const top = voiced.slice(0, 5).map((c) => ({
            id:     c.id,
            label:  c.label.toUpperCase(),
            accent: facet,
        }))

        this.tldrSlotEl.hidden = false
        this.tldrSlotEl.innerHTML = tldrHeroHTML({
            eyebrow: `TOP VOICES IN YOUR ${tagLabel.toUpperCase()}`,
            title:   this._tldrHeadline(facet, voiced.length),
            chips:   top,
            meta:    metaParts.join(' · '),
            accent:  facet,
        })

        // Reflect the currently-selected claim (if any) on its chip.
        if(this.selectedClaimId)
        {
            const chip = this.tldrSlotEl.querySelector(
                `.tldr-chip[data-tldr-chip-id="${this.selectedClaimId}"]`
            )
            chip?.classList.add('is-selected')
        }
    }

    /**
     * Per-facet headline copy for the TLDR hero. Kept here (not in
     * `FACET_HEADERS`) because the headline is dynamic and small enough
     * to colocate with the renderer.
     */
    _tldrHeadline(facet, voicedCount)
    {
        const ringPhrase = voicedCount >= 5 ? 'keep surfacing'
                         : voicedCount >= 3 ? 'are showing up'
                         : 'are starting to show'
        const noun = ({
            values:        'values',
            interests:     'interests',
            personality:   'traits',
            skills:        'skills',
            relationships: 'connections',
            choices:       'choices',
        })[facet] || 'themes'
        return `These ${noun} ${ringPhrase} in your reflections`
    }

    _renderReactPanel(tab)
    {
        // Keep the sheet's CSS color channel in sync with the active tab —
        // otherwise the non-VIPS panels render against the prior VIPS tab's
        // accent/soft/ink vars.
        applyFacetVars(this.root, tab)

        // Hide the engine-managed VIPS body and header; the React view
        // brings its own eyebrow + section headers.
        if(this.headerEl)   this.headerEl.hidden   = true
        if(this.vipsBodyEl) this.vipsBodyEl.hidden = true
        if(!this.reactMountEl) return

        this.reactMountEl.hidden = false
        try { mountProfileTabReactPanel(tab, this.reactMountEl) }
        catch(err) { console.warn('[ProfileSheet] react mount failed', err) }
    }

    _unmountReactPanel()
    {
        if(this.reactMountEl) this.reactMountEl.hidden = true
        try { unmountProfileTabReactPanel() }
        catch(err) { console.warn('[ProfileSheet] react unmount failed', err) }
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
        const totalNoticings = claims.reduce((sum, c) => sum + (counts[c.id] || 0), 0)
        const dimensionLabel = FACET_HEADERS[this.activeFacet]?.tag || this.activeFacet

        if(totalNoticings === 0)
        {
            this.bentoEl.innerHTML = ''
            this.collectionEyebrowEl.hidden = true
            this.dimensionEmptyEl.hidden = false
            this.dimensionEmptyTextEl.textContent =
                `Your ${dimensionLabel} read grows as you reflect. Capture a few from the island, and tiles will fill in here.`
            return
        }

        this.collectionEyebrowEl.hidden = false
        this.dimensionEmptyEl.hidden = true
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

    /**
     * Returns the DOM slot in the identity header where U4's ShareDialog will
     * mount its Share button. Returns null when the sheet has been disposed.
     */
    getShareSlot()
    {
        return this.shareSlotEl ?? null
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

        const expanded   = this._timelineExpanded.has(this.activeFacet)
        const showFilter = !!this.selectedClaimId
        // Default cap: 3 cards. Hide the cap entirely when a filter is active
        // and the filtered set is ≤ 3 (the button would have nothing to do).
        const cap = 3
        const total = sorted.length
        const useCap = !expanded && total > cap && !(showFilter && total <= cap)
        const visible = useCap ? sorted.slice(0, cap) : sorted

        if(showFilter)
        {
            this.filterEl.textContent = ` · ${claimLabel(this.selectedClaimId)}`
        }
        else if(useCap)
        {
            this.filterEl.textContent = ` · showing ${visible.length} of ${total}`
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
        const cardsHtml = visible.map((q) =>
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

        const hiddenCount = total - visible.length
        const expandBtn = (!showFilter && total > cap)
            ? (expanded
                ? `<li class="profile-sheet__timeline-toggle"><button type="button" class="timeline-expand-btn" data-action="timeline-collapse">Show fewer</button></li>`
                : `<li class="profile-sheet__timeline-toggle"><button type="button" class="timeline-expand-btn" data-action="timeline-expand">Show all ${hiddenCount} more noticing${hiddenCount === 1 ? '' : 's'}</button></li>`)
            : ''

        this.quoteListEl.innerHTML = cardsHtml + expandBtn
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

        const more = target.closest('[data-action="auth-more"]')
        if(more)
        {
            event.preventDefault()
            this._setAuthMenuOpen(more.getAttribute('aria-expanded') !== 'true')
            return
        }
        if(!target.closest('.profile-auth-menu')) this._setAuthMenuOpen(false)

        // × button and Escape are owned by SheetChrome — no per-sheet close
        // handling needed here.
        const tab = target.closest('.profile-tab')
        if(tab)
        {
            const facet = tab.dataset.facet
            if(facet && facet !== this.activeFacet) this._switchTab(facet)
            return
        }

        const tile = target.closest('.bento-tile')
        if(tile)
        {
            const claimId = tile.dataset.claimId
            if(claimId === this.selectedClaimId) this.selectedClaimId = null
            else this.selectedClaimId = claimId
            this._renderTldrHero()
            this._renderBento()
            this._renderTimeline()
            return
        }

        // TLDR hero chip click — same filter behaviour as a bento tile.
        const chip = target.closest('.tldr-chip')
        if(chip && this.tldrSlotEl?.contains(chip))
        {
            const claimId = chip.dataset.tldrChipId
            if(!claimId) return
            if(claimId === this.selectedClaimId) this.selectedClaimId = null
            else this.selectedClaimId = claimId
            this._renderTldrHero()
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

        // Timeline expand/collapse — sits inside the quote list as its own <li>.
        const timelineToggle = target.closest('[data-action^="timeline-"]')
        if(timelineToggle)
        {
            event.preventDefault()
            const action = timelineToggle.dataset.action
            if(action === 'timeline-expand') this._timelineExpanded.add(this.activeFacet)
            else                              this._timelineExpanded.delete(this.activeFacet)
            this._renderTimeline()
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
