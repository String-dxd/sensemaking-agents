/**
 * Persistence orchestrator for v1.1. Owns the namespaced-key layout,
 * the schema-version guard, the per-slice debounce, and the
 * beforeunload/pagehide flush.
 *
 * The actual byte-level read/write is delegated to a `storage` adapter
 * — a minimal subset of the Web Storage API (`getItem` / `setItem` /
 * `removeItem`). The default adapter wraps `window.localStorage`; the
 * React/TanStack Start host can swap in a backend-backed adapter (idb,
 * fetch, etc.) without touching this file.
 *
 * Lenient: never throws, never crashes the boot. If the adapter probe
 * fails, every method silently no-ops.
 *
 *   - `load()` is called once by State.js. Returns the raw parsed slices.
 *     Each consumer pipes its slice through the matching `merge*()` helper
 *     in schema.js — Persistence itself does not know shapes.
 *   - `save(slice, value)` is debounced ~250ms per slice, batched per key.
 *   - `flush()` synchronously drains pending timers (called by the
 *     `beforeunload` listener so the last forget/markRead survives a tab close).
 *   - `clear()` wipes every namespaced key (used by ?debug=1 "Clear all").
 *
 * @typedef {object} StorageAdapter
 * @property {(key: string) => (string | null)} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

import { SCHEMA_VERSION } from './schema.js'
import Debug from '../Debug/Debug.js'

const NS = 'ss:v1'
const KEY = {
    version:    `${NS}:_v`,
    moodPins:   `${NS}:moodPins`,
    captures:   `${NS}:captures`,
    profile:    `${NS}:profile`,
    letters:    `${NS}:letters`,
    calendar:   `${NS}:calendar`,
    onboarding: `${NS}:onboarding`,
}

const SLICES = ['moodPins', 'captures', 'profile', 'letters', 'calendar', 'onboarding']
const DEBOUNCE_MS = 250

/**
 * Default storage adapter — wraps window.localStorage. Returns a
 * no-op adapter when localStorage is unavailable (Safari private,
 * embedded iframes, SSR) so callers never have to null-check.
 */
export function localStorageAdapter()
{
    if(typeof window === 'undefined' || !window.localStorage) return memoryAdapter()
    try
    {
        const k = `${NS}:__probe`
        window.localStorage.setItem(k, '1')
        window.localStorage.removeItem(k)
    }
    catch(_)
    {
        return memoryAdapter()
    }
    return {
        getItem:    (k) => window.localStorage.getItem(k),
        setItem:    (k, v) => window.localStorage.setItem(k, v),
        removeItem: (k) => window.localStorage.removeItem(k),
    }
}

/**
 * In-memory storage adapter. Used as the fallback when localStorage is
 * blocked, and as a clean default for SSR / unit tests / agent harnesses.
 * Data is lost on page reload.
 */
export function memoryAdapter()
{
    const map = new Map()
    return {
        getItem:    (k) => (map.has(k) ? map.get(k) : null),
        setItem:    (k, v) => { map.set(k, String(v)) },
        removeItem: (k) => { map.delete(k) },
    }
}

export default class Persistence
{
    static instance

    static getInstance() { return Persistence.instance }

    /**
     * @param {{ storage?: StorageAdapter }} [opts]
     */
    constructor(opts = {})
    {
        if(Persistence.instance) return Persistence.instance
        Persistence.instance = this

        this._storage = opts.storage || localStorageAdapter()
        this._timers  = new Map()    // slice → setTimeout id
        this._pending = new Map()    // slice → latest serialized value
        this._available = this._probe()

        // Drain pending writes on tab close. Synchronous so the last forget()
        // or markRead() doesn't get lost in the 250ms debounce window. Tracked
        // so `dispose()` can remove them.
        this._onBeforeUnload = () => this.flush()
        if(typeof window !== 'undefined')
        {
            window.addEventListener('beforeunload', this._onBeforeUnload)
            // pagehide fires more reliably on mobile Safari tab-switch.
            window.addEventListener('pagehide',     this._onBeforeUnload)
        }

        this.setDebug()
    }

    /**
     * #debug studio folder. Three controls:
     *   - Export JSON: download a snapshot of every persistent slice.
     *   - Import JSON: file picker → hydrate every module → re-persist.
     *   - Clear all  : wipe namespaced keys and reload the page.
     *
     * Per-device export is the v1.1 escape hatch for cross-device sync.
     */
    setDebug()
    {
        const debug = Debug.getInstance()
        if(!debug || !debug.active) return

        const folder = debug.ui.getFolder('state/persistence')

        const actions = {
            export: () => this._exportJson(),
            import: () => this._importJson(),
            clear:  () =>
            {
                if(!confirm('Wipe all v1.1 persistence keys and reload?')) return
                this.clear()
                location.reload()
            },
        }
        folder.add(actions, 'export').name('export json')
        folder.add(actions, 'import').name('import json')
        folder.add(actions, 'clear').name('clear all')
    }

    _exportJson()
    {
        const snapshot = this.load()
        const blob = new Blob([JSON.stringify({ _v: SCHEMA_VERSION, ...snapshot }, null, 2)], { type: 'application/json' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        a.href     = url
        a.download = `student-space-v1-${stamp}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }

    _importJson()
    {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json'
        input.addEventListener('change', () =>
        {
            const file = input.files?.[0]
            if(!file) return
            const reader = new FileReader()
            reader.onload = () =>
            {
                try
                {
                    const parsed = JSON.parse(reader.result)
                    // Reject snapshots written by a newer schema — same guard
                    // as load() at line ~228, applied at the import boundary
                    // so a cross-device JSON can't slip past versioning.
                    const fileV = Number(parsed?._v) || 0
                    if(fileV > SCHEMA_VERSION)
                    {
                        alert(`Import failed: file schema v${fileV} > engine v${SCHEMA_VERSION}. Upgrade the engine before importing.`)
                        return
                    }
                    // Write each slice as-is; each module re-merges via its
                    // own hydrate() on next reload. Skip the version key.
                    for(const slice of SLICES)
                    {
                        if(slice in parsed && parsed[slice] != null)
                        {
                            this._storage.setItem(KEY[slice], JSON.stringify(parsed[slice]))
                        }
                    }
                    this._storage.setItem(KEY.version, String(SCHEMA_VERSION))
                    if(confirm('Import complete. Reload now?')) location.reload()
                }
                catch(e)
                {
                    alert(`Import failed: ${e.message}`)
                }
            }
            reader.readAsText(file)
        })
        input.click()
    }

    /** Detect whether the configured adapter is actually usable. Cached. */
    _probe()
    {
        try
        {
            const k = `${NS}:__probe`
            this._storage.setItem(k, '1')
            this._storage.removeItem(k)
            return true
        }
        catch(_) { return false }
    }

    /**
     * Load every slice as raw JSON-parsed values. Caller is responsible for
     * piping each through the corresponding merge*() in schema.js.
     * Returns { moodPins: [], captures: [], profile: null, letters: [], calendar: [] }.
     */
    load()
    {
        const empty = { moodPins: [], captures: [], profile: null, letters: [], calendar: [], onboarding: null }
        if(!this._available) return empty

        let storedV = 0
        try { storedV = parseInt(this._storage.getItem(KEY.version) || '0', 10) || 0 }
        catch(_) { return empty }

        if(storedV > SCHEMA_VERSION)
        {
            console.warn('[persist] storage holds a newer schema; ignoring saved state to avoid corruption.')
            return empty
        }
        // (future) if(storedV > 0 && storedV < SCHEMA_VERSION) runMigrations(storedV)

        const out = { ...empty }
        for(const slice of SLICES)
        {
            try
            {
                const raw = this._storage.getItem(KEY[slice])
                if(raw == null) continue
                out[slice] = JSON.parse(raw)
            }
            catch(e)
            {
                console.warn(`[persist] corrupt slice "${slice}", defaulting.`, e)
            }
        }
        return out
    }

    /**
     * Debounced save. Multiple `save('profile', …)` within 250ms collapse to
     * the last value written. Each call updates the schema version so
     * partial corruption (one slice present, another stale) still records
     * the intended SCHEMA_VERSION on the latest write.
     */
    save(slice, value)
    {
        if(!this._available) return
        if(!Object.prototype.hasOwnProperty.call(KEY, slice)) return
        this._pending.set(slice, value)

        clearTimeout(this._timers.get(slice))
        this._timers.set(slice, setTimeout(() => this._flushSlice(slice), DEBOUNCE_MS))
    }

    _flushSlice(slice)
    {
        if(!this._pending.has(slice)) return
        const value = this._pending.get(slice)
        this._pending.delete(slice)
        this._timers.delete(slice)
        try
        {
            const r1 = this._storage.setItem(KEY[slice], JSON.stringify(value))
            const r2 = this._storage.setItem(KEY.version, String(SCHEMA_VERSION))
            // If a backend-backed adapter returns a Promise from setItem, attach
            // a .catch so async rejections don't bubble up as unhandled rejections.
            // The contract (StorageAdapter) is sync, but real adapters bend it.
            if(r1 && typeof r1.then === 'function')
                r1.catch((e) => console.warn(`[persist] async save failed for "${slice}".`, e))
            if(r2 && typeof r2.then === 'function')
                r2.catch((e) => console.warn(`[persist] async save failed for version.`, e))
        }
        catch(e)
        {
            console.warn(`[persist] save failed for "${slice}".`, e)
            // Quota errors mean the store is full — flip _available off so
            // subsequent debounced saves don't keep retrying into a guaranteed
            // failure. Page reload re-probes from scratch.
            if(e && (e.name === 'QuotaExceededError' || e.code === 22))
                this._available = false
        }
    }

    /** Synchronously write every pending slice. Safe to call any time. */
    flush()
    {
        for(const slice of Array.from(this._pending.keys()))
        {
            clearTimeout(this._timers.get(slice))
            this._flushSlice(slice)
        }
    }

    /** Wipe every namespaced key. Used by ?debug=1 "Clear all". */
    clear()
    {
        if(!this._available) return
        try { for(const k of Object.values(KEY)) this._storage.removeItem(k) }
        catch(_) {}
        this._timers.clear()
        this._pending.clear()
    }

    /**
     * Tear down — remove window listeners, drain pending writes, and
     * clear the singleton so a subsequent `new Persistence()` builds a
     * fresh instance. Required for React StrictMode / HMR / clean
     * unmount paths.
     *
     * Listeners are removed BEFORE flush() so a thrown flush (quota,
     * adapter rejection) can't leave the page-level listener pointing
     * at this disposed instance. Pending writes are accepted as lost
     * in that failure mode — the listener leak under StrictMode is the
     * worse outcome.
     */
    dispose()
    {
        if(typeof window !== 'undefined' && this._onBeforeUnload)
        {
            window.removeEventListener('beforeunload', this._onBeforeUnload)
            window.removeEventListener('pagehide',     this._onBeforeUnload)
        }
        this._onBeforeUnload = null

        try { this.flush() } catch(_) {}

        // Defensive: even if flush() drained _pending, the _timers map
        // could theoretically still hold ids if a future code path adds
        // a timer without a corresponding pending entry. Clear both.
        for(const id of this._timers.values()) clearTimeout(id)
        this._timers.clear()
        this._pending.clear()

        Persistence.instance = null
    }
}
