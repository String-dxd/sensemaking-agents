/**
 * Multimodal capture store — sibling to MoodPins. Holds the two non-mood
 * capture kinds the spec calls for:
 *
 *   - { kind: 'ask',   text, prompt? }      — open-ended chat/voice entry
 *   - { kind: 'photo', dataUrl, caption? }  — camera snapshot + caption
 *
 * v1.1: photos are downscaled at `add()` time to ≤640px JPEG q=0.7 so a
 * handful of captures don't blow the localStorage 5MB quota. View code
 * reads photo bytes through `getPhoto(id)` rather than touching `dataUrl`
 * directly — when v1.2 swaps the photo store to IndexedDB the call sites
 * stay unchanged.
 */

import Persistence from './Persistence.js'
import { mergeArray, mergeCapture } from './schema.js'

let counter = 0
const uuid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`

const PHOTO_MAX_EDGE = 640
const PHOTO_QUALITY  = 0.7

/**
 * Downscale a base64 dataUrl to at most PHOTO_MAX_EDGE × PHOTO_MAX_EDGE,
 * re-encoded as JPEG. Returns a promise of the new dataUrl. If anything
 * goes wrong (decode fails, OffscreenCanvas unsupported, MIME unrecognised),
 * resolves with the original dataUrl untouched — never throws.
 */
function downscalePhoto(dataUrl)
{
    return new Promise((resolve) =>
    {
        if(typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image'))
        {
            resolve(dataUrl); return
        }
        try
        {
            const img = new Image()
            img.onload = () =>
            {
                const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height))
                const w = Math.round(img.width  * scale)
                const h = Math.round(img.height * scale)
                const c = document.createElement('canvas')
                c.width = w; c.height = h
                const ctx = c.getContext('2d')
                if(!ctx) { resolve(dataUrl); return }
                ctx.drawImage(img, 0, 0, w, h)
                try { resolve(c.toDataURL('image/jpeg', PHOTO_QUALITY)) }
                catch(_) { resolve(dataUrl) }
            }
            img.onerror = () => resolve(dataUrl)
            img.src = dataUrl
        }
        catch(_) { resolve(dataUrl) }
    })
}

export default class Captures
{
    static instance

    static getInstance() { return Captures.instance }

    constructor()
    {
        if(Captures.instance) return Captures.instance
        Captures.instance = this

        this.entries = []
        this.subscribers = new Set()
    }

    /**
     * Add an entry. For photos, the dataUrl is downscaled asynchronously
     * before persistence — but the entry is pushed immediately with the
     * raw dataUrl so the UI never sees an empty placeholder. The downscaled
     * value replaces the raw one in-place once the encode completes.
     */
    add(payload)
    {
        const now = new Date()
        const entryDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const entry = {
            id: uuid(),
            createdAt: now.toISOString(),
            entryDate,
            ...payload,
        }
        this.entries.push(entry)
        for(const cb of this.subscribers) cb(entry, this.entries)

        if(entry.kind === 'photo' && entry.dataUrl)
        {
            downscalePhoto(entry.dataUrl).then((smaller) =>
            {
                entry.dataUrl = smaller
                this._persist()
            })
        }
        else
        {
            this._persist()
        }
        return entry
    }

    /**
     * Patch an existing capture entry (used for post-save dimension
     * tagging by the chip picker). Mirrors MoodPins.patch — fans to
     * subscribers AFTER mutation, then persists. Subscribers must
     * dedupe by capture id if they only care about add events
     * (see Sprouts.grow's dedupe).
     */
    patch(id, updates)
    {
        const entry = this.entries.find((c) => c.id === id)
        if(!entry) return null
        Object.assign(entry, updates)
        for(const cb of this.subscribers) cb(entry, this.entries)
        this._persist()
        return entry
    }

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    recent(n = 7)
    {
        return this.entries.slice(-n).reverse()
    }

    /**
     * Funnelled photo read. Returns the dataUrl string, or null if the id
     * doesn't match a photo capture. When v1.2 moves photos to IndexedDB,
     * this becomes async without breaking call sites (treat return as
     * `Promise<string|null>` going forward).
     */
    getPhoto(id)
    {
        const entry = this.entries.find((c) => c.id === id)
        if(!entry || entry.kind !== 'photo') return null
        return entry.dataUrl ?? null
    }

    findById(id) { return this.entries.find((c) => c.id === id) ?? null }

    // ── Persistence ────────────────────────────────────────────────────────

    hydrate(snapshot)
    {
        if(!Array.isArray(snapshot) || snapshot.length === 0) return
        this.entries = mergeArray(snapshot, mergeCapture, 'capture')
        // Bulk load is not a save event — see MoodPins.hydrate for the
        // same reasoning. Subscribers read `this.entries` on demand.
    }

    serialize() { return this.entries }

    _persist() { Persistence.getInstance()?.save('captures', this.serialize()) }
}
