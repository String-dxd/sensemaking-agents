import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Kira's voice. Two of the three locked modes from docs/companion-bird.md:
 *   - Greeting (time-of-day-aware, fires once per session on first arrival)
 *   - Inviting (observation-first, after ~45s home-idle, max 1 per session)
 *
 * Naming-back lives in a later phase — it depends on captures that route
 * through the value/skill/interest planting flow, which isn't in v1 yet.
 *
 * Soft-mode heuristic (docs/mood-journaling.md §Soft-mode): if ≥3 of the
 * last 7 mood pins are inward-coded (anxiety/sadness/ennui) Kira swaps
 * to a quieter inviting subset. Silent — the student should feel the
 * change without it being announced. Pins live in memory only, so the
 * 24-hour spec window collapses naturally to "for this session".
 *
 * Implementation: a CSS speech bubble pinned to Kira's screen-space position
 * each frame. Bubble follows her even as the camera orbits. Tap or wait —
 * the bubble dismisses on click or after a 12s soft timeout, matching the
 * spec's "held until reply or 12s" rule.
 */

const GREETINGS = {
    morning: [
        "You're back. The island's been quiet.",
        "Morning. The wind's from the east today.",
    ],
    afternoon: [
        "Good — I was hoping you'd come by.",
        "The fruit on the southwest tree is heavier than yesterday.",
    ],
    evening: [
        "Late one. I'll keep my voice down.",
        "Hey. The light's getting soft.",
    ],
    any: [
        "Settling in?",
        "Take your time. I'll be on the branch.",
    ],
}

// First-arrival greetings, fired only while `state.coldStart.active` is
// true — the twilight pin window. Different beat from the time-banded
// returner lines: this is the student's first time on the island, the
// ground is still bare, Kira is the only thing here.
const FIRST_ARRIVAL_GREETINGS = [
    "There you are. I've been on this branch a while.",
    "Welcome. The island's quiet — but it's listening.",
    "The sky was waiting for someone. That's you.",
    "Take a look around. Nothing's growing yet, and that's okay.",
]

const INVITES = [
    "Anything pull at you today?",
    "What was the loudest part of today?",
    "If you had to describe today as a kind of weather — what would it be?",
    "Something stuck with you. I can usually tell. What was it?",
    "Small thing. Big thing. Either's fine.",
    "Did anything surprise you today?",
    "Anything you'd want me to remember?",
    "What did you do that felt like *you*?",
    "If today had a color, what would it be?",
    "Heavy day or light one?",
]

// Soft prompts per docs/mood-journaling.md §Soft-mode. Quieter, fewer
// questions, no asking for output. Used when the recent pin window is
// inward-coded (anxiety / sadness / ennui).
const SOFT_INVITES = [
    "Quiet day. That's okay.",
    "I'm not asking anything today.",
    "Just here if you want company.",
    "The wind's gentle today.",
    "Take your time. I'll be on the branch.",
    "We can both just sit for a bit.",
    "I noticed. That's all.",
]

const INWARD_EMOTIONS = new Set(['anxiety', 'sadness', 'ennui'])
const SOFT_MODE_PIN_WINDOW = 7
const SOFT_MODE_THRESHOLD  = 3

const HOLD_MS  = 12_000   // auto-dismiss after 12s if no reply
const IDLE_MS  = 45_000   // first invite fires 45s after last activity

// Typewriter cadence — Animal-Crossing-style chat reveal. ~32 chars/sec with
// soft pauses on punctuation. Respects prefers-reduced-motion (full text
// is set instantly for those users).
const TYPER_BASE_MS  = 32
const TYPER_COMMA_MS = 140
const TYPER_STOP_MS  = 220
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default class KiraDialogue
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.dayCycle = this.state.day
        this.kira = this.view.kira

        this.bubble = document.createElement('div')
        this.bubble.className = 'kira-bubble'
        this.bubble.setAttribute('aria-hidden', 'true')
        this.bubble.innerHTML = '<span class="kira-bubble__text"></span>'
        document.body.appendChild(this.bubble)
        this.textEl = this.bubble.querySelector('.kira-bubble__text')

        // Held on `this` so dispose() can detach. The bubble-attached click
        // would be GC'd with the detached bubble, but the THREE window-level
        // activity listeners definitely outlive root removal.
        this._onBubbleClick = () => this.hide()
        this.bubble.addEventListener('click', this._onBubbleClick)

        this.spoken = 0           // count of lines this session (cap = 2)
        this.invited = false      // max 1 inviting_reflection per session
        this.activeUntil = 0
        this.lastActivity = performance.now()
        this.typerId = 0          // bumped per show() so old typers self-cancel
        this._lastSay = 0         // cooldown stamp for the event-triggered channel

        // Onboarding bypass — when active, the autonomous greet/invite path
        // is suppressed and the OnboardingFlow drives the bubble via
        // sayOnboarding(). The session caps reset on entry and exit so the
        // post-ceremony autonomous channel starts fresh.
        this.onboardingMode = false

        // Track any meaningful student activity for the idle counter. Use a
        // single shared handler and remember it for dispose() — the previous
        // pattern attached three independent anonymous closures per remount.
        this._activityEvents = ['pointerdown', 'keydown', 'wheel']
        this._onActivity = () => { this.lastActivity = performance.now() }
        for(const evt of this._activityEvents)
            window.addEventListener(evt, this._onActivity)

        this.worldPos = new THREE.Vector3()
        this.screenPos = new THREE.Vector3()

        // Greet on first arrival — 1.4s delay so the world has time to settle.
        // The timer id is held so dispose() can cancel it if teardown lands
        // before the greet fires (otherwise the greet would touch a torn-down
        // bubble and log a benign error).
        this._greetTimerId = setTimeout(() => this._greet(), 1400)
    }

    /**
     * Tear-down hook called from View.dispose(). Removes the three window-
     * level activity listeners (the leak risk that survives bubble removal)
     * and cancels the deferred greet timer.
     */
    dispose()
    {
        if(this._greetTimerId != null)
        {
            try { clearTimeout(this._greetTimerId) } catch(_) {}
            this._greetTimerId = null
        }
        if(this._onActivity && this._activityEvents)
        {
            for(const evt of this._activityEvents)
            {
                try { window.removeEventListener(evt, this._onActivity) } catch(_) {}
            }
            this._onActivity = null
            this._activityEvents = null
        }
        if(this._onBubbleClick && this.bubble)
        {
            try { this.bubble.removeEventListener('click', this._onBubbleClick) } catch(_) {}
            this._onBubbleClick = null
        }
        try { this.bubble?.remove?.() } catch(_) {}
        this.bubble = null
        this.textEl = null
    }

    _hourBand(hour)
    {
        if(hour < 12) return 'morning'
        if(hour < 17.5) return 'afternoon'
        return 'evening'
    }

    _greet()
    {
        if(this.onboardingMode) return    // orchestrator owns the bubble
        if(this.spoken >= 2) return
        // First-arrival ceremony has its own line set — the regular time-band
        // greetings are for returners. Cold-start.active stays true for the
        // twilight pin window so the greeting fires during the ritual.
        if(this.state.coldStart?.active)
        {
            const line = FIRST_ARRIVAL_GREETINGS[Math.floor(Math.random() * FIRST_ARRIVAL_GREETINGS.length)]
            this.show(line)
            return
        }
        const hour = this.dayCycle.hour
        const band = this._hourBand(hour)
        const lines = GREETINGS[band] || GREETINGS.any
        const line = lines[Math.floor(Math.random() * lines.length)]
        this.show(line)
    }

    _invite()
    {
        if(this.spoken >= 2 || this.invited) return
        this.invited = true
        const pool = this._isSoftMode() ? SOFT_INVITES : INVITES
        const line = pool[Math.floor(Math.random() * pool.length)]
        this.show(line)
    }

    _isSoftMode()
    {
        const recent = this.state.moodPins.recent(SOFT_MODE_PIN_WINDOW)
        let inward = 0
        for(const p of recent) if(INWARD_EMOTIONS.has(p.emotion)) inward += 1
        return inward >= SOFT_MODE_THRESHOLD
    }

    show(text)
    {
        this.bubble.classList.add('is-visible')
        this.bubble.setAttribute('aria-hidden', 'false')
        this.activeUntil = performance.now() + HOLD_MS
        this.spoken += 1
        this._type(text)
    }

    /**
     * Event-triggered speech — bypasses the per-session cap because it's
     * the world reacting to a real moment (sky event, weather change),
     * not Kira proactively chatting. A short cooldown prevents the bubble
     * from re-triggering when the student rapid-clicks a switch.
     */
    say(text, { cooldown = 3500 } = {})
    {
        const now = performance.now()
        if(now - this._lastSay < cooldown) return
        this._lastSay = now
        this.bubble.classList.add('is-visible')
        this.bubble.setAttribute('aria-hidden', 'false')
        this.activeUntil = now + HOLD_MS
        this._type(text)
    }

    _type(text)
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
            if(myId !== this.typerId) return    // a newer line took over
            if(i >= text.length) return
            const ch = text[i]
            this.textEl.textContent += ch
            i += 1
            const delay = ch === '.' || ch === '?' || ch === '!' ? TYPER_STOP_MS
                : ch === ',' || ch === ';' || ch === ':' || ch === '—' ? TYPER_COMMA_MS
                : TYPER_BASE_MS
            setTimeout(step, delay)
        }
        step()
    }

    hide()
    {
        this.bubble.classList.remove('is-visible')
        this.bubble.setAttribute('aria-hidden', 'true')
        this.activeUntil = 0
    }

    /**
     * Enter / leave onboarding bubble mode. While active, autonomous greet
     * and invite paths short-circuit, and the orchestrator drives the
     * bubble via sayOnboarding(). Counters reset on entry AND exit so the
     * post-ceremony session starts with a clean greet budget.
     */
    setOnboardingMode(active)
    {
        this.onboardingMode = !!active
        this.spoken  = 0
        this.invited = false
        this.lastActivity = performance.now()
        if(active) this.hide()
    }

    /**
     * Orchestrator-driven speech. Bypasses the per-session cap and the 12s
     * auto-dismiss — the bubble holds until the next sayOnboarding() or a
     * clearOnboardingBubble() call. Refuses if not in onboarding mode.
     */
    sayOnboarding(text)
    {
        if(!this.onboardingMode) return
        this.bubble.classList.add('is-visible')
        this.bubble.setAttribute('aria-hidden', 'false')
        this.activeUntil = 0     // disable auto-dismiss
        this._type(text)
    }

    clearOnboardingBubble()
    {
        if(!this.onboardingMode) return
        this.hide()
    }

    update()
    {
        const now = performance.now()

        // Auto-dismiss after 12s soft hold (spec: "held until reply or 12s").
        if(this.activeUntil && now >= this.activeUntil) this.hide()

        // Trigger one inviting reflection at the idle threshold. Suppressed
        // while the onboarding ceremony owns the bubble.
        if(!this.onboardingMode && !this.invited && this.spoken < 2 && now - this.lastActivity > IDLE_MS)
            this._invite()

        // Re-anchor the bubble each frame so it follows Kira when the camera
        // orbits. Project her head world position to screen space; bubble
        // sits just above her with a small upward offset.
        const cam = this.view.camera.instance
        this.kira.getHeadWorldPosition(this.worldPos)
        this.worldPos.y += 0.4 // crown-clearance above the head mesh
        this.screenPos.copy(this.worldPos).project(cam)
        const x = (this.screenPos.x * 0.5 + 0.5) * window.innerWidth
        const y = (-this.screenPos.y * 0.5 + 0.5) * window.innerHeight
        this.bubble.style.transform = `translate(calc(${x | 0}px - 50%), calc(${y | 0}px - 100% - 16px))`
        // Hide if Kira is behind the camera so the bubble doesn't flip to the
        // opposite side of the screen.
        const behind = this.screenPos.z > 1
        this.bubble.style.visibility = behind ? 'hidden' : 'visible'
    }
}
