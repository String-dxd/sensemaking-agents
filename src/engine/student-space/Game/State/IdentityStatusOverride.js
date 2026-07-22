/**
 * Singleton slice that holds a manual override of the Marcia identity
 * status (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).
 *
 * Path Finder normally infers the student's status from Profile + Captures
 * + Choices. This slice exists so a single chip in the Profile sheet can
 * force a chosen quadrant for preview / classroom demo without having to
 * mint realistic state for every status. When `overrideId` is null the
 * inferred audit wins; when set, the classifier returns the overridden
 * status (the underlying exploration / commitment audit is still computed
 * so callers can show "this is a preview" honestly).
 *
 * Default preview: `'searching'`. Path Finder opens on the Searching view
 * for a fresh space rather than whatever status the evidence infers, so the
 * exploration narrative is the default frame. An explicit later choice
 * (including clearing to Auto, which persists `null`) still wins on reload.
 *
 * Persistence key: `ss:v1:identityStatusOverride`. Survives reload.
 *
 * Follows the singleton + subscribe + persist template per
 * [[feedback-engine-slice-template]].
 */

import Persistence from './Persistence.js'

const VALID_IDS = new Set(['starter', 'diffused', 'searching', 'foreclosed', 'achieved'])

export default class IdentityStatusOverride
{
    static instance

    static getInstance() { return IdentityStatusOverride.instance }

    constructor()
    {
        if(IdentityStatusOverride.instance) return IdentityStatusOverride.instance
        IdentityStatusOverride.instance = this

        // Default to the Searching preview so Path Finder opens on the
        // exploration frame. Persisted state (including an explicit Auto ⇒
        // null) overrides this via hydrate() on reload.
        this.overrideId  = 'searching'
        this.subscribers = new Set()
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    /** True when a manual preview is active. */
    get isActive() { return this.overrideId !== null }

    /** The overridden status id, or null when the inferred status should win. */
    get current() { return this.overrideId }

    // ── Mutations ──────────────────────────────────────────────────────────

    /**
     * Set the override. Pass `null` (or the literal string `'auto'`) to clear
     * the override and let the inferred audit win. Unknown ids are rejected
     * with a console.warn — lenient, consistent with other slices.
     */
    setOverride(id)
    {
        const next = (id === null || id === undefined || id === 'auto') ? null : id
        if(next !== null && !VALID_IDS.has(next))
        {
            console.warn(`[IdentityStatusOverride] refusing invalid status id "${id}"`)
            return this.overrideId
        }
        if(next === this.overrideId) return this.overrideId
        this.overrideId = next
        this._notify({ kind: 'set', overrideId: next })
        this._persist()
        return this.overrideId
    }

    /** Sugar — same as setOverride(null). */
    clear() { return this.setOverride(null) }

    // ── Persistence + pub/sub ─────────────────────────────────────────────

    hydrate(snapshot)
    {
        if(snapshot === null || snapshot === undefined) return
        // Accept either a bare string or a `{ overrideId }` envelope so a
        // future addition (e.g. a `setAt` timestamp for telemetry) can
        // land without breaking older persisted blobs.
        const raw = typeof snapshot === 'string' ? snapshot : snapshot?.overrideId
        if(raw === null) { this.overrideId = null; return }
        if(typeof raw !== 'string' || !VALID_IDS.has(raw)) return
        this.overrideId = raw
    }

    serialize() { return { overrideId: this.overrideId } }

    _persist() { Persistence.getInstance()?.save('identityStatusOverride', this.serialize()) }

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    _notify(event)
    {
        for(const cb of this.subscribers)
        {
            try { cb(event, this) }
            catch(err) { console.warn('[IdentityStatusOverride] subscriber threw', err) }
        }
    }

    dispose() { IdentityStatusOverride.instance = null }
}
