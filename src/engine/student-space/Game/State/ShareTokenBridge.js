/**
 * Share-token bridge — engine-side state machine wrapping the three
 * server endpoints (/api/share/create, /api/share/revoke, /api/share/redactions).
 *
 * Constructed lazily on first ShareDialog open, NOT at engine boot. This
 * preserves the engine's sync boot path: nothing here calls fetch() at
 * module load. The dialog's open handler invokes ensureToken() the first
 * time a Share button is clicked.
 *
 * The bridge does not persist anything to localStorage — share tokens
 * live in Postgres and are authoritative there. The engine just caches
 * the most recent server response in memory; a page reload re-fetches
 * (or re-mints) on the next dialog open.
 */

const SHARE_API = {
    create: '/api/share/create',
    revoke: '/api/share/revoke',
    redactions: '/api/share/redactions',
}

/**
 * @typedef {'idle'|'creating'|'ready'|'revoking'|'error'} ShareStatus
 */

export default class ShareTokenBridge
{
    static instance

    static getInstance() { return ShareTokenBridge.instance }

    constructor()
    {
        if(ShareTokenBridge.instance) return ShareTokenBridge.instance
        ShareTokenBridge.instance = this

        this.status        = 'idle'
        this.token         = null
        this.url           = null
        this.showQuotes    = false
        this.errorCode     = null
        this.errorMessage  = null
        this.lastAction    = null
        this.pendingShowQuotes = null
        this.subscribers   = new Set()
    }

    dispose()
    {
        this.subscribers.clear()
        if(ShareTokenBridge.instance === this) ShareTokenBridge.instance = null
    }

    /**
     * Subscribe to state transitions. Returns an unsubscribe function.
     * Receives the bridge instance so subscribers can read whatever fields
     * they care about without a separate payload allocation.
     */
    subscribe(listener)
    {
        this.subscribers.add(listener)
        return () => this.subscribers.delete(listener)
    }

    _notify()
    {
        for(const listener of this.subscribers)
        {
            try { listener(this) }
            catch(err) { console.warn('[ShareTokenBridge] subscriber threw', err) }
        }
    }

    _setStatus(next, extras = {})
    {
        this.status = next
        if(next !== 'error')
        {
            this.errorCode = null
            this.errorMessage = null
        }
        Object.assign(this, extras)
        this._notify()
    }

    _toError(code, message)
    {
        this.errorCode = code
        this.errorMessage = message
        this._setStatus('error')
    }

    /**
     * Idempotent first-load fetch: mints a new token on every call when
     * the bridge has no in-memory token. Server enforces auth gating — a
     * demo / dev-bypass session receives 403 and the dialog enters the
     * 'error' state with a sign-in CTA.
     */
    async ensureToken()
    {
        if(this.status === 'ready' && this.token) return
        if(this.status === 'creating') return
        await this.createToken()
    }

    async createToken()
    {
        this.lastAction = 'create'
        this.pendingShowQuotes = null
        this._setStatus('creating')
        try
        {
            const response = await fetch(SHARE_API.create, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            })
            const payload = await this._readJson(response)
            if(!response.ok)
            {
                this._toError(payload?.error?.code || 'create_failed', payload?.error?.message || 'Could not create a share link.')
                return
            }
            this.token = payload.token
            this.url   = payload.url
            this.showQuotes = false
            this.lastAction = null
            this._setStatus('ready')
        }
        catch(err)
        {
            this._toError('network_error', err?.message || 'Network error.')
        }
    }

    async revokeToken()
    {
        if(!this.token) return
        const revoking = this.token
        this.lastAction = 'revoke'
        this.pendingShowQuotes = null
        this._setStatus('revoking')
        try
        {
            const response = await fetch(SHARE_API.revoke, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: revoking }),
            })
            if(!response.ok)
            {
                const payload = await this._readJson(response)
                this._toError(payload?.error?.code || 'revoke_failed', payload?.error?.message || 'Could not revoke the link.')
                return
            }
            // Drop the in-memory token; next ensureToken() mints a new one.
            this.token = null
            this.url   = null
            this.showQuotes = false
            this.lastAction = null
            this._setStatus('idle')
        }
        catch(err)
        {
            this._toError('network_error', err?.message || 'Network error.')
        }
    }

    /**
     * Optimistic toggle: updates `showQuotes` locally and notifies subscribers,
     * then PATCHes the server. On 4xx/5xx the local state snaps back to the
     * server's response.
     */
    async setShowQuotes(next)
    {
        if(!this.token) return
        this.lastAction = 'redactions'
        this.pendingShowQuotes = next
        const previous = this.showQuotes
        this.showQuotes = next
        this._notify()
        try
        {
            const response = await fetch(SHARE_API.redactions, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: this.token, show_quotes: next }),
            })
            const payload = await this._readJson(response)
            if(!response.ok)
            {
                // Snap back to the prior value; surface the error.
                this.showQuotes = previous
                this._toError(payload?.error?.code || 'redactions_failed', payload?.error?.message || 'Could not update redactions.')
                return
            }
            // Trust the server's echo of the persisted value.
            if(typeof payload?.show_quotes === 'boolean')
            {
                this.showQuotes = payload.show_quotes
                this.lastAction = null
                this.pendingShowQuotes = null
                if(this.status === 'error') this._setStatus('ready')
                else this._notify()
            }
        }
        catch(err)
        {
            this.showQuotes = previous
            this._toError('network_error', err?.message || 'Network error.')
        }
    }

    /** Used by the dialog's "Try again" button after an error. */
    retry()
    {
        if(this.token && this.lastAction === 'redactions')
        {
            return this.setShowQuotes(!!this.pendingShowQuotes)
        }
        if(this.token && this.lastAction === 'revoke') return this.revokeToken()
        return this.createToken()
    }

    async _readJson(response)
    {
        try { return await response.json() }
        catch(_) { return null }
    }
}
