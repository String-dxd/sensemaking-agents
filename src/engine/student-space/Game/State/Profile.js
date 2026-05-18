/**
 * Profile store — the written face of the student. Holds four facets keyed
 * by the canonical VIPS facet ids (values · interests · personality · skills).
 *
 * Cold-start: hydrates from PROFILE_SEED. Any subsequent mutation (forgetQuote,
 * refine) writes the curated state through Persistence so reload restores
 * the user's edits.
 *
 * The store has no opinion about the underlying canonical claim taxonomy
 * beyond what mergeQuote validates — the view layer is what filters by
 * facet, renders bento tiles per canonical claim, and renders the timeline.
 */

import Persistence from './Persistence.js'
import { PROFILE_SEED } from '../Data/profileSeed.js'
import { mergeProfile, COMPANION_SPECIES_IDS } from './schema.js'

export default class Profile
{
    static instance

    static getInstance() { return Profile.instance }

    constructor()
    {
        if(Profile.instance) return Profile.instance
        Profile.instance = this

        // Always start from a merged seed so the view never sees missing
        // facets. `hydrate(snapshot)` from State.js then overlays anything
        // persisted on disk. If a snapshot is empty, we keep the seed.
        this.facets      = mergeProfile(PROFILE_SEED)
        // Identity surface — name, class, and an optional avatar dataUrl.
        // Defaults are intentionally generic so the placeholder shows the
        // student's initial-on-circle (cream/coral palette) until they
        // refine it. Persisted through the same snapshot path as facets.
        // Default identity used when no persisted profile exists yet — the
        // seed reads "Mei" so the screenshot-parity copy in the Trajectory
        // compass / Path Finder reads naturally ("Mei's current through-line").
        // setIdentity({ name }) can still override this from the UI later.
        // companionSpecies + companionName are written by the first-run
        // ceremony (View/Onboarding/EggHatcher.js). Until then, Kira falls
        // back to the default 'flame' species (also Kira.js's hardcoded
        // default), and the bubble label uses the species name instead of a
        // nickname. See plan: /Users/jeongwondo/.claude/plans/steady-conjuring-panda.md
        this.identity = {
            name:             'Mei',
            className:        'Sec 3B',
            avatarDataUrl:    null,
            companionSpecies: 'flame',
            companionName:    null,
        }
        this.subscribers = new Set()
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    getFacet(facetId) { return this.facets[facetId] ?? null }

    getQuotesForClaim(claimId)
    {
        for(const facet of Object.values(this.facets))
        {
            const found = facet.quotes.filter((q) => q.canonicalClaimId === claimId)
            if(found.length) return found
        }
        return []
    }

    /** Count quotes per canonical claim within a facet. Used for bento tile badges. */
    countByClaim(facetId)
    {
        const facet = this.facets[facetId]
        if(!facet) return {}
        const counts = {}
        for(const q of facet.quotes)
        {
            if(!q.canonicalClaimId) continue
            counts[q.canonicalClaimId] = (counts[q.canonicalClaimId] ?? 0) + 1
        }
        return counts
    }

    // ── Mutations ──────────────────────────────────────────────────────────

    /**
     * Remove a quote. The student is the only one who can forget in v1.1
     * (v1.2 may add a "Connector retracts a claim" path; same shape).
     * Returns the removed id, or null if nothing matched.
     */
    forgetQuote(facetId, quoteId)
    {
        const facet = this.facets[facetId]
        if(!facet) return null
        const before = facet.quotes.length
        facet.quotes = facet.quotes.filter((q) => q.id !== quoteId)
        if(facet.quotes.length === before) return null

        this._notify({ kind: 'forget', facetId, quoteId })
        this._persist()
        return quoteId
    }

    /**
     * Patch a facet's prose fields. Stamps `lastRefinedAt` automatically so
     * the meta line in the view stays honest.
     */
    refine(facetId, partial = {})
    {
        const facet = this.facets[facetId]
        if(!facet) return null
        if(typeof partial.paragraph    === 'string') facet.paragraph    = partial.paragraph
        if(typeof partial.openQuestion === 'string') facet.openQuestion = partial.openQuestion
        facet.lastRefinedAt = new Date().toISOString()

        this._notify({ kind: 'refine', facetId })
        this._persist()
        return facet
    }

    /**
     * Update one or more identity fields (name / className / avatarDataUrl /
     * companionSpecies / companionName). Unknown keys are ignored. Persists
     * through the same path as facets.
     */
    setIdentity(partial = {})
    {
        if(typeof partial.name === 'string')          this.identity.name = partial.name
        if(typeof partial.className === 'string')     this.identity.className = partial.className
        if(typeof partial.avatarDataUrl === 'string' || partial.avatarDataUrl === null)
            this.identity.avatarDataUrl = partial.avatarDataUrl
        if(typeof partial.companionSpecies === 'string' && COMPANION_SPECIES_IDS.has(partial.companionSpecies))
            this.identity.companionSpecies = partial.companionSpecies
        if(typeof partial.companionName === 'string')
        {
            const trimmed = partial.companionName.trim().slice(0, 32)
            if(trimmed.length > 0) this.identity.companionName = trimmed
        }
        else if(partial.companionName === null) this.identity.companionName = null
        this._notify({ kind: 'identity' })
        this._persist()
        return this.identity
    }

    // ── Persistence ────────────────────────────────────────────────────────

    /** Replace state from a stored snapshot. Called once at boot by State.js. */
    hydrate(snapshot)
    {
        if(!snapshot) return
        // Accept both legacy { values, interests, … } snapshots and the new
        // { facets, identity } shape. mergeProfile remains lenient so the
        // boot path never throws on a partial snapshot.
        const isWrapped = snapshot && typeof snapshot === 'object'
                         && (snapshot.facets || snapshot.identity)
        const facetsPart = isWrapped ? (snapshot.facets ?? {}) : snapshot
        this.facets = mergeProfile(facetsPart)

        if(isWrapped && snapshot.identity && typeof snapshot.identity === 'object')
        {
            const id = snapshot.identity
            if(typeof id.name === 'string')          this.identity.name = id.name
            if(typeof id.className === 'string')     this.identity.className = id.className
            if(typeof id.avatarDataUrl === 'string') this.identity.avatarDataUrl = id.avatarDataUrl
            if(typeof id.companionSpecies === 'string' && COMPANION_SPECIES_IDS.has(id.companionSpecies))
                this.identity.companionSpecies = id.companionSpecies
            if(typeof id.companionName === 'string' && id.companionName.trim().length > 0)
                this.identity.companionName = id.companionName.trim().slice(0, 32)
        }

        this._notify({ kind: 'hydrate' })
    }

    serialize() { return { facets: this.facets, identity: this.identity } }

    _persist() { Persistence.getInstance()?.save('profile', this.serialize()) }

    // ── Pub/sub ────────────────────────────────────────────────────────────

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    _notify(event)
    {
        for(const cb of this.subscribers) cb(event, this.facets)
    }
}
