import Time from './Time.js'
import Viewport from './Viewport.js'
import DayCycle from './DayCycle.js'
import ColdStart from './ColdStart.js'
import Sun from './Sun.js'
import Island from './Island.js'
import MoodPins from './MoodPins.js'
import Captures from './Captures.js'
import Profile from './Profile.js'
import TeacherLetters from './TeacherLetters.js'
import CalendarEvents from './CalendarEvents.js'
import Persistence from './Persistence.js'
import Weather from './Weather.js'
import Wind from './Wind.js'
import Onboarding from './Onboarding.js'
import Sprouts, { wireSproutsToCaptures } from './Sprouts.js'
import Relationships from './Relationships.js'
import Choices from './Choices.js'
import IslandSnapshotBridge from './IslandSnapshotBridge.js'

export default class State
{
    static instance

    static getInstance()
    {
        return State.instance
    }

    /**
     * @param {{
     *   persistence?: { storage?: import('./Persistence.js').StorageAdapter },
     *   backend?: import('../../../lib/student-space/backend-bridge.ts').StudentSpaceBackendBridge,
     * }} [opts]
     */
    constructor(opts = {})
    {
        if(State.instance)
            return State.instance

        State.instance = this
        this.backend = opts.backend || null
        this.backendActive = false

        // Persistence is the very first state thing constructed — every
        // persistent module reads `Persistence.getInstance()` inside its
        // own _persist(), so the singleton must exist by then. The host
        // can pass a custom `storage` adapter to swap localStorage for
        // a backend-backed store.
        this.persistence = new Persistence(opts.persistence || {})

        this.time = new Time()
        this.viewport = new Viewport()
        this.day = new DayCycle()
        // Onboarding must construct + hydrate before ColdStart so ColdStart's
        // constructor can read `state.onboarding.stage` to decide whether to
        // arm the twilight pin (the ceremony owns the sky while it's active).
        this.onboarding = new Onboarding()
        this.onboarding.hydrate(this.persistence.load().onboarding)
        this.coldStart = new ColdStart()
        this.sun = new Sun()
        this.island = new Island()
        this.moodPins = new MoodPins()
        this.captures = new Captures()
        this.profile  = new Profile()
        this.letters  = new TeacherLetters()
        this.calendar = new CalendarEvents()
        this.sprouts  = new Sprouts()
        this.relationships = new Relationships()
        this.choices       = new Choices()
        this.weather = new Weather()
        this.wind = new Wind()

        // Hydrate from disk. Each module's hydrate() is lenient (never
        // throws). Order doesn't matter — modules are independent and
        // subscribers haven't been wired by View yet at this point.
        // Onboarding was already hydrated above before ColdStart was built.
        const snapshot = this.persistence.load()
        this.moodPins.hydrate(snapshot.moodPins)
        this.captures.hydrate(snapshot.captures)
        this.profile.hydrate(snapshot.profile)
        this.letters.hydrate(snapshot.letters)
        this.calendar.hydrate(snapshot.calendar)
        this.sprouts.hydrate(snapshot.sprouts)
        this.relationships.hydrate(snapshot.relationships)
        this.choices.hydrate(snapshot.choices)

        // Cross-slice wiring — Sprouts subscribes to Captures and MoodPins so
        // every new capture/mood grows the active sprout. The helper wraps
        // each subscriber in try/catch so a buggy Sprouts.grow cannot abort
        // host-slice fan-out or skip its debounced _persist. See
        // wireSproutsToCaptures in ./Sprouts.js for the boundary rationale.
        this._unwireSprouts = wireSproutsToCaptures(this.captures, this.moodPins, this.sprouts)

        // Island snapshot bridge — POSTs the Sprouts payload to the server on
        // 'bloomed' / 'decorMoved' so the year-over-year growth timelapse has
        // server-authoritative history to reconstruct from. WorkOS-only at the
        // server layer; demo / dev-bypass sessions silently receive 403 and
        // the bridge swallows it. Boot-trigger throttle (1/hour) lives in the
        // bridge itself; Game.js calls captureNow('boot') after construction.
        this.islandSnapshots = new IslandSnapshotBridge()
        this.islandSnapshots.attach(this.sprouts)

        // Player shim — Bruno's Sky/Grass/etc read `state.player.position.current`
        // to centre their world around the moving player. We don't have a player,
        // so we expose a static origin so those modules keep working untouched.
        this.player = {
            position: { current: [0, 0, 0] }
        }
    }

    resize()
    {
        this.viewport.resize()
    }

    applyBackendSnapshot(snapshot)
    {
        if(!snapshot || typeof snapshot !== 'object') return
        this.backendActive = true
        if(snapshot.profile) this.profile?.hydrateBackend?.(snapshot.profile)
        const captures = snapshot.trajectory
            ? [...(snapshot.reflections || []), snapshot.trajectory]
            : (snapshot.reflections || [])
        this.captures?.upsertBackend?.(captures)
        this.moodPins?.upsertBackend?.(snapshot.recentMoods || [])
        this.calendar?.hydrateBackend?.(snapshot.calendarEvents || [])
        this.letters?.hydrateBackend?.(snapshot.teacherLetters || [])
    }

    update()
    {
        this.time.update()
        // ColdStart writes manualHour BEFORE DayCycle.update() reads it, so
        // the very first frame already paints twilight on first arrival.
        this.coldStart.update()
        this.day.update()
        this.sun.update()
        this.weather.update()
        this.wind.update()
    }
}
