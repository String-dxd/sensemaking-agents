/**
 * LettersSheet — read-only inbox of letters from a form teacher.
 *
 * Layout: two-pane on ≥780px (list on left, opened letter on right),
 * single-pane router below that (list-or-letter, with a back button when
 * a letter is open). Opening a letter calls `state.letters.markRead(id)`
 * which persists immediately.
 *
 * The unread dot is rendered in the Personality facet's accent (lavender) —
 * letters live in the integrative facet color family because they are
 * incoming to the student-as-a-whole, not to a single dimension.
 */

import State from '../State/State.js'
import OverlayController from './OverlayController.js'

const formatSent = (iso) =>
{
    if(!iso) return ''
    try
    {
        const d = new Date(iso)
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    }
    catch(_) { return '' }
}

const escapeHtml = (s) => (s || '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch])

export default class LettersSheet
{
    constructor()
    {
        this.state   = State.getInstance()
        this.letters = this.state.letters
        this.selectedId = null

        const root = document.createElement('div')
        root.className = 'letters-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="letters-sheet__close" type="button" aria-label="Close">×</button>
            <aside class="letters-sheet__list" role="list"></aside>
            <section class="letters-sheet__panel">
                <button class="letters-sheet__back" type="button">‹ all letters</button>
                <article class="letters-sheet__body">
                    <p class="letters-sheet__empty">Tap a letter to read it.</p>
                </article>
            </section>
        `
        document.body.appendChild(root)
        this.root    = root
        this.listEl  = root.querySelector('.letters-sheet__list')
        this.bodyEl  = root.querySelector('.letters-sheet__body')

        // Root click is GC'd when root is removed; the document keydown
        // outlives root.remove() and is the leak risk we need to detach.
        this._onRootClick = (event) => this._onClick(event)
        root.addEventListener('click', this._onRootClick)

        this._onKeyDown = (event) =>
        {
            if(this.isOpen && event.key === 'Escape') this.close()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Detaches the page-level
     * keydown listener and the sheet root.
     */
    dispose()
    {
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
    }

    open()
    {
        // First time the inbox opens, snap to the newest unread letter (or
        // newest letter if all are read). Subsequent opens preserve the
        // selection across the session.
        if(!this.selectedId)
        {
            const sorted = [...this.letters.letters].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))
            const first = sorted.find((l) => !l.read) || sorted[0]
            if(first) this.selectedId = first.id
        }
        this._render()
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this.root.classList.remove('is-open')
        this.root.classList.remove('is-reading')
        this.root.setAttribute('aria-hidden', 'true')
        this.isOpen = false
        OverlayController.getInstance().noteClosed('letters')
    }

    _render()
    {
        const sorted = [...this.letters.letters].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))

        this.listEl.innerHTML = sorted.map((l) => `
            <button type="button"
                    class="letter-row${l.id === this.selectedId ? ' is-selected' : ''}${l.read ? '' : ' is-unread'}"
                    role="listitem"
                    data-letter-id="${l.id}">
                <span class="letter-row__unread" aria-hidden="true"></span>
                <div class="letter-row__body">
                    <div class="letter-row__meta">
                        <span class="letter-row__from">${escapeHtml(l.from)}</span>
                        <span class="letter-row__date">${formatSent(l.sentAt)}</span>
                    </div>
                    <div class="letter-row__subject">${escapeHtml(l.subject)}</div>
                </div>
            </button>
        `).join('')

        const selected = this.letters.letters.find((l) => l.id === this.selectedId)
        if(selected)
        {
            const paragraphs = (selected.body || '').split('\n\n').map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
            this.bodyEl.innerHTML = `
                <header class="letters-sheet__header">
                    <p class="letters-sheet__from">${escapeHtml(selected.from)} · <time>${formatSent(selected.sentAt)}</time></p>
                    <h2 class="letters-sheet__subject">${escapeHtml(selected.subject)}</h2>
                </header>
                ${paragraphs}
            `
        }
        else
        {
            this.bodyEl.innerHTML = `<p class="letters-sheet__empty">Tap a letter to read it.</p>`
        }
    }

    _onClick(event)
    {
        if(event.target.closest('.letters-sheet__close')) { this.close(); return }
        if(event.target.closest('.letters-sheet__back'))
        {
            this.root.classList.remove('is-reading')
            return
        }

        const row = event.target.closest('.letter-row')
        if(row)
        {
            const id = row.dataset.letterId
            this.selectedId = id
            this.letters.markRead(id)        // idempotent; persists
            this.root.classList.add('is-reading')
            this._render()
            return
        }
    }
}
