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
 *       onOpen:           (opts) => { ... },        // fires after the chrome opens
 *       onClose:          () => { ... },            // fires after the chrome closes
 *   })
 *
 *   chrome.root           // outer DOM node — has body-class hook, sized to viewport
 *   chrome.contentSlot    // where the per-sheet content mounts
 *   chrome.portalTarget   // where child overlays (DayDetailCard, popovers) mount
 *   chrome.closeBtn       // the × button (or null if withCloseButton is false)
 *
 *   chrome.open(opts)     // open the sheet (called by OverlayController)
 *   chrome.close()        // close the sheet (idempotent; safe to call twice)
 *   chrome.dispose()      // tear down DOM + listeners (called by View.dispose)
 *
 * Chrome registers itself with OverlayController under `key`, so the existing
 * exclusivity rules (one full-viewport sheet at a time, body.has-overlay class
 * toggling) keep working unchanged.
 */

import OverlayController from './OverlayController.js'

export default class SheetChrome
{
    constructor({
        key,
        sheetClassName  = '',
        withCloseButton = true,
        closeOnBackdrop = false,
        onOpen,
        onClose,
    } = {})
    {
        if(!key) throw new Error('SheetChrome requires a `key`')

        this.key             = key
        this.closeOnBackdrop = closeOnBackdrop
        this._onOpen         = onOpen
        this._onClose        = onClose
        this.isOpen          = false

        // Outer root — owns the chrome (backdrop / blur / fade / z-tier).
        // The per-sheet class (e.g. `.profile-sheet`) is layered on so existing
        // per-sheet content CSS continues to apply unchanged.
        const root = document.createElement('div')
        const classes = ['sheet-chrome']
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

        // Content slot — every per-sheet body mounts here. Child overlays
        // (DayDetailCard, future popovers) portal into `portalTarget` which
        // is the same node, so they live inside this sheet's stacking context.
        const contentSlot = document.createElement('div')
        contentSlot.className = 'sheet-chrome__content'
        root.appendChild(contentSlot)

        document.body.appendChild(root)

        this.root         = root
        this.contentSlot  = contentSlot
        this.portalTarget = root

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
        OverlayController.getInstance().close(this.key)
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
        this.portalTarget = null
        this.closeBtn     = null
        this._onClick     = null
        this._onKeyDown   = null
    }
}
