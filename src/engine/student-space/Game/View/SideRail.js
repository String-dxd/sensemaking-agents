/**
 * Vertical icon rail — the Gathertown-style left chrome that owns every
 * sheet-launcher and the onboarding-restart action.
 *
 * Placement: fixed left, full height, z-index 70 (above sheets at z-60) so
 * the rail stays visible even while a full-viewport sheet is open. Each
 * button is icon-only with an `aria-label` + a CSS-driven tooltip that
 * reveals on hover/focus. The rail intentionally does NOT hide on
 * `body.has-overlay` — it's the primary chrome.
 *
 * Sections:
 *   - top group  → sheet launchers (Letters · History · Profile · Path Finder)
 *   - bottom group → onboarding-restart action
 *
 * The restart action used to live in its own corner subsystem
 * (`OnboardingRestartButton`); folding it in here removes the top-left chip
 * and matches the Gathertown pattern of "every world action sits on the
 * rail." See CLAUDE.md "Sheet chrome contract" for adjacent rules.
 */

import OverlayController from './OverlayController.js'
import State from '../State/State.js'
import Game from '../Game.js'

// Canonical paths for each rail entry. Kept inline (not imported from
// `~/lib/student-space/route-sync`) so the engine's JS layer stays free
// of TS imports for navigation primitives. The host's `pathnameForSurface`
// helper is the authoritative builder; this map just mirrors the well-known
// pathnames the rail emits.
//
// `test/engine/SideRail.hrefs.test.ts` enforces the keep-in-sync contract
// by importing this map AND `pathnameForSurface` and asserting they agree
// on every rail entry. If route-sync.ts changes a canonical path or this
// map drifts, the test fails at CI time — no silent drift.
export const SHEET_HREFS = {
    home:       '/',
    letters:    '/letters',
    history:    '/history',
    profile:    '/profile',
    trajectory: '/trajectory',
}

const SHEET_BUTTONS = [
    {
        // `home` is special — it has no sheet. Tapping it closes any open
        // surface and returns the user to the island. _setActive() marks it
        // active when no other surface is open, so the rail always reads as
        // "you are here".
        id:    'home',
        label: 'Island',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M3 12.2L12 4l9 8.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5.5 10.6V20h13v-9.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
    },
    {
        id:    'letters',
        label: 'Letters',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
    },
    {
        id:    'history',
        label: 'History',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
    },
    {
        id:    'profile',
        label: 'Profile',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M5.5 19.5c.8-3.2 3.5-5 6.5-5s5.7 1.8 6.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`,
    },
    {
        id:    'trajectory',
        label: 'Path Finder',
        icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 6.5l2.5 5.5L12 17.5 9.5 12z" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.1" fill="#faf6ee" stroke="none"/>
        </svg>`,
    },
]

const RESTART_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M4 12a8 8 0 1 1 2.34 5.66" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M4 6v5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

export default class SideRail
{
    constructor()
    {
        const root = document.createElement('nav')
        root.className = 'side-rail'
        root.setAttribute('aria-label', 'World navigation')
        root.innerHTML = `
            <div class="side-rail__group side-rail__group--top">
                ${SHEET_BUTTONS.map(b => `
                    <button type="button"
                            class="side-rail__btn"
                            data-sheet="${b.id}"
                            aria-label="${b.label}">
                        <span class="side-rail__icon" aria-hidden="true">${b.icon}</span>
                        <span class="side-rail__tooltip" role="tooltip">${b.label}</span>
                    </button>
                `).join('')}
            </div>
            <div class="side-rail__group side-rail__group--bottom">
                <button type="button"
                        class="side-rail__btn side-rail__btn--restart"
                        data-action="restart"
                        aria-label="Restart onboarding">
                    <span class="side-rail__icon" aria-hidden="true">${RESTART_ICON}</span>
                    <span class="side-rail__tooltip" role="tooltip">Restart onboarding</span>
                </button>
            </div>
        `

        document.body.appendChild(root)
        this.root = root

        this._onClick = (event) =>
        {
            const btn = event.target.closest('.side-rail__btn')
            if(!btn) return
            const sheet  = btn.dataset.sheet
            const action = btn.dataset.action
            if(sheet === 'home')
            {
                // Home == the island. Ask the host to navigate to `/`.
                this._navigate('/')
                return
            }
            if(sheet)
            {
                const href = SHEET_HREFS[sheet]
                if(!href) return
                // Re-tap the same chip while its sheet is open → navigate
                // home. We compare against `window.location.pathname`
                // rather than `OverlayController.isOpen` because the
                // controller flag lags behind URL transitions during
                // rapid taps, leading to two history entries for the
                // same surface. The pathname is updated synchronously
                // by the router on each navigate.
                const onSheet = typeof window !== 'undefined' &&
                    window.location.pathname.startsWith(href)
                if(onSheet) this._navigate('/')
                else this._navigate(href)
                return
            }
            if(action === 'restart') this._restartOnboarding()
        }
        root.addEventListener('click', this._onClick)

        // Reflect the active sheet on the rail (highlights the icon). The
        // controller has no subscribe API; mirroring via the View update loop
        // is cheap and matches the existing engine pattern (one classList
        // toggle per frame is a no-op when the value is unchanged).
        this._activeKey = null
    }

    _setActive(key)
    {
        if(!this.root) return
        if(this._activeKey === key) return
        this._activeKey = key
        // null → 'home' is active (we're looking at the island).
        const resolved = key ?? 'home'
        for(const btn of this.root.querySelectorAll('.side-rail__btn[data-sheet]'))
        {
            const isActive = btn.dataset.sheet === resolved
            btn.classList.toggle('is-active', isActive)
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false')
        }
    }

    /**
     * Ask the host to navigate. `Game.navigate()` already owns the
     * host-router fallback (closes the active surface on `/`, no-ops
     * otherwise). When no Game instance exists (test harness mounting
     * the rail in isolation) we drive `OverlayController` directly so
     * the rail still works.
     */
    _navigate(href)
    {
        const game = Game.getInstance()
        if(game)
        {
            game.navigate(href)
            return
        }
        // No-game harness fallback — drive the controller directly so the
        // rail still opens sheets in isolation.
        const controller = OverlayController.getInstance()
        if(!controller) return
        if(href === '/')
        {
            if(controller.active) controller.close(controller.active)
            return
        }
        const sheet = href.replace(/^\/+/, '').split(/[/#?]/)[0]
        if(sheet && controller.surfaces?.has?.(sheet)) controller.open(sheet)
    }

    _restartOnboarding()
    {
        try
        {
            const state = State.getInstance()
            state?.onboarding?.reset?.()
            // Flush so the wiped stage hits storage before reload, in case the
            // `#onboarding` hash path isn't honored (custom storage adapter,
            // private mode, etc.).
            state?.persistence?.flush?.()
        }
        catch(_) {}
        try
        {
            if(typeof window !== 'undefined')
            {
                window.location.hash = '#onboarding'
                window.location.reload()
            }
        }
        catch(_) {}
    }

    dispose()
    {
        if(this._onClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onClick) } catch(_) {}
            this._onClick = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
    }

    update()
    {
        // Mirror OverlayController.active onto the rail every frame so the
        // active sheet's button reads as pressed.
        const active = OverlayController.getInstance()?.active ?? null
        if(active !== this._activeKey) this._setActive(active)
    }
}
