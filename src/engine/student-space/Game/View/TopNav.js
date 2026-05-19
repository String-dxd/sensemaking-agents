/**
 * Top-right navigation cluster — cream pill chips that open the new
 * Profile / Calendar / Letters sheets via OverlayController.
 *
 * Placement: top-right corner, immediately left of HourHud (which already
 * sits there). Both share z-index 10 with the rest of the chrome HUDs.
 * Hides itself via `body.has-overlay` (and `.has-chooser` when the capture
 * popover is open) so it never collides with anything full-viewport.
 *
 * The label collapses to icon-only below 520px so all three chips + HourHud
 * still fit comfortably on phone widths.
 *
 * A fifth "Sign in" chip appears only when `state.auth` is signed-out,
 * opening a chip-local popover with WorkOS Google + demo-cookie shortcuts.
 * It deliberately does NOT register with OverlayController — the popover is
 * a chip-local affordance, not a full-viewport sheet.
 */

import OverlayController from './OverlayController.js'
import State from '../State/State.js'

const CHIPS = [
    {
        id:    'letters',
        label: 'Letters',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
    },
    {
        id:    'history',
        label: 'History',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
    },
    {
        id:    'profile',
        label: 'Profile',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M5.5 19.5c.8-3.2 3.5-5 6.5-5s5.7 1.8 6.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`,
    },
    {
        id:    'trajectory',
        label: 'Path Finder',
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 6.5l2.5 5.5L12 17.5 9.5 12z" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.1" fill="#faf6ee" stroke="none"/>
        </svg>`,
    },
]

const SIGNIN_CHIP_HTML = `
    <button type="button" class="top-nav__chip top-nav__chip--signin" data-action="auth-signin" aria-haspopup="true" aria-expanded="false" aria-label="Sign in">
        <span class="top-nav__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="12" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M5.5 19.5c.8-3.2 3.5-5 6.5-5s5.7 1.8 6.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M17 6l3 0M18.5 4.5l0 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
        </span>
        <span class="top-nav__label">Sign in</span>
    </button>
    <div class="top-nav__signin-popover" data-signin-popover hidden role="dialog" aria-label="Sign-in options">
        <a class="top-nav__signin-option top-nav__signin-option--primary"
           data-signin-google
           href="/api/auth/sign-in?returnPathname=/">Sign in with Google</a>
        <form class="top-nav__signin-option-form"
              data-signin-demo
              method="post"
              action="/api/auth/sign-in?demo=1&returnPathname=/">
            <button type="submit" class="top-nav__signin-option">Use demo account</button>
        </form>
    </div>
`

export default class TopNav
{
    constructor()
    {
        const root = document.createElement('div')
        root.className = 'top-nav'
        root.innerHTML = CHIPS.map((c) => `
            <button type="button" class="top-nav__chip" data-sheet="${c.id}" aria-label="${c.label}">
                <span class="top-nav__icon" aria-hidden="true">${c.icon}</span>
                <span class="top-nav__label">${c.label}</span>
            </button>
        `).join('')

        document.body.appendChild(root)
        this.root = root

        // Auth slice carries the server-resolved menu. Read once at mount and
        // append the Sign-in chip when signed-out; subscribe so flipping
        // auth (sign-in / sign-out from any other surface) updates the chip
        // without re-mounting the nav.
        this._state = State.getInstance?.() ?? null
        this._authSlot = null
        this._popoverEl = null
        this._popoverOpen = false
        this._mountAuthChipIfSignedOut()
        this._unsubAuth = this._state?.auth?.subscribe?.(() => this._mountAuthChipIfSignedOut())

        // Stored on `this` so dispose() can detach. The root-attached click
        // would be GC'd with the detached root regardless, but keeping the
        // pattern uniform across chrome subsystems makes the teardown read
        // the same everywhere.
        this._onRootClick = (event) =>
        {
            // Sign-in chip + popover handling — does not delegate to
            // OverlayController. The popover lives inside the same root
            // element so we can route both branches here.
            if(this._handleSignInClick(event)) return

            const chip = event.target.closest('.top-nav__chip')
            if(!chip) return
            if(chip.dataset.action === 'auth-signin') return
            const sheet = chip.dataset.sheet
            const controller = OverlayController.getInstance()
            if(this._popoverOpen) this._closeSignInPopover()
            // Tap the same chip while its sheet is open → close it
            if(controller.isOpen(sheet)) controller.close(sheet)
            else controller.open(sheet)
        }
        root.addEventListener('click', this._onRootClick)

        this._onDocClick = (event) =>
        {
            if(!this._popoverOpen) return
            if(this.root?.contains(event.target)) return
            this._closeSignInPopover()
        }
        document.addEventListener('click', this._onDocClick)

        this._onKeyDown = (event) =>
        {
            if(this._popoverOpen && event.key === 'Escape') this._closeSignInPopover()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    _mountAuthChipIfSignedOut()
    {
        const isSignedOut = this._state?.auth?.isSignedOut !== false && !this._state?.auth?.isSignedIn
        const hasChip = !!this.root?.querySelector('[data-action="auth-signin"]')
        if(isSignedOut && !hasChip)
        {
            const tpl = document.createElement('template')
            tpl.innerHTML = SIGNIN_CHIP_HTML.trim()
            // Append the chip and the popover at the end of the nav root.
            while(tpl.content.firstChild) this.root.appendChild(tpl.content.firstChild)
            this._popoverEl = this.root.querySelector('[data-signin-popover]')
        }
        else if(!isSignedOut && hasChip)
        {
            const chip = this.root.querySelector('[data-action="auth-signin"]')
            chip?.remove()
            this._popoverEl?.remove()
            this._popoverEl = null
            this._popoverOpen = false
        }
    }

    _handleSignInClick(event)
    {
        // Drain navigation paths first so the engine flushes before the
        // browser tears down.
        const googleLink = event.target.closest('[data-signin-google]')
        if(googleLink)
        {
            event.preventDefault()
            try { window.__studentSpaceGame?.dispose?.() } catch(_) {}
            if(typeof window !== 'undefined') window.location.assign(googleLink.getAttribute('href'))
            return true
        }
        const demoForm = event.target.closest('[data-signin-demo]')
        if(demoForm)
        {
            // Submit button inside the form — drain engine; native submit
            // continues. The button itself triggers the form's submit
            // listener below which fires the engine dispose if the click
            // path skipped it.
            try { window.__studentSpaceGame?.dispose?.() } catch(_) {}
            return false
        }
        const signinChip = event.target.closest('[data-action="auth-signin"]')
        if(signinChip)
        {
            event.preventDefault()
            this._togglePopover(signinChip)
            return true
        }
        return false
    }

    _togglePopover(chip)
    {
        if(this._popoverOpen) this._closeSignInPopover()
        else this._openSignInPopover(chip)
    }

    _openSignInPopover(chip)
    {
        if(!this._popoverEl) return
        this._popoverEl.hidden = false
        this._popoverOpen = true
        if(chip) chip.setAttribute('aria-expanded', 'true')
    }

    _closeSignInPopover()
    {
        if(!this._popoverEl) return
        this._popoverEl.hidden = true
        this._popoverOpen = false
        const chip = this.root?.querySelector('[data-action="auth-signin"]')
        if(chip) chip.setAttribute('aria-expanded', 'false')
    }

    /**
     * Tear-down hook. Detaches the top-nav root from the body. No
     * document/window listeners are registered.
     */
    dispose()
    {
        if(this._unsubAuth)
        {
            try { this._unsubAuth() } catch(_) {}
            this._unsubAuth = null
        }
        if(this._onDocClick)
        {
            try { document.removeEventListener('click', this._onDocClick) } catch(_) {}
            this._onDocClick = null
        }
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
        this._popoverEl = null
    }

    update() {}
}
