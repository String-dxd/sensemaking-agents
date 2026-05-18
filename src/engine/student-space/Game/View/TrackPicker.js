import View from './View.js'

/**
 * TrackPicker — dark-glass chip in the bottom-left (above BirdPicker)
 * that lets the student cycle through ambient music tracks. Same
 * admin/dev visual tier as BirdPicker: this is "configure the room",
 * not "use the room."
 *
 * Click cycles forward through Sound.tracks; right-click cycles back.
 * The chip shows the current track name plus a small attribution line
 * for CC-BY streamed tracks. The procedural track has no attribution
 * row, so the chip is shorter when that's active.
 */
export default class TrackPicker
{
    constructor()
    {
        this.view = View.getInstance()
        this.sound = this.view.sound

        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'track-picker'
        el.setAttribute('aria-label', 'Cycle through ambient music tracks')
        el.innerHTML = `
            <span class="track-picker__note" aria-hidden="true">♪</span>
            <span class="track-picker__text">
                <span class="track-picker__eyebrow">Music</span>
                <span class="track-picker__name"></span>
                <span class="track-picker__attribution"></span>
            </span>
            <span class="track-picker__chev" aria-hidden="true">↻</span>
        `
        document.body.appendChild(el)
        this.el = el
        this.nameEl   = el.querySelector('.track-picker__name')
        this.attribEl = el.querySelector('.track-picker__attribution')

        el.addEventListener('click', () => this.sound.cycleTrack(+1))
        el.addEventListener('contextmenu', (e) =>
        {
            e.preventDefault()
            this.sound.cycleTrack(-1)
        })

        this._render(this.sound.trackId)
        this.sound.onTrackChange(id => this._render(id))
    }

    _render(id)
    {
        const track = this.sound.tracks.find(t => t.id === id) || this.sound.tracks[0]
        this.nameEl.textContent = track.name
        this.attribEl.textContent = track.attribution || ''
        this.attribEl.hidden = !track.attribution
    }

    update() {}
}
