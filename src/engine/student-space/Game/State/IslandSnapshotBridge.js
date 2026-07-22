/**
 * Island snapshot bridge — engine → server writer for the Sprouts slice
 * payload, supporting the year-over-year growth timelapse.
 *
 * Subscribes to `state.sprouts` and POSTs the slice's serialized payload to
 * `/api/island/snapshot` on three coarse triggers:
 *
 *   - boot / sheet-open via `captureNow('boot')`, throttled to once per hour
 *     per session (in-memory timestamp, resets on reload)
 *   - every `'bloomed'` event in the slice
 *   - every `'decorMoved'` event in the slice
 *
 * Not every micro-mutation. Pre-bloom sprouts are invisible to viewers and
 * don't need point-in-time fidelity; capturing only when the visible state
 * changes keeps write volume bounded.
 *
 * Fire-and-forget — a 403 (demo / dev-bypass), network error, or 5xx is
 * logged at debug level and never reaches the student. The server-side
 * `assertWorkosOnly` is what actually enforces auth gating; this bridge
 * doesn't check auth state itself (the engine stays auth-blind).
 *
 * Follows the engine state-slice singleton template:
 *   - static `instance` + `getInstance()`
 *   - `subscribers = new Set()` (kept for future read-only consumers)
 *   - `dispose()` clears the singleton and detaches the slice subscription
 *   - `hydrate()` does NOT exist — there's no persisted state for this
 *     bridge; the throttle timestamp is in-memory only
 */

const SNAPSHOT_API = '/api/island/snapshot'
const BOOT_THROTTLE_MS = 60 * 60 * 1000  // 1 hour
const VERSION = 1

export default class IslandSnapshotBridge
{
    static instance

    static getInstance() { return IslandSnapshotBridge.instance }

    /**
     * @param {{ sproutsSlice?: object, fetch?: typeof fetch, now?: () => number }} [opts]
     *   - sproutsSlice: the engine's Sprouts slice. Required for production
     *     use; left optional so tests can construct the bridge with their
     *     own slice stub.
     *   - fetch: injectable fetch (tests).
     *   - now: injectable clock (tests).
     */
    constructor(opts = {})
    {
        if(IslandSnapshotBridge.instance) return IslandSnapshotBridge.instance
        IslandSnapshotBridge.instance = this

        this._sproutsSlice = null
        // Bind to globalThis: native fetch throws "Illegal invocation" when
        // called as a method (this._fetch(...)) with a non-window `this`.
        const globalFetch =
            typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
                ? globalThis.fetch.bind(globalThis)
                : null
        this._fetch = opts.fetch || globalFetch
        this._now = opts.now || (() => Date.now())

        this.subscribers   = new Set()
        this._unsubscribe  = null
        this._lastBootMs   = -Infinity
        this._inFlight     = false

        if(opts.sproutsSlice) this.attach(opts.sproutsSlice)
    }

    /**
     * Attach to a Sprouts slice. Idempotent — re-attaching detaches the prior
     * subscription first. Tests can construct without a slice and call this
     * later; production wiring lives in State.js.
     */
    attach(sproutsSlice)
    {
        if(!sproutsSlice) return
        this._detach()
        this._sproutsSlice = sproutsSlice
        if(typeof sproutsSlice.subscribe !== 'function') return
        this._unsubscribe = sproutsSlice.subscribe(event =>
        {
            if(!event) return
            // Coarse triggers only — pre-bloom mutations don't change the
            // visible island.
            if(event.type === 'bloomed' || event.type === 'decorMoved')
            {
                this._captureNoThrottle('event:' + event.type)
            }
        })
    }

    _detach()
    {
        if(this._unsubscribe)
        {
            try { this._unsubscribe() } catch(_) {}
            this._unsubscribe = null
        }
    }

    dispose()
    {
        this._detach()
        this.subscribers.clear()
        if(IslandSnapshotBridge.instance === this) IslandSnapshotBridge.instance = null
    }

    /**
     * Manual capture trigger. Throttled so repeated boots within the same
     * session window write at most one row per BOOT_THROTTLE_MS. The bloom /
     * decorMoved event paths skip the throttle because those events are
     * already low-frequency by their nature.
     */
    captureNow(reason = 'manual')
    {
        const now = this._now()
        if(now - this._lastBootMs < BOOT_THROTTLE_MS) return
        this._lastBootMs = now
        this._captureNoThrottle(reason)
    }

    _captureNoThrottle(_reason)
    {
        if(!this._sproutsSlice || typeof this._sproutsSlice.serialize !== 'function') return
        if(!this._fetch) return
        if(this._inFlight) return

        let payloadJson
        try
        {
            payloadJson = JSON.stringify({
                v: VERSION,
                sprouts: this._sproutsSlice.serialize(),
            })
        }
        catch(err)
        {
            console.warn('[IslandSnapshotBridge] serialize failed', err)
            return
        }

        this._inFlight = true
        this._fetch(SNAPSHOT_API, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ payload_json: payloadJson }),
        }).then(response =>
        {
            // Fire-and-forget. 403 is the expected demo path; anything else
            // we log at debug level so the student never sees it.
            if(!response.ok && response.status !== 403)
            {
                if(typeof console?.debug === 'function')
                {
                    console.debug('[IslandSnapshotBridge] snapshot rejected', response.status)
                }
            }
        }).catch(err =>
        {
            if(typeof console?.debug === 'function')
            {
                console.debug('[IslandSnapshotBridge] snapshot failed', err?.message || err)
            }
        }).finally(() =>
        {
            this._inFlight = false
        })
    }

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }
}
