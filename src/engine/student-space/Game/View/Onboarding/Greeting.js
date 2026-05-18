/**
 * Post-login greeting surface. "Hi, {name}." + sub + hint + CTA.
 * Pure DOM. No bird visible — the egg hasn't been picked yet.
 */

import { wait } from '../../util/timing.js'
import { escapeHtml } from '../../util/html.js'

const ENTER_MS = 320
const EXIT_MS  = 240

export default class Greeting
{
    constructor(flow)
    {
        this.flow = flow
        this._el = null
        this._advance = null
    }

    setAdvance(cb) { this._advance = cb }

    async mount(root, ctx)
    {
        const studentName = (ctx.profile.identity?.name ?? '').split(' ')[0] || 'there'
        const hello = ctx.copy.greeting.hello.replace('{name}', escapeHtml(studentName))

        const el = document.createElement('div')
        el.className = 'onb-greeting'
        el.innerHTML = `
            <div class="onb-greeting__text">
                <h1 class="onb-greeting__hello">${hello}</h1>
                <p class="onb-greeting__sub">${escapeHtml(ctx.copy.greeting.sub)}</p>
                <p class="onb-greeting__hint">${escapeHtml(ctx.copy.greeting.hint)}</p>
            </div>
            <button type="button" class="onb-greeting__cta">${escapeHtml(ctx.copy.greeting.cta)}</button>
        `
        root.appendChild(el)
        this._el = el
        const cta = el.querySelector('.onb-greeting__cta')
        cta.addEventListener('click', () => this._advance?.('egg-color'))

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

        // Focus the CTA *after* the entry animation so the screen-reader
        // announces the heading + sub + hint first, then lands on the
        // button.
        cta?.focus({ preventScroll: true })
    }

    async unmount()
    {
        if(!this._el) return
        const el = this._el
        this._el = null
        el.classList.remove('is-visible')
        el.classList.add('is-leaving')
        await wait(EXIT_MS)
        el.remove()
    }
}

