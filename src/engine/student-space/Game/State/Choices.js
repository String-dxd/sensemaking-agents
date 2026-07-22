/**
 * Choices state slice — two lists under one singleton:
 *   - decisions : DecisionEntry[]    decision log with optional patternTag
 *   - intentions: ChangeIntention[]  forward-looking change intentions
 *
 * Patterns (avoidant / impulsive / deliberate) are stored per-entry on
 * decisions and aggregated at read time by `dominantPatternTag()` — the
 * slice does not maintain a separate "patterns" list.
 *
 * Mirrors the Profile / Relationships template: singleton + subscribe +
 * fan-out + debounced persist.
 */

import Persistence from './Persistence.js'
import { mergeChoices } from './schema.js'
import { CHOICES_SEED } from '../Data/choicesSeed.js'

let counter = 0
const uuid = (prefix) => `${prefix}_${Date.now().toString(36)}-${(counter++).toString(36)}`

export const DECISION_PATTERN_TAGS = ['avoidant', 'impulsive', 'deliberate']

export default class Choices
{
    static instance

    static getInstance() { return Choices.instance }

    constructor()
    {
        if(Choices.instance) return Choices.instance
        Choices.instance = this

        this.decisions  = []
        this.intentions = []
        this.subscribers = new Set()
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    listDecisions()  { return this.decisions }
    listIntentions() { return this.intentions }

    /**
     * Dominant pattern tag across logged decisions. Returns null when there
     * are no tagged entries, or when there is a tie at the top (deterministic
     * — no arbitrary winner). Otherwise returns one of DECISION_PATTERN_TAGS.
     */
    dominantPatternTag()
    {
        const counts = { avoidant: 0, impulsive: 0, deliberate: 0 }
        for(const d of this.decisions)
        {
            if(d.patternTag && counts[d.patternTag] !== undefined) counts[d.patternTag] += 1
        }
        const ranked = DECISION_PATTERN_TAGS
            .map((tag) => ({ tag, count: counts[tag] }))
            .filter((e) => e.count > 0)
            .sort((a, b) => b.count - a.count)
        if(ranked.length === 0) return null
        if(ranked.length > 1 && ranked[0].count === ranked[1].count) return null
        return ranked[0].tag
    }

    /** Pattern counts as a plain object — used by §2 rollup view. */
    patternCounts()
    {
        const counts = { avoidant: 0, impulsive: 0, deliberate: 0 }
        for(const d of this.decisions)
        {
            if(d.patternTag && counts[d.patternTag] !== undefined) counts[d.patternTag] += 1
        }
        return counts
    }

    // ── Mutations: decisions ──────────────────────────────────────────────

    addDecision(partial = {})
    {
        const decision = typeof partial.decision === 'string' ? partial.decision.trim() : ''
        if(!decision) return null
        const entry = {
            id:         uuid('dec'),
            createdAt:  new Date().toISOString(),
            decision,
            options:    Array.isArray(partial.options) ? partial.options.filter((o) => typeof o === 'string') : [],
            chose:      typeof partial.chose === 'string' ? partial.chose : '',
            forces:     Array.isArray(partial.forces) ? partial.forces.filter((f) => typeof f === 'string') : [],
            when:       typeof partial.when === 'string' ? partial.when : '',
            note:       partial.note ?? null,
            patternTag: partial.patternTag ?? null,
        }
        this.decisions = [...this.decisions, entry]
        this._notify({ kind: 'decisions:add', id: entry.id })
        this._persist()
        return entry
    }

    updateDecision(id, partial = {})
    {
        const idx = this.decisions.findIndex((e) => e.id === id)
        if(idx < 0) return null
        const current = this.decisions[idx]
        const next = { ...current }
        if(typeof partial.decision === 'string' && partial.decision.trim()) next.decision = partial.decision.trim()
        if(typeof partial.chose === 'string') next.chose = partial.chose
        if(typeof partial.when === 'string')  next.when  = partial.when
        if(partial.note === null || typeof partial.note === 'string') next.note = partial.note
        if(Array.isArray(partial.options)) next.options = partial.options.filter((o) => typeof o === 'string')
        if(Array.isArray(partial.forces))  next.forces  = partial.forces.filter((f) => typeof f === 'string')
        if(partial.patternTag === null || typeof partial.patternTag === 'string') next.patternTag = partial.patternTag
        this.decisions = [...this.decisions.slice(0, idx), next, ...this.decisions.slice(idx + 1)]
        this._notify({ kind: 'decisions:update', id })
        this._persist()
        return next
    }

    tagDecisionPattern(id, patternTag)
    {
        if(patternTag !== null && !DECISION_PATTERN_TAGS.includes(patternTag)) return null
        return this.updateDecision(id, { patternTag })
    }

    removeDecision(id)
    {
        const before = this.decisions.length
        this.decisions = this.decisions.filter((e) => e.id !== id)
        if(this.decisions.length === before) return null
        this._notify({ kind: 'decisions:remove', id })
        this._persist()
        return id
    }

    // ── Mutations: intentions ─────────────────────────────────────────────

    addChangeIntention(partial = {})
    {
        const change = typeof partial.change === 'string' ? partial.change.trim() : ''
        if(!change) return null
        const entry = {
            id:               uuid('intent'),
            createdAt:        new Date().toISOString(),
            current:          typeof partial.current === 'string' ? partial.current : '',
            change,
            byWhen:           partial.byWhen ?? null,
            linkedPatternTag: partial.linkedPatternTag ?? null,
        }
        this.intentions = [...this.intentions, entry]
        this._notify({ kind: 'intentions:add', id: entry.id })
        this._persist()
        return entry
    }

    updateChangeIntention(id, partial = {})
    {
        const idx = this.intentions.findIndex((e) => e.id === id)
        if(idx < 0) return null
        const current = this.intentions[idx]
        const next = { ...current }
        if(typeof partial.change === 'string' && partial.change.trim()) next.change = partial.change.trim()
        if(typeof partial.current === 'string') next.current = partial.current
        if(partial.byWhen === null || typeof partial.byWhen === 'string') next.byWhen = partial.byWhen
        if(partial.linkedPatternTag === null || typeof partial.linkedPatternTag === 'string')
            next.linkedPatternTag = partial.linkedPatternTag
        this.intentions = [...this.intentions.slice(0, idx), next, ...this.intentions.slice(idx + 1)]
        this._notify({ kind: 'intentions:update', id })
        this._persist()
        return next
    }

    removeChangeIntention(id)
    {
        const before = this.intentions.length
        this.intentions = this.intentions.filter((e) => e.id !== id)
        if(this.intentions.length === before) return null
        this._notify({ kind: 'intentions:remove', id })
        this._persist()
        return id
    }

    // ── Persistence + pub/sub ─────────────────────────────────────────────

    hydrate(snapshot)
    {
        // Fresh demo (no persisted snapshot) falls back to the seed corpus;
        // once the student has edited, their persisted list (even if empty)
        // wins so cleared entries don't resurrect.
        const merged = mergeChoices(snapshot ?? CHOICES_SEED)
        this.decisions  = merged.decisions
        this.intentions = merged.intentions
        this._notify({ kind: 'hydrate' })
    }

    serialize()
    {
        return { decisions: this.decisions, intentions: this.intentions }
    }

    _persist() { Persistence.getInstance()?.save('choices', this.serialize()) }

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
            catch(err) { console.warn('[Choices] subscriber threw', err) }
        }
    }

    dispose() { Choices.instance = null }
}
