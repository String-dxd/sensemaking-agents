/**
 * Sprouts state slice — sibling to MoodPins and Captures. Owns the
 * "things growing on the island" surface: small sprout descriptors that
 * accumulate capture references and eventually bloom into trees.
 *
 * v1 ships **single-species (trees only)**. Visual variety comes from
 * cycling tree species (oak / cherry) by sprout creation index. Species
 * variety across object kinds (flower, fruit) waits for v2 when claim
 * dimension (Values/Interests/Personality/Skills) can decide species
 * meaningfully — see docs/plans/2026-05-18-002-feat-island-object-progression-plan.md.
 *
 * Lifecycle of a sprout:
 *   1. First capture creates a sprout (count=1).
 *   2. Subsequent captures grow the same sprout (count++).
 *   3. count >= BLOOM_THRESHOLD flips readyToBloom=true; new captures
 *      open a fresh sprout.
 *   4. Student taps the sprout → view calls Sprouts.bloom(id) → the
 *      sprout dissolves and the view spawns a real Tree at its seed.
 *
 * Mirrors MoodPins.js architecture: subscribe → fan out → debounced
 * persist. The two snapshot accessors (recent, getActive) return
 * referentially-stable references between mutations so React's
 * useSyncExternalStore can wrap this slice without infinite loops.
 */

import Persistence from './Persistence.js'
import { mergeArray, mergeSprout } from './schema.js'

// Bloom threshold — number of captures required before a sprout is
// ready to plant. v1 single-species; one number suffices. Origin: R1
// in docs/brainstorms/2026-05-18-island-object-progression-requirements.md.
export const BLOOM_THRESHOLD = 3

// Tree species cycled per sprout createdAt index. Matches the existing
// Tree.js PLACEMENTS species set (oak, cherry).
export const TREE_SPECIES_ROTATION = Object.freeze(['oak', 'cherry'])

let counter = 0
const uuid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`

export default class Sprouts
{
    static instance

    static getInstance() { return Sprouts.instance }

    constructor()
    {
        if(Sprouts.instance) return Sprouts.instance
        Sprouts.instance = this

        // Active list — sprouts that have not yet been bloomed. Once a
        // sprout blooms it is removed from this list and a small tree
        // descriptor is appended to `bloomedTrees` (visible to the view
        // module as a persistent island object). The cycleIndex tracks
        // the total number of sprouts ever spawned for rotation.
        this.sprouts = []
        this.bloomedTrees = []
        this.cycleIndex = 0
        this.subscribers = new Set()

        // Snapshot caches — invalidated on every mutation. React's
        // useSyncExternalStore requires getSnapshot to return the same
        // reference until state actually changes, otherwise it throws
        // a "cached snapshot" warning and bails out unsafely.
        this._recentCache = new Map()  // n → frozen array
        this._activeCache = null
    }

    // ── Mutation API ───────────────────────────────────────────────────

    /**
     * Attach a capture/mood reference to the active sprout. If the
     * active sprout has already crossed the bloom threshold (or no
     * sprout exists yet), spawn a fresh one with this reference as
     * its first member.
     *
     * Deduping: if the captureRef.id is already in the active sprout's
     * captureRefs, return without incrementing. This guards against
     * MoodPins.patch fan-out (which re-fires subscribers for the same
     * pin id when cause/note are filled in later).
     *
     * @param {{ kind: 'capture'|'mood', id: string }} captureRef
     * @returns {{ sprout, didSpawn: boolean, didMarkReady: boolean }}
     */
    grow(captureRef)
    {
        if(!captureRef || typeof captureRef !== 'object' || !captureRef.id)
        {
            // Silent no-op on bad payload — matches the lenient posture
            // of every other slice. Sprouts is best-effort; never throw.
            return { sprout: null, didSpawn: false, didMarkReady: false }
        }

        let sprout = this._activeSprout()
        let didSpawn = false
        let didMarkReady = false

        if(!sprout)
        {
            sprout = this._spawnSprout()
            didSpawn = true
        }

        // Dedupe: if this capture is already counted, return without
        // changing the count. (MoodPins.patch re-fires subscribers.)
        if(sprout.captureRefs.includes(captureRef.id))
        {
            return { sprout, didSpawn, didMarkReady: false }
        }

        sprout.captureRefs.push(captureRef.id)
        sprout.count = sprout.captureRefs.length

        if(!sprout.readyToBloom && sprout.count >= sprout.threshold)
        {
            sprout.readyToBloom = true
            didMarkReady = true
        }

        this._invalidateCache()
        this._fan({ type: didSpawn ? 'spawned' : (didMarkReady ? 'markedReady' : 'grew'), sprout })
        this._persist()
        return { sprout, didSpawn, didMarkReady }
    }

    /**
     * Mark a sprout as bloomed. Removes it from the active list and
     * appends a persistent BloomedTree descriptor to `bloomedTrees` so
     * the view can keep rendering the result after the bloom animation
     * completes. The view module owns the dissolve/grow animation; this
     * slice only carries the state.
     *
     * @param {string} id
     * @returns {{ sprout: Sprout, bloomedTree: BloomedTree } | null}
     */
    bloom(id)
    {
        const idx = this.sprouts.findIndex((s) => s.id === id)
        if(idx === -1) return null
        const sprout = this.sprouts[idx]
        if(!sprout.readyToBloom) return null

        const bloomedAt = new Date().toISOString()
        sprout.bloomedAt = bloomedAt
        this.sprouts.splice(idx, 1)

        const bloomedTree = {
            id:            sprout.id,
            createdAt:     sprout.createdAt,
            bloomedAt,
            treeSpecies:   sprout.treeSpecies,
            placementSeed: sprout.placementSeed,
            captureRefs:   [...sprout.captureRefs],
        }
        this.bloomedTrees.push(bloomedTree)

        this._invalidateCache()
        this._fan({ type: 'bloomed', sprout, bloomedTree })
        this._persist()
        return { sprout, bloomedTree }
    }

    /** All bloomed trees, in bloom order. Used by the view to render persistent trees. */
    listBloomedTrees()
    {
        return this.bloomedTrees
    }

    // ── Snapshot accessors (referentially stable until next mutation) ──

    /**
     * Active sprouts, newest first. Returns a stable reference for
     * the same `n` until the next mutation.
     */
    recent(n = 50)
    {
        if(this._recentCache.has(n)) return this._recentCache.get(n)
        const snapshot = Object.freeze(this.sprouts.slice(-n).reverse().map((s) => Object.freeze({ ...s, captureRefs: Object.freeze([...s.captureRefs]) })))
        this._recentCache.set(n, snapshot)
        return snapshot
    }

    /**
     * The single active (not-yet-bloomed, not-yet-full) sprout, or
     * null if none. Stable reference until next mutation.
     */
    getActive()
    {
        if(this._activeCache !== null) return this._activeCache
        const found = this._activeSprout()
        this._activeCache = found
            ? Object.freeze({ ...found, captureRefs: Object.freeze([...found.captureRefs]) })
            : null
        return this._activeCache
    }

    /**
     * All ready-to-bloom sprouts, oldest first (insertion order). The
     * tray uses this to pick which sprout to focus when the student
     * clicks the count badge.
     */
    readyToBloom()
    {
        return this.sprouts.filter((s) => s.readyToBloom)
    }

    // ── Subscribe ──────────────────────────────────────────────────────

    /**
     * Subscribe to mutation events. Callback receives
     * `({ type, sprout }, sprouts)` where type is one of:
     * `'spawned' | 'grew' | 'markedReady' | 'bloomed'`.
     *
     * The dispatch loop wraps each callback in try/catch so a buggy
     * subscriber cannot abort fan-out or skip the persist write.
     */
    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    // ── Persistence ────────────────────────────────────────────────────

    hydrate(snapshot)
    {
        if(!snapshot || typeof snapshot !== 'object') return
        if(typeof snapshot.cycleIndex === 'number' && snapshot.cycleIndex >= 0)
        {
            this.cycleIndex = snapshot.cycleIndex
        }
        if(Array.isArray(snapshot.sprouts))
        {
            this.sprouts = mergeArray(snapshot.sprouts, mergeSprout, 'sprout')
        }
        if(Array.isArray(snapshot.bloomedTrees))
        {
            // Lenient — keep only well-formed entries with id + treeSpecies + placementSeed.
            this.bloomedTrees = snapshot.bloomedTrees.filter((t) =>
                t && typeof t === 'object' &&
                typeof t.id === 'string' &&
                typeof t.treeSpecies === 'string' &&
                typeof t.placementSeed === 'number',
            )
        }
        this._invalidateCache()
        // Bulk load is not a `spawned`/`grew` event. View subscribers
        // are written against post-add semantics; firing them on hydrate
        // would trigger toast/particle cascades on every reload. The
        // view reads `sprouts.recent()` directly on construction.
    }

    serialize()
    {
        return {
            cycleIndex:    this.cycleIndex,
            sprouts:       this.sprouts.map((s) => ({ ...s, captureRefs: [...s.captureRefs] })),
            bloomedTrees:  this.bloomedTrees.map((t) => ({ ...t, captureRefs: [...t.captureRefs] })),
        }
    }

    // ── Internal ───────────────────────────────────────────────────────

    /** The current active (growing) sprout, or null if all are ready/bloomed. */
    _activeSprout()
    {
        for(let i = this.sprouts.length - 1; i >= 0; i--)
        {
            if(!this.sprouts[i].readyToBloom) return this.sprouts[i]
        }
        return null
    }

    _spawnSprout()
    {
        const now = new Date()
        const entryDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const treeSpecies = TREE_SPECIES_ROTATION[this.cycleIndex % TREE_SPECIES_ROTATION.length]
        const sprout = {
            id:            uuid(),
            createdAt:     now.toISOString(),
            entryDate,
            species:       'tree',
            treeSpecies,
            placementSeed: this._nextPlacementSeed(),
            threshold:     BLOOM_THRESHOLD,
            count:         0,
            readyToBloom:  false,
            bloomedAt:     null,
            captureRefs:   [],
        }
        this.sprouts.push(sprout)
        this.cycleIndex += 1
        return sprout
    }

    /**
     * Deterministic placement seed — derived from cycleIndex so the
     * same student reloading on the same device gets the same island
     * layout. The View module maps this to a world (x, z) via a
     * seeded RNG over the island disk.
     */
    _nextPlacementSeed()
    {
        // Multiplicative hash to keep adjacent seeds visually separated.
        // The view's seed→world helper does the actual placement.
        return (this.cycleIndex * 2654435761) >>> 0
    }

    _invalidateCache()
    {
        this._recentCache.clear()
        this._activeCache = null
    }

    _fan(event)
    {
        for(const cb of this.subscribers)
        {
            try { cb(event, this.sprouts) }
            catch(err) { console.warn('[sprouts] subscriber threw', err) }
        }
    }

    _persist() { Persistence.getInstance()?.save('sprouts', this.serialize()) }
}

/**
 * Wire a Sprouts slice to a Captures and MoodPins slice so every new
 * capture/mood grows the active sprout. Each subscription wraps the
 * Sprouts.grow call in try/catch — the host slice's subscriber dispatch
 * loop does NOT swallow exceptions, and a throw from grow would abort
 * fan-out and skip the host's debounced _persist, silently losing the
 * entry on tab close. The wrap is the boundary that enforces "Sprouts
 * is best-effort, never blocks captures."
 *
 * Returns an `unsubscribe()` function that detaches both subscriptions.
 *
 * @param {{ subscribe: (cb: (entry: { id: string }) => void) => () => void }} captures
 * @param {{ subscribe: (cb: (pin: { id: string }) => void) => () => void }} moodPins
 * @param {Sprouts} sprouts
 * @returns {() => void}
 */
export function wireSproutsToCaptures(captures, moodPins, sprouts)
{
    const offCaptures = captures.subscribe((entry) =>
    {
        try { sprouts.grow({ kind: 'capture', id: entry.id }) }
        catch(err) { console.warn('[sprouts] grow from capture failed', err) }
    })
    const offMoodPins = moodPins.subscribe((pin) =>
    {
        try { sprouts.grow({ kind: 'mood', id: pin.id }) }
        catch(err) { console.warn('[sprouts] grow from mood pin failed', err) }
    })
    return () => { offCaptures(); offMoodPins() }
}
