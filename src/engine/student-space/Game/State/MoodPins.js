/**
 * In-memory store of mood pins captured by the student.
 *
 * v1.1: pins persist through Persistence.js — `add`/`patch` fan out to
 * subscribers first (so the FAB tint, sky-bottom bias, and Kira observation
 * paths see the change before disk write), then trigger a debounced save.
 *
 * Each pin matches the locked MoodPin type from the spec, minus `privacy`
 * (locked to self_only in v0 — no field needed yet).
 */

import Persistence from './Persistence.js'
import { mergeArray, mergeMoodPin } from './schema.js'

let counter = 0
const uuid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`

export default class MoodPins
{
    static instance

    static getInstance() { return MoodPins.instance }

    constructor()
    {
        if(MoodPins.instance) return MoodPins.instance
        MoodPins.instance = this

        this.pins = []
        this.subscribers = new Set()
    }

    /**
     * Add a pin. `cause` and `note` are post-save patches and arrive null.
     */
    add({ emotion, intensity, cause = null, note = null })
    {
        const now = new Date()
        const entryDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const pin = {
            id: uuid(),
            createdAt: now.toISOString(),
            entryDate,
            emotion,
            intensity,
            cause,
            note,
        }
        this.pins.push(pin)
        for(const cb of this.subscribers) cb(pin, this.pins)
        this._persist()
        return pin
    }

    /** Patch an existing pin (used for post-save cause + note). */
    patch(id, updates)
    {
        const pin = this.pins.find((p) => p.id === id)
        if(!pin) return null
        Object.assign(pin, updates)
        for(const cb of this.subscribers) cb(pin, this.pins)
        this._persist()
        return pin
    }

    /** Subscribe to add/patch events. Used by Kira's sense-making later. */
    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    /** Last N pins, newest first. */
    recent(n = 7)
    {
        return this.pins.slice(-n).reverse()
    }

    // ── Persistence ────────────────────────────────────────────────────────

    hydrate(snapshot)
    {
        if(!Array.isArray(snapshot) || snapshot.length === 0) return
        this.pins = mergeArray(snapshot, mergeMoodPin, 'pin')
        // Bulk load is not a save event. Subscribers (Weather.js, CaptureFab)
        // are written against `add()` semantics and assume `pin.emotion` is
        // readable; firing them with a synthetic pin would crash, and even a
        // guarded version would trigger sky tints / particle fountains on
        // every reload. Subscribers learn about hydrated state by reading
        // `this.pins` directly when they need it.
    }

    upsertBackend(snapshot)
    {
        if(!Array.isArray(snapshot)) return
        const backendPins = mergeArray(snapshot, mergeMoodPin, 'pin.backend')
        const backendIds = new Set(backendPins.map((pin) => pin.id))
        const localPins = this.pins.filter((pin) => !backendIds.has(pin.id))
        this.pins = [...localPins, ...backendPins].sort((a, b) =>
            Date.parse(a.createdAt) - Date.parse(b.createdAt),
        )
        // Bulk backend load is not an add/patch event; subscribers read
        // `pins` on demand and should not receive a synthetic pin payload.
    }

    serialize() { return this.pins }

    _persist() { Persistence.getInstance()?.save('moodPins', this.serialize()) }
}
