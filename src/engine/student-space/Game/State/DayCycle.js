import Game from '../Game.js'
import State from './State.js'
import Debug from '../Debug/Debug.js'

// Tinyskies-inspired day/night palette. Hours interpolate linearly between
// adjacent keys. Each key holds sky gradient stops, sun/ambient/hemi
// intensities + colours, and a seaShift used by future water/grass tints.
const DAY_KEYS = [
    { h: 0,    skyTop:[14,8,46],    skyBottom:[112,56,206], sunInt:0.0,  sunColor:[126,90,198],  ambInt:0.22, ambColor:[156,128,206],hemiInt:0.44, hemiTop:[78,56,156],  hemiBot:[28,20,58],   seaShift:-0.55 },
    { h: 5,    skyTop:[34,18,70],   skyBottom:[224,120,72], sunInt:0.35, sunColor:[255,170,96],  ambInt:0.28, ambColor:[255,206,168],hemiInt:0.52, hemiTop:[210,128,116],hemiBot:[88,62,52],   seaShift:-0.30 },
    { h: 6.5,  skyTop:[44,108,156], skyBottom:[248,224,176],sunInt:0.62, sunColor:[255,218,178], ambInt:0.36, ambColor:[252,232,210],hemiInt:0.72, hemiTop:[148,210,224],hemiBot:[112,176,80],  seaShift:0.0 },
    { h: 9,    skyTop:[58,128,176], skyBottom:[252,228,184],sunInt:0.70, sunColor:[255,220,180], ambInt:0.42, ambColor:[252,232,210],hemiInt:0.76, hemiTop:[156,214,228],hemiBot:[112,176,80],  seaShift:0.08 },
    { h: 12,   skyTop:[62,134,182], skyBottom:[255,228,170],sunInt:0.78, sunColor:[255,222,184], ambInt:0.46, ambColor:[252,232,210],hemiInt:0.80, hemiTop:[156,214,228],hemiBot:[112,176,80],  seaShift:0.1  },
    { h: 15,   skyTop:[58,142,186], skyBottom:[232,232,200],sunInt:0.72, sunColor:[255,218,178], ambInt:0.42, ambColor:[252,230,206],hemiInt:0.74, hemiTop:[152,212,226],hemiBot:[110,174,76],  seaShift:0.05 },
    { h: 17.5, skyTop:[74,32,120],  skyBottom:[240,160,48], sunInt:0.80, sunColor:[255,170,64],  ambInt:0.36, ambColor:[255,216,160],hemiInt:0.68, hemiTop:[255,153,68], hemiBot:[85,68,34],   seaShift:-0.05 },
    // v0.3 twilight signature keyframes — hero look (aurora ribbon forced on in [18, 19.5] in legacy).
    { h: 18.2, skyTop:[26,16,80],   skyBottom:[248,200,88], sunInt:0.65, sunColor:[255,170,64],  ambInt:0.34, ambColor:[255,216,160],hemiInt:0.62, hemiTop:[255,153,68], hemiBot:[85,68,34],   seaShift:-0.12 },
    { h: 18.7, skyTop:[26,16,80],   skyBottom:[224,120,40], sunInt:0.55, sunColor:[255,170,64],  ambInt:0.30, ambColor:[255,216,160],hemiInt:0.58, hemiTop:[255,153,68], hemiBot:[85,68,34],   seaShift:-0.18 },
    { h: 19,   skyTop:[14,10,42],   skyBottom:[252,224,160],sunInt:0.42, sunColor:[255,170,64],  ambInt:0.28, ambColor:[255,216,160],hemiInt:0.54, hemiTop:[255,153,68], hemiBot:[85,68,34],   seaShift:-0.22 },
    { h: 20.5, skyTop:[24,18,68],   skyBottom:[92,52,180],  sunInt:0.16, sunColor:[120,86,192],  ambInt:0.26, ambColor:[156,128,206],hemiInt:0.46, hemiTop:[78,56,156],  hemiBot:[28,20,58],   seaShift:-0.40 },
    { h: 22,   skyTop:[18,12,54],   skyBottom:[82,42,160],  sunInt:0.06, sunColor:[122,88,196],  ambInt:0.24, ambColor:[156,128,206],hemiInt:0.44, hemiTop:[78,56,156],  hemiBot:[28,20,58],   seaShift:-0.50 },
    { h: 24,   skyTop:[14,8,46],    skyBottom:[112,56,206], sunInt:0.0,  sunColor:[126,90,198],  ambInt:0.22, ambColor:[156,128,206],hemiInt:0.44, hemiTop:[78,56,156],  hemiBot:[28,20,58],   seaShift:-0.55 },
]

const lerp = (a, b, t) => a + (b - a) * t
const lerpRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

// 9-emotion IO2 palette, locked in docs/mood-journaling.md. Hexes match
// DESIGN.md `C.mood.*` tokens — these are the colours mood pins tint the
// sky-bottom toward for ~3 min after a pin.
const MOOD_HEX = {
    joy:           '#FFD66B',
    sadness:       '#7FB3D9',
    anger:         '#E36A55',
    fear:          '#B49AD6',
    disgust:       '#9CC36E',
    anxiety:       '#F1A04E',
    envy:          '#6FC2B3',
    embarrassment: '#F0A6B5',
    ennui:         '#A8A5BD',
}
const hexToRgb = (hex) =>
{
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Boot default for `manualHour` — noon, the editor-daylight keyframe. */
const DEFAULT_MANUAL_HOUR = 12

export default class DayCycle
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        // null = follow wall-clock; any number 0–24 pins the cycle to that hour.
        // HourHud writes here; Phase 2d's mood input may also bump it.
        //
        // Default is PINNED to noon (world-port follow-up): the world boots in
        // fixed editor daylight instead of the visitor's wall-clock hour, so
        // sky/sea/ambient match the island-editor look by default. The hour
        // HUD's scrubber + "use real time" (clearManualHour) and scripted
        // beats (onboarding 11.5, TermlyReveal twilight) still move it.
        this.manualHour = DEFAULT_MANUAL_HOUR
        this.hour = 0
        // Bruno's SkySphere shader expects: noon → 0/1, midnight → 0.5
        // (it computes `dayIntensity = abs(progress - 0.5) * 2`). Kept distinct
        // from `hour/24` so a future "linear progress" reader can't get fooled.
        this.skyDayProgress = 0
        this.currentState = null

        // Phase 2d: set by `setMood(emotion)` and blended into `currentState.skyBottom`
        // during update() so every downstream consumer (CssSky, water shader) sees the
        // post-bias colour. Duration default 180 000 ms = ~3 min per docs/mood-journaling.md.
        this.moodBias = { color: null, until: 0, weight: 0.14, durationMs: 180_000 }

        this.update()
        this.setDebug()
    }

    update()
    {
        const date = new Date()
        const realHour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
        this.hour = (this.manualHour !== null && this.manualHour !== undefined) ? this.manualHour : realHour
        this.skyDayProgress = ((this.hour + 12) / 24) % 1

        let kA = DAY_KEYS[0], kB = DAY_KEYS[DAY_KEYS.length - 1]
        for(let i = 0; i < DAY_KEYS.length - 1; i++)
        {
            if(this.hour >= DAY_KEYS[i].h && this.hour <= DAY_KEYS[i + 1].h)
            {
                kA = DAY_KEYS[i]
                kB = DAY_KEYS[i + 1]
                break
            }
        }
        const t = (this.hour - kA.h) / Math.max(0.001, kB.h - kA.h)

        // Base time-of-day skyBottom; mood-bias blend below.
        let skyBottom = lerpRgb(kA.skyBottom, kB.skyBottom, t)

        const mood = this.moodBias
        const now = performance.now()
        if(mood.color && now < mood.until)
        {
            const [mr, mg, mb] = hexToRgb(mood.color)
            const w = mood.weight
            skyBottom = [
                skyBottom[0] * (1 - w) + mr * w,
                skyBottom[1] * (1 - w) + mg * w,
                skyBottom[2] * (1 - w) + mb * w,
            ]
        }
        else if(mood.color && now >= mood.until)
        {
            // Expired — drop the colour so a stale hex can't re-engage if the
            // student scrubs the hour slider into a fresh keyframe.
            mood.color = null
        }

        let skyTop = lerpRgb(kA.skyTop, kB.skyTop, t)
        let sunInt  = lerp(kA.sunInt, kB.sunInt, t)
        let sunColor = lerpRgb(kA.sunColor, kB.sunColor, t)
        let ambInt  = lerp(kA.ambInt, kB.ambInt, t)
        let hemiInt = lerp(kA.hemiInt, kB.hemiInt, t)

        // Rain bias: desaturate sky toward an overcast grey, dim the sun, dull
        // the hemisphere fill. Single integration point so every downstream
        // consumer (CssSky, Sky shader, lights) feels the weather. Weather is
        // constructed after DayCycle, so first-frame reads safely as 0.
        const rain = this.state.weather?.rain ?? 0
        if(rain > 0.001)
        {
            // Drift toward a luminance-matched grey of each colour — preserves
            // night-darkness instead of bleaching the sky at 22:00.
            const greyMix = (rgb, w) =>
            {
                const lum = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114
                return [
                    rgb[0] * (1 - w) + lum * w,
                    rgb[1] * (1 - w) + lum * w,
                    rgb[2] * (1 - w) + lum * w,
                ]
            }
            // Gentler than v1.2's first cut — that pass produced a near-black
            // scene at rain ≈ 0.85 once the rain glass mix was layered on top.
            // Halved sun drop and desat; the rain streaks + glass distortion
            // do most of the "looks like weather" work, so the lighting just
            // needs a nudge rather than a stage-blackout.
            const desat = rain * 0.30
            const dim   = 1 - rain * 0.10
            skyTop    = greyMix(skyTop, desat).map((c) => c * dim)
            skyBottom = greyMix(skyBottom, desat).map((c) => c * dim)
            sunColor  = greyMix(sunColor, desat * 0.5)
            sunInt   *= (1 - rain * 0.30)
            hemiInt  *= (1 - rain * 0.12)
            ambInt   *= (1 - rain * 0.05)
        }

        this.currentState = {
            hour:      this.hour,
            skyTop,
            skyBottom,
            sunInt,
            sunColor,
            ambInt,
            ambColor:  lerpRgb(kA.ambColor, kB.ambColor, t),
            hemiInt,
            hemiTop:   lerpRgb(kA.hemiTop, kB.hemiTop, t),
            hemiBot:   lerpRgb(kA.hemiBot, kB.hemiBot, t),
            seaShift:  lerp(kA.seaShift, kB.seaShift, t),
            isNight:   this.hour < 6.0 || this.hour > 19.5,
            moodColor: (mood.color && now < mood.until) ? mood.color : null,
            rain,
        }
    }

    /**
     * Pin a mood. Sky-bottom + water tint bias toward the emotion's colour for
     * `durationMs` (default ~3 min per docs/mood-journaling.md). Mood pins are
     * additive — calling again resets the timer and switches the colour.
     */
    setMood(emotion, durationMs = this.moodBias.durationMs)
    {
        const hex = MOOD_HEX[emotion]
        if(!hex)
        {
            console.warn(`Unknown mood emotion: ${emotion}. Expected one of ${Object.keys(MOOD_HEX).join(', ')}.`)
            return
        }
        this.moodBias.color = hex
        this.moodBias.until = performance.now() + durationMs
    }

    clearMood()
    {
        this.moodBias.color = null
        this.moodBias.until = 0
    }

    setManualHour(hour)
    {
        this.manualHour = hour
    }

    /** Explicit wall-clock mode — the hour HUD's "use real time" button. */
    clearManualHour()
    {
        this.manualHour = null
    }

    /** Back to the boot default (pinned noon). Scripted beats that scrub the
     *  hour (onboarding, TermlyReveal) restore through here, NOT through
     *  clearManualHour — clearing would drop the world to wall-clock and
     *  undo the fixed editor-daylight default. */
    resetHourToDefault()
    {
        this.manualHour = DEFAULT_MANUAL_HOUR
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        const folder = this.debug.ui.getFolder('state/dayCycle')
        folder.add(this, 'hour').min(0).max(24).step(0.1).listen()
        folder.add(this, 'skyDayProgress').min(0).max(1).step(0.001).listen()
        folder.add(this, 'clearManualHour').name('use real time')
    }
}
