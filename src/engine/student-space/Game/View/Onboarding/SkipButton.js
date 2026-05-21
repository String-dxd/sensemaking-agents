/**
 * Floating "Skip onboarding (dev)" button that rides every post-login
 * onboarding stage (greeting / egg / first-chat / first-mood / reveal).
 *
 * Owned by OnboardingFlow. Mounted once at start() and torn down at
 * _finish() / dispose(). Hides itself on the `login` stage because
 * EdupassLogin already renders an integrated inline skip button — and
 * showing both at once would read as a UI bug. Outside the
 * `.onboarding-root` subtree so the per-surface fade transitions don't
 * tween it in and out alongside the active surface.
 */

import { performOnboardingSkip } from './OnboardingSkip.js'

export default class SkipButton
{
    constructor(flow)
    {
        this.flow = flow
        this._el  = null
        this._onClick = null
    }

    mount()
    {
        if(this._el) return
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'onb-skip-floating'
        btn.setAttribute('aria-label', 'Skip onboarding (dev)')
        btn.textContent = 'Skip onboarding (dev)'
        this._onClick = () =>
        {
            performOnboardingSkip(this.flow._buildCtx(this.flow.onb.stage))
        }
        btn.addEventListener('click', this._onClick)
        document.body.appendChild(btn)
        this._el = btn
        this.syncVisibility(this.flow.onb.stage)
    }

    // Hidden on the `login` stage because EdupassLogin's inline `.onb-login__skip`
    // covers that surface visually. Shown on every other stage.
    syncVisibility(stage)
    {
        if(!this._el) return
        const hide = stage === 'login' || stage === 'done' || stage === 'pending'
        this._el.classList.toggle('is-hidden', hide)
    }

    unmount()
    {
        if(!this._el) return
        if(this._onClick) try { this._el.removeEventListener('click', this._onClick) } catch(_) {}
        try { this._el.remove() } catch(_) {}
        this._el = null
        this._onClick = null
    }
}
