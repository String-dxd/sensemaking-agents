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
import { claimCellAt, occupiedCellsFromSpec, snapPositionToLand } from './islandSpecCore/snapToLand.ts'
import { coercePosition, mergeArray, mergeSprout } from './schema.js'

// Bloom threshold — number of captures required before a sprout is
// ready to plant. v1.1: thresholds vary by species (tree=3, flower=3,
// fruit=2, butterfly=3) — see THRESHOLD_BY_SPECIES.  BLOOM_THRESHOLD
// is the default used when species is still 'pending' (no dimension
// chosen yet).
export const BLOOM_THRESHOLD = 3

// Tree species cycled per sprout createdAt index. Matches the existing
// Tree.js PLACEMENTS species set (oak, cherry).
export const TREE_SPECIES_ROTATION = Object.freeze(['oak', 'cherry'])

// Dimension → sprout species mapping. The student picks a dimension
// chip after each capture; the sprout's species is locked from the
// FIRST tagged capture in the sprout (later captures' dimensions are
// stored on their entries but don't change the sprout).
export const DIMENSION_TO_SPECIES = Object.freeze({
    values:      'tree',
    interests:   'flower',
    personality: 'butterfly',
    skills:      'fruit',
})

// Decor kinds (per-instance arrange) → bucket-name inside `decorOffsets`.
// Listed once here so `setDecorOffset` / `getDecorOffset` / serialize /
// hydrate all agree on which kinds are supported.
const DECOR_BUCKETS = Object.freeze({
    tree:      'trees',
    flower:    'flowers',
    fruit:     'fruits',
    mailbox:   'mailbox',
    telescope: 'telescope',
})

export const THRESHOLD_BY_SPECIES = Object.freeze({
    pending:   3,
    tree:      3,
    flower:    3,
    butterfly: 3,
    fruit:     2,
})

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
        // Pick-and-plant offsets for static decoration that the student
        // considers theirs (the onboarding tree and flower). Keyed by
        // placement index. A missing key means "use the authored
        // placement coords"; an explicit `{x, z}` overrides them.
        // Per-kind offset buckets — universal arrange ships trees, flowers,
        // fruits, mailbox, telescope. Butterflies and other animated /
        // ambient props stay non-draggable. Buckets are keyed by index
        // (singleton kinds use { 0: {x,z} }).
        this.decorOffsets = { trees: {}, flowers: {}, fruits: {}, mailbox: {}, telescope: {} }
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
            // Species may be 'pending' if the student bloomed before
            // tagging (rare path — chip picker would normally land
            // first). Persist whatever it is; the view falls back to
            // the tree visual for 'pending' bloomedTrees.
            species:       sprout.species,
            treeSpecies:   sprout.treeSpecies,
            placementSeed: sprout.placementSeed,
            captureRefs:   [...sprout.captureRefs],
            dimension:     sprout.dimension,
            // Carry the student-set position forward so a sprout the
            // student moved blooms in place rather than snapping back
            // to its seeded coordinate. Cloned so later mutations on
            // the bloomedTree's position don't bleed into the dropped
            // sprout reference.
            position:      sprout.position ? { x: sprout.position.x, z: sprout.position.z } : null,
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

    /**
     * Pick-and-plant: set or clear an explicit world position for an
     * active sprout. The view treats an explicit position as
     * authoritative; clearing (passing `null`) reverts to the seeded
     * placement. Silent no-op on unknown id or invalid payload — matches
     * the lenient posture of every other slice.
     *
     * @param {string} id
     * @param {{ x: number, z: number } | null} position
     * @returns {boolean} true if the sprout's position changed (or
     *   cleared), false on unknown id or rejected payload.
     */
    setSproutPosition(id, position)
    {
        if(typeof id !== 'string' || id.length === 0) return false
        // coercePosition returns null for both "explicit null clear" and
        // "invalid payload". Distinguish them so an invalid payload is
        // rejected without clearing existing data.
        const coerced = coercePosition(position)
        if(coerced === null && position !== null && position !== undefined) return false

        const sprout = this.sprouts.find((s) => s.id === id)
        if(!sprout) return false

        sprout.position = coerced
        this._invalidateCache()
        this._fan({ type: 'sproutMoved', sprout })
        this._persist()
        return true
    }

    /**
     * Pick-and-plant: set or clear the position offset for an
     * onboarding-spawned decoration (the static tree or flower
     * placed at boot). `kind` is 'tree' or 'flower', `index` is the
     * placement index, and `position` is `{x,z}` or null to revert.
     *
     * Fires a `'decorMoved'` event so the view can call into
     * Tree.moveEntry / Flowers.moveInstance.
     */
    setDecorOffset(kind, index, position)
    {
        const bucketName = DECOR_BUCKETS[kind]
        if(!bucketName) return false
        if(!Number.isInteger(index) || index < 0) return false
        const coerced = coercePosition(position)
        if(coerced === null && position !== null && position !== undefined) return false

        const bucket = this.decorOffsets[bucketName] || (this.decorOffsets[bucketName] = {})
        if(coerced === null) delete bucket[index]
        else bucket[index] = coerced

        this._invalidateCache()
        this._fan({ type: 'decorMoved', kind, index, position: coerced })
        this._persist()
        return true
    }

    /** Read the persisted offset for a decor entry, or null if none. */
    getDecorOffset(kind, index)
    {
        const bucketName = DECOR_BUCKETS[kind]
        if(!bucketName) return null
        return this.decorOffsets[bucketName]?.[index] ?? null
    }

    /**
     * Pick-and-plant: set or clear an explicit world position for a
     * bloomed object. Same contract as `setSproutPosition`. Fans a
     * `'bloomedMoved'` event so subscribers can dispatch by tag rather
     * than peeking at shape.
     */
    setBloomedPosition(id, position)
    {
        if(typeof id !== 'string' || id.length === 0) return false
        const coerced = coercePosition(position)
        if(coerced === null && position !== null && position !== undefined) return false

        const bloomedTree = this.bloomedTrees.find((t) => t.id === id)
        if(!bloomedTree) return false

        bloomedTree.position = coerced
        this._invalidateCache()
        this._fan({ type: 'bloomedMoved', bloomedTree })
        this._persist()
        return true
    }

    /**
     * The student has tagged a capture with a V/I/P/S dimension via the
     * chip picker. If this capture is the FIRST in its sprout AND the
     * sprout is still 'pending', lock the sprout's species from the
     * dimension. Later captures' dimensions are still recorded on the
     * capture entry itself (by Captures.patch) but do NOT change the
     * sprout's species — only the first one counts. This matches the
     * student mental model of "the first thing I tag determines what
     * grows."
     *
     * @param {string} captureId — the id of the capture that was tagged
     * @param {'values'|'interests'|'personality'|'skills'} dimension
     * @returns {boolean} true if the sprout's species changed
     */
    setDimensionForFirstCapture(captureId, dimension)
    {
        if(!DIMENSION_TO_SPECIES[dimension]) return false
        for(const sprout of this.sprouts)
        {
            const idx = sprout.captureRefs.indexOf(captureId)
            if(idx === -1) continue
            // Only the first capture in the sprout drives species.
            if(idx !== 0) return false
            // Species is locked once set; subsequent tags are ignored.
            if(sprout.species !== 'pending') return false
            sprout.species = DIMENSION_TO_SPECIES[dimension]
            sprout.dimension = dimension
            sprout.threshold = THRESHOLD_BY_SPECIES[sprout.species]
            // The threshold may have shifted (fruit=2 vs default 3).
            // If the count has already crossed it (rare but possible
            // if the picker is delayed), flip readyToBloom now.
            if(!sprout.readyToBloom && sprout.count >= sprout.threshold)
            {
                sprout.readyToBloom = true
                this._invalidateCache()
                this._fan({ type: 'markedReady', sprout })
            }
            else
            {
                this._invalidateCache()
                this._fan({ type: 'speciesLocked', sprout })
            }
            this._persist()
            return true
        }
        return false
    }

    // ── Snapshot accessors (referentially stable until next mutation) ──

    /**
     * Active sprouts, newest first. Returns a stable reference for
     * the same `n` until the next mutation.
     */
    recent(n = 50)
    {
        if(this._recentCache.has(n)) return this._recentCache.get(n)
        const freezeOne = (s) => Object.freeze({
            ...s,
            captureRefs: Object.freeze([...s.captureRefs]),
            position:    s.position ? Object.freeze({ x: s.position.x, z: s.position.z }) : null,
        })
        const snapshot = Object.freeze(this.sprouts.slice(-n).reverse().map(freezeOne))
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
            ? Object.freeze({
                ...found,
                captureRefs: Object.freeze([...found.captureRefs]),
                position:    found.position ? Object.freeze({ x: found.position.x, z: found.position.z }) : null,
            })
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

    hydrate(snapshot, island)
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
            // Default species to 'tree' for legacy entries written before
            // v1.1 widened the species enum (preserves smoke-test data).
            this.bloomedTrees = snapshot.bloomedTrees
                .filter((t) =>
                    t && typeof t === 'object' &&
                    typeof t.id === 'string' &&
                    typeof t.treeSpecies === 'string' &&
                    typeof t.placementSeed === 'number',
                )
                .map((t) => ({
                    species: 'tree',
                    dimension: null,
                    position: null,
                    ...t,
                    // Position is hydrated through coercePosition so a
                    // corrupt entry (`{ x: NaN }` etc.) falls back to
                    // null and the view re-seeds from placementSeed.
                    // Applied after the spread so the spread can't
                    // override the coerced result.
                    ...{ position: coercePosition(t.position) },
                }))
        }
        if(snapshot.decorOffsets && typeof snapshot.decorOffsets === 'object')
        {
            const merge = (raw) =>
            {
                const out = {}
                if(!raw || typeof raw !== 'object') return out
                for(const [k, v] of Object.entries(raw))
                {
                    const idx = Number(k)
                    if(!Number.isInteger(idx) || idx < 0) continue
                    const pos = coercePosition(v)
                    if(pos) out[idx] = pos
                }
                return out
            }
            this.decorOffsets = {
                trees:     merge(snapshot.decorOffsets.trees),
                flowers:   merge(snapshot.decorOffsets.flowers),
                fruits:    merge(snapshot.decorOffsets.fruits),
                mailbox:   merge(snapshot.decorOffsets.mailbox),
                telescope: merge(snapshot.decorOffsets.telescope),
            }
        }
        // Terrain-aware snap (world-port U11, KTD-7): all three position
        // stores — sprouts[].position, bloomedTrees[].position, and the
        // decorOffsets buckets (absolute coords) — snap in place at hydrate
        // time. `position` objects are MUTATED (never replaced) so id-keyed
        // captureRefs / bloom lookups never detach; `position: null` passes
        // through (seed-derived placement stays seed-derived). No fan, no
        // _persist, no snapshot POST — snapped values persist lazily on the
        // first ordinary mutation.
        if(island) this._snapHydratedPositions(island)
        this._invalidateCache()
        // Bulk load is not a `spawned`/`grew` event. View subscribers
        // are written against post-add semantics; firing them on hydrate
        // would trigger toast/particle cascades on every reload. The
        // view reads `sprouts.recent()` directly on construction.
    }

    /** U11: snap every hydrated position store to placeable land (in place). */
    _snapHydratedPositions(island)
    {
        const env = {
            worldSize: island.worldSize,
            cols: island.spec.grid.cols,
            rows: island.spec.grid.rows,
            isValid: (x, z) => island.isPlaceable(x, z),
        }
        const occupied = occupiedCellsFromSpec(island.spec)
        const stores = []
        for(const sprout of this.sprouts) if(sprout.position) stores.push(sprout.position)
        for(const tree of this.bloomedTrees) if(tree.position) stores.push(tree.position)
        for(const bucket of Object.values(this.decorOffsets))
        {
            for(const pos of Object.values(bucket)) if(pos) stores.push(pos)
        }
        const invalid = []
        for(const pos of stores)
        {
            if(env.isValid(pos.x, pos.z)) claimCellAt(env, occupied, pos.x, pos.z)
            else invalid.push(pos)
        }
        for(const pos of invalid)
        {
            const snapped = snapPositionToLand(env, occupied, pos.x, pos.z)
            if(snapped)
            {
                // Mutate in place — identity survives for captureRefs/lookups.
                pos.x = snapped.x
                pos.z = snapped.z
            }
        }
    }

    serialize()
    {
        const cloneTree = (t) => ({
            ...t,
            captureRefs: [...t.captureRefs],
            position:    t.position ? { x: t.position.x, z: t.position.z } : null,
        })
        const cloneOffsets = (bucket) =>
        {
            const out = {}
            for(const [k, v] of Object.entries(bucket))
            {
                if(v && typeof v.x === 'number' && typeof v.z === 'number')
                {
                    out[k] = { x: v.x, z: v.z }
                }
            }
            return out
        }
        return {
            cycleIndex:    this.cycleIndex,
            sprouts:       this.sprouts.map(cloneTree),
            bloomedTrees:  this.bloomedTrees.map(cloneTree),
            decorOffsets:  {
                trees:     cloneOffsets(this.decorOffsets.trees),
                flowers:   cloneOffsets(this.decorOffsets.flowers),
                fruits:    cloneOffsets(this.decorOffsets.fruits || {}),
                mailbox:   cloneOffsets(this.decorOffsets.mailbox || {}),
                telescope: cloneOffsets(this.decorOffsets.telescope || {}),
            },
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
        // Species starts as 'pending' — the student picks a dimension
        // chip after the capture lands; setDimensionForFirstCapture
        // then locks the species (only the FIRST capture's dimension
        // counts).
        const sprout = {
            id:            uuid(),
            createdAt:     now.toISOString(),
            entryDate,
            species:       'pending',
            treeSpecies,
            placementSeed: this._nextPlacementSeed(),
            threshold:     THRESHOLD_BY_SPECIES.pending,
            count:         0,
            readyToBloom:  false,
            bloomedAt:     null,
            captureRefs:   [],
            dimension:     null,
            // No explicit student-set position at spawn — view falls
            // back to seededAngleAndRadius(placementSeed). The student
            // can later move it via setSproutPosition.
            position:      null,
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
 * Captures landed during onboarding (when `onboarding.isActive`) are
 * deliberately skipped — the ceremony owns the first capture's visual
 * (it blooms the static ceremony flower) and an extra sprout mesh
 * appearing simultaneously would crowd the moment. Normal sprout growth
 * resumes the instant onboarding reaches `done`.
 *
 * Returns an `unsubscribe()` function that detaches both subscriptions.
 *
 * @param {{ subscribe: (cb: (entry: { id: string }) => void) => () => void }} captures
 * @param {{ subscribe: (cb: (pin: { id: string }) => void) => () => void }} moodPins
 * @param {Sprouts} sprouts
 * @param {{ isActive: boolean } | null | undefined} [onboarding]
 * @returns {() => void}
 */
export function wireSproutsToCaptures(captures, moodPins, sprouts, onboarding)
{
    const skipDuringOnboarding = () => !!(onboarding && onboarding.isActive)
    const offCaptures = captures.subscribe((entry) =>
    {
        if(skipDuringOnboarding()) return
        try { sprouts.grow({ kind: 'capture', id: entry.id }) }
        catch(err) { console.warn('[sprouts] grow from capture failed', err) }
    })
    const offMoodPins = moodPins.subscribe((pin) =>
    {
        if(skipDuringOnboarding()) return
        try
        {
            const result = sprouts.grow({ kind: 'mood', id: pin.id })
            // Mood pins auto-tag as 'personality' — emotional state is
            // inherently a glimpse of how you tend to be. The chip
            // picker exists for captures (ask/photo/trajectory) where
            // the content meaning is genuinely ambiguous. Only tag if
            // this mood pin spawned a new sprout (so the species lock
            // applies); if it joined an existing sprout, the species
            // is already locked by whatever tagged the first capture.
            if(result?.didSpawn && pin?.id)
            {
                sprouts.setDimensionForFirstCapture(pin.id, 'personality')
            }
        }
        catch(err) { console.warn('[sprouts] grow from mood pin failed', err) }
    })
    return () => { offCaptures(); offMoodPins() }
}
