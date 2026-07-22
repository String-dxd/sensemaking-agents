/**
 * Relationships state slice — three lists under one singleton:
 *   - map         : RelationshipMapEntry[]   who is in my life
 *   - belonging   : BelongingEntry[]         where I belong vs. participate
 *   - perspectives: OutsidePerspectiveEntry[] how others see me
 *
 * Mirrors the Profile / MoodPins template: singleton + subscribe + fan-out
 * + debounced persist. List accessors return referentially-stable arrays
 * between mutations so React's useSyncExternalStore can wrap this slice
 * without infinite loops.
 */

import Persistence from './Persistence.js'
import { mergeRelationships } from './schema.js'
import { RELATIONSHIPS_SEED } from '../Data/relationshipsSeed.js'

let counter = 0
const uuid = (prefix) => `${prefix}_${Date.now().toString(36)}-${(counter++).toString(36)}`

export default class Relationships
{
    static instance

    static getInstance() { return Relationships.instance }

    constructor()
    {
        if(Relationships.instance) return Relationships.instance
        Relationships.instance = this

        this.map          = []
        this.belonging    = []
        this.perspectives = []
        this.subscribers  = new Set()
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    listMap()          { return this.map }
    listBelonging()    { return this.belonging }
    listPerspectives() { return this.perspectives }

    // ── Mutations: relationship map ───────────────────────────────────────

    addPerson(partial = {})
    {
        const name = typeof partial.name === 'string' ? partial.name.trim() : ''
        if(!name) return null
        const entry = {
            id:        uuid('rel'),
            createdAt: new Date().toISOString(),
            name,
            category:  partial.category || 'other',
            quality:   partial.quality || null,
            note:      partial.note ?? null,
        }
        this.map = [...this.map, entry]
        this._notify({ kind: 'map:add', id: entry.id })
        this._persist()
        return entry
    }

    updatePerson(id, partial = {})
    {
        const idx = this.map.findIndex((e) => e.id === id)
        if(idx < 0) return null
        const current = this.map[idx]
        const next = { ...current }
        if(typeof partial.name === 'string' && partial.name.trim()) next.name = partial.name.trim()
        if(typeof partial.category === 'string') next.category = partial.category
        if(partial.quality === null || typeof partial.quality === 'string') next.quality = partial.quality
        if(partial.note === null || typeof partial.note === 'string')       next.note    = partial.note
        this.map = [...this.map.slice(0, idx), next, ...this.map.slice(idx + 1)]
        this._notify({ kind: 'map:update', id })
        this._persist()
        return next
    }

    removePerson(id)
    {
        const before = this.map.length
        this.map = this.map.filter((e) => e.id !== id)
        if(this.map.length === before) return null
        this._notify({ kind: 'map:remove', id })
        this._persist()
        return id
    }

    // ── Mutations: belonging ──────────────────────────────────────────────

    addBelonging(partial = {})
    {
        const groupName = typeof partial.groupName === 'string' ? partial.groupName.trim() : ''
        if(!groupName) return null
        const entry = {
            id:          uuid('belong'),
            createdAt:   new Date().toISOString(),
            groupKind:   partial.groupKind || 'other',
            groupName,
            belongLevel: partial.belongLevel || 'participate',
            note:        partial.note ?? null,
        }
        this.belonging = [...this.belonging, entry]
        this._notify({ kind: 'belonging:add', id: entry.id })
        this._persist()
        return entry
    }

    updateBelonging(id, partial = {})
    {
        const idx = this.belonging.findIndex((e) => e.id === id)
        if(idx < 0) return null
        const current = this.belonging[idx]
        const next = { ...current }
        if(typeof partial.groupName === 'string' && partial.groupName.trim()) next.groupName = partial.groupName.trim()
        if(typeof partial.groupKind === 'string')   next.groupKind = partial.groupKind
        if(typeof partial.belongLevel === 'string') next.belongLevel = partial.belongLevel
        if(partial.note === null || typeof partial.note === 'string') next.note = partial.note
        this.belonging = [...this.belonging.slice(0, idx), next, ...this.belonging.slice(idx + 1)]
        this._notify({ kind: 'belonging:update', id })
        this._persist()
        return next
    }

    removeBelonging(id)
    {
        const before = this.belonging.length
        this.belonging = this.belonging.filter((e) => e.id !== id)
        if(this.belonging.length === before) return null
        this._notify({ kind: 'belonging:remove', id })
        this._persist()
        return id
    }

    // ── Mutations: outside perspectives ───────────────────────────────────

    addPerspective(partial = {})
    {
        const observation = typeof partial.observation === 'string' ? partial.observation.trim() : ''
        if(!observation) return null
        const entry = {
            id:               uuid('persp'),
            createdAt:        new Date().toISOString(),
            source:           partial.source || 'peer',
            sourceLabel:      partial.sourceLabel ?? null,
            observation,
            vipsDimensionRef: partial.vipsDimensionRef ?? null,
            agreementSelf:    partial.agreementSelf || 'unknown',
        }
        this.perspectives = [...this.perspectives, entry]
        this._notify({ kind: 'perspectives:add', id: entry.id })
        this._persist()
        return entry
    }

    updatePerspective(id, partial = {})
    {
        const idx = this.perspectives.findIndex((e) => e.id === id)
        if(idx < 0) return null
        const current = this.perspectives[idx]
        const next = { ...current }
        if(typeof partial.observation === 'string' && partial.observation.trim()) next.observation = partial.observation.trim()
        if(typeof partial.source === 'string') next.source = partial.source
        if(partial.sourceLabel === null || typeof partial.sourceLabel === 'string') next.sourceLabel = partial.sourceLabel
        if(partial.vipsDimensionRef === null || typeof partial.vipsDimensionRef === 'string')
            next.vipsDimensionRef = partial.vipsDimensionRef
        if(typeof partial.agreementSelf === 'string') next.agreementSelf = partial.agreementSelf
        this.perspectives = [...this.perspectives.slice(0, idx), next, ...this.perspectives.slice(idx + 1)]
        this._notify({ kind: 'perspectives:update', id })
        this._persist()
        return next
    }

    removePerspective(id)
    {
        const before = this.perspectives.length
        this.perspectives = this.perspectives.filter((e) => e.id !== id)
        if(this.perspectives.length === before) return null
        this._notify({ kind: 'perspectives:remove', id })
        this._persist()
        return id
    }

    // ── Persistence + pub/sub ─────────────────────────────────────────────

    hydrate(snapshot)
    {
        // Fresh demo (no persisted snapshot) falls back to the seed corpus;
        // once the student has edited, their persisted list (even if empty)
        // wins so cleared entries don't resurrect.
        const merged = mergeRelationships(snapshot ?? RELATIONSHIPS_SEED)
        this.map          = merged.map
        this.belonging    = merged.belonging
        this.perspectives = merged.perspectives
        this._notify({ kind: 'hydrate' })
    }

    serialize()
    {
        return { map: this.map, belonging: this.belonging, perspectives: this.perspectives }
    }

    _persist() { Persistence.getInstance()?.save('relationships', this.serialize()) }

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
            catch(err) { console.warn('[Relationships] subscriber threw', err) }
        }
    }

    dispose() { Relationships.instance = null }
}
