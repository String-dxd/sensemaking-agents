/**
 * Inbox of letters from a form teacher. Read-only in v1.1 — letters are
 * seeded; the only mutation a student performs is `markRead`. Persists
 * through the same Persistence adapter as everything else.
 *
 * The "letter response → ask capture" path lives off this store, not in it
 * (`LettersSheet` opens an `ask` capture from a letter's `prompt`), so the
 * read-only posture here stays the same.
 */

import Persistence from './Persistence.js'
import { LETTERS_SEED } from '../Data/lettersSeed.js'
import { mergeArray, mergeTeacherLetter } from './schema.js'

export default class TeacherLetters
{
    static instance

    static getInstance() { return TeacherLetters.instance }

    constructor()
    {
        if(TeacherLetters.instance) return TeacherLetters.instance
        TeacherLetters.instance = this

        this.letters     = mergeArray(LETTERS_SEED, mergeTeacherLetter, 'letter')
        this.subscribers = new Set()
    }

    /** Mark a letter read. Idempotent — re-marking emits no event. */
    markRead(id)
    {
        const letter = this.letters.find((l) => l.id === id)
        if(!letter || letter.read) return null
        letter.read = true
        this._notify({ kind: 'read', id })
        this._persist()
        return letter
    }

    unreadCount() { return this.letters.filter((l) => !l.read).length }

    // ── Persistence ────────────────────────────────────────────────────────

    hydrate(snapshot)
    {
        if(!Array.isArray(snapshot) || snapshot.length === 0) return
        // Hydrating preserves seeded letters that aren't in the snapshot —
        // we union on id so a future seed addition doesn't disappear after
        // first persistence write.
        const persisted = mergeArray(snapshot, mergeTeacherLetter, 'letter')
        const byId = new Map(this.letters.map((l) => [l.id, l]))
        for(const l of persisted) byId.set(l.id, l)
        this.letters = Array.from(byId.values()).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        this._notify({ kind: 'hydrate' })
    }

    hydrateBackend(snapshot)
    {
        if(!Array.isArray(snapshot)) return
        // Union-merge instead of hard-replace: backend wins on shared IDs,
        // but seed-only letters (e.g. demo-content additions that the
        // backend doesn't echo) stay visible. Mirrors the seed-preservation
        // posture in hydrate() above — without this, any new seed letter
        // disappears the moment a backend snapshot arrives.
        const backend = mergeArray(snapshot, mergeTeacherLetter, 'letter.backend')
        const byId = new Map(this.letters.map((l) => [l.id, l]))
        for(const l of backend) byId.set(l.id, l)
        this.letters = Array.from(byId.values()).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        this._notify({ kind: 'backend-hydrate' })
    }

    serialize() { return this.letters }

    _persist() { Persistence.getInstance()?.save('letters', this.serialize()) }

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    _notify(event)
    {
        for(const cb of this.subscribers) cb(event, this.letters)
    }
}
