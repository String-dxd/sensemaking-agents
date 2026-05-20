/**
 * Top-right navigation cluster — four cream pill chips that open the
 * Profile / Calendar / Letters / Path Finder sheets via OverlayController.
 *
 * Placement: top-right corner, immediately left of HourHud (which already
 * sits there). Both share z-index 10 with the rest of the chrome HUDs.
 * Hides itself via `body.has-overlay` (and `.has-chooser` when the capture
 * popover is open) so it never collides with anything full-viewport.
 *
 * The label collapses to icon-only below 520px so all chips + HourHud
 * still fit comfortably on phone widths.
 *
 * Auth chrome lives in two other places: the onboarding `EdupassLogin`
 * surface handles first-arrival sign-in, and the engine `ProfileSheet`
 * identity header hosts the post-onboarding Sign-in / Sign-out
 * affordance. The TopNav itself stays focused on world-navigation chips.
 */

import OverlayController from './OverlayController.js'

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

        // Stored on `this` so dispose() can detach. The root-attached click
        // would be GC'd with the detached root regardless, but keeping the
        // pattern uniform across chrome subsystems makes the teardown read
        // the same everywhere.
        this._onRootClick = (event) =>
        {
            const chip = event.target.closest('.top-nav__chip')
            if(!chip) return
            const sheet = chip.dataset.sheet
            const controller = OverlayController.getInstance()
            // Tap the same chip while its sheet is open → close it
            if(controller.isOpen(sheet)) controller.close(sheet)
            else controller.open(sheet)
        }
        root.addEventListener('click', this._onRootClick)
    }

    /**
     * Tear-down hook. Detaches the top-nav root from the body.
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
    }

    update() {}
}
