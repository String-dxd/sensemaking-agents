import State from '../State/State.js'

/**
 * Procedural ambient music + rain audio. No asset files — both layers
 * are synthesized with Web Audio so the build stays small and works
 * offline.
 *
 *   · Ambient — a four-chord progression (vi · IV · I · V in C, voiced
 *     across two octaves) cycles every ~64s. Four sine voices crossfade
 *     between chord notes via setTargetAtTime so chord changes glide
 *     instead of step. A sparse triangle-wave melody picks one of the
 *     upper chord tones every 5–9s and plays it with a soft attack +
 *     long release. Everything feeds a short feedback delay so the room
 *     has tail.
 *   · Rain    — pink noise through a bandpass filter around 2 kHz with
 *     gentle amplitude modulation for gusts. Off by default; fades in
 *     when state.weather.rain crosses the threshold.
 *
 * Ducking: when rain is active, ambient ducks from 0.16 to 0.07 over
 * 600ms and rain ramps in to 0.32. Inversely linked through the read
 * of state.weather.rain each frame.
 *
 * Autoplay gate: AudioContext only starts after the first user gesture
 * (pointerdown / keydown / touchstart). On gesture we lazy-build the
 * graph and the ambient music starts immediately.
 */

const AMBIENT_BASE   = 0.16
const AMBIENT_DUCKED = 0.07
const RAIN_PEAK      = 0.32
// Breeze plays in clear weather — softer than rain (it's background
// air, not falling water) and crossfades inversely so they never
// share the foreground.
const BREEZE_PEAK    = 0.18
const RAIN_THRESHOLD = 0.12     // weather.rain crosses this to count as "raining"
const FADE_TAU       = 1.2      // seconds for ~63% of the way to target

// Stream volumes are independent of the procedural Web Audio graph
// because they play via <audio> elements (most ambient-music CDNs
// don't ship CORS headers, so decodeAudioData won't work). Volume is
// modulated on the element directly: base × not-muted × not-ducked.
const STREAM_BASE   = 0.55
const STREAM_DUCKED = 0.22

// Track catalog. All entries stream from incompetech (Kevin MacLeod,
// CC-BY 4.0) over HTTPS with a Mozilla UA. Add new tracks by appending
// to this list — the picker rebuilds itself from it.
//
// The procedural Web Audio engine (chord progression + melody) is kept
// in this file but unwired from the catalog — it read too dark/scary
// against the bright daytime island. Re-introduce it later with a
// warmer voicing if we want a no-network fallback.
export const TRACKS = [
    {
        id: 'dreamy-flashback',
        name: 'Dreamy Flashback',
        attribution: 'K. MacLeod · CC-BY',
        type: 'stream',
        url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dreamy%20Flashback.mp3',
    },
    {
        id: 'tranquility',
        name: 'Tranquility',
        attribution: 'K. MacLeod · CC-BY',
        type: 'stream',
        url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Tranquility.mp3',
    },
    {
        id: 'meditation-impromptu',
        name: 'Meditation Impromptu',
        attribution: 'K. MacLeod · CC-BY',
        type: 'stream',
        url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Meditation%20Impromptu%2003.mp3',
    },
    {
        id: 'pamgaea',
        name: 'Pamgaea',
        attribution: 'K. MacLeod · CC-BY',
        type: 'stream',
        url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pamgaea.mp3',
    },
]
const TRACKS_BY_ID = Object.fromEntries(TRACKS.map(t => [t.id, t]))

// Four-chord progression in C — vi · IV · I · V. Each row is the four
// pad voices' target frequencies (low → high). Chosen to share common
// tones across changes so the voice-leading is smooth: e.g. C4 stays
// across Am→F, G4 stays across C→G. Total cycle ~64s at 16s/chord.
const CHORD_PROGRESSION = [
    // Am9 — vi
    [110.00, 261.63, 329.63, 493.88],   // A2, C4, E4, B4
    // Fmaj7 — IV
    [ 87.31, 261.63, 349.23, 440.00],   // F2, C4, F4, A4
    // Cmaj7 — I
    [130.81, 329.63, 392.00, 493.88],   // C3, E4, G4, B4
    // G — V
    [ 98.00, 293.66, 392.00, 440.00],   // G2, D4, G4, A4
]

const CHORD_HOLD_S    = 16    // dwell time per chord
const CHORD_GLIDE_S   = 3.0   // crossfade time when changing chord
const MELODY_MIN_S    = 5
const MELODY_MAX_S    = 9

export default class Sound
{
    constructor()
    {
        this.state = State.getInstance()
        this.ctx = null
        this.master = null
        this.ambientGain = null
        this.rainGain = null
        this.breezeGain = null
        this.unlocked = false
        this._muted = this._loadMutePref()
        this._listeners = []
        this._trackListeners = []

        // Targets are the values we ease the gains toward each frame. They
        // are updated based on weather state; the actual gain glides over
        // FADE_TAU so transitions stay smooth even if weather snaps.
        this._ambientTarget = AMBIENT_BASE
        this._rainTarget    = 0
        this._breezeTarget  = 0

        // Chord progression bookkeeping — the music engine drives chord
        // changes from update() so the schedule pauses gracefully if the
        // tab is backgrounded (setTimeout would drift hard).
        this._chordIdx = 0
        this._nextChordAt = 0
        this._padVoices  = []     // {osc, detune} per chord-voice
        this._melodyOsc  = null
        this._melodyEnv  = null
        this._nextMelodyAt = 0

        // Track switcher. Procedural is the safe default — switching to
        // a streamed track lazy-creates an <audio> element and pauses the
        // procedural pad. _streamVolTarget mirrors AMBIENT_BASE / DUCKED
        // logic so streamed tracks duck the same way under rain.
        this._trackId = this._loadTrackPref()
        if(!TRACKS_BY_ID[this._trackId]) this._trackId = 'dreamy-flashback'
        this._streamEls = new Map()    // id → HTMLAudioElement
        this._streamVolTarget = STREAM_BASE
        this._streamLoadPromise = null

        // Lazy-unlock on first gesture. Browsers block AudioContext until
        // a user-initiated event; we listen once and then build the graph.
        // The handler ref is stored so `dispose()` can remove the listeners
        // when the engine is torn down before any user gesture fires.
        this._unlockHandler = () => this._unlock()
        const opts = { once: true, passive: true }
        window.addEventListener('pointerdown', this._unlockHandler, opts)
        window.addEventListener('keydown', this._unlockHandler, opts)
        window.addEventListener('touchstart', this._unlockHandler, opts)
    }

    /* ----- public ----- */

    get muted() { return this._muted }

    setMuted(muted)
    {
        if(this._muted === muted) return
        this._muted = muted
        this._savePref()
        for(const fn of this._listeners) fn(muted)
        if(!this.unlocked || !this.master) return
        // Tiny ramp on the master gain — affects procedural layers.
        const now = this.ctx.currentTime
        this.master.gain.cancelScheduledValues(now)
        this.master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.08)
        // Stream tracks bypass the Web Audio graph — set their element
        // volume directly. Pause when fully muted so the network bytes
        // aren't wasted.
        for(const [, el] of this._streamEls)
        {
            el.volume = muted ? 0 : this._streamVolTarget
            if(muted) el.pause()
            else if(TRACKS_BY_ID[this._trackId]?.id === this._streamElIdOf(el))
                el.play().catch(() => {})
        }
    }

    _streamElIdOf(el)
    {
        for(const [id, e] of this._streamEls) if(e === el) return id
        return null
    }

    toggleMuted() { this.setMuted(!this._muted) }

    onMuteChange(fn)
    {
        this._listeners.push(fn)
        return () => { this._listeners = this._listeners.filter(l => l !== fn) }
    }

    /* ----- track switching ----- */

    get trackId() { return this._trackId }
    get tracks()  { return TRACKS }

    setTrack(id)
    {
        if(!TRACKS_BY_ID[id] || id === this._trackId) return
        const prev = this._trackId
        this._trackId = id
        this._saveTrackPref()
        for(const fn of this._trackListeners) fn(id)
        if(!this.unlocked) return    // applied on _buildGraph()

        // Procedural fade out via the pad gain — already wired through
        // ambientGain. Streams fade via the <audio> element's .volume.
        const isProc = TRACKS_BY_ID[id].type === 'procedural'
        const wasProc = TRACKS_BY_ID[prev].type === 'procedural'

        // Pause whichever stream was previously playing.
        if(!wasProc)
        {
            const el = this._streamEls.get(prev)
            if(el) { el.pause() }
        }

        if(isProc)
        {
            // Procedural music stays "playing" continuously — just unduck
            // the ambient pad target by re-routing the target logic. The
            // update() loop reads _trackId each frame to decide who's
            // foreground.
        }
        else
        {
            this._ensureStream(id).then(el =>
            {
                if(this._trackId !== id) return   // user switched again mid-load
                // Apply current muted/duck state when starting.
                el.volume = this._currentStreamVolume()
                el.play().catch(err => console.warn('[Sound] stream play failed:', err))
            })
        }
    }

    cycleTrack(delta = 1)
    {
        const i = TRACKS.findIndex(t => t.id === this._trackId)
        const next = TRACKS[(i + delta + TRACKS.length) % TRACKS.length]
        this.setTrack(next.id)
    }

    onTrackChange(fn)
    {
        this._trackListeners.push(fn)
        return () => { this._trackListeners = this._trackListeners.filter(l => l !== fn) }
    }

    _ensureStream(id)
    {
        if(this._streamEls.has(id)) return Promise.resolve(this._streamEls.get(id))
        const track = TRACKS_BY_ID[id]
        if(!track || track.type !== 'stream') return Promise.reject(new Error('not a stream'))
        const el = new Audio()
        // Don't set crossOrigin — these CDNs don't return CORS headers
        // and crossorigin='anonymous' would block playback. Without
        // crossOrigin the audio plays but is "tainted", which only
        // matters for Web Audio capture (we don't need it).
        el.loop = true
        el.preload = 'auto'
        el.src = track.url
        el.volume = 0
        this._streamEls.set(id, el)
        return new Promise((resolve) =>
        {
            const ready = () =>
            {
                el.removeEventListener('canplay', ready)
                el.removeEventListener('error', ready)
                resolve(el)
            }
            el.addEventListener('canplay', ready, { once: true })
            el.addEventListener('error', ready, { once: true })
        })
    }

    _currentStreamVolume()
    {
        if(this._muted) return 0
        return this._streamVolTarget
    }

    /** Called from View.update() each frame. Reads weather state, drifts
     *  gains toward their targets, and advances the music scheduler. */
    update()
    {
        if(!this.unlocked || !this.ctx) return
        const weather = this.state.weather
        const raining = weather && weather.rain >= RAIN_THRESHOLD
        // Normalize within the threshold..1 range so light drizzle isn't
        // as loud as a downpour.
        const rainAmt = raining
            ? Math.min(1, (weather.rain - RAIN_THRESHOLD) / (1 - RAIN_THRESHOLD))
            : 0
        // Breeze plays in clear weather; fades out as rain takes over so
        // the two never compete in the same ear-space.
        const breezeAmt = 1 - rainAmt
        this._rainTarget    = rainAmt   * RAIN_PEAK
        this._breezeTarget  = breezeAmt * BREEZE_PEAK
        // Procedural pad only plays when track == procedural; otherwise
        // it stays silent so a streamed track has the foreground.
        const isProcTrack = TRACKS_BY_ID[this._trackId]?.type === 'procedural'
        if(isProcTrack)
        {
            this._ambientTarget = raining
                ? AMBIENT_BASE + (AMBIENT_DUCKED - AMBIENT_BASE) * rainAmt
                : AMBIENT_BASE
            this._streamVolTarget = 0
        }
        else
        {
            this._ambientTarget = 0
            this._streamVolTarget = raining
                ? STREAM_BASE + (STREAM_DUCKED - STREAM_BASE) * rainAmt
                : STREAM_BASE
        }

        const dt = Math.max(0.0001, this.state.time.delta || 0.016)
        const k = 1 - Math.exp(-dt / FADE_TAU)
        const now = this.ctx.currentTime
        const ag = this.ambientGain.gain.value + (this._ambientTarget - this.ambientGain.gain.value) * k
        const rg = this.rainGain.gain.value    + (this._rainTarget    - this.rainGain.gain.value)    * k
        const bg = this.breezeGain.gain.value  + (this._breezeTarget  - this.breezeGain.gain.value)  * k
        this.ambientGain.gain.setValueAtTime(ag, now)
        this.rainGain.gain.setValueAtTime(rg, now)
        this.breezeGain.gain.setValueAtTime(bg, now)

        // Streams bypass the Web Audio graph, so ease their volume in
        // JS-space using the same FADE_TAU. Muted state forces 0.
        const streamEl = this._streamEls.get(this._trackId)
        if(streamEl && !isProcTrack)
        {
            const targ = this._muted ? 0 : this._streamVolTarget
            streamEl.volume = streamEl.volume + (targ - streamEl.volume) * k
        }

        // Music scheduler — drive chord changes and melody hits off the
        // audio clock (currentTime), not setTimeout, so backgrounding
        // the tab doesn't desync the progression.
        if(now >= this._nextChordAt)
        {
            this._advanceChord(now)
        }
        if(now >= this._nextMelodyAt)
        {
            this._playMelodyNote(now)
        }
    }

    /* ----- unlock + graph build ----- */

    _unlock()
    {
        if(this.unlocked) return
        const Ctx = window.AudioContext || window.webkitAudioContext
        if(!Ctx) return
        try
        {
            this.ctx = new Ctx()
            // Some browsers create the context in 'suspended' state even
            // inside a gesture; resume() returns a promise we don't need
            // to await.
            if(this.ctx.state === 'suspended') this.ctx.resume()
        }
        catch(err)
        {
            console.warn('[Sound] AudioContext failed:', err)
            return
        }

        this._buildGraph()
        this.unlocked = true
    }

    _buildGraph()
    {
        const ctx = this.ctx

        this.master = ctx.createGain()
        this.master.gain.value = this._muted ? 0 : 1
        this.master.connect(ctx.destination)

        this.ambientGain = ctx.createGain()
        this.ambientGain.gain.value = AMBIENT_BASE
        this.ambientGain.connect(this.master)

        this.rainGain = ctx.createGain()
        this.rainGain.gain.value = 0
        this.rainGain.connect(this.master)

        this.breezeGain = ctx.createGain()
        this.breezeGain.gain.value = 0
        this.breezeGain.connect(this.master)

        // One shared pink-noise buffer for rain + breeze — rain reads it
        // at full bandwidth (pattering), breeze low-passes it (whisper).
        this._pinkBuffer = this._makePinkNoiseBuffer(4)

        this._buildAmbient()
        this._buildRain()
        this._buildBreeze()

        // If the persisted preference is a streamed track, start it now
        // that the user gesture has unlocked playback.
        if(TRACKS_BY_ID[this._trackId]?.type === 'stream')
        {
            this._ensureStream(this._trackId).then(el =>
            {
                if(this._trackId !== el._trackId && TRACKS_BY_ID[this._trackId]?.type !== 'stream') return
                el.volume = this._muted ? 0 : this._streamVolTarget
                el.play().catch(err => console.warn('[Sound] stream play failed:', err))
            })
        }
    }

    _buildAmbient()
    {
        const ctx = this.ctx
        const now = ctx.currentTime

        // Soft global lowpass so the pad reads warm, not glassy.
        const padFilter = ctx.createBiquadFilter()
        padFilter.type = 'lowpass'
        padFilter.frequency.value = 1500
        padFilter.Q.value = 0.7

        // Feedback delay tail — cheap reverb. Short delay with moderate
        // feedback gives the room a soft echo without going cathedral.
        const wet = ctx.createGain()
        wet.gain.value = 0.32
        const delay = ctx.createDelay(0.6)
        delay.delayTime.value = 0.28
        const feedback = ctx.createGain()
        feedback.gain.value = 0.42
        const delayFilter = ctx.createBiquadFilter()
        delayFilter.type = 'lowpass'
        delayFilter.frequency.value = 1200
        delay.connect(delayFilter).connect(feedback).connect(delay)
        delayFilter.connect(wet)
        wet.connect(this.ambientGain)

        // Pad voices (one per chord note). Frequency is mutable — chord
        // changes use setTargetAtTime to glide each voice to its new
        // note over CHORD_GLIDE_S so the change feels like crossfade,
        // not switch.
        const startChord = CHORD_PROGRESSION[0]
        for(let i = 0; i < 4; i++)
        {
            const osc = ctx.createOscillator()
            osc.type = 'sine'
            osc.frequency.value = startChord[i]
            osc.detune.value = (i - 1.5) * 3   // tiny detune per voice

            const voiceGain = ctx.createGain()
            voiceGain.gain.value = i === 0 ? 0.18 : 0.20  // bass slightly under
            // Slow tremolo so the chord breathes during the long holds.
            const lfo = ctx.createOscillator()
            lfo.type = 'sine'
            lfo.frequency.value = 1 / (13 + i * 2.5)
            const lfoGain = ctx.createGain()
            lfoGain.gain.value = 0.07
            lfo.connect(lfoGain).connect(voiceGain.gain)

            osc.connect(voiceGain).connect(padFilter)
            // Dry → ambient, plus a tap into the delay for the wet tail.
            padFilter.connect(this.ambientGain)
            voiceGain.connect(delay)

            osc.start()
            lfo.start()

            this._padVoices.push({ osc })
        }

        // Melody — a single triangle voice plays sparse high-register
        // notes from the current chord. Soft attack, long release; the
        // delay tail does most of the spatial work.
        const melodyOsc = ctx.createOscillator()
        melodyOsc.type = 'triangle'
        melodyOsc.frequency.value = 0   // silent until first note scheduled
        const melodyEnv = ctx.createGain()
        melodyEnv.gain.value = 0
        const melodyFilter = ctx.createBiquadFilter()
        melodyFilter.type = 'lowpass'
        melodyFilter.frequency.value = 2400
        melodyFilter.Q.value = 0.6
        melodyOsc.connect(melodyEnv).connect(melodyFilter)
        // Mostly wet so each note lingers; small dry tap so the attack
        // has presence.
        melodyFilter.connect(this.ambientGain)
        melodyFilter.connect(delay)
        melodyOsc.start()
        this._melodyOsc = melodyOsc
        this._melodyEnv = melodyEnv

        // Kick off the schedulers — first chord lands immediately, first
        // melody note a beat later so the entry isn't muddled.
        this._chordIdx = 0
        this._nextChordAt = now + CHORD_HOLD_S
        this._nextMelodyAt = now + 4
    }

    _advanceChord(now)
    {
        this._chordIdx = (this._chordIdx + 1) % CHORD_PROGRESSION.length
        const notes = CHORD_PROGRESSION[this._chordIdx]
        for(let i = 0; i < this._padVoices.length; i++)
        {
            const osc = this._padVoices[i].osc
            // setTargetAtTime glides exponentially — ~95% in 3τ. Use a
            // timeConstant of CHORD_GLIDE_S / 3 so the full crossfade
            // completes in CHORD_GLIDE_S seconds.
            osc.frequency.cancelScheduledValues(now)
            osc.frequency.setTargetAtTime(notes[i], now, CHORD_GLIDE_S / 3)
        }
        this._nextChordAt = now + CHORD_HOLD_S
    }

    _playMelodyNote(now)
    {
        // Pick one of the three upper chord tones (skip the bass), shift
        // up an octave for the melody register. The random choice keeps
        // the line from feeling scripted.
        const notes = CHORD_PROGRESSION[this._chordIdx]
        const noteIdx = 1 + Math.floor(Math.random() * 3)
        const freq = notes[noteIdx] * 2
        this._melodyOsc.frequency.cancelScheduledValues(now)
        this._melodyOsc.frequency.setTargetAtTime(freq, now, 0.04)

        // Envelope: soft attack 0.4s, hold ~0.8s, release 2.0s. Total
        // note length ~3.2s including release tail.
        const env = this._melodyEnv.gain
        env.cancelScheduledValues(now)
        env.setValueAtTime(env.value, now)
        env.linearRampToValueAtTime(0.16, now + 0.4)   // attack
        env.setTargetAtTime(0.10, now + 0.5, 0.4)      // sustain dip
        env.setTargetAtTime(0,    now + 1.2, 0.8)      // release

        // Schedule next note 5–9s out — sparse enough to feel composed,
        // dense enough to feel alive.
        const gap = MELODY_MIN_S + Math.random() * (MELODY_MAX_S - MELODY_MIN_S)
        this._nextMelodyAt = now + gap
    }

    _buildBreeze()
    {
        const ctx = this.ctx
        const noise = ctx.createBufferSource()
        noise.buffer = this._pinkBuffer
        noise.loop = true

        // Two-band character — soft "air" below 800 Hz + a quiet leaf
        // rustle bandpass around 4 kHz with deeper gust modulation. Both
        // share the same noise source so the gusts feel coherent.
        const air = ctx.createBiquadFilter()
        air.type = 'lowpass'
        air.frequency.value = 720
        air.Q.value = 0.5
        const airGain = ctx.createGain()
        airGain.gain.value = 0.82

        const leaves = ctx.createBiquadFilter()
        leaves.type = 'bandpass'
        leaves.frequency.value = 4200
        leaves.Q.value = 1.4
        const leavesGain = ctx.createGain()
        leavesGain.gain.value = 0.32

        // Slow gust LFO — air rises and falls over ~14s. Leaves get a
        // faster, deeper modulation so rustles happen in bursts.
        const slowLfo = ctx.createOscillator()
        slowLfo.type = 'sine'
        slowLfo.frequency.value = 1 / 14
        const slowLfoGain = ctx.createGain()
        slowLfoGain.gain.value = 0.30
        slowLfo.connect(slowLfoGain).connect(airGain.gain)

        const rustleLfo = ctx.createOscillator()
        rustleLfo.type = 'sine'
        rustleLfo.frequency.value = 1 / 5.5
        const rustleLfoGain = ctx.createGain()
        rustleLfoGain.gain.value = 0.45
        rustleLfo.connect(rustleLfoGain).connect(leavesGain.gain)

        noise.connect(air).connect(airGain).connect(this.breezeGain)
        noise.connect(leaves).connect(leavesGain).connect(this.breezeGain)
        noise.start()
        slowLfo.start()
        rustleLfo.start()
    }

    _makePinkNoiseBuffer(durationS)
    {
        // Voss-McCartney pink-noise approximation. Pulled out of _buildRain
        // so rain + breeze can share one buffer.
        const ctx = this.ctx
        const length = durationS * ctx.sampleRate
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for(let i = 0; i < length; i++)
        {
            const white = Math.random() * 2 - 1
            b0 = 0.99886 * b0 + white * 0.0555179
            b1 = 0.99332 * b1 + white * 0.0750759
            b2 = 0.96900 * b2 + white * 0.1538520
            b3 = 0.86650 * b3 + white * 0.3104856
            b4 = 0.55000 * b4 + white * 0.5329522
            b5 = -0.7616 * b5 - white * 0.0168980
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
            b6 = white * 0.115926
        }
        return buffer
    }

    _buildRain()
    {
        const ctx = this.ctx
        const noise = ctx.createBufferSource()
        noise.buffer = this._pinkBuffer
        noise.loop = true

        // Bandpass tuned to bring out the "patter on leaves" frequencies.
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 2000
        filter.Q.value = 0.55

        // Gentle high-shelf to add a tiny rain-on-roof hiss without going
        // splashy.
        const shelf = ctx.createBiquadFilter()
        shelf.type = 'highshelf'
        shelf.frequency.value = 5000
        shelf.gain.value = 4

        // LFO for "gusts" — slow amplitude modulation so the rain isn't
        // a perfectly steady wash.
        const gustGain = ctx.createGain()
        gustGain.gain.value = 1.0
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 1 / 9
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 0.18
        lfo.connect(lfoGain).connect(gustGain.gain)

        noise.connect(filter).connect(shelf).connect(gustGain).connect(this.rainGain)
        noise.start()
        lfo.start()
    }

    /* ----- one-shot SFX ----- */

    /**
     * Play a short procedural SFX through the master gain. Used by the
     * onboarding reveal beats so the bloom + tree-grow chips don't pop
     * silently. No-ops when audio hasn't been unlocked or the user has
     * muted — silence here is fine; the cinematic still reads.
     *
     * Specs:
     *   'bloom' — two short sine pings (E6 → A6, 220ms each, ~600ms total)
     *             through a small delay tap so it shimmers without ringing.
     *   'grow'  — fundamental G3 + harmonics (D4, G4, B4) that swell
     *             over ~800ms, with a filtered-noise leaf-rustle tail.
     */
    playOneShot(spec)
    {
        if(!this.unlocked || !this.ctx || this._muted) return
        if(spec === 'bloom') this._playBloom()
        else if(spec === 'grow') this._playGrow()
    }

    _playBloom()
    {
        const ctx = this.ctx
        const now = ctx.currentTime

        // Delay-tap shimmer — shared across the two pings so the second
        // note rings into the tail of the first.
        const delay = ctx.createDelay(0.4)
        delay.delayTime.value = 0.14
        const fb = ctx.createGain()
        fb.gain.value = 0.32
        const dryWet = ctx.createGain()
        dryWet.gain.value = 0.55
        const tone = ctx.createBiquadFilter()
        tone.type = 'lowpass'
        tone.frequency.value = 4200
        delay.connect(fb).connect(delay)
        delay.connect(tone).connect(dryWet).connect(this.master)

        const ping = (freq, startOffset) =>
        {
            const t = now + startOffset
            const osc = ctx.createOscillator()
            osc.type = 'sine'
            osc.frequency.value = freq
            const env = ctx.createGain()
            env.gain.setValueAtTime(0, t)
            env.gain.linearRampToValueAtTime(0.34, t + 0.012)   // 12ms attack
            env.gain.setTargetAtTime(0, t + 0.04, 0.07)         // soft decay
            osc.connect(env)
            env.connect(this.master)
            env.connect(delay)
            osc.start(t)
            osc.stop(t + 0.5)
        }

        // E6 → A6 (1318.51 Hz → 1760 Hz). 220ms gap so the two notes overlap
        // through the delay tail.
        ping(1318.51, 0)
        ping(1760.00, 0.22)
    }

    _playGrow()
    {
        const ctx = this.ctx
        const now = ctx.currentTime

        // Bus: shared filter + gain so the harmonics share envelope shape.
        const bus = ctx.createGain()
        bus.gain.setValueAtTime(0, now)
        bus.gain.linearRampToValueAtTime(0.30, now + 0.38)    // slow swell
        bus.gain.setTargetAtTime(0, now + 0.8, 0.32)
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 2200
        bus.connect(lp).connect(this.master)

        // G3 fundamental + D4, G4, B4 harmonics. Triangle on the
        // fundamental for body, sines on the rest for clarity.
        const voice = (freq, type, level, detuneCents = 0) =>
        {
            const osc = ctx.createOscillator()
            osc.type = type
            osc.frequency.value = freq
            osc.detune.value = detuneCents
            const g = ctx.createGain()
            g.gain.value = level
            osc.connect(g).connect(bus)
            osc.start(now)
            osc.stop(now + 1.2)
        }
        voice(196.00, 'triangle', 0.45, -3)   // G3
        voice(293.66, 'sine',     0.22,  2)   // D4
        voice(392.00, 'sine',     0.20, -1)   // G4
        voice(493.88, 'sine',     0.14,  4)   // B4

        // Leaf-rustle tail — short pink-noise pulse through a bandpass
        // around 4 kHz, swelling slightly after the harmonic body and
        // tailing off by ~1.2s.
        if(this._pinkBuffer)
        {
            const noise = ctx.createBufferSource()
            noise.buffer = this._pinkBuffer
            noise.loop = false
            const bp = ctx.createBiquadFilter()
            bp.type = 'bandpass'
            bp.frequency.value = 4200
            bp.Q.value = 1.6
            const ng = ctx.createGain()
            ng.gain.setValueAtTime(0, now)
            ng.gain.linearRampToValueAtTime(0.18, now + 0.50)
            ng.gain.setTargetAtTime(0, now + 0.85, 0.28)
            noise.connect(bp).connect(ng).connect(this.master)
            noise.start(now)
            noise.stop(now + 1.3)
        }
    }

    /* ----- preference persistence ----- */

    _loadMutePref()
    {
        try { return localStorage.getItem('ss.sound.muted') === '1' }
        catch(_) { return false }
    }
    _savePref()
    {
        try { localStorage.setItem('ss.sound.muted', this._muted ? '1' : '0') }
        catch(_) {}
    }

    _loadTrackPref()
    {
        try { return localStorage.getItem('ss.sound.track') || 'dreamy-flashback' }
        catch(_) { return 'dreamy-flashback' }
    }
    _saveTrackPref()
    {
        try { localStorage.setItem('ss.sound.track', this._trackId) }
        catch(_) {}
    }

    /**
     * Browsers cap AudioContext per tab (~6 in Chrome). Without explicit
     * close, every engine remount under React StrictMode / HMR leaks one
     * context and dev sessions hit the cap after a handful of saves.
     *
     * Also removes the pre-gesture unlock listeners (which would otherwise
     * leak when dispose runs before any user click) and pauses every
     * streamed <audio> element so background tracks don't keep playing.
     */
    dispose()
    {
        if(this._unlockHandler)
        {
            try
            {
                window.removeEventListener('pointerdown', this._unlockHandler)
                window.removeEventListener('keydown',      this._unlockHandler)
                window.removeEventListener('touchstart',   this._unlockHandler)
            }
            catch(_) {}
            this._unlockHandler = null
        }

        for(const el of this._streamEls.values())
        {
            try { el.pause(); el.removeAttribute('src'); el.load() } catch(_) {}
        }
        this._streamEls.clear()

        if(this.ctx)
        {
            try { this.ctx.close() } catch(_) {}
            this.ctx = null
        }
    }
}
