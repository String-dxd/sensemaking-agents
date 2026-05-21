/**
 * ShareDialog — engine-DOM dialog that mounts on top of the profile sheet
 * when the student taps the Share button. Subscribes to ShareTokenBridge
 * and renders one of five states: idle / creating / ready / revoking / error.
 *
 * Not registered with OverlayController — it sits visually above the
 * already-open ProfileSheet rather than replacing it. Closing the dialog
 * returns the student to the profile sheet they came from.
 *
 * Demo / dev-bypass auth kinds reach the dialog the same way (the engine
 * stays auth-blind here); the create call returns 403 share_demo_unsupported
 * and the dialog renders the error state with a Sign-In CTA.
 */

import ShareTokenBridge from '../State/ShareTokenBridge.js'
import OverlayController from './OverlayController.js'

const REVOKE_DISARM_MS = 4000

export default class ShareDialog
{
    constructor()
    {
        this.bridge = new ShareTokenBridge()
        this._unsubscribe = this.bridge.subscribe(() => this._render())
        this._revokeArmed = false
        this._revokeDisarmTimer = null

        const root = document.createElement('div')
        root.className = 'share-dialog'
        root.setAttribute('aria-hidden', 'true')
        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-labelledby', 'share-dialog-title')
        root.innerHTML = `
            <div class="share-dialog__scrim" data-action="dismiss"></div>
            <section class="share-dialog__card">
                <header class="share-dialog__header">
                    <h2 class="share-dialog__title" id="share-dialog-title">Share your profile</h2>
                    <button class="share-dialog__close" type="button" data-action="dismiss" aria-label="Close">×</button>
                </header>
                <p class="share-dialog__lede">
                    Generate a link you can send to parents, teachers, or friends.
                    Quotes are hidden by default; flip the toggle if you want to show them.
                </p>

                <div class="share-dialog__url-block" data-block="url" hidden>
                    <label class="share-dialog__field-label" for="share-dialog-url">Your link</label>
                    <div class="share-dialog__url-row">
                        <input class="share-dialog__url" id="share-dialog-url" readonly type="text" value="" />
                        <button class="share-dialog__action share-dialog__action--copy" type="button" data-action="copy">Copy</button>
                    </div>
                </div>

                <div class="share-dialog__placeholder" data-block="placeholder">
                    <span class="share-dialog__spinner" aria-hidden="true"></span>
                    <span class="share-dialog__placeholder-text">Generating your link…</span>
                </div>

                <div class="share-dialog__error" data-block="error" hidden>
                    <p class="share-dialog__error-text"></p>
                    <div class="share-dialog__error-actions">
                        <button class="share-dialog__action" type="button" data-action="retry">Try again</button>
                        <a class="share-dialog__action share-dialog__action--signin" href="/api/auth/sign-in?returnTo=/" data-action="signin" hidden>Sign in to share</a>
                    </div>
                </div>

                <div class="share-dialog__row share-dialog__redaction" data-block="redaction" hidden>
                    <div>
                        <span class="share-dialog__redaction-label">Show your reflection quotes</span>
                        <p class="share-dialog__redaction-hint" data-redaction-hint>Hidden — viewers see compiled reads only.</p>
                    </div>
                    <button class="share-dialog__toggle" type="button" data-action="toggle-quotes" aria-pressed="false">
                        <span class="share-dialog__toggle-track"></span>
                    </button>
                </div>

                <footer class="share-dialog__footer" data-block="footer" hidden>
                    <span class="share-dialog__footer-spacer"></span>
                    <button class="share-dialog__action share-dialog__action--revoke" type="button" data-action="revoke">Revoke link</button>
                </footer>
            </section>
        `
        // Portaling deferred to open() — see open() for the rationale.
        this.root = root

        this.urlBlockEl    = root.querySelector('[data-block="url"]')
        this.urlInputEl    = root.querySelector('.share-dialog__url')
        this.copyButton    = root.querySelector('[data-action="copy"]')
        this.placeholderEl = root.querySelector('[data-block="placeholder"]')
        this.placeholderTextEl = root.querySelector('.share-dialog__placeholder-text')
        this.errorBlockEl  = root.querySelector('[data-block="error"]')
        this.errorTextEl   = root.querySelector('.share-dialog__error-text')
        this.signInEl      = root.querySelector('[data-action="signin"]')
        this.retryEl       = root.querySelector('[data-action="retry"]')
        this.redactionEl   = root.querySelector('[data-block="redaction"]')
        this.redactionHintEl = root.querySelector('[data-redaction-hint]')
        this.toggleEl      = root.querySelector('[data-action="toggle-quotes"]')
        this.footerEl      = root.querySelector('[data-block="footer"]')
        this.revokeEl      = root.querySelector('[data-action="revoke"]')

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
        try { this._unsubscribe?.() } catch(_) {}
        try { this.root.removeEventListener('click', this._onClick) } catch(_) {}
        try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
        try { this.root.remove() } catch(_) {}
        try { this.bridge?.dispose?.() } catch(_) {}
        this._clearRevokeTimer()
        this.root = null
    }

    open()
    {
        // Portal into the currently-active sheet's root so ShareDialog lives
        // inside that sheet's stacking context — same mechanism DayDetailCard
        // uses. Falls back to document.body if nothing is open. Re-portals on
        // each open since the active sheet may have changed between opens.
        const activeRoot = OverlayController.getInstance().getActiveRoot?.() || document.body
        if(this.root && this.root.parentNode !== activeRoot)
        {
            try { activeRoot.appendChild(this.root) } catch(_) {}
        }
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
        this._render()
        // Don't await — let the spinner state render first.
        this.bridge.ensureToken().catch(() => {})
    }

    close()
    {
        if(!this.isOpen) return
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
        this.isOpen = false
        this._disarmRevoke()
    }

    _render()
    {
        if(!this.root) return
        const b = this.bridge
        const status = b.status

        // Block visibility.
        const showUrl   = status === 'ready' || status === 'revoking'
        const showPh    = status === 'idle' || status === 'creating'
        const showError = status === 'error'
        const showFooter = status === 'ready' || status === 'revoking'
        const showRedaction = status === 'ready'

        this.urlBlockEl.hidden    = !showUrl
        this.placeholderEl.hidden = !showPh
        this.errorBlockEl.hidden  = !showError
        this.footerEl.hidden      = !showFooter
        this.redactionEl.hidden   = !showRedaction

        // Placeholder / spinner copy.
        if(status === 'idle')        this.placeholderTextEl.textContent = 'Generating your link…'
        if(status === 'creating')    this.placeholderTextEl.textContent = 'Generating your link…'

        // URL field + revoking strike-through.
        if(showUrl)
        {
            this.urlInputEl.value = b.url || ''
            this.urlBlockEl.classList.toggle('is-revoking', status === 'revoking')
        }

        // Error block + sign-in surfacing.
        if(showError)
        {
            this.errorTextEl.textContent = b.errorMessage || 'Something went wrong.'
            const isAuthError = b.errorCode === 'share_demo_unsupported' || b.errorCode === 'unauthenticated'
            this.signInEl.hidden = !isAuthError
            this.retryEl.hidden = isAuthError
        }

        // Footer actions: Revoke only in v1; PDF download lands in a later
        // unit (plan U7) once the @react-pdf/renderer wiring is in place.
        if(showFooter)
        {
            this.revokeEl.disabled = status === 'revoking'
            this.revokeEl.textContent = status === 'revoking'
                ? 'Revoking…'
                : (this._revokeArmed ? 'Tap again to revoke' : 'Revoke link')
            this.revokeEl.classList.toggle('is-armed', this._revokeArmed)
        }

        // Redaction toggle reflects server truth.
        if(showRedaction)
        {
            this.toggleEl.setAttribute('aria-pressed', String(b.showQuotes))
            this.toggleEl.classList.toggle('is-on', !!b.showQuotes)
            this.redactionHintEl.textContent = b.showQuotes
                ? 'Visible — viewers will see your verbatim quotes.'
                : 'Hidden — viewers see compiled reads only.'
        }
    }

    _handleClick(event)
    {
        const action = event.target?.closest?.('[data-action]')?.dataset?.action
        if(!action) return

        switch(action)
        {
            case 'dismiss':
                this.close()
                return

            case 'copy':
                event.preventDefault()
                this._copyUrl()
                return

            case 'retry':
                event.preventDefault()
                this.bridge.retry().catch(() => {})
                return

            case 'signin':
                // Default anchor behavior — let it navigate.
                return

            case 'toggle-quotes':
                event.preventDefault()
                this.bridge.setShowQuotes(!this.bridge.showQuotes).catch(() => {})
                return

            case 'revoke':
                event.preventDefault()
                this._onRevokeClick()
                return
        }
    }

    _onRevokeClick()
    {
        if(!this._revokeArmed)
        {
            this._revokeArmed = true
            this._render()
            this._clearRevokeTimer()
            this._revokeDisarmTimer = setTimeout(() => this._disarmRevoke(), REVOKE_DISARM_MS)
            return
        }
        // Armed — execute.
        this._disarmRevoke()
        this.bridge.revokeToken().catch(() => {})
    }

    _disarmRevoke()
    {
        this._revokeArmed = false
        this._clearRevokeTimer()
        this._render()
    }

    _clearRevokeTimer()
    {
        if(this._revokeDisarmTimer)
        {
            clearTimeout(this._revokeDisarmTimer)
            this._revokeDisarmTimer = null
        }
    }

    async _copyUrl()
    {
        const url = this.bridge.url
        if(!url) return
        try
        {
            if(navigator.clipboard?.writeText)
            {
                await navigator.clipboard.writeText(url)
                this._flashCopyConfirm()
                return
            }
        }
        catch(_) { /* fall through to manual fallback */ }

        // Fallback: select the input contents so the user can ⌘C.
        try
        {
            this.urlInputEl.focus()
            this.urlInputEl.select()
        }
        catch(_) {}
    }

    _flashCopyConfirm()
    {
        const btn = this.copyButton
        if(!btn) return
        const prev = btn.textContent
        btn.textContent = 'Copied'
        btn.classList.add('is-flashed')
        setTimeout(() =>
        {
            btn.textContent = prev
            btn.classList.remove('is-flashed')
        }, 1400)
    }
}
