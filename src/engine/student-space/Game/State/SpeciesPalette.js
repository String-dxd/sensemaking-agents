/**
 * SpeciesPalette — working-copy-over-committed-base slice for species colors.
 *
 * Same model as IslandLayout (plan 001): base = defaultSpeciesPalette(),
 * working copy overridden per-species per setColor(), persisted in localStorage.
 * Fires { type: 'paletteChanged', kind, species, colors } on setColor().
 * Fires { type: 'paletteReplaced' } on revertToDefault() / setFromSnapshot().
 */

import Persistence from './Persistence.js'
import { defaultSpeciesPalette, defaultSpeciesPaletteFromConstants } from '../Data/speciesPalette.js'
import { mergeSpeciesPalette } from './schema.js'

export default class SpeciesPalette
{
    static instance = null

    static getInstance() { return SpeciesPalette.instance }

    constructor()
    {
        if(SpeciesPalette.instance) return SpeciesPalette.instance
        SpeciesPalette.instance = this

        this._base    = defaultSpeciesPalette()
        this._working = null   // null = not diverged
        this._version = 0
        this._listeners = []
    }

    // ── Read API ───────────────────────────────────────────────────────────────

    /**
     * Return the current colors for a (kind, species) pair.
     * Falls back to the committed default if the working copy doesn't override it.
     *
     * @param {'tree'|'flower'|'fruit'} kind
     * @param {string} species
     * @returns {object|null}
     */
    get(kind, species)
    {
        const working = this._working?.[kind]?.[species]
        if(working) return { ...working }
        return this._base[kind]?.[species] ? { ...this._base[kind][species] } : null
    }

    /** @returns {import('../Data/speciesPalette.js').PaletteSnapshot} */
    list()
    {
        const base = this._base
        const work = this._working

        /** @param {Record<string,object>} b @param {Record<string,object>|undefined} w */
        function mergeKind(b, w)
        {
            const out = {}
            for(const [id, colors] of Object.entries(b || {}))
            {
                out[id] = { ...colors, ...(w?.[id] || {}) }
            }
            return out
        }

        return {
            v:      1,
            tree:   mergeKind(base.tree,   work?.tree),
            flower: mergeKind(base.flower, work?.flower),
            fruit:  mergeKind(base.fruit,  work?.fruit),
        }
    }

    isDiverged()
    {
        return this._working !== null
    }

    // ── Write API ──────────────────────────────────────────────────────────────

    /**
     * Update colors for a (kind, species) pair.
     * Fans paletteChanged; persists; bumps version.
     *
     * @param {'tree'|'flower'|'fruit'} kind
     * @param {string} species
     * @param {object} colors  — must contain at least one color field
     */
    setColor(kind, species, colors)
    {
        if(!colors || typeof colors !== 'object') return false
        if(!['tree', 'flower', 'fruit'].includes(kind)) return false

        if(!this._working) this._working = {}
        if(!this._working[kind]) this._working[kind] = {}
        this._working[kind][species] = { ...(this._working[kind][species] || {}), ...colors }

        this._invalidate()
        this._fan({ type: 'paletteChanged', kind, species, colors })
        this._persist()
        return true
    }

    setFromSnapshot(raw)
    {
        const merged = mergeSpeciesPalette(raw)
        if(!merged) return false
        this._working = { tree: merged.tree, flower: merged.flower, fruit: merged.fruit }
        this._invalidate()
        this._fan({ type: 'paletteReplaced' })
        this._persist()
        return true
    }

    revertToDefault()
    {
        this._working = null
        this._invalidate()
        this._fan({ type: 'paletteReplaced' })
        this._persist()
    }

    // ── Slice protocol ─────────────────────────────────────────────────────────

    serialize()
    {
        return this.list()
    }

    hydrate(snapshot)
    {
        if(!snapshot || typeof snapshot !== 'object') return
        const merged = mergeSpeciesPalette(snapshot)
        if(!merged) return

        // Compare to base to determine if this represents a working-copy divergence
        // or if it's equal to the default (no divergence).
        const base = this._base
        const isDefault = ['tree', 'flower', 'fruit'].every((k) =>
            JSON.stringify(merged[k]) === JSON.stringify(base[k])
        )

        if(!isDefault)
        {
            this._working = { tree: merged.tree, flower: merged.flower, fruit: merged.fruit }
        }
        else
        {
            this._working = null
        }
        this._invalidate()
    }

    /**
     * @param {(event: {type: string, kind?: string, species?: string, colors?: object}) => void} cb
     * @returns {() => void}
     */
    subscribe(cb)
    {
        this._listeners.push(cb)
        return () =>
        {
            const i = this._listeners.indexOf(cb)
            if(i >= 0) this._listeners.splice(i, 1)
        }
    }

    // ── Private ────────────────────────────────────────────────────────────────

    _fan(event)
    {
        for(const cb of this._listeners.slice()) { try { cb(event) } catch(e) { console.warn('[SpeciesPalette] listener threw', e) } }
    }

    _invalidate() { this._version++ }

    _persist()
    {
        Persistence.getInstance()?.save('speciesPalette', this.serialize())
    }
}
