import State from '../State/State.js'
import View from './View.js'

/**
 * Companion prompts that fire when a sky event toggles. Two scenarios:
 *
 *   • Rain just stopped — assumption stand-in for a real NEA weather API
 *     hook ("the actual sky in Singapore just cleared").
 *   • CCA / activity just finished — assumption stand-in for a calendar
 *     hook ("you just came in from something out there").
 *
 * Both nudge the student toward capturing a vivid memory while it's fresh.
 * Lines are short, present-tense, no commands — matches Kira's voice in
 * docs/companion-bird.md.
 */
const RAIN_STOPPED_LINES = [
    "The rain just lifted. Anything feel different out there?",
    "It's gone quiet. What did you carry in with you?",
    "The drops stopped. A small thing — capture it before it slips.",
]
const CCA_FINISHED_LINES = [
    "You just came in from something. One vivid bit — anything stuck?",
    "Practice just wrapped, didn't it? What's still humming?",
    "Capture one moment from out there before it fades.",
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

/**
 * HourHud — middle-right environment panel for time and weather. Rows:
 *   • hour slider + "use real time" toggle (manual hour vs. live clock)
 *   • rain switch          → state.weather.start / .stop
 *   • aurora switch        → view.aurora.setForce(on) (force visible)
 *   • rainbow switch       → view.rainbow.setForce(on)
 *
 * Aurora's auto rule still runs at twilight + night when its switch is off.
 * Rainbow has no auto rule — it only appears when forced on.
 */
export default class HourHud
{
    constructor()
    {
        this.state = State.getInstance()
        this.dayCycle = this.state.day
        this.weather  = this.state.weather

        const wrap = document.createElement('div')
        wrap.className = 'hour-hud'
        wrap.innerHTML = `
            <label class="hour-hud__row">
                <span class="hour-hud__label">hour</span>
                <input class="hour-hud__slider" type="range" min="0" max="24" step="0.1" />
                <span class="hour-hud__value">--</span>
            </label>
            <button class="hour-hud__realtime" type="button">use real time</button>
            <div class="hour-hud__divider" aria-hidden="true"></div>
            <div class="hour-hud__row hour-hud__row--toggle">
                <span class="hour-hud__label">rain</span>
                <button class="hour-hud__switch" type="button" role="switch" aria-checked="false" data-switch="rain">
                    <span class="hour-hud__switch-thumb"></span>
                </button>
            </div>
            <div class="hour-hud__row hour-hud__row--toggle">
                <span class="hour-hud__label">aurora</span>
                <button class="hour-hud__switch" type="button" role="switch" aria-checked="false" data-switch="aurora">
                    <span class="hour-hud__switch-thumb"></span>
                </button>
            </div>
            <div class="hour-hud__row hour-hud__row--toggle">
                <span class="hour-hud__label">rainbow</span>
                <button class="hour-hud__switch" type="button" role="switch" aria-checked="false" data-switch="rainbow">
                    <span class="hour-hud__switch-thumb"></span>
                </button>
            </div>
        `
        document.body.appendChild(wrap)

        this.slider = wrap.querySelector('.hour-hud__slider')
        this.valueEl = wrap.querySelector('.hour-hud__value')
        this.realtimeBtn = wrap.querySelector('.hour-hud__realtime')
        this.rainBtn    = wrap.querySelector('[data-switch="rain"]')
        this.auroraBtn  = wrap.querySelector('[data-switch="aurora"]')
        this.rainbowBtn = wrap.querySelector('[data-switch="rainbow"]')

        this.slider.value = this.dayCycle.hour.toFixed(1)
        this.valueEl.textContent = this.dayCycle.hour.toFixed(1)
        this.refreshRealtimeButton()
        this.refreshRainButton()
        this.refreshSkyButton(this.auroraBtn,  false)
        this.refreshSkyButton(this.rainbowBtn, false)

        this.slider.addEventListener('input', () =>
        {
            const h = parseFloat(this.slider.value)
            this.dayCycle.setManualHour(h)
            this.valueEl.textContent = h.toFixed(1)
            this.refreshRealtimeButton()
        })

        this.realtimeBtn.addEventListener('click', () =>
        {
            this.dayCycle.clearManualHour()
            this.refreshRealtimeButton()
        })

        this.rainBtn.addEventListener('click', () =>
        {
            const wasOn = this._rainIsOn()
            if(wasOn) this.weather.stop()
            else      this.weather.start(0.65)
            this.refreshRainButton()
            // Rain stopping is the canonical "world settled" moment — same
            // place a real NEA weather hook would land us. Kira nudges.
            if(wasOn) this._companionSay(pick(RAIN_STOPPED_LINES))
        })

        // Sky-event switches drive view modules directly. View construction
        // happens before this hud, so the references are already live.
        this.auroraBtn.addEventListener('click',  () => this._toggleSky(this.auroraBtn,  'aurora'))
        this.rainbowBtn.addEventListener('click', () => this._toggleSky(this.rainbowBtn, 'rainbow'))

        // Root reference held for dispose(); all listeners attach to
        // descendants of `wrap`, so root.remove() drops them with the tree.
        this.root = wrap
    }

    /**
     * Tear-down hook. Listeners are all bound to descendants of `root`, so
     * detaching it drops the closure graph. No document/window listeners
     * are registered here.
     */
    dispose()
    {
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.slider = null
        this.valueEl = null
        this.realtimeBtn = null
        this.rainBtn = null
        this.auroraBtn = null
        this.rainbowBtn = null
    }

    _companionSay(line)
    {
        const kira = View.getInstance()?.kiraDialogue
        if(kira && typeof kira.say === 'function') kira.say(line)
    }

    _toggleSky(btn, viewKey)
    {
        // View.getInstance() at click time so the view module references
        // (Aurora, Rainbow) are already constructed.
        const view = View.getInstance()
        const module = view?.[viewKey]
        if(!module || typeof module.setForce !== 'function') return
        const next = !btn.classList.contains('is-on')
        module.setForce(next)
        this.refreshSkyButton(btn, next)
        // Aurora / rainbow turning ON is the CCA-finished stand-in — the
        // sky just did something, the student probably did too.
        if(next) this._companionSay(pick(CCA_FINISHED_LINES))
    }

    update()
    {
        if(!this.slider) return    // post-dispose tick
        // In real-time mode, mirror the live hour into the slider so the UI doesn't drift from the cycle.
        // Skip while the slider is focused so we don't fight the user's drag.
        if(this.dayCycle.manualHour === null && document.activeElement !== this.slider)
        {
            const h = this.dayCycle.hour.toFixed(1)
            if(this.slider.value !== h)
            {
                this.slider.value = h
                this.valueEl.textContent = h
            }
        }
        // The weather scheduler can flip rain on/off on its own (ambient cycle);
        // keep the switch in sync so it reflects current state.
        this.refreshRainButton()
    }

    refreshRealtimeButton()
    {
        this.realtimeBtn.classList.toggle('is-active', this.dayCycle.manualHour === null)
    }

    _rainIsOn()
    {
        // Authoritative on target. Weather.start/stop sync `phase` for us,
        // so the switch flips the instant the student clicks.
        return (this.weather.rainTarget ?? 0) > 0.05
    }

    refreshRainButton()
    {
        const on = this._rainIsOn()
        this.rainBtn.classList.toggle('is-on', on)
        this.rainBtn.setAttribute('aria-checked', on ? 'true' : 'false')
    }

    refreshSkyButton(btn, on)
    {
        if(!btn) return
        btn.classList.toggle('is-on', on)
        btn.setAttribute('aria-checked', on ? 'true' : 'false')
    }
}
