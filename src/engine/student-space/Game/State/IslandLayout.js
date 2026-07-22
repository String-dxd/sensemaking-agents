/**
 * IslandLayout state slice — singleton that owns the live authored placement
 * for all five view kinds (tree, flower, fruit, mailbox, telescope).
 *
 * Architecture mirrors Sprouts.js: singleton, referentially-stable snapshot
 * caches, `_invalidateCache` → `_fan` → `_persist`, lenient `hydrate`, clean
 * `serialize`.
 *
 * Persistence model (working-copy-over-committed-base):
 *   - `_base`  = `defaultIslandLayout()` (plan 004 will repoint to a committed file)
 *   - `objects` = live layout (working copy if loaded from storage; else base)
 *   - `isDiverged()` = objects deep-differ from `_base.objects`
 *   - `revertToDefault()` = reset objects to base, clear working copy
 *
 * The slice fans typed events (`objectAdded`, `objectRemoved`, `objectUpdated`,
 * `layoutReplaced`) so downstream modules can subscribe without shape-sniffing.
 */

import Persistence from './Persistence.js'
import { coercePosition, mergeIslandLayout, mergePlacedObject } from './schema.js'
import { defaultIslandLayout } from '../Data/islandLayout.js'
import { claimCellAt, occupiedCellsFromSpec, snapPositionToLand } from './islandSpecCore/snapToLand.ts'

let counter = 0
const uuid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`


/**
 * Snap a hydrated layout's invalid positions to the nearest flat land cell
 * (pure U1 core helper; terrain predicate injected). Occupancy is pre-seeded
 * with the committed spec's decorative-object cells and the character spawn
 * so a snapped functional object never lands inside an editor tree; valid
 * positions are byte-identical and their cells claimed first so clustered
 * invalid objects fan out to distinct cells.
 */
export function snapLayoutPositions(objects, island)
{
    const env = {
        worldSize: island.worldSize,
        cols: island.spec.grid.cols,
        rows: island.spec.grid.rows,
        isValid: (x, z) => island.isPlaceable(x, z),
    }
    const occupied = occupiedCellsFromSpec(island.spec)
    const invalid = []
    for(const o of objects)
    {
        if(typeof o.x !== 'number' || typeof o.z !== 'number') continue
        if(env.isValid(o.x, o.z)) claimCellAt(env, occupied, o.x, o.z)
        else invalid.push(o)
    }
    for(const o of invalid)
    {
        const snapped = snapPositionToLand(env, occupied, o.x, o.z)
        if(snapped)
        {
            o.x = snapped.x
            o.z = snapped.z
        }
    }
}

export default class IslandLayout
{
    static instance

    static getInstance() { return IslandLayout.instance }

    constructor()
    {
        if(IslandLayout.instance) return IslandLayout.instance
        IslandLayout.instance = this

        this._base = defaultIslandLayout()
        // Clone the base objects so mutations to `this.objects` don't mutate the base.
        this.objects = this._base.objects.map((o) => ({ ...o }))
        this.subscribers = new Set()

        // Snapshot caches — invalidated on every mutation. Provides stable
        // references for React's useSyncExternalStore pattern.
        this._listCache = null
        this._listByKindCache = new Map()
        this._getCache = new Map()
    }

    // ── Query API ──────────────────────────────────────────────────────────

    /** All placed objects in insertion order. Returns a stable frozen array. */
    list()
    {
        if(this._listCache) return this._listCache
        this._listCache = Object.freeze(this.objects.map((o) => Object.freeze({ ...o })))
        return this._listCache
    }

    /**
     * All objects matching `kind`. Returns a stable frozen array.
     * @param {string} kind
     */
    listByKind(kind)
    {
        if(this._listByKindCache.has(kind)) return this._listByKindCache.get(kind)
        const filtered = Object.freeze(
            this.objects
                .filter((o) => o.kind === kind)
                .map((o) => Object.freeze({ ...o })),
        )
        this._listByKindCache.set(kind, filtered)
        return filtered
    }

    /**
     * Find one object by id. Returns a stable frozen object or undefined.
     * @param {string} id
     */
    get(id)
    {
        if(this._getCache.has(id)) return this._getCache.get(id)
        const obj = this.objects.find((o) => o.id === id)
        if(!obj) return undefined
        const frozen = Object.freeze({ ...obj })
        this._getCache.set(id, frozen)
        return frozen
    }

    // ── Mutation API ───────────────────────────────────────────────────────

    /**
     * Add a new placed object. If `obj.id` is absent, assigns
     * `${kind}-${uuid()}`. Rejects duplicate ids. Fans `objectAdded`.
     * @param {object} obj
     */
    addObject(obj)
    {
        if(!obj || typeof obj !== 'object') return
        // Assign a generated id before merge so mergePlacedObject's id-required
        // check passes when the caller omits id.
        const withId = { ...obj }
        if(!withId.id && withId.kind) withId.id = `${withId.kind}-${uuid()}`
        const merged = mergePlacedObject(withId, 'addObject')
        if(!merged) return
        if(this.objects.some((o) => o.id === merged.id)) return
        this.objects.push(merged)
        this._invalidateCache()
        this._fan({ type: 'objectAdded', object: merged })
        this._persist()
    }

    /**
     * Remove an object by id. No-op on unknown id. Fans `objectRemoved`.
     * @param {string} id
     */
    removeObject(id)
    {
        if(typeof id !== 'string') return
        const idx = this.objects.findIndex((o) => o.id === id)
        if(idx === -1) return
        const removed = this.objects[idx]
        this.objects.splice(idx, 1)
        this._invalidateCache()
        this._fan({ type: 'objectRemoved', object: removed })
        this._persist()
    }

    /**
     * Apply a partial patch to an object. `id` and `kind` are immutable.
     * Fans `objectUpdated`.
     * @param {string} id
     * @param {object} patch
     */
    updateObject(id, patch)
    {
        if(typeof id !== 'string' || !patch || typeof patch !== 'object') return
        const obj = this.objects.find((o) => o.id === id)
        if(!obj) return
        // id and kind are immutable
        const { id: _id, kind: _kind, ...safe } = patch
        // Validate numeric fields
        for(const k of ['x', 'z', 'yaw', 'scale'])
        {
            if(k in safe && (typeof safe[k] !== 'number' || !Number.isFinite(safe[k])))
            {
                delete safe[k]
            }
        }
        Object.assign(obj, safe)
        this._invalidateCache()
        this._fan({ type: 'objectUpdated', object: { ...obj } })
        this._persist()
    }

    /**
     * Move an object to a new `{ x, z }` position. Validates via
     * `coercePosition`. Fans `objectUpdated`.
     * @param {string} id
     * @param {{ x: number, z: number }} pos
     */
    moveObject(id, pos)
    {
        if(typeof id !== 'string') return
        const coerced = coercePosition(pos)
        if(!coerced) return
        const obj = this.objects.find((o) => o.id === id)
        if(!obj) return
        obj.x = coerced.x
        obj.z = coerced.z
        this._invalidateCache()
        this._fan({ type: 'objectUpdated', object: { ...obj } })
        this._persist()
    }

    /**
     * Replace the entire layout. Validates via `mergeIslandLayout`.
     * Fans `layoutReplaced`.
     * @param {{ v: 1, objects: object[] }} layout
     */
    setLayout(layout)
    {
        const merged = mergeIslandLayout(layout)
        if(!merged) return
        this.objects = merged.objects
        this._invalidateCache()
        this._fan({ type: 'layoutReplaced', layout: merged })
        this._persist()
    }

    /**
     * Revert the working copy to the committed base default. Clears the
     * persisted working copy. Fans `layoutReplaced`.
     */
    revertToDefault()
    {
        this.objects = this._base.objects.map((o) => ({ ...o }))
        this._invalidateCache()
        // Wipe the persisted working copy so the next boot also defaults.
        Persistence.getInstance()?.save('islandLayout', null)
        this._fan({ type: 'layoutReplaced', layout: this._base })
    }

    /**
     * True when the current live objects differ from the committed base.
     * @returns {boolean}
     */
    isDiverged()
    {
        const live = this.objects
        const base = this._base.objects
        if(live.length !== base.length) return true
        for(let i = 0; i < live.length; i++)
        {
            const l = live[i]
            const b = base[i]
            if(
                l.id      !== b.id      ||
                l.kind    !== b.kind    ||
                l.species !== b.species ||
                l.x       !== b.x       ||
                l.z       !== b.z       ||
                l.yaw     !== b.yaw     ||
                l.scale   !== b.scale   ||
                l.locked  !== b.locked
            ) return true
        }
        return false
    }

    // ── Subscribe ──────────────────────────────────────────────────────────

    /**
     * Subscribe to mutation events. Callback receives an event object.
     * Returns an unsubscribe function.
     * @param {(event: object) => void} cb
     * @returns {() => void}
     */
    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    // ── Persistence ────────────────────────────────────────────────────────

    /**
     * Hydrate from a persisted working-copy snapshot. If the snapshot is
     * valid and non-empty, it replaces the base default. Otherwise the
     * slice keeps the base.
     * @param {unknown} snapshot
     */
    hydrate(snapshot, island)
    {
        if(!snapshot || typeof snapshot !== 'object') return
        const merged = mergeIslandLayout(snapshot)
        if(!merged) return
        this.objects = merged.objects
        // Terrain-aware snap (world-port U11, KTD-7): persisted positions that
        // fall in the sea or on terrace walls under the new terrain snap to
        // the nearest flat land cell — hydrate-time only, no subscriber fan,
        // no _persist, no snapshot POST. `schema.js` stays terrain-blind; the
        // snapped values persist lazily on the first ordinary mutation.
        if(island) snapLayoutPositions(this.objects, island)
        this._invalidateCache()
        // Bulk hydrate does NOT fan events (same rationale as Sprouts.hydrate).
    }

    /**
     * Serialize the current working-copy layout.
     * @returns {{ v: 1, objects: object[] }}
     */
    serialize()
    {
        return {
            v:       1,
            objects: this.objects.map((o) => ({ ...o })),
        }
    }

    // ── Internal ───────────────────────────────────────────────────────────

    _invalidateCache()
    {
        this._listCache = null
        this._listByKindCache.clear()
        this._getCache.clear()
    }

    _fan(event)
    {
        for(const cb of this.subscribers)
        {
            try { cb(event) }
            catch(err) { console.warn('[islandLayout] subscriber threw', err) }
        }
    }

    _persist()
    {
        Persistence.getInstance()?.save('islandLayout', this.serialize())
    }
}
