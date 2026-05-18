/**
 * Stripped 1-step mood capture. Reuses EMOTIONS + shapeSvg from MoodSheet
 * so the 9 IO2 tiles stay in lockstep visually with the canonical mood
 * journal. Skips the intensity step (defaults to 2 = "talking") and the
 * cause step (post-save patch in MoodSheet; absent here).
 *
 * On tap: state.moodPins.add({ emotion, intensity: 2 }), record the new
 * pin id on the onboarding slice, tint the sky via day.setMood, swap the
 * bubble to the acknowledgement line, then advance to 'first-grow'.
 */

import { EMOTIONS, shapeSvg } from '../MoodSheet.js'
import { wait } from '../../util/timing.js'
import { escapeHtml } from '../../util/html.js'

const ENTER_MS      = 320
const EXIT_MS       = 240
const PICK_HOLD_MS  = 1200   // hold bubble on the ack line before advancing
const PATIENCE_MS   = 60_000 // soft fallback line if the student stalls

export default class FirstMood
{
    constructor(flow)
    {
        this.flow = flow
        this._el = null
        this._advance = null
        this._patienceTimer = null
        this._aborted = false
        this._committed = false
    }

    setAdvance(cb) { this._advance = cb }

    async mount(root, ctx)
    {
        const tiles = EMOTIONS.map((e, i) => `
            <button type="button" class="onb-firstmood__tile mood-tile" data-emotion="${e.id}"
                    tabindex="${i === 0 ? 0 : -1}"
                    aria-label="${escapeHtml(e.label)}">
                <span class="onb-firstmood__shape mood-tile__shape">${shapeSvg(e.shape, e.color)}</span>
                <span class="onb-firstmood__label mood-tile__label">${escapeHtml(e.label)}</span>
            </button>
        `).join('')

        const el = document.createElement('div')
        el.className = 'onb-firstmood'
        el.innerHTML = `
            <div class="onb-firstmood__sheen" aria-hidden="true"></div>
            <div class="onb-firstmood__panel">
                <h2 class="onb-firstmood__title">${escapeHtml(ctx.copy.firstMood.title)}</h2>
                <p class="onb-firstmood__sub">${escapeHtml(ctx.copy.firstMood.sub)}</p>
                <div class="onb-firstmood__grid" role="radiogroup" aria-label="${escapeHtml(ctx.copy.firstMood.title)}">${tiles}</div>
            </div>
        `
        root.appendChild(el)
        this._el = el

        el.addEventListener('click', (e) =>
        {
            const tile = e.target.closest('.onb-firstmood__tile')
            if(!tile || this._committed) return
            this._onPick(tile.dataset.emotion, ctx)
        })

        // 3×3 grid arrow nav. Arrow keys move focus + roving tabindex;
        // space/enter commits. Wrap-around so the user can't dead-end at
        // a corner.
        el.addEventListener('keydown', (e) =>
        {
            const tile = e.target.closest('.onb-firstmood__tile')
            if(!tile || this._committed) return
            const key = e.key
            if(key === ' ' || key === 'Enter')
            {
                e.preventDefault()
                this._onPick(tile.dataset.emotion, ctx)
                return
            }
            let step = 0
            if(key === 'ArrowLeft')       step = -1
            else if(key === 'ArrowRight') step =  1
            else if(key === 'ArrowUp')    step = -3
            else if(key === 'ArrowDown')  step =  3
            if(!step) return
            e.preventDefault()
            const list = Array.from(this._el.querySelectorAll('.onb-firstmood__tile'))
            const i = list.indexOf(tile)
            if(i < 0) return
            const next = list[(i + step + list.length) % list.length]
            for(const node of list) node.tabIndex = (node === next) ? 0 : -1
            next.focus()
        })

        if(!ctx.reducedMotion)
        {
            // eslint-disable-next-line no-unused-expressions
            el.offsetWidth
            el.classList.add('is-visible')
            await wait(ENTER_MS)
        }
        else
        {
            el.classList.add('is-visible')
        }

        // Soft fallback — Kira speaks a patience line if the student stalls.
        this._patienceTimer = setTimeout(() =>
        {
            if(this._committed || this._aborted) return
            ctx.view.kiraDialogue?.sayOnboarding?.(ctx.copy.kira.firstMoodPatience)
        }, PATIENCE_MS)
    }

    async unmount()
    {
        this._aborted = true
        if(this._patienceTimer) { clearTimeout(this._patienceTimer); this._patienceTimer = null }
        if(!this._el) return
        const el = this._el
        this._el = null
        el.classList.remove('is-visible')
        el.classList.add('is-leaving')
        await wait(EXIT_MS)
        el.remove()
    }

    async _onPick(emotionId, ctx)
    {
        const emotion = EMOTIONS.find((e) => e.id === emotionId)
        if(!emotion) return
        this._committed = true
        if(this._patienceTimer) { clearTimeout(this._patienceTimer); this._patienceTimer = null }

        // Highlight the picked tile briefly.
        const tile = this._el?.querySelector(`.onb-firstmood__tile[data-emotion="${emotionId}"]`)
        if(tile) tile.classList.add('is-picked')

        // Commit the pin. Intensity defaults to 2 ("talking") — the
        // onboarding skips the intensity question by design.
        const pin = ctx.moodPins.add({ emotion: emotionId, intensity: 2 })
        if(pin?.id) ctx.onboarding.setFirstMoodPinId(pin.id)

        // Sky-bottom tint via the canonical mood path.
        ctx.state?.day?.setMood?.(emotionId)

        // Kira acknowledges, then we advance.
        ctx.view.kiraDialogue?.sayOnboarding?.(ctx.copy.kira.firstMoodAck)

        await wait(ctx.reducedMotion ? 80 : PICK_HOLD_MS)
        if(this._aborted) return
        this._advance?.('first-grow')
    }
}

