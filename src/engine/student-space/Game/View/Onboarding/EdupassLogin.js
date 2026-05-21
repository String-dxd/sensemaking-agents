/**
 * "Login with Edupass" surface, now an explicit two-action picker.
 *
 * Visual identity (wordmark, sky orbit) is preserved — the change is
 * behavioral: clicking the primary "Sign in with Edupass" CTA starts a
 * real WorkOS sign-in (WorkOS routes to its configured social provider —
 * Google in v0.2). A secondary "Use a demo account" button POSTs to the
 * demo cookie route.
 *
 * Returning signed-in students never see this surface — `OnboardingFlow.start()`
 * auto-skips the `login` stage when `state.auth.status === 'signed-in'`.
 */

import { performOnboardingSkip } from './OnboardingSkip.js'
import { wait } from '../../util/timing.js'
import { escapeHtml } from '../../util/html.js'

const CONNECTING_MS  = 600
const ENTER_MS       = 320
const EXIT_MS        = 240

function safeReturnPathname(value, fallback = '/')
{
    const trimmed = value?.trim?.()
    if(!trimmed) return fallback
    if(!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) return fallback
    return trimmed
}

function currentAuthReturnPathname()
{
    if(typeof window === 'undefined') return '/'
    const raw = new URLSearchParams(window.location.search).get('returnPathname')
    return safeReturnPathname(raw)
}

function authActionHref({ demo = false } = {})
{
    const search = new URLSearchParams()
    if(demo) search.set('demo', '1')
    search.set('returnPathname', currentAuthReturnPathname())
    return `/api/auth/sign-in?${search.toString()}`
}

function disposeEngineForNavigation()
{
    // Drain Persistence's debounced writes synchronously before any link or
    // form navigation tears the page down. Mirrors the documented pattern in
    // `src/lib/sign-out-engine.ts`; we reach the live Game through the same
    // window-global so this engine file does not have to import host code.
    if(typeof window === 'undefined') return
    try
    {
        const game = /** @type {{ dispose?: () => void } | null | undefined} */ (window.__studentSpaceGame)
        if(game?.dispose) game.dispose()
    }
    catch(err) { console.warn('[EdupassLogin] engine dispose before navigation failed', err) }
}

/**
 * Build a fresh hidden form on `document.body` and submit it. The body
 * survives engine `dispose()` (which removes the .onboarding-root that
 * holds the original visible form). Without this indirection a form-scoped
 * native POST can be aborted by the browser when its ancestor is removed
 * mid-handler — the documented DevPalette pattern at
 * `src/components/DevPalette.tsx`.
 */
function submitBodyScopedAuthForm(action, method = 'post')
{
    if(typeof document === 'undefined') return
    const form = document.createElement('form')
    form.method = method
    form.action = action
    form.style.display = 'none'
    document.body.appendChild(form)
    form.submit()
}

export default class EdupassLogin
{
    constructor(flow)
    {
        this.flow = flow
        this._el = null
        this._advance = null
        this._buttons = null
        this._connecting = false
    }

    setAdvance(cb) { this._advance = cb }

    async mount(root, ctx)
    {
        const edupassHref = authActionHref()
        const demoAction = authActionHref({ demo: true })
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
                <div class="onb-login__actions" role="group" aria-label="Sign in">
                    <a class="onb-login__cta onb-login__cta--edupass"
                       data-action="edupass"
                       href="${escapeHtml(edupassHref)}">
                        <span class="onb-login__edupass-mark" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <rect x="3" y="3" width="18" height="18" rx="5" fill="#fff" opacity="0.95"/>
                                <circle cx="12" cy="12" r="4" fill="#ff8a5c"/>
                            </svg>
                        </span>
                        <span class="onb-login__cta-label">${escapeHtml(ctx.copy.login.actions.edupass)}</span>
                    </a>
                    <form class="onb-login__secondary-form"
                          data-action="demo"
                          method="post"
                          action="${escapeHtml(demoAction)}">
                        <button type="submit" class="onb-login__secondary">
                            ${escapeHtml(ctx.copy.login.actions.demo)}
                        </button>
                    </form>
                </div>
                <p class="onb-login__demo-note">${escapeHtml(ctx.copy.login.demoNote)}</p>
                <button type="button" class="onb-login__skip" aria-label="Skip onboarding (dev)">
                    Skip onboarding (dev)
                </button>
            </div>
        `
        root.appendChild(el)
        this._el = el
        this._buttons = el.querySelector('.onb-login__actions')
        this._onClickRoot = (event) => this._onClick(event, ctx)
        this._onSubmitRoot = (event) => this._onSubmit(event, ctx)
        this._buttons.addEventListener('click', this._onClickRoot)
        this._buttons.addEventListener('submit', this._onSubmitRoot)
        // Skip button lives OUTSIDE .onb-login__actions (it's a dev affordance,
        // not an auth path) so it bypasses _beginConnecting and doesn't show
        // up in the "Sign in" aria-grouped controls. Wire it directly.
        this._skipBtn = el.querySelector('.onb-login__skip')
        if(this._skipBtn)
        {
            this._onSkipClick = () => this._onSkip(ctx)
            this._skipBtn.addEventListener('click', this._onSkipClick)
        }

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

        // Park focus on the primary CTA after the entry animation. Keyboard
        // users can hit Enter without tabbing in from the splash.
        const primary = this._buttons.querySelector('[data-action="edupass"]')
        try { primary?.focus({ preventScroll: true }) } catch(_) { /* link focus may not be supported */ }
    }

    async unmount()
    {
        if(!this._el) return
        const el = this._el
        this._el = null
        // Reset the connecting guard so a future remount can interact again.
        this._connecting = false
        if(this._buttons)
        {
            if(this._onClickRoot)  this._buttons.removeEventListener('click', this._onClickRoot)
            if(this._onSubmitRoot) this._buttons.removeEventListener('submit', this._onSubmitRoot)
        }
        this._buttons = null
        this._onClickRoot = null
        this._onSubmitRoot = null
        if(this._skipBtn && this._onSkipClick)
        {
            try { this._skipBtn.removeEventListener('click', this._onSkipClick) } catch(_) {}
        }
        this._skipBtn = null
        this._onSkipClick = null
        // Snap the orbit back to the default static framing for greeting/
        // egg surfaces; clear the body class so cream panels read solid.
        document.body.classList.remove('is-onb-landing')
        try { this.flow?.view?.camera?.stopLandingOrbit?.() } catch(_) {}
        el.classList.remove('is-visible')
        el.classList.add('is-leaving')
        await wait(EXIT_MS)
        el.remove()
    }

    /**
     * Dev-only escape hatch. Marks onboarding as complete (so the next boot
     * skips the ceremony), seeds a demo identity when there's no backend, then
     * reloads. Surfaced on the landing as a small inline button beneath the
     * Edupass CTA so test/dev flows don't have to sit through the full
     * ceremony each run. No-ops gracefully if any singleton is missing.
     */
    // On the login surface, "skip" means: log the user in as a demo account
    // (the safe default when no explicit method has been picked) AND mark
    // onboarding done so the post-demo reload lands them straight on the
    // island. We commit onboarding=done BEFORE the demo POST so the server's
    // redirect-back boots a flow that immediately short-circuits in
    // OnboardingFlow.start() via `onb.isDone`. If the demo form is missing
    // (no backend / dev env), we fall back to the offline-identity skip
    // path used by the post-login floating button.
    _onSkip(ctx)
    {
        const demoForm = this._el?.querySelector('form[data-action="demo"]')
        if(!demoForm)
        {
            performOnboardingSkip(ctx)
            return
        }

        try
        {
            ctx.state?.onboarding?.complete?.()
            // Drain the persistence debounce SYNCHRONOUSLY so the
            // stage='done' write survives the demo POST → server redirect.
            ctx.state?.persistence?.flush?.()
            if(typeof window !== 'undefined' && window.location.hash === '#onboarding')
            {
                window.history.replaceState(null, '', window.location.pathname + window.location.search)
            }
        }
        catch(_) {}

        try
        {
            const btn = demoForm.querySelector('button')
            this._beginConnecting(btn || demoForm, ctx)
            disposeEngineForNavigation()
            submitBodyScopedAuthForm(demoForm.action, demoForm.method || 'post')
        }
        catch(_)
        {
            performOnboardingSkip(ctx)
        }
    }

    _onClick(event, ctx)
    {
        if(this._connecting) return

        const link = event.target.closest('[data-action="edupass"]')
        if(link)
        {
            event.preventDefault()
            this._beginConnecting(link, ctx)
            disposeEngineForNavigation()
            if(typeof window !== 'undefined')
            {
                window.location.assign(link.getAttribute('href'))
            }
            return
        }
    }

    _onSubmit(event, ctx)
    {
        if(this._connecting) { event.preventDefault(); return }
        const form = event.target.closest('[data-action="demo"]')
        if(!form) return
        // preventDefault the in-place form so the browser-native POST does
        // not race with our synchronous engine dispose (which removes the
        // .onboarding-root mid-handler and would otherwise cancel the
        // navigation). Submit through a body-scoped form instead.
        event.preventDefault()
        this._beginConnecting(form.querySelector('button'), ctx)
        disposeEngineForNavigation()
        submitBodyScopedAuthForm(form.action, form.method || 'post')
    }

    /**
     * Mark the surface as "connecting" so subsequent taps no-op. Only the
     * triggered control flips into the visual connecting state; the other
     * two are simply disabled to communicate exclusivity.
     */
    _beginConnecting(triggeredControl, ctx)
    {
        this._connecting = true
        if(triggeredControl)
        {
            triggeredControl.classList.add('is-connecting')
            if(triggeredControl.disabled !== undefined) triggeredControl.disabled = true
            const label = triggeredControl.querySelector('.onb-login__cta-label')
            if(label && ctx?.copy?.login?.connecting)
            {
                label.textContent = `${ctx.copy.login.connecting}…`
            }
        }
        if(this._buttons)
        {
            for(const btn of this._buttons.querySelectorAll('button'))
            {
                if(btn !== triggeredControl) btn.disabled = true
            }
            for(const link of this._buttons.querySelectorAll('a'))
            {
                if(link !== triggeredControl) link.classList.add('is-disabled')
            }
        }
    }
}
