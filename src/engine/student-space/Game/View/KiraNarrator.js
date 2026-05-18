import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import OverlayController from './OverlayController.js'

/**
 * KiraNarrator — Animal-Crossing-style mediated dialogue.
 *
 * When the student picks an island element (tree / flower / Kira herself),
 * the camera zooms in on Kira and a large bottom-screen bubble appears
 * with a yellow "Kira" name tag and a short observation in her voice. A
 * CTA button at the bottom-right of the bubble hands off to the compact
 * facet card; closing the bubble (× or tap-outside) restores the camera.
 *
 * Distinct from `KiraDialogue` (the small floating greeting/invite bubble
 * pinned over Kira's head); when narrate mode is active the ambient
 * bubble is suppressed and only the AC-style panel shows.
 */
const TREE_NARRATION = {
    oak: {
        text: 'That one is an oak. They take their time — they hold the things you keep coming back to. Want me to show you what this oak is rooted in?',
        cta:  'Show me',
    },
    cherry: {
        text: 'A cherry. Those grow around values that are still becoming — something you’ve only said once or twice. I’ve been watching this one.',
        cta:  'Tell me more',
    },
}

const FLOWER_NARRATION = {
    daisy:    { text: 'A daisy — small interest in motion. They open with attention and close when you look away. Curious about this one?',           cta: 'Open' },
    tulip:    { text: 'A tulip. Held close, like a secret. Sometimes the interests we don’t share yet are the ones that matter most.',                cta: 'Open' },
    rose:     { text: 'A rose. Interests with layers — practice, return, prune. The reward is the time you put in.',                                   cta: 'Open' },
    lily:     { text: 'A lily. Generous, reaching. These are the interests that pull other people in — making, sharing, performing.',                  cta: 'Open' },
    pansy:    { text: 'A pansy. Curious, watching. Interests that are mostly about noticing — reading, observing, taking small notes.',                cta: 'Open' },
    hyacinth: { text: 'A hyacinth. Quiet build of attention — small noticings stacked over time, becoming something tall.',                            cta: 'Open' },
}

const FRUIT_NARRATION = {
    apple:  { text: 'An apple — a practical skill. The kind of thing that gets done when nobody’s watching.',         cta: 'Open' },
    pear:   { text: 'A pear — analytical. Slicing a problem until the shape underneath shows.',                       cta: 'Open' },
    plum:   { text: 'A plum — something you’ve made where the path wasn’t drawn for you.',                            cta: 'Open' },
    fig:    { text: 'A fig — reading people. Knowing what to say and when to leave it alone.',                        cta: 'Open' },
    citrus: { text: 'A citrus — leading. Setting direction, then carrying the weight of it.',                          cta: 'Open' },
    berry:  { text: 'A berry — saying what you mean, in the register the listener needs.',                            cta: 'Open' },
}

const KIRA_NARRATION = {
    text: 'It’s me. If anything is on your mind, I’m here. Say it however feels easier, written or out loud.',
    cta:  'Talk to me',
}

// Mailbox + telescope narration used to live here too, but their
// peek-then-companion flow now runs through ObjectPeek. KiraNarrator only
// handles single-bubble AC dialogue for kira/trees/fruits.

function speciesIdOf(target)
{
    const raw = target?.species
    if(typeof raw === 'string') return raw
    return raw?.id ?? raw?.species ?? ''
}

function narrationFor(target)
{
    if(target.kind === 'kira') return KIRA_NARRATION
    const sp = speciesIdOf(target)
    if(target.kind === 'tree')   return TREE_NARRATION[sp]   ?? { text: 'A tree.',   cta: 'Open' }
    if(target.kind === 'flower') return FLOWER_NARRATION[sp] ?? { text: 'A flower.', cta: 'Open' }
    if(target.kind === 'fruit')  return FRUIT_NARRATION[sp]  ?? { text: 'A fruit — a skill ripening.', cta: 'Open' }
    return { text: '...', cta: 'Open' }
}

const ZOOM_DURATION = 600

// Typewriter cadence — matches the ambient bubble so Kira's voice has a
// single consistent texture across both surfaces.
const TYPER_BASE_MS  = 32
const TYPER_COMMA_MS = 140
const TYPER_STOP_MS  = 220
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default class KiraNarrator
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()

        const root = document.createElement('div')
        root.className = 'kira-dialogue'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <div class="kira-dialogue__name">Kira</div>
            <button class="kira-dialogue__close" type="button" aria-label="Close">×</button>
            <div class="kira-dialogue__body">
                <p class="kira-dialogue__text"></p>
                <div class="kira-dialogue__row">
                    <button class="kira-dialogue__cta" type="button">Open <span aria-hidden="true">→</span></button>
                </div>
            </div>
        `
        document.body.appendChild(root)
        this.root = root
        this.textEl  = root.querySelector('.kira-dialogue__text')
        this.ctaEl   = root.querySelector('.kira-dialogue__cta')
        this.closeEl = root.querySelector('.kira-dialogue__close')

        this.isActive = false
        this.target   = null
        this.tmpVec   = new THREE.Vector3()
        this.typerId  = 0

        // Kira yaw animation — narrator-driven. Kira's body has a fixed
        // resting yaw set in Kira.js; while a narration is active we tween
        // her to face the camera, then back on close. This lives here (not
        // in Kira.js) because the lookAt target depends on the camera
        // destination the narrator chose.
        this._kiraTurn = null
        this._kiraRestYaw = null

        this.ctaEl.addEventListener('click', () => this._confirm())
        this.closeEl.addEventListener('click', () => this.close())
        // Document keydown survives root removal; held on `this` so dispose
        // can detach it.
        this._onKeyDown = (event) =>
        {
            if(this.isActive && event.key === 'Escape') this.close()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Drops the page-level
     * keydown listener, cancels any in-flight typewriter (so its setTimeout
     * chain self-cancels on the next tick), and detaches the bubble root.
     * The Kira yaw tween is on `update()` and ends when its mode resolves —
     * no setTimeout id to clear.
     */
    dispose()
    {
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        // Bumping the id makes any queued _scheduleType callback short-
        // circuit instead of touching torn-down elements.
        this.typerId += 1
        this._kiraTurn = null
        this._kiraRestYaw = null
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.textEl = null
        this.ctaEl = null
        this.closeEl = null
    }

    narrate(target)
    {
        if(!target) return
        this.target = target

        const narration = narrationFor(target)
        this.ctaEl.firstChild.textContent = narration.cta + ' '
        // Defer the typewriter until after the bubble slide-in (180ms below)
        // so the characters don't start ticking against a still-hidden bubble.
        this._scheduleType(narration.text, 260)

        // Suppress the ambient floating bubble so we don't double up.
        if(this.view.kiraDialogue) this.view.kiraDialogue.hide()
        // Dismiss any open compact card so the dialogue beat owns the foreground.
        if(this.view.facetView && this.view.facetView.isOpen) this.view.facetView.close()
        // Hide the hover signifier set during the click.
        if(this.view.hoverCta)   this.view.hoverCta.hide()
        if(this.view.hoverProbe) this.view.hoverProbe.setEnabled(false)

        // Frame Kira in the upper half of the screen, looking at her chest.
        // Vantage is along the student's CURRENT view direction (the
        // ground-projected camera→Kira ray), pulled close, and lifted
        // slightly. That way the camera just glides in from where the
        // student is already looking — no surprise side-swing — and Kira
        // can rotate to face them dead-on for the AC-style face-shot.
        const kira = this.view.kira
        const perch = kira.group.position
        const liveCam = this.view.camera.instance.position
        const fromKiraDx = liveCam.x - perch.x
        const fromKiraDz = liveCam.z - perch.z
        const flatLen = Math.hypot(fromKiraDx, fromKiraDz) || 1
        const unitX = fromKiraDx / flatLen
        const unitZ = fromKiraDz / flatLen
        const dist  = 2.6
        const lift  = 1.05
        const camPos = new THREE.Vector3(
            perch.x + unitX * dist,
            perch.y + lift,
            perch.z + unitZ * dist,
        )
        // Frame at chest height of the standing build (~0.85 above the
        // feet at the ~0.81 group scale). The old short Kira sat at 0.35;
        // keeping that for the taller bird put the framing at her belly.
        const camLook = new THREE.Vector3(perch.x, perch.y + 0.85, perch.z)
        this.view.camera.zoomTo(camPos, camLook, ZOOM_DURATION)

        // Turn Kira to face the destination camera position. The standing
        // build (Flame Bower) is authored with head/beak along local +X,
        // so the yaw that aims +X at (unitX, unitZ) is atan2(-unitZ, unitX).
        // Animated by update() over ZOOM_DURATION.
        if(this._kiraRestYaw === null) this._kiraRestYaw = kira.group.rotation.y
        const targetYaw = Math.atan2(-unitZ, unitX)
        this._kiraTurn = {
            mode: 'in',
            startTime: performance.now(),
            from: kira.group.rotation.y,
            to:   targetYaw,
            duration: ZOOM_DURATION,
        }

        // Bubble slides up just after the zoom starts so the motion feels
        // staged rather than simultaneous-noisy.
        setTimeout(() =>
        {
            this.root.classList.add('is-open')
            this.root.setAttribute('aria-hidden', 'false')
        }, 180)
        this.isActive = true
    }

    _scheduleType(text, delay = 0)
    {
        this.typerId += 1
        const myId = this.typerId
        if(reduceMotion)
        {
            this.textEl.textContent = text
            return
        }
        this.textEl.textContent = ''
        let i = 0
        const step = () =>
        {
            if(myId !== this.typerId) return
            if(i >= text.length) return
            const ch = text[i]
            this.textEl.textContent += ch
            i += 1
            const next = ch === '.' || ch === '?' || ch === '!' ? TYPER_STOP_MS
                : ch === ',' || ch === ';' || ch === ':' || ch === '—' ? TYPER_COMMA_MS
                : TYPER_BASE_MS
            setTimeout(step, next)
        }
        setTimeout(step, delay)
    }

    _confirm()
    {
        const target = this.target
        this.close()
        if(!target) return
        // Small delay across all branches so the camera restore + bubble
        // close finish before the next surface slides up; otherwise the
        // framing feels juddery.
        if(target.kind === 'kira')
        {
            // "Talk to me" CTA → open the AskSheet so the student can
            // type or talk via mic, same flow the capture chooser uses
            // for Open chat. dismissOnBack=true so the × on AskSheet
            // returns to the island instead of detouring through the
            // capture chooser (which the student never opened).
            setTimeout(() => OverlayController.getInstance().open('ask', {
                prompt: 'Tell me anything.',
                dismissOnBack: true,
            }), 280)
            return
        }
        if(this.view.facetView)
            setTimeout(() => this.view.facetView.openFor(target), 280)
    }

    close()
    {
        if(!this.isActive) return
        this.isActive = false
        this.typerId += 1               // cancel any in-flight typewriter
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
        this.view.camera.restoreZoom(ZOOM_DURATION)

        // Turn Kira back to her resting yaw alongside the camera restore.
        if(this._kiraRestYaw !== null)
        {
            this._kiraTurn = {
                mode: 'out',
                startTime: performance.now(),
                from: this.view.kira.group.rotation.y,
                to:   this._kiraRestYaw,
                duration: ZOOM_DURATION,
            }
        }

        // Re-arm hover only after the camera has finished restoring, so the
        // probe doesn't show a chip mid-tween.
        setTimeout(() =>
        {
            if(this.view.hoverProbe) this.view.hoverProbe.setEnabled(true)
        }, ZOOM_DURATION + 80)
    }

    update()
    {
        const turn = this._kiraTurn
        if(!turn) return
        const t = Math.min(1, (performance.now() - turn.startTime) / turn.duration)
        // smootherstep so Kira's neck-turn matches the camera's ease curve.
        const eased = t * t * t * (t * (t * 6 - 15) + 10)
        // Shortest signed angle from-to (in (-π, π]) so she rotates the
        // short way around the circle.
        let delta = turn.to - turn.from
        delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        this.view.kira.group.rotation.y = turn.from + delta * eased
        if(t >= 1)
        {
            this._kiraTurn = null
            if(turn.mode === 'out') this._kiraRestYaw = null
        }
    }
}
