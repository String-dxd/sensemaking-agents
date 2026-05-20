/**
 * First-run ceremony state.
 *
 * Drives the multi-stage onboarding flow (splash → login → greeting →
 * egg-color → egg-name → egg-hatch → first-chat → first-mood → first-grow
 * → tree-narration → closing → done). Forward-only — there is no rewind
 * except from `egg-name` back to `egg-color`, and a debug `reset()`.
 *
 * See DESIGN.md §"First-run ceremony" and the plan at
 * /Users/jeongwondo/.claude/plans/steady-conjuring-panda.md for the locked
 * surface rules. This file is state-only; the surfaces live under
 * View/Onboarding/.
 */

import Persistence from './Persistence.js'
import Debug from '../Debug/Debug.js'
import { mergeOnboarding, defaultOnboarding, ONBOARDING_STAGES } from './schema.js'

export default class Onboarding
{
    static instance

    static getInstance() { return Onboarding.instance }

    constructor()
    {
        if(Onboarding.instance) return Onboarding.instance
        Onboarding.instance = this

        const seed = defaultOnboarding()
        this.stage          = seed.stage
        this.eggColorId     = seed.eggColorId
        this.companionName  = seed.companionName
        this.completedAt    = seed.completedAt
        this.firstMoodPinId = seed.firstMoodPinId

        // `#onboarding` URL hash forces a re-run on the next boot. The hash
        // stays on the URL so the student can refresh during QA without
        // losing the replay intent. Hydration below still runs first so we
        // can observe what was persisted before clearing it.
        // Exact match only — earlier `.includes('onboarding')` matched any URL
        // fragment containing the word (e.g. `#section-onboarding-foo`), making
        // it a foot-gun for accidental ceremony resets via shareable links.
        this._replayHash = (typeof window !== 'undefined') &&
            window.location.hash === '#onboarding'
        // `#sign-in` reuses the onboarding login surface without wiping the
        // completed ceremony fields. Profile-sheet auth sends signed-out
        // students here so they see the same Edupass/demo/offline chooser
        // from first arrival.
        this._signInHash = (typeof window !== 'undefined') &&
            window.location.hash === '#sign-in'

        this.subscribers = new Set()

        this.setDebug()
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    /** True when the ceremony has fully completed and the chrome should be on. */
    get isDone() { return this.stage === 'done' }

    /** True while the ceremony is actively gating the world. */
    get isActive() { return this.stage !== 'done' && this.stage !== 'pending' }

    // ── Mutations ──────────────────────────────────────────────────────────

    setStage(next)
    {
        if(!ONBOARDING_STAGES.has(next))
        {
            console.warn(`[onboarding] refusing invalid stage "${next}"`)
            return this.stage
        }
        if(next === this.stage) return this.stage
        this.stage = next
        if(next === 'done' && !this.completedAt) this.completedAt = new Date().toISOString()
        this._notify({ kind: 'stage', stage: next })
        this._persist()
        return this.stage
    }

    setEggColor(id)
    {
        // Lenient — `null` clears, an unknown id is dropped with a warn.
        if(id !== null && id !== undefined && typeof id !== 'string')
        {
            console.warn('[onboarding] eggColorId must be a string or null')
            return this.eggColorId
        }
        this.eggColorId = id ?? null
        this._notify({ kind: 'eggColor', eggColorId: this.eggColorId })
        this._persist()
        return this.eggColorId
    }

    setCompanionName(name)
    {
        if(name === null || name === undefined) { this.companionName = null }
        else if(typeof name === 'string')
        {
            const trimmed = name.trim().slice(0, 32)
            this.companionName = trimmed.length > 0 ? trimmed : null
        }
        else { console.warn('[onboarding] companionName must be string or null'); return this.companionName }
        this._notify({ kind: 'companionName', companionName: this.companionName })
        this._persist()
        return this.companionName
    }

    setFirstMoodPinId(id)
    {
        this.firstMoodPinId = (typeof id === 'string' && id.length > 0) ? id : null
        this._notify({ kind: 'firstMoodPinId' })
        this._persist()
        return this.firstMoodPinId
    }

    /** Convenience — used by IslandReveal at the ceremony finale. */
    complete()
    {
        return this.setStage('done')
    }

    /**
     * Wipe every onboarding field back to defaults. Re-pinging the flow on
     * next boot. Does NOT touch moodPins or profile — those persist for real.
     */
    reset()
    {
        const seed = defaultOnboarding()
        this.stage          = seed.stage
        this.eggColorId     = seed.eggColorId
        this.companionName  = seed.companionName
        this.completedAt    = seed.completedAt
        this.firstMoodPinId = seed.firstMoodPinId
        this._notify({ kind: 'reset' })
        this._persist()
    }

    // ── Persistence ────────────────────────────────────────────────────────

    hydrate(snapshot)
    {
        const merged = mergeOnboarding(snapshot)
        this.stage          = merged.stage
        this.eggColorId     = merged.eggColorId
        this.companionName  = merged.companionName
        this.completedAt    = merged.completedAt
        this.firstMoodPinId = merged.firstMoodPinId

        // Honor `#onboarding` URL hash after hydration so the user can replay
        // without manually clearing localStorage. `reset()` will also persist
        // the cleared state so a subsequent refresh still replays.
        if(this._replayHash) this.reset()
        else if(this._signInHash)
        {
            this.stage = 'login'
            this._persist()
        }

        this._notify({ kind: 'hydrate' })
    }

    serialize()
    {
        return {
            stage:          this.stage,
            eggColorId:     this.eggColorId,
            companionName:  this.companionName,
            completedAt:    this.completedAt,
            firstMoodPinId: this.firstMoodPinId,
            version:        1,
        }
    }

    _persist() { Persistence.getInstance()?.save('onboarding', this.serialize()) }

    // ── Pub/sub ────────────────────────────────────────────────────────────

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    _notify(event)
    {
        for(const cb of this.subscribers) cb(event, this)
    }

    // ── Debug ──────────────────────────────────────────────────────────────

    setDebug()
    {
        const debug = Debug.getInstance()
        if(!debug || !debug.active) return

        const folder = debug.ui.getFolder('state/onboarding')
        folder.add(this, 'stage').listen()
        folder.add(this, 'companionName').listen()
        folder.add(this, 'eggColorId').listen()
        folder.add({ replay: () => { this.reset(); location.reload() } }, 'replay').name('replay onboarding')
        folder.add({ skip:   () => this.setStage('done') },                 'skip').name('skip to done')
    }
}
