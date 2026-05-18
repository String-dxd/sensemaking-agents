import State from '../State/State.js'

/**
 * Dev-only mood HUD — a row of nine coloured dots, one per IO2 emotion.
 * Clicking a dot calls `state.day.setMood(emotion)`; the sky-bottom + water
 * shader picks the colour up through DayCycle's mood-bias blend.
 *
 * This is *not* the production mood-pin UI specced in docs/mood-journaling.md
 * (capture-FAB → 3×3 grid → intensity → optional cause/note). It exists so
 * the visual plumbing for Phase 2d can be exercised without building the full
 * capture flow first.
 */
const EMOTIONS = [
    { id: 'joy',           color: '#FFD66B' },
    { id: 'sadness',       color: '#7FB3D9' },
    { id: 'anger',         color: '#E36A55' },
    { id: 'fear',          color: '#B49AD6' },
    { id: 'disgust',       color: '#9CC36E' },
    { id: 'anxiety',       color: '#F1A04E' },
    { id: 'envy',          color: '#6FC2B3' },
    { id: 'embarrassment', color: '#F0A6B5' },
    { id: 'ennui',         color: '#A8A5BD' },
]

export default class MoodHud
{
    constructor()
    {
        this.state = State.getInstance()
        this.dayCycle = this.state.day

        const wrap = document.createElement('div')
        wrap.className = 'mood-hud'
        const dots = EMOTIONS.map((e) => `
            <button
                type="button"
                class="mood-hud__dot"
                data-mood="${e.id}"
                title="${e.id}"
                style="background:${e.color}"
            ></button>`).join('')
        wrap.innerHTML = `
            <span class="mood-hud__label">mood</span>
            <div class="mood-hud__dots">${dots}</div>
            <button class="mood-hud__clear" type="button">clear</button>
        `
        document.body.appendChild(wrap)

        this.root = wrap
        this.dotsWrap = wrap.querySelector('.mood-hud__dots')
        this.clearBtn = wrap.querySelector('.mood-hud__clear')
        this.label    = wrap.querySelector('.mood-hud__label')

        this.dotsWrap.addEventListener('click', (event) =>
        {
            const dot = event.target.closest('.mood-hud__dot')
            if(!dot) return
            const id = dot.dataset.mood
            this.dayCycle.setMood(id)
            this._setActive(id)
        })

        this.clearBtn.addEventListener('click', () =>
        {
            this.dayCycle.clearMood()
            this._setActive(null)
        })

        this._setActive(null)
    }

    /**
     * Tear-down hook. Click listeners are attached to descendants of
     * `this.root`, so detaching the wrap removes them with the tree. No
     * document/window listeners to detach.
     */
    dispose()
    {
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.dotsWrap = null
        this.clearBtn = null
        this.label = null
    }

    _setActive(id)
    {
        for(const dot of this.dotsWrap.querySelectorAll('.mood-hud__dot'))
            dot.classList.toggle('is-active', dot.dataset.mood === id)
        this.label.textContent = id ?? 'mood'
    }

    update()
    {
        if(!this.root) return    // post-dispose tick
        // Auto-clear UI state when the bias expires so the active ring fades
        // out in sync with the sky tint.
        const active = this.root.querySelector('.mood-hud__dot.is-active')
        if(active && !this.dayCycle.moodBias.color)
            this._setActive(null)
    }
}
