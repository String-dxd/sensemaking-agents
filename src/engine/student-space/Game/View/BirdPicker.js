import View from './View.js'
import { SPECIES } from './Kira.js'

/**
 * Bird picker — a small chip in the bottom-left that lets the student try
 * any of the seven bowerbird variants. Click cycles forward; long-press
 * (or right-click) cycles back. Label updates as the species changes.
 *
 * Intentionally lo-fi: this is a "try them out" affordance, not a
 * persistent character-select screen. State is in-memory only — refresh
 * returns to the default (Flame Bower).
 */
export default class BirdPicker
{
    constructor()
    {
        this.view = View.getInstance()
        this.kira = this.view.kira

        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'bird-picker'
        el.setAttribute('aria-label', 'Cycle through bird companions')
        el.innerHTML = `
            <span class="bird-picker__dot" aria-hidden="true"></span>
            <span class="bird-picker__text">
                <span class="bird-picker__eyebrow">Try</span>
                <span class="bird-picker__name"></span>
            </span>
            <span class="bird-picker__chev" aria-hidden="true">↻</span>
        `
        document.body.appendChild(el)
        this.el = el
        this.nameEl = el.querySelector('.bird-picker__name')
        this.dotEl  = el.querySelector('.bird-picker__dot')

        el.addEventListener('click', () => this.kira.cycleSpecies(+1))
        el.addEventListener('contextmenu', (e) =>
        {
            e.preventDefault()
            this.kira.cycleSpecies(-1)
        })

        this._render(this.kira.speciesId)
        // Held for dispose() — onSpeciesChange returns an unsubscribe fn
        // and the closure captures `this`, so we need to drop it.
        this._offSpeciesChange = this.kira.onSpeciesChange(id => this._render(id))
    }

    /**
     * Tear-down hook. Drops the Kira species-change subscription (the
     * captured closure keeps the picker alive otherwise) and detaches the
     * chip. No document/window listeners are registered here.
     */
    dispose()
    {
        if(this._offSpeciesChange)
        {
            try { this._offSpeciesChange() } catch(_) {}
            this._offSpeciesChange = null
        }
        try { this.el?.remove?.() } catch(_) {}
        this.el = null
        this.nameEl = null
        this.dotEl = null
    }

    _render(id)
    {
        if(!this.nameEl) return    // post-dispose subscription fire
        const spec = SPECIES.find(s => s.id === id) || SPECIES[0]
        this.nameEl.textContent = spec.displayName
        // Tint the dot with the species' accent. The dot also gets a soft
        // white halo from CSS for legibility against the dark-glass chip;
        // don't override box-shadow here or that halo disappears.
        this.dotEl.style.background = spec.palette.accent
    }

    update() {}
}
