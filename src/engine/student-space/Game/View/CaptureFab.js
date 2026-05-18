/**
 * Capture FAB — the production entry point per docs/mood-journaling.md.
 * A flat soft pill above the input bar; tap routes through to the
 * structured-capture sheet (currently mood-only; the proud/feel/cca/animal
 * shapes are later phases).
 *
 * Also doubles as the *mood pill* per the spec's "post-save feedback":
 *   - On each new pin, the FAB itself tints toward the pin's emotion
 *     colour so the entry point reflects the most recent mood.
 *   - A single particle in the pin's colour rises from the FAB and
 *     drifts up-and-right toward the canopy before dissolving (~1.4s,
 *     ease-out cubic per DESIGN.md motion rules).
 *
 * Dev affordance: stays alongside MoodHud so the dev row of nine dots
 * can be used to scrub mood-bias without going through the full sheet.
 */
import MoodSheet from './MoodSheet.js'
import AskSheet from './AskSheet.js'
import PhotoSheet from './PhotoSheet.js'
import CaptureChooser from './CaptureChooser.js'
import OverlayController from './OverlayController.js'
import State from '../State/State.js'

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

export default class CaptureFab
{
    constructor()
    {
        this.state = State.getInstance()

        const fab = document.createElement('button')
        fab.type = 'button'
        fab.className = 'capture-fab'
        fab.setAttribute('aria-label', 'Capture')
        fab.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
              />
            </svg>
            <span class="capture-fab__label">capture</span>
        `
        document.body.appendChild(fab)
        this.el = fab

        this.moodSheet  = new MoodSheet()
        this.askSheet   = new AskSheet()
        this.photoSheet = new PhotoSheet()
        this.chooser    = new CaptureChooser({
            routes: { ask: this.askSheet, mood: this.moodSheet, photo: this.photoSheet },
        })

        // Hand each capture surface to OverlayController so opening any
        // other sheet (Profile / Calendar / Letters) auto-closes whatever
        // capture flow was mid-interaction.
        const controller = OverlayController.getInstance()
        controller.register('chooser', this.chooser)
        controller.register('mood',    this.moodSheet)
        controller.register('ask',     this.askSheet)
        controller.register('photo',   this.photoSheet)

        fab.addEventListener('click', () =>
        {
            if(controller.isOpen('chooser')) controller.close('chooser')
            else controller.open('chooser')
        })

        // Subscribe AFTER the FAB is in the DOM so emitParticle has a layout
        // anchor on the first pin. Mood pins tint the FAB toward the emotion
        // color and emit a coloured particle. Ask/photo captures fire a
        // neutral particle so every save shows the same kind of feedback.
        this.state.moodPins.subscribe((pin) =>
        {
            const colour = MOOD_HEX[pin.emotion] || '#FF8A5C'
            this._tint(colour)
            this._emitParticle(colour)
        })
        this.state.captures.subscribe(() =>
        {
            this._emitParticle('#FFFDF6')
        })
    }

    _tint(colour)
    {
        // CSS handles the easing — toggling the var is enough.
        this.el.style.setProperty('--capture-tint', colour)
        this.el.classList.add('is-tinted')
    }

    _emitParticle(colour)
    {
        const rect = this.el.getBoundingClientRect()
        const startX = rect.left + rect.width / 2
        const startY = rect.top + rect.height / 2

        const dot = document.createElement('div')
        dot.className = 'mood-particle'
        dot.style.left = `${startX}px`
        dot.style.top  = `${startY}px`
        dot.style.background = colour
        document.body.appendChild(dot)

        // Forced reflow so the transition picks up the post-paint transform.
        // Without this, browsers can batch both styles and skip the animation.
        void dot.offsetWidth
        dot.classList.add('is-drifting')

        // Up-and-right, distance scaled to viewport so it always heads
        // toward the canopy region regardless of screen size.
        const dx = 80 + Math.random() * 30
        const dy = -(window.innerHeight * 0.55 + Math.random() * 30)
        dot.style.transform = `translate(${dx}px, ${dy}px) scale(0.6)`
        dot.style.opacity = '0'

        setTimeout(() => dot.remove(), 1500)
    }

    update() {}
}
