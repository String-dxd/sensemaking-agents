/**
 * Dummy "Login with Edupass" surface.
 *
 * On click: shows a 600ms "Connecting…" affordance, picks a random student
 * from DEMO_STUDENTS, writes profile.identity, advances to greeting. Easy
 * swap for a real OAuth redirect later — the rest of the flow only needs
 * `profile.identity.name`.
 */

import { DEMO_STUDENTS } from './copy.js'
import { wait } from '../../util/timing.js'
import { escapeHtml } from '../../util/html.js'

const CONNECTING_MS  = 600
const ENTER_MS       = 320
const EXIT_MS        = 240

export default class EdupassLogin
{
    constructor(flow)
    {
        this.flow = flow
        this._el = null
        this._advance = null
        this._btn = null
        this._connecting = false
    }

    setAdvance(cb) { this._advance = cb }

    async mount(root, ctx)
    {
        const el = document.createElement('div')
        el.className = 'onb-login onb-login--landing'
        el.innerHTML = `
            <div class="onb-login__sky-wash" aria-hidden="true"></div>
            <div class="onb-login__hero">
                <div class="onb-login__wordmark">
                    <span class="onb-login__brand">${escapeHtml(ctx.copy.login.wordmark)}</span>
                    <span class="onb-login__brand-sub">${escapeHtml(ctx.copy.login.tagline)}</span>
                </div>
            </div>
            <div class="onb-login__footer">
                <button type="button" class="onb-login__cta">
                    <span class="onb-login__edupass-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <rect x="3" y="3" width="18" height="18" rx="5" fill="#fff" opacity="0.95"/>
                            <circle cx="12" cy="12" r="4" fill="#ff8a5c"/>
                        </svg>
                    </span>
                    <span class="onb-login__cta-label">${escapeHtml(ctx.copy.login.cta)}</span>
                </button>
                <p class="onb-login__demo-note">${escapeHtml(ctx.copy.login.demoNote)}</p>
            </div>
        `
        root.appendChild(el)
        this._el = el
        this._btn = el.querySelector('.onb-login__cta')
        this._btn.addEventListener('click', () => this._onClick(ctx))

        // Reveal the 3D scene behind the surface. The body class flips
        // every onboarding-root child to transparent backgrounds so the
        // live island shows through; egg/greeting/etc. don't carry the
        // landing class so they keep their cream panels.
        document.body.classList.add('is-onb-landing')

        // Start the slow camera orbit on the world canvas. Caller takes
        // care of stopping it on click / unmount so the rest of the
        // ceremony lands at the default static framing.
        if(!ctx.reducedMotion)
        {
            ctx.view?.camera?.startLandingOrbit?.({ azimuthDegPerSec: 4, distance: 18, pitchDeg: 12 })
        }

        if(ctx.reducedMotion)
        {
            el.classList.add('is-visible')
        }
        else
        {
            // eslint-disable-next-line no-unused-expressions
            el.offsetWidth
            el.classList.add('is-visible')
            await wait(ENTER_MS)
        }

        // Park focus on the CTA after the entry animation. Keyboard users
        // can hit Enter without tabbing in from the splash.
        this._btn?.focus({ preventScroll: true })
    }

    async unmount()
    {
        if(!this._el) return
        const el = this._el
        this._el = null
        // Snap the orbit back to the default static framing for greeting/
        // egg surfaces; clear the body class so cream panels read solid.
        document.body.classList.remove('is-onb-landing')
        try { this.flow?.view?.camera?.stopLandingOrbit?.() } catch(_) {}
        el.classList.remove('is-visible')
        el.classList.add('is-leaving')
        await wait(EXIT_MS)
        el.remove()
    }

    _onClick(ctx)
    {
        if(this._connecting || !this._btn) return
        this._connecting = true
        this._btn.classList.add('is-connecting')
        this._btn.disabled = true
        this._btn.querySelector('.onb-login__cta-label').textContent = `${ctx.copy.login.connecting}…`

        setTimeout(() =>
        {
            // Random pick from the demo students list. Real Edupass OAuth
            // would replace this with the redirect's callback handling.
            const pick = DEMO_STUDENTS[Math.floor(Math.random() * DEMO_STUDENTS.length)]
            ctx.profile.setIdentity({ name: pick.name, className: pick.className })
            this._advance?.('greeting')
        }, CONNECTING_MS)
    }
}

