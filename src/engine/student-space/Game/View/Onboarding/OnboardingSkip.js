/**
 * Canonical "skip onboarding (dev)" logic, shared between the EdupassLogin
 * inline button and the floating SkipButton that rides every post-login
 * stage. Marks the ceremony complete, seeds an offline demo identity when
 * there's no backend, drains the persistence debounce synchronously so the
 * write survives the reload, and strips any `#onboarding` hash that would
 * trigger Onboarding.hydrate()'s replay-reset on next boot.
 */

import { OFFLINE_DEMO_STUDENTS } from './copy.js'

export function performOnboardingSkip(ctx)
{
    try
    {
        if(!ctx.state?.backend)
        {
            const pick = OFFLINE_DEMO_STUDENTS[Math.floor(Math.random() * OFFLINE_DEMO_STUDENTS.length)]
            ctx.profile?.setIdentity?.({ name: pick.name, className: pick.className })
        }
        ctx.state?.onboarding?.complete?.()
        // Drain the 250ms persistence debounce SYNCHRONOUSLY so the new
        // onboarding stage hits storage before we reload. Without this,
        // the page reload races the debounce timer, the stage='done'
        // write is lost, and the next boot replays the ceremony.
        ctx.state?.persistence?.flush?.()
        // Clear the `#onboarding` URL hash — Onboarding.hydrate() runs
        // its replay-reset whenever it sees that hash on boot, which
        // would re-wipe the `stage='done'` we just persisted. Without
        // this, skip → reload would replay the ceremony every time.
        if(typeof window !== 'undefined' && window.location.hash === '#onboarding')
        {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
    }
    catch(_) {}
    try { window.location.reload() } catch(_) {}
}
