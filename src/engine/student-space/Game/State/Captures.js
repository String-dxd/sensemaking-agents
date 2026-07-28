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

import { sgDateKey } from '../entry-date.constants.js'
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
        // Asia/Singapore day bucketing — the read side (src/lib/entry-date.ts)
        // files entries by SGT day, so the write side must stamp the same day.
        const entryDate = sgDateKey(now)
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

    patch(id, updates)
    {
        const entry = this.findById(id)
        if(!entry) return null
        Object.assign(entry, updates)
        for(const cb of this.subscribers) cb(entry, this.entries)
        this._persist()
        return entry
    }

    // ── Persistence ────────────────────────────────────────────────────────

    hydrate(snapshot)
    {
        if(!Array.isArray(snapshot) || snapshot.length === 0) return
        this.entries = mergeArray(snapshot, mergeCapture, 'capture')

        // A persisted 'syncing' status can only mean the page went away mid
        // submit (AskSheet writes it before the network call). Nothing else
        // reconciles it, so the capture would render "Syncing…" forever with
        // Retry suppressed and the reflection silently lost. hydrate() runs once
        // at boot (State.js), before any submit in this session can be in flight,
        // so re-marking here cannot race a live request.
        for(const entry of this.entries)
        {
            if(entry.syncStatus === 'syncing' && !entry.backendMirrorEntryId)
            {
                entry.syncStatus = 'failed'
                entry.syncError  = 'Interrupted before saving'
            }
        }

        // Bulk load is not a save event — see MoodPins.hydrate for the
        // same reasoning. Subscribers read `this.entries` on demand.
    }

    /**
     * Merge backend-backed captures without persisting them as local authored
     * state. Local unsynced captures stay in place; backend rows replace the
     * previous backend snapshot by durable id.
     */
    upsertBackend(snapshot)
    {
        if(!Array.isArray(snapshot)) return
        const backendEntries = mergeArray(snapshot, mergeCapture, 'capture.backend')
        // Photos are client-side only (captured into localStorage; the
        // backend mirror row has no image column). When a backend entry
        // replaces the local capture with the same durable key, carry the
        // local photo bytes over so the reflection keeps its picture.
        const localByKey = new Map()
        for(const entry of this.entries)
        {
            const key = backendKey(entry)
            if(key) localByKey.set(key, entry)
        }
        for(const entry of backendEntries)
        {
            const key = backendKey(entry)
            const local = key ? localByKey.get(key) : null
            if(local?.dataUrl && !entry.dataUrl) entry.dataUrl = local.dataUrl
        }
        const backendKeys = new Set(
            backendEntries.map((entry) => backendKey(entry)).filter(Boolean),
        )
        const localEntries = this.entries.filter((entry) =>
        {
            const key = backendKey(entry)
            // Unsynced local capture — always survives.
            if(!key) return true
            // Cached snapshot row (`mirror:*` / `cartographer:*` id): the
            // snapshot is its source of truth. A key missing from the new
            // snapshot means the backend row was deleted or replaced (e.g.
            // a reseed minted fresh ids), so keeping the stale copy would
            // duplicate the reflection.
            if(isSnapshotSourced(entry)) return false
            // Locally-authored but synced capture: dedupe when the backend
            // row is present, keep otherwise — a snapshot fetched before
            // the sync landed must not drop the capture (and its photo).
            return !backendKeys.has(key)
        })
        this.entries = [...localEntries, ...backendEntries].sort((a, b) =>
            Date.parse(a.createdAt) - Date.parse(b.createdAt),
        )
        // Bulk backend load is not an add event; subscribers read `entries`
        // when rendering and should not receive a synthetic capture payload.
    }

    serialize() { return this.entries }

    _persist() { Persistence.getInstance()?.save('captures', this.serialize()) }
}

function isSnapshotSourced(entry)
{
    const id = typeof entry.id === 'string' ? entry.id : ''
    return id.startsWith('mirror:') || id.startsWith('cartographer:')
}

function backendKey(entry)
{
    if(entry.backendMirrorEntryId) return `mirror:${entry.backendMirrorEntryId}`
    if(entry.backendCartographerOutputId) return `cartographer:${entry.backendCartographerOutputId}`
    return null
}
