/**
 * DayDetailCard — right-slide overlay child of CalendarSheet. Opens when
 * the student taps a day cell; renders the mood pins, captures, and teacher
 * events for that day in the same row idiom FacetView uses.
 *
 * Lives at z 32 so it lands above CalendarSheet (z 30). Closing this card
 * does NOT close the parent calendar — they are independent overlays
 * sharing semantic scope. Closing the calendar closes both.
 */

import State from '../State/State.js'
import OverlayController from './OverlayController.js'

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

const formatDate = (ymd) =>
{
    if(!ymd) return ''
    try
    {
        const d = new Date(`${ymd}T00:00:00`)
        return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }
    catch(_) { return ymd }
}

export default class DayDetailCard
{
    constructor()
    {
        this.state = State.getInstance()

        const root = document.createElement('aside')
        root.className = 'day-detail-card'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="day-detail-card__close" type="button" aria-label="Close">×</button>
            <header class="day-detail-card__head">
                <p class="day-detail-card__eyebrow">Day</p>
                <h2 class="day-detail-card__title"></h2>
            </header>
            <section class="day-detail-card__section" data-section="moods">
                <h3 class="day-detail-card__eyebrow">Moods</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <section class="day-detail-card__section" data-section="captures">
                <h3 class="day-detail-card__eyebrow">Reflections</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <section class="day-detail-card__section" data-section="events">
                <h3 class="day-detail-card__eyebrow">From school</h3>
                <div class="day-detail-card__rows"></div>
            </section>
            <p class="day-detail-card__empty" hidden>Nothing logged this day.</p>
        `
        document.body.appendChild(root)
        this.root  = root
        this.titleEl = root.querySelector('.day-detail-card__title')
        this.emptyEl = root.querySelector('.day-detail-card__empty')

        root.addEventListener('click', (event) =>
        {
            if(event.target.closest('.day-detail-card__close')) this.close()
        })
    }

    open({ date } = {})
    {
        if(!date) return
        this.date = date
        this.titleEl.textContent = formatDate(date)
        this._render()
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
        OverlayController.getInstance().noteClosed('dayDetail')
    }

    _render()
    {
        const moods = this.state.moodPins.pins.filter((p) => p.entryDate === this.date)
        const caps  = this.state.captures.entries.filter((c) => c.entryDate === this.date)
        const evs   = this.state.calendar.events.filter((e) => e.date === this.date)

        const sectionEls = this.root.querySelectorAll('.day-detail-card__section')

        const renderRow = (left, primary, sub) =>
            `<div class="day-detail-row">
                <span class="day-detail-row__dot">${left}</span>
                <div class="day-detail-row__body">
                    <div class="day-detail-row__primary">${primary}</div>
                    ${sub ? `<div class="day-detail-row__sub">${sub}</div>` : ''}
                </div>
            </div>`

        // Moods
        sectionEls[0].querySelector('.day-detail-card__rows').innerHTML = moods.map((p) =>
        {
            const col = MOOD_HEX[p.emotion] || '#888'
            const dot = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${col}"></span>`
            const cause = p.cause ? ` · ${p.cause}` : ''
            return renderRow(dot, `${p.emotion} (${p.intensity}/4)`, cause + (p.note ? ` · "${p.note}"` : ''))
        }).join('')

        // Captures
        sectionEls[1].querySelector('.day-detail-card__rows').innerHTML = caps.map((c) =>
        {
            if(c.kind === 'ask')
            {
                const text = (c.text || '').slice(0, 120)
                return renderRow('✎', text || '<i>(empty)</i>', c.prompt ? `prompt: ${c.prompt}` : '')
            }
            if(c.kind === 'photo')
            {
                const cap = c.caption ? c.caption.slice(0, 120) : '<i>(photo, no caption)</i>'
                return renderRow('📷', cap, '')
            }
            return renderRow('•', c.kind, '')
        }).join('')

        // Events
        sectionEls[2].querySelector('.day-detail-card__rows').innerHTML = evs.map((e) =>
            renderRow('·', e.label, e.kind)
        ).join('')

        // Hide empty sections and decide whether to show the global empty msg.
        sectionEls[0].hidden = moods.length === 0
        sectionEls[1].hidden = caps.length  === 0
        sectionEls[2].hidden = evs.length   === 0
        this.emptyEl.hidden = (moods.length + caps.length + evs.length) !== 0
    }
}
