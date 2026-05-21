/**
 * Thin list of seeded calendar events. v1.1 reads only — no add/remove path.
 * v1.2 will hydrate from a school timetable feed and add per-day captures.
 */

import Persistence from './Persistence.js'
import { CALENDAR_SEED } from '../Data/calendarSeed.js'
import { mergeArray, mergeCalendarEvent } from './schema.js'

export default class CalendarEvents
{
    static instance

    static getInstance() { return CalendarEvents.instance }

    constructor()
    {
        if(CalendarEvents.instance) return CalendarEvents.instance
        CalendarEvents.instance = this

        this.events      = mergeArray(CALENDAR_SEED, mergeCalendarEvent, 'event')
        this.subscribers = new Set()
    }

    /** Return all events for a given YYYY-MM-DD. */
    forDate(date) { return this.events.filter((e) => e.date === date) }

    /** Return events whose dates fall in [startYMD, endYMD] inclusive. */
    inRange(startYMD, endYMD)
    {
        return this.events.filter((e) => e.date >= startYMD && e.date <= endYMD)
    }

    hydrate(snapshot)
    {
        if(!Array.isArray(snapshot) || snapshot.length === 0) return
        const persisted = mergeArray(snapshot, mergeCalendarEvent, 'event')
        const byId = new Map(this.events.map((e) => [e.id, e]))
        for(const e of persisted) byId.set(e.id, e)
        this.events = Array.from(byId.values())
        this._notify({ kind: 'hydrate' })
    }

    hydrateBackend(snapshot)
    {
        if(!Array.isArray(snapshot)) return
        this.events = mergeArray(snapshot, mergeCalendarEvent, 'event.backend')
        this._notify({ kind: 'backend-hydrate' })
    }

    serialize() { return this.events }

    _persist() { Persistence.getInstance()?.save('calendar', this.serialize()) }

    subscribe(cb)
    {
        this.subscribers.add(cb)
        return () => this.subscribers.delete(cb)
    }

    _notify(event)
    {
        for(const cb of this.subscribers) cb(event, this.events)
    }
}
