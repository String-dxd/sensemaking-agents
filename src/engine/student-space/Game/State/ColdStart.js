import State from './State.js'
import Debug from '../Debug/Debug.js'

/**
 * Cold-start twilight sequence.
 *
 * DESIGN.md: "For first-session arrival the sky transition is allowed to span
 * up to 90 minutes of in-app time rather than the standard 1800ms ease, so
 * the moment of arriving at the (still-barren) island has space to breathe
 * before any reflection happens." The signature hero keyframe is h=18.5 —
 * Aurora.js already auto-engages its ribbon inside [18.0, 19.5], so all this
 * module has to do is pin DayCycle's `manualHour` to 18.5 on first visit,
 * dwell for a real-time window, then ease back to wall-clock.
 *
 * Persistence: a localStorage flag (`studentSpace.firstArrivalSeen`) gets
 * set after `SEEN_DWELL_MS` so that page refreshes during the very first
 * second don't accidentally consume the cold start. After the flag is set,
 * subsequent sessions skip the pin entirely and the clock follows real time.
 *
 * Debug: the GUI exposes a "replay ceremony" button that clears the flag
 * and rearms the pin — so a smoke test doesn't require manually wiping
 * localStorage to re-experience the arrival beat.
 */
const STORAGE_KEY     = 'studentSpace.firstArrivalSeen'
const PIN_HOUR        = 18.5
const DWELL_MS        = 60_000   // hold at twilight for ~60s of real time
const SEEN_DWELL_MS   = 10_000   // mark the cold start as "seen" after 10s
const FADE_MS         = 6_000    // ease back to wall-clock over 6s

const lerp = (a, b, t) => a + (b - a) * t

// Pick the shorter angular path around the 24h clock so the ease never
// drifts the long way (e.g. 18.5 → 14.0 should go backward through 17/16/15
// rather than forward through night-noon-afternoon).
function shortestHour(from, to)
{
    const diff = ((to - from + 36) % 24) - 12
    return from + diff
}

function readRealHour()
{
    const d = new Date()
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

export default class ColdStart
{
    constructor()
    {
        this.state = State.getInstance()
        this.day   = this.state.day

        this.bootedAt   = performance.now()
        this.fadeStart  = null
        this.fadeFromH  = PIN_HOUR
        this.fadeToH    = null
        this.seenFlagWritten = false

        // Visible to the rest of the app via `state.coldStart.active`. Other
        // systems (HourHud, future MoodSheet) can read this to suppress UI
        // affordances while the arrival ceremony is on screen.
        this.active = false

        let seen = false
        try { seen = localStorage.getItem(STORAGE_KEY) === '1' }
        catch(_) { /* localStorage unavailable — skip pin */ }

        // First-run ceremony supersedes the legacy twilight pin. While the
        // onboarding flow is in flight (stage !== 'done'), the orchestrator
        // controls the sky via `state.day.setManualHour` directly. Once the
        // ceremony marks stage='done', it writes the legacy "seen" flag so
        // future sessions land at wall-clock. See DESIGN.md §"First-run
        // ceremony" for the carve-out.
        const onboardingDone = this.state.onboarding && this.state.onboarding.stage === 'done'

        if(!seen && onboardingDone)
        {
            this.active = true
            this.day.setManualHour(PIN_HOUR)
        }
        else
        {
            this.seenFlagWritten = true
        }

        this.setDebug()
    }

    /**
     * Replay the cold-start ceremony. Clears the localStorage flag, rearms
     * the pin, and resets the boot timer so the full 60s dwell + 6s fade
     * plays out from now. Safe to call multiple times. Debug-only entry.
     */
    replay()
    {
        try { localStorage.removeItem(STORAGE_KEY) } catch(_) {}
        this.bootedAt        = performance.now()
        this.fadeStart       = null
        this.fadeFromH       = PIN_HOUR
        this.fadeToH         = null
        this.seenFlagWritten = false
        this.active          = true
        this.day.setManualHour(PIN_HOUR)
    }

    setDebug()
    {
        const debug = Debug.getInstance()
        if(!debug.active) return

        const folder = debug.ui.getFolder('state/coldStart')
        folder.add(this, 'active').listen()
        folder.add({ replay: () => this.replay() }, 'replay').name('replay ceremony')
    }

    update()
    {
        if(!this.active && this.fadeStart === null) return

        const now = performance.now()

        // Mark as "seen" once the student has actually dwelled in twilight.
        // This guards against a refresh in the first second wiping out the
        // sequence — and conversely guarantees that after 10s, a refresh
        // delivers a normal wall-clock landing.
        if(this.active && !this.seenFlagWritten && now - this.bootedAt > SEEN_DWELL_MS)
        {
            try { localStorage.setItem(STORAGE_KEY, '1') } catch(_) {}
            this.seenFlagWritten = true
        }

        // External hour scrub (HourHud / debug GUI) — abort cold start.
        if(this.active && this.day.manualHour !== PIN_HOUR && this.day.manualHour !== null)
        {
            this.active = false
            return
        }

        // Reached the dwell threshold → begin easing back to wall-clock.
        if(this.active && now - this.bootedAt > DWELL_MS)
        {
            this.active = false
            this.fadeStart  = now
            this.fadeFromH  = PIN_HOUR
            this.fadeToH    = shortestHour(PIN_HOUR, readRealHour())
        }

        // Ease in progress.
        if(this.fadeStart !== null)
        {
            const t = Math.min(1, (now - this.fadeStart) / FADE_MS)
            // smootherstep for an unhurried sky drift.
            const eased = t * t * t * (t * (t * 6 - 15) + 10)
            const h = lerp(this.fadeFromH, this.fadeToH, eased)
            // Wrap into [0, 24).
            this.day.setManualHour(((h % 24) + 24) % 24)
            if(t >= 1)
            {
                this.fadeStart = null
                this.day.clearManualHour()
            }
        }
    }
}
