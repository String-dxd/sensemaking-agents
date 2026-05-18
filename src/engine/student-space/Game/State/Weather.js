import State from './State.js'
import Debug from '../Debug/Debug.js'

/**
 * Weather state — just rain intensity for v1.0. `rain` is the current
 * rendered weight (0 = clear, 1 = downpour) and `rainTarget` is the value
 * it eases toward, so transitions to/from rain are gradual rather than
 * snap-on. Future weather dimensions (wind, fog, rainbow) hang off the
 * same class.
 *
 * v1.1: ports the v0.3 rain overlay's external surface — `start()`,
 * `stop()`, `setIntensity()`, debug-GUI slider — but the actual streak +
 * glass distortion lives in `view/Rain.js` (see for shader details).
 *
 * v1.2: ambient scheduler. The world should rain on its own; the student
 * shouldn't have to find the dev GUI. A simple state machine cycles
 * between clear stretches and rain stretches, with randomised durations
 * and intensities so the sky doesn't feel scripted. A mood-pin subscriber
 * gently bumps the rain target when the student logs an inward-coded
 * emotion (anxiety / sadness / ennui) — the world matching tone, per
 * DESIGN.md's "world reacts" rule.
 */
const EASE_TAU = 1.4   // seconds for ~63% of the way to the target

// Ambient cycle (seconds). The first arrival window is deliberately short
// so the student sees rain within the first couple of minutes — proves the
// weather is alive, then the cycle relaxes into longer clear stretches.
const FIRST_CLEAR_MIN   = 5
const FIRST_CLEAR_MAX   = 12
const RAIN_DURATION_MIN = 60
const RAIN_DURATION_MAX = 150
const CLEAR_MIN         = 240
const CLEAR_MAX         = 540
const RAIN_INTENSITY_MIN = 0.35
const RAIN_INTENSITY_MAX = 0.85

const INWARD_EMOTIONS = new Set(['anxiety', 'sadness', 'ennui'])

const randRange = (a, b) => a + Math.random() * (b - a)

export default class Weather
{
    constructor()
    {
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.rain = 0
        this.rainTarget = 0

        // Ambient scheduler. `phase` ∈ 'clear' | 'rain'. `phaseEndsAt` is in
        // seconds on the state.time.elapsed clock — switching phases just
        // means rolling new target + duration.
        this.phase = 'clear'
        this.phaseEndsAt = randRange(FIRST_CLEAR_MIN, FIRST_CLEAR_MAX)
        this.ambient = true     // killswitch — debug GUI can disable

        // Mood-pin nudge: inward emotion (anxiety/sadness/ennui) pushes the
        // sky toward rain by ~+0.18 for the rest of the current phase.
        this.state.moodPins.subscribe((pin) =>
        {
            if(!INWARD_EMOTIONS.has(pin.emotion)) return
            if(this.phase === 'clear')
            {
                // Cut the dry stretch short and start a moderate shower.
                this.phase = 'rain'
                this.rainTarget = Math.min(1, Math.max(this.rainTarget, 0.55))
                this.phaseEndsAt = this.state.time.elapsed + randRange(RAIN_DURATION_MIN, RAIN_DURATION_MAX)
            }
            else
            {
                // Already raining — deepen the current shower without
                // resetting its remaining time.
                this.rainTarget = Math.min(1, this.rainTarget + 0.18)
            }
        })

        this.setDebug()
    }

    update()
    {
        const dt = this.state.time.delta
        const k = 1 - Math.exp(-dt / EASE_TAU)
        this.rain += (this.rainTarget - this.rain) * k

        if(!this.ambient) return
        if(this.state.time.elapsed < this.phaseEndsAt) return
        this._nextPhase()
    }

    _nextPhase()
    {
        if(this.phase === 'clear')
        {
            this.phase = 'rain'
            this.rainTarget = randRange(RAIN_INTENSITY_MIN, RAIN_INTENSITY_MAX)
            this.phaseEndsAt = this.state.time.elapsed + randRange(RAIN_DURATION_MIN, RAIN_DURATION_MAX)
        }
        else
        {
            this.phase = 'clear'
            this.rainTarget = 0
            this.phaseEndsAt = this.state.time.elapsed + randRange(CLEAR_MIN, CLEAR_MAX)
        }
    }

    /** Snap target to value; call from UI / debug / future mood hooks. */
    setIntensity(v)
    {
        this.rainTarget = Math.max(0, Math.min(1, v))
    }

    /**
     * Enable / disable the ambient rain scheduler. Onboarding parks the
     * world in clear weather while the ceremony plays, then re-enables on
     * complete. Disabling does not snap rain to 0 on its own — callers pair
     * it with setIntensity(0) if they want the sky to clear immediately.
     */
    setAmbient(active)
    {
        this.ambient = !!active
        if(!this.ambient)
        {
            // Push phase clock far out so the next phase swap can't fire while
            // ambient is off (defence-in-depth — update() already gates).
            this.phaseEndsAt = this.state.time.elapsed + 1e6
        }
        else
        {
            this.phase = 'clear'
            this.phaseEndsAt = this.state.time.elapsed + randRange(CLEAR_MIN, CLEAR_MAX)
        }
    }

    /**
     * Manual on/off — keeps `phase` consistent with `rainTarget` and pushes
     * the scheduler's next-phase clock out so it doesn't immediately reverse
     * the student's choice. Without the phase sync the HUD switch would
     * appear stuck (HourHud reads phase + target to decide "is rain on?").
     */
    start(intensity = 0.6)
    {
        this.setIntensity(intensity)
        this.phase = 'rain'
        const now = this.state.time.elapsed
        this.phaseEndsAt = Math.max(this.phaseEndsAt, now + randRange(RAIN_DURATION_MIN, RAIN_DURATION_MAX))
    }
    stop()
    {
        this.setIntensity(0)
        this.phase = 'clear'
        const now = this.state.time.elapsed
        this.phaseEndsAt = Math.max(this.phaseEndsAt, now + randRange(CLEAR_MIN, CLEAR_MAX))
    }

    setDebug()
    {
        if(!this.debug.active) return

        const folder = this.debug.ui.getFolder('state/weather')
        folder.add(this, 'rain').min(0).max(1).step(0.01).listen()
        folder.add(this, 'rainTarget').min(0).max(1).step(0.01).name('rain target')
        folder.add(this, 'ambient').name('ambient cycle')
        folder.add(this, 'phase').listen()
        folder.add({ start: () => this.start(0.6) }, 'start').name('rain start')
        folder.add({ stop: () => this.stop() }, 'stop').name('rain stop')
    }
}
