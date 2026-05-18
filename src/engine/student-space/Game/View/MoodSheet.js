import State from '../State/State.js'
import OverlayController from './OverlayController.js'

/**
 * Full-viewport mood-capture sheet. Three steps:
 *   1. Emotion picker — 3×3 grid of IO2 emotions (joy/sadness/anger/fear/
 *      disgust/anxiety/envy/embarrassment/ennui). Auto-advance on tap.
 *   2. Intensity — whisper / talking / loud / running the show (1..4).
 *      Save fires the instant intensity is picked.
 *   3. Cause — optional, post-save. 10 chips + a skip; tapping a chip
 *      patches the existing pin, skip just dismisses.
 *
 * On save (between steps 2 and 3):
 *   - MoodPins.add({ emotion, intensity }) — pin lands the instant
 *     intensity is picked. Cause is a patch, not a gate (Lieberman et al.
 *     affect-labeling: the naming is the regulation event).
 *   - DayCycle.setMood(emotion) — sky-bottom + water shader bias for ~3 min
 *   - Sheet pivots to step 3 (cause) instead of closing.
 *
 * Step 4 (note) hands off to a free-form input bar in the sister project
 * and is out of scope for v1 (no input bar present).
 */
export const EMOTIONS = [
    { id: 'joy',           label: 'Joy',           color: '#FFD66B', shape: 'sphere' },
    { id: 'sadness',       label: 'Sadness',       color: '#7FB3D9', shape: 'teardrop' },
    { id: 'anger',         label: 'Anger',         color: '#E36A55', shape: 'octahedron' },
    { id: 'fear',          label: 'Fear',          color: '#B49AD6', shape: 'cube' },
    { id: 'disgust',       label: 'Disgust',       color: '#9CC36E', shape: 'torus' },
    { id: 'anxiety',       label: 'Anxiety',       color: '#F1A04E', shape: 'capsule' },
    { id: 'envy',          label: 'Envy',          color: '#6FC2B3', shape: 'egg' },
    { id: 'embarrassment', label: 'Embarrassed',   color: '#F0A6B5', shape: 'halfcube' },
    { id: 'ennui',         label: 'Ennui',         color: '#A8A5BD', shape: 'disk' },
]

const INTENSITIES = [
    { value: 1, label: 'whisper' },
    { value: 2, label: 'talking' },
    { value: 3, label: 'loud' },
    { value: 4, label: 'running the show' },
]

// Cause chips per docs/mood-journaling.md §Step 3. Order matches the spec
// (left→right, top→bottom). Labels are surface-facing; ids match the locked
// MoodPin.cause union so persistence-day doesn't need a remap.
const CAUSES = [
    { id: 'school',       label: 'school' },
    { id: 'friends',      label: 'friends' },
    { id: 'family',       label: 'family' },
    { id: 'social',       label: 'social media' },
    { id: 'body',         label: 'body' },
    { id: 'achievement',  label: 'achievement' },
    { id: 'uncertainty',  label: 'uncertainty' },
    { id: 'alone',        label: 'alone time' },
    { id: 'gratitude',    label: 'gratitude' },
    { id: 'other',        label: 'something else' },
]

// Inline-SVG primitives for each shape — shaded with light/mid/dark tones of
// the emotion colour so the tile reads as a low-poly object, not an emoji.
// Each takes a single 0xRRGGBB hex; returns the SVG element markup.
const lighten = (hex, amt) =>
{
    const h = hex.replace('#', '')
    let r = parseInt(h.slice(0, 2), 16)
    let g = parseInt(h.slice(2, 4), 16)
    let b = parseInt(h.slice(4, 6), 16)
    r = Math.round(r + (255 - r) * amt)
    g = Math.round(g + (255 - g) * amt)
    b = Math.round(b + (255 - b) * amt)
    return `rgb(${r},${g},${b})`
}
const darken = (hex, amt) =>
{
    const h = hex.replace('#', '')
    let r = parseInt(h.slice(0, 2), 16)
    let g = parseInt(h.slice(2, 4), 16)
    let b = parseInt(h.slice(4, 6), 16)
    r = Math.round(r * (1 - amt))
    g = Math.round(g * (1 - amt))
    b = Math.round(b * (1 - amt))
    return `rgb(${r},${g},${b})`
}

export const shapeSvg = (shape, color) =>
{
    const light = lighten(color, 0.18)
    const mid   = color
    const dark  = darken(color, 0.22)
    switch(shape)
    {
        case 'sphere':
            return `<svg viewBox="0 0 100 100"><circle cx="50" cy="55" r="32" fill="${dark}"/><circle cx="50" cy="50" r="28" fill="${mid}"/><circle cx="40" cy="40" r="12" fill="${light}"/></svg>`
        case 'teardrop':
            return `<svg viewBox="0 0 100 100"><path d="M50 18 L72 70 A24 24 0 1 1 28 70 Z" fill="${mid}"/><path d="M50 18 L62 50 A14 14 0 0 1 38 56 Z" fill="${light}"/><path d="M50 18 L72 70 A24 24 0 0 1 50 88 Z" fill="${dark}"/></svg>`
        case 'octahedron':
            return `<svg viewBox="0 0 100 100"><path d="M50 14 L84 50 L50 86 L16 50 Z" fill="${dark}"/><path d="M50 14 L84 50 L50 50 Z" fill="${light}"/><path d="M50 14 L16 50 L50 50 Z" fill="${mid}"/><path d="M50 86 L84 50 L50 50 Z" fill="${dark}"/><path d="M50 86 L16 50 L50 50 Z" fill="${mid}"/></svg>`
        case 'cube':
            return `<svg viewBox="0 0 100 100"><path d="M22 30 L50 18 L78 30 L78 70 L50 82 L22 70 Z" fill="${dark}"/><path d="M22 30 L50 18 L50 58 L22 70 Z" fill="${mid}"/><path d="M50 18 L78 30 L78 70 L50 58 Z" fill="${dark}"/><path d="M22 30 L50 42 L78 30 L50 18 Z" fill="${light}"/></svg>`
        case 'torus':
            return `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="55" rx="34" ry="14" fill="${dark}"/><ellipse cx="50" cy="50" rx="34" ry="14" fill="${mid}"/><ellipse cx="50" cy="50" rx="14" ry="6" fill="${dark}"/><ellipse cx="40" cy="44" rx="6" ry="3" fill="${light}"/></svg>`
        case 'capsule':
            return `<svg viewBox="0 0 100 100"><rect x="36" y="18" width="28" height="64" rx="14" fill="${dark}"/><rect x="36" y="18" width="14" height="64" rx="7" fill="${mid}"/><rect x="38" y="22" width="6" height="50" rx="3" fill="${light}"/></svg>`
        case 'egg':
            return `<svg viewBox="0 0 100 100"><path d="M50 16 C68 16 80 38 80 60 C80 76 66 86 50 86 C34 86 20 76 20 60 C20 38 32 16 50 16 Z" transform="rotate(15 50 50)" fill="${mid}"/><path d="M50 16 C58 16 65 22 70 32" transform="rotate(15 50 50)" fill="${light}" stroke="${light}" stroke-width="6" stroke-linecap="round"/></svg>`
        case 'halfcube':
            return `<svg viewBox="0 0 100 100"><path d="M22 30 L50 18 L78 30 L78 70 L50 82 L22 70 Z" fill="${dark}" opacity="0.5"/><path d="M50 30 L78 30 L78 70 L50 82 Z" fill="${mid}"/><path d="M50 30 L78 30 L78 50 L50 42 Z" fill="${light}"/></svg>`
        case 'disk':
            return `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="58" rx="36" ry="10" fill="${dark}"/><ellipse cx="50" cy="54" rx="36" ry="10" fill="${mid}"/><ellipse cx="44" cy="52" rx="14" ry="3" fill="${light}"/></svg>`
        default:
            return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="${mid}"/></svg>`
    }
}

export default class MoodSheet
{
    constructor()
    {
        this.state = State.getInstance()
        this.dayCycle = this.state.day
        this.moodPins = this.state.moodPins

        const root = document.createElement('div')
        root.className = 'mood-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="mood-sheet__close" type="button" aria-label="Back">×</button>
            <div class="mood-sheet__header">
                <span class="mood-sheet__dots" aria-hidden="true"><span class="is-on"></span><span></span><span></span></span>
                <span class="mood-sheet__privacy">Only you</span>
            </div>
            <div class="mood-sheet__step is-active" data-step="emotion">
                <h2 class="mood-sheet__title">Who's at the console right now?</h2>
                <p class="mood-sheet__sub">Pick the loudest one.</p>
                <div class="mood-sheet__grid">
                    ${EMOTIONS.map((e) => `
                        <button type="button" class="mood-tile" data-emotion="${e.id}">
                            <span class="mood-tile__shape">${shapeSvg(e.shape, e.color)}</span>
                            <span class="mood-tile__label">${e.label}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="mood-sheet__step" data-step="intensity">
                <h2 class="mood-sheet__title">How loud?</h2>
                <p class="mood-sheet__sub">Tap to save.</p>
                <div class="mood-sheet__intensities">
                    ${INTENSITIES.map((i) => `
                        <button type="button" class="intensity-tile" data-intensity="${i.value}">
                            <span class="intensity-tile__dots" data-count="${i.value}">${'<span></span>'.repeat(i.value)}</span>
                            <span class="intensity-tile__label">${i.label}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="mood-sheet__step" data-step="cause">
                <h2 class="mood-sheet__title">Want to add what's behind it?</h2>
                <p class="mood-sheet__sub">Optional — your pin is already saved.</p>
                <div class="mood-sheet__causes">
                    ${CAUSES.map((c) => `
                        <button type="button" class="cause-chip" data-cause="${c.id}">${c.label}</button>
                    `).join('')}
                </div>
                <div class="mood-sheet__skip-row">
                    <button type="button" class="cause-skip">Skip</button>
                </div>
            </div>
        `
        document.body.appendChild(root)
        this.root = root

        this.draft = { emotion: null, intensity: null, pinId: null }

        root.addEventListener('click', (event) =>
        {
            const close = event.target.closest('.mood-sheet__close')
            if(close) { this._onBack(); return }

            // Read-only mode: only the × can fire, everything else is inert.
            if(this.readOnly) return

            const moodTile = event.target.closest('.mood-tile')
            if(moodTile) { this._pickEmotion(moodTile.dataset.emotion); return }

            const intensityTile = event.target.closest('.intensity-tile')
            if(intensityTile) { this._pickIntensity(parseInt(intensityTile.dataset.intensity, 10)); return }

            const causeChip = event.target.closest('.cause-chip')
            if(causeChip) { this._pickCause(causeChip.dataset.cause); return }

            const skip = event.target.closest('.cause-skip')
            // Skip during the cause step has already committed the pin —
            // dismiss the whole capture flow rather than backtracking.
            if(skip) { this.close(); return }
        })

        // Escape mirrors the × — go back to the chooser, not dismiss.
        document.addEventListener('keydown', (event) =>
        {
            if(this.isOpen && event.key === 'Escape') this._onBack()
        })
    }

    open({ readOnly, pin } = {})
    {
        this.readOnly = !!readOnly
        this.root.classList.toggle('is-read-only', this.readOnly)
        this.draft = { emotion: null, intensity: null, pinId: null }

        if(this.readOnly && pin)
        {
            // Replay-mode: pre-fill the highlight rings on the pin's
            // emotion and intensity, leave the cause chip un-highlighted
            // unless the pin had one. The user can only close from here.
            this.draft.emotion   = pin.emotion
            this.draft.intensity = pin.intensity
            this._setStep('cause')
            for(const el of this.root.querySelectorAll('.mood-tile'))
                el.classList.toggle('is-picked', el.dataset.emotion === pin.emotion)
            for(const el of this.root.querySelectorAll('.intensity-tile'))
                el.classList.toggle('is-picked', parseInt(el.dataset.intensity, 10) === pin.intensity)
            if(pin.cause)
            {
                for(const el of this.root.querySelectorAll('.cause-chip'))
                    el.classList.toggle('is-picked', el.dataset.cause === pin.cause)
            }
        }
        else
        {
            this._setStep('emotion')
        }

        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
        this.isOpen = false
        // Wipe any highlight rings so the next open is a clean slate.
        for(const el of this.root.querySelectorAll('.is-picked'))
            el.classList.remove('is-picked')
        OverlayController.getInstance().noteClosed('mood')
    }

    _onBack()
    {
        // Read-only replay has no chooser to return to.
        if(this.readOnly) { this.close(); return }
        // Route back to the chooser; OverlayController closes this sheet
        // as part of the exclusive-surface swap.
        OverlayController.getInstance().open('chooser')
    }

    _pickEmotion(emotion)
    {
        this.draft.emotion = emotion
        for(const el of this.root.querySelectorAll('.mood-tile'))
            el.classList.toggle('is-picked', el.dataset.emotion === emotion)
        // Auto-advance to intensity after a brief highlight beat.
        setTimeout(() => this._setStep('intensity'), 220)
    }

    _pickIntensity(intensity)
    {
        this.draft.intensity = intensity
        for(const el of this.root.querySelectorAll('.intensity-tile'))
            el.classList.toggle('is-picked', parseInt(el.dataset.intensity, 10) === intensity)
        // Save on intensity tap (no extra button — speed is the design).
        this._save()
    }

    _pickCause(cause)
    {
        // Highlight then patch + close. Pin already exists; this is a patch.
        for(const el of this.root.querySelectorAll('.cause-chip'))
            el.classList.toggle('is-picked', el.dataset.cause === cause)
        if(this.draft.pinId) this.moodPins.patch(this.draft.pinId, { cause })
        setTimeout(() => this.close(), 260)
    }

    _save()
    {
        if(!this.draft.emotion || !this.draft.intensity) return
        const pin = this.moodPins.add({
            emotion: this.draft.emotion,
            intensity: this.draft.intensity,
        })
        this.draft.pinId = pin.id
        this.dayCycle.setMood(this.draft.emotion)
        // Pivot to step 3 (cause) — the world has already reacted; offering
        // a cause is the second-thought patch, not a save gate.
        setTimeout(() => this._setStep('cause'), 320)
    }

    _setStep(step)
    {
        const steps = this.root.querySelectorAll('.mood-sheet__step')
        for(const el of steps)
            el.classList.toggle('is-active', el.dataset.step === step)
        // Header dots: emotion → emotion+intensity → all three. The dot
        // count matches the locked spec mock (● ○ ○).
        const dots = this.root.querySelectorAll('.mood-sheet__dots > span')
        dots[0].classList.toggle('is-on', true)
        dots[1].classList.toggle('is-on', step === 'intensity' || step === 'cause')
        dots[2].classList.toggle('is-on', step === 'cause')
    }
}
