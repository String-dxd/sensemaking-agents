/**
 * Auth state slice — carries the server-resolved `loadAuthMenu()` payload
 * into the engine so React chrome surfaces (ProfileSheet, the onboarding
 * EdupassLogin) can render the right sign-in / sign-out / demo affordance.
 *
 * Intentionally non-persistent. Auth is a server fact; reload re-reads it
 * via `StudentSpaceHost` -> `backend.loadAuthMenu()` and feeds it back in
 * through `createGame({ authMenu })`. Persisting would create a window
 * where a stale signed-in chip survives a cookie clear.
 *
 * Shape matches `loadAuthMenuHandler`'s return type verbatim so the host
 * passes the payload straight through with no remapping:
 *   { status: 'signed-out' }
 *   { status: 'signed-in', label, detail, kind: 'workos' | 'demo' | 'dev-bypass' }
 *
 * Modeled on `MoodPins.js` — same singleton + subscribe pattern, minus
 * persistence + bulk-load handling.
 */

const SIGNED_OUT = Object.freeze({ status: 'signed-out' })

function freezeMenu(menu)
{
    if(!menu || menu.status !== 'signed-in') return SIGNED_OUT
    let kind = menu.kind
    if(kind !== 'workos' && kind !== 'demo' && kind !== 'dev-bypass')
    {
        // Unknown kind signals server-side schema drift (e.g. a new
        // identity provider added but the engine type wasn't refreshed).
        // Coerce to 'workos' so chrome still renders something sensible,
        // but warn so the drift is observable instead of silent.
        if(kind !== undefined)
        {
            console.warn(`[Auth] unknown menu kind "${String(kind)}"; coercing to "workos"`)
        }
        kind = 'workos'
    }
    return Object.freeze({
        status: 'signed-in',
        label: typeof menu.label === 'string' ? menu.label : '',
        detail: typeof menu.detail === 'string' ? menu.detail : null,
        kind,
    })
}

export default class Auth
{
    static instance

    static getInstance() { return Auth.instance }

    /** @param {{ status: 'signed-out' } | { status: 'signed-in', label: string, detail: string | null, kind: 'workos' | 'demo' | 'dev-bypass' } | null | undefined} initialMenu */
    constructor(initialMenu)
    {
        if(Auth.instance) return Auth.instance
        Auth.instance = this

        this.menu = freezeMenu(initialMenu)
        this.subscribers = new Set()
    }

    /**
     * Replace the auth menu and fan to subscribers. Tolerant of malformed
     * input — coerces unknown shapes to the canonical signed-out state so a
     * fetch glitch can't crash chrome surfaces.
     */
    setMenu(next)
    {
        const frozen = freezeMenu(next)
        // Identity-equality skip — same object reference means no change.
        // The chrome subscribes are cheap, so we don't bother with deep
        // equality; identity is enough to avoid the no-op refresh loop.
        if(frozen === this.menu) return frozen
        this.menu = frozen
        for(const cb of this.subscribers)
        {
            try { cb(frozen) }
            catch(err) { console.warn('[Auth] subscriber threw', err) }
        }
        return frozen
    }

    /** Subscribe to menu changes. Returns an unsubscribe function. */
    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    /** Convenience getters used by the engine chrome. */
    get isSignedIn() { return this.menu.status === 'signed-in' }
    get isSignedOut() { return this.menu.status === 'signed-out' }
}
