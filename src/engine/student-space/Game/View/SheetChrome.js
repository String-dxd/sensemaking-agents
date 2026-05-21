/**
 * SheetChrome — shared vanilla-JS primitive for every full-viewport sheet
 * (History, Profile, Letters, Path Finder, Calendar).
 *
 * Owns the chrome contract: translucent backdrop (rgba 0.55 → 0.92), 10px
 * blur, 200ms opacity fade, z-60, Escape-to-close, optional ×-button, optional
 * backdrop-click-to-close, and a portal target for child overlays (e.g. the
 * Day-Detail card that opens from inside History → Calendar).
 *
 * Why this exists
 * ---------------
 * Before SheetChrome, each sheet hand-rolled its own backdrop, transition,
 * and z-index. That produced the History-vs-others visual split (translucent
 * fade vs opaque slide-up) and a stacking bug where DayDetailCard sat behind
 * History because its z-index was tuned for body, not for History's stacking
 * context. The fix is *structural* — one chrome implementation, every sheet
 * inherits — not a string of per-sheet adjustments.
 *
 * Guardrail
 * ---------
 * Every new full-viewport sheet MUST be built on this primitive. No new sheet
 * may own its own backdrop, fade, or z-index. See `CLAUDE.md` (section:
 * "Sheet chrome contract") for the durable rule.
 *
 * API
 * ---
 *   const chrome = new SheetChrome({
 *       key:              'profile',                // exclusivity key for OverlayController
 *       sheetClassName:   'profile-sheet',          // per-sheet class for content CSS
 *       withCloseButton:  true,                     // render the × button (default true)
 *       closeOnBackdrop:  false,                    // click-outside dismissal (default false to preserve current sheets' behavior)
 *       layout:           'split',                  // 'stacked' (default) | 'split' (Gather-style two-pane)
 *       header: {                                   // optional shared header block — eyebrow + title + subtitle
 *           eyebrow:  'PROFILE',
 *           title:    'Your identity',
 *           subtitle: 'How your reflections have shaped you so far.',
 *       },
 *       onOpen:           (opts) => { ... },        // fires after the chrome opens
 *       onClose:          () => { ... },            // fires after the chrome closes
 *   })
 *
 *   chrome.root           // outer DOM node — has body-class hook, sized to viewport
 *   chrome.contentSlot    // outer slot — stacked: [header?, bodySlot]; split: [leftPane, rightPane]
 *   chrome.bodySlot       // per-sheet body container (the right pane under split layout)
 *   chrome.introSlot      // per-sheet intro container in the left pane (split layout only; null otherwise)
 *   chrome.headerEl       // the shared header element (or null when no header)
 *   chrome.leftPane       // the left pane element under split layout (null otherwise)
 *   chrome.rightPane      // the right pane element under split layout (null otherwise)
 *   chrome.portalTarget   // where child overlays (DayDetailCard, popovers) mount — always the chrome root
 *   chrome.closeBtn       // the × button (or null if withCloseButton is false)
 *
 *   chrome.open(opts)     // open the sheet (called by OverlayController)
 *   chrome.close()        // close the sheet (idempotent; safe to call twice)
 *   chrome.setHeader({ eyebrow, title, subtitle })  // mutate the header text (for status-driven sheets)
 *   chrome.dispose()      // tear down DOM + listeners (called by View.dispose)
 *
 * Chrome registers itself with OverlayController under `key`, so the existing
 * exclusivity rules (one full-viewport sheet at a time, body.has-overlay class
 * toggling) keep working unchanged.
 *
 * Split layout
 * ------------
 * Under `layout: 'split'`, contentSlot becomes a two-pane row container:
 *   contentSlot
 *     ├── leftPane  (header + introSlot)  — ~360px sidebar
 *     └── rightPane (bodySlot)            — fills remainder
 * Left and right panes are direct children of contentSlot so the existing
 * 0/80/160ms entry stagger continues to animate panes in sequence. The
 * portalTarget stays the chrome root so child overlays (DayDetailCard,
 * ShareDialog) keep portaling into the active sheet's stacking context
 * — splitting that contract would re-introduce the z-32-behind-z-60 bug
 * that originally motivated SheetChrome. Below 860px the panes stack
 * vertically (see style.css `.sheet-chrome--split` media query).
 */

import OverlayController from './OverlayController.js'

export default class SheetChrome
{
    constructor({
        key,
        sheetClassName  = '',
        withCloseButton = true,
        closeOnBackdrop = false,
        layout          = 'stacked',
        header          = null,
        onOpen,
        onClose,
        // Routed sheets (Profile, History, Letters, Trajectory) pass an
        // `onCloseRequest` callback so Escape (and any optional bespoke
        // close affordance) navigates back through the router instead of
        // calling `OverlayController.close(key)` directly. The router's
        // location change then drives the sheet close via the
        // `useStudentSpaceRouteSync` hook, keeping the URL authoritative.
        // When absent, `_requestClose()` falls back to the legacy
        // controller-close path so capture sheets and any non-routed
        // surfaces keep their old dismiss semantics.
        onCloseRequest,
    } = {})
    {
        if(!key) throw new Error('SheetChrome requires a `key`')
        if(layout !== 'stacked' && layout !== 'split')
            throw new Error(`SheetChrome: unknown layout "${layout}" (expected 'stacked' or 'split')`)

        this.key              = key
        this.layout           = layout
        this.closeOnBackdrop  = closeOnBackdrop
        this._onOpen          = onOpen
        this._onClose         = onClose
        this._onCloseRequest  = onCloseRequest
        this.isOpen           = false

        // Outer root — owns the chrome (backdrop / blur / fade / z-tier).
        // The per-sheet class (e.g. `.profile-sheet`) is layered on so existing
        // per-sheet content CSS continues to apply unchanged. The split-layout
        // modifier is added here so CSS can target the two-pane container
        // without re-checking the layout flag.
        const root = document.createElement('div')
        const classes = ['sheet-chrome']
        if(layout === 'split') classes.push('sheet-chrome--split')
        if(sheetClassName) classes.push(sheetClassName)
        root.className = classes.join(' ')
        root.dataset.sheetKey = key
        root.setAttribute('aria-hidden', 'true')

        // Optional × button — shares the existing `.sheet-chrome__close` style
        // grouped with the other sheet closes in `style.css`. Sheets that want
        // a bespoke close (different position, label) can pass
        // `withCloseButton: false` and render their own inside `contentSlot`.
        if(withCloseButton)
        {
            const closeBtn = document.createElement('button')
            closeBtn.type = 'button'
            closeBtn.className = 'sheet-chrome__close'
            closeBtn.setAttribute('aria-label', 'Close')
            closeBtn.textContent = '×'
            root.appendChild(closeBtn)
            this.closeBtn = closeBtn
        }
        else
        {
            this.closeBtn = null
        }

        // Content slot — outermost mount point. Two layouts:
        //
        //  • stacked (default) — contentSlot holds [header?, bodySlot].
        //    Legacy single-column sheets keep working unchanged. When no
        //    header is provided, bodySlot aliases contentSlot.
        //
        //  • split — contentSlot holds [leftPane, rightPane] siblings. The
        //    header (when present) moves into the left pane along with a new
        //    introSlot for per-sheet summary content. bodySlot lives inside
        //    the right pane and continues to be the per-sheet body container.
        //    Keeping panes as direct children of contentSlot preserves the
        //    existing `.sheet-chrome__content > :nth-child(-n+3)` entry
        //    stagger so panes animate in sequence for free.
        //
        // Child overlays (DayDetailCard, popovers) portal into `portalTarget`
        // which stays at the root level under BOTH layouts — splitting that
        // contract per pane would re-introduce the z-32-behind-z-60 bug class
        // that originally motivated SheetChrome.
        const contentSlot = document.createElement('div')
        contentSlot.className = 'sheet-chrome__content'
        root.appendChild(contentSlot)

        let headerEl = null
        let bodySlot = contentSlot
        let introSlot = null
        let leftPane = null
        let rightPane = null

        if(layout === 'split')
        {
            leftPane  = document.createElement('div')
            rightPane = document.createElement('div')
            leftPane.className  = 'sheet-chrome__pane sheet-chrome__pane--left'
            rightPane.className = 'sheet-chrome__pane sheet-chrome__pane--right'
            contentSlot.appendChild(leftPane)
            contentSlot.appendChild(rightPane)

            if(header)
            {
                headerEl = document.createElement('header')
                // The --compact modifier collapses title scale from
                // ~56px to ~22px so the page name reads as a normal
                // heading next to the intro content, matching the
                // Gather Town reference.
                headerEl.className = 'sheet-chrome__header sheet-chrome__header--compact'
                headerEl.innerHTML = `
                    <span class="sheet-chrome__eyebrow" data-role="eyebrow"></span>
                    <h1 class="sheet-chrome__title sheet-chrome__title--compact" data-role="title"></h1>
                    <p class="sheet-chrome__subtitle" data-role="subtitle"></p>
                `
                leftPane.appendChild(headerEl)
            }

            introSlot = document.createElement('div')
            introSlot.className = 'sheet-chrome__intro'
            leftPane.appendChild(introSlot)

            bodySlot = document.createElement('div')
            bodySlot.className = 'sheet-chrome__body'
            rightPane.appendChild(bodySlot)

            if(headerEl)
            {
                const titleId = `sheet-chrome-title--${key}`
                headerEl.querySelector('[data-role="title"]').id = titleId
                root.setAttribute('role', 'dialog')
                root.setAttribute('aria-labelledby', titleId)
            }
        }
        else if(header)
        {
            headerEl = document.createElement('header')
            headerEl.className = 'sheet-chrome__header'
            headerEl.innerHTML = `
                <span class="sheet-chrome__eyebrow" data-role="eyebrow"></span>
                <h1 class="sheet-chrome__title" data-role="title"></h1>
                <p class="sheet-chrome__subtitle" data-role="subtitle"></p>
            `
            contentSlot.appendChild(headerEl)

            bodySlot = document.createElement('div')
            bodySlot.className = 'sheet-chrome__body'
            contentSlot.appendChild(bodySlot)

            // Wire ARIA — header's title acts as the sheet's accessible name.
            const titleId = `sheet-chrome-title--${key}`
            headerEl.querySelector('[data-role="title"]').id = titleId
            root.setAttribute('role', 'dialog')
            root.setAttribute('aria-labelledby', titleId)
        }

        document.body.appendChild(root)

        this.root         = root
        this.contentSlot  = contentSlot
        this.bodySlot     = bodySlot
        this.introSlot    = introSlot
        this.leftPane     = leftPane
        this.rightPane    = rightPane
        this.headerEl     = headerEl
        this.portalTarget = root

        // Paint the initial header text from the constructor option.
        if(header) this.setHeader(header)

        // Click handler — × dismiss, optional backdrop-click dismiss. Routing
        // through `OverlayController.close(key)` (instead of `this.close()`
        // directly) keeps the controller's `active` state and body class in
        // sync — chrome.close() will run as the controller's surface.close()
        // callback.
        this._onClick = (event) =>
        {
            if(this.closeBtn && event.target === this.closeBtn)
            {
                event.preventDefault()
                this._requestClose()
                return
            }
            if(this.closeOnBackdrop && event.target === root)
            {
                this._requestClose()
            }
        }
        root.addEventListener('click', this._onClick)

        // Document-level Escape — the chrome owns this so per-sheet
        // implementations don't duplicate it. Two guards:
        //   1. `this.isOpen` filters chromes that aren't currently visible.
        //   2. `OverlayController.isOpen(this.key)` filters chromes that ARE
        //      visible but are *embedded* inside another active sheet (e.g.
        //      Calendar inside History — both have chrome.isOpen=true, but
        //      only History is the active surface). Without this guard,
        //      Escape would fire twice and briefly desync the body class.
        this._onKeyDown = (event) =>
        {
            if(!this.isOpen || event.key !== 'Escape') return
            if(!OverlayController.getInstance().isOpen(this.key)) return
            this._requestClose()
        }
        document.addEventListener('keydown', this._onKeyDown)

        OverlayController.getInstance().register(key, this)
    }

    _requestClose()
    {
        if(this._onCloseRequest)
        {
            this._onCloseRequest()
            return
        }
        OverlayController.getInstance().close(this.key)
    }

    /**
     * Update the shared header text. Safe to call before/after open. Empty
     * strings collapse the corresponding sub-element by toggling `hidden`
     * so the layout stays compact when (e.g.) a status sheet has no
     * subtitle for the current quadrant.
     *
     * @param {{eyebrow?: string, title?: string, subtitle?: string}} parts
     */
    setHeader({ eyebrow, title, subtitle } = {})
    {
        if(!this.headerEl) return
        const eyebrowEl  = this.headerEl.querySelector('[data-role="eyebrow"]')
        const titleEl    = this.headerEl.querySelector('[data-role="title"]')
        const subtitleEl = this.headerEl.querySelector('[data-role="subtitle"]')
        if(eyebrowEl !== null && eyebrow !== undefined)
        {
            eyebrowEl.textContent = eyebrow ?? ''
            eyebrowEl.hidden = !eyebrow
        }
        if(titleEl !== null && title !== undefined)
        {
            titleEl.textContent = title ?? ''
            titleEl.hidden = !title
        }
        if(subtitleEl !== null && subtitle !== undefined)
        {
            subtitleEl.textContent = subtitle ?? ''
            subtitleEl.hidden = !subtitle
        }
    }

    /**
     * Open the chrome. Called by OverlayController. Per-sheet logic runs in
     * the `onOpen` callback so the chrome stays generic.
     */
    open(opts)
    {
        if(this.isOpen) return
        if(!this.root) return
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
        try { this._onOpen?.(opts) } catch(err) { console.warn(`[SheetChrome:${this.key}] onOpen threw`, err) }
    }

    /**
     * Close the chrome. Idempotent. `OverlayController.noteClosed` keeps the
     * controller's `active` + body class in sync regardless of whether this
     * close was driven by the user (× / Escape / backdrop) or by exclusivity
     * (another sheet opening).
     */
    close()
    {
        if(!this.isOpen) return
        if(this.root)
        {
            this.root.setAttribute('aria-hidden', 'true')
            this.root.classList.remove('is-open')
        }
        this.isOpen = false
        try { this._onClose?.() } catch(err) { console.warn(`[SheetChrome:${this.key}] onClose threw`, err) }
        try { OverlayController.getInstance().noteClosed(this.key) } catch(_) {}
    }

    /**
     * Tear-down hook. Removes DOM + document listeners. Safe to call twice.
     */
    dispose()
    {
        if(this._onClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onClick) } catch(_) {}
        }
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root         = null
        this.contentSlot  = null
        this.bodySlot     = null
        this.introSlot    = null
        this.leftPane     = null
        this.rightPane    = null
        this.headerEl     = null
        this.portalTarget = null
        this.closeBtn     = null
        this._onClick     = null
        this._onKeyDown   = null
    }
}
