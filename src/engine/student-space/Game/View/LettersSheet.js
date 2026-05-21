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
import SheetChrome from './SheetChrome.js'

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

        // SheetChrome owns backdrop, blur, fade, z-tier, the × button, the
        // Escape-to-close listener, AND the shared header. Under the Gather-
        // style split layout the letter list lives in the left pane (intro)
        // and the active letter's body fills the right pane. The chrome's
        // 860px responsive stack replaces the old internal 780px list/detail
        // pivot, so the standalone back-button is gone — at narrow widths
        // both panes flow vertically. See CLAUDE.md "Sheet chrome contract".
        this.chrome = new SheetChrome({
            key:            'letters',
            sheetClassName: 'letters-sheet',
            withCloseButton: true,
            closeOnBackdrop: false,
            layout:         'split',
            header: {
                eyebrow:  'LETTERS',
                title:    'Inbox',
                subtitle: 'Notes from your form teacher when they notice something worth saying.',
            },
        })
        this.chrome.introSlot.innerHTML = `
            <aside class="letters-sheet__list" role="list"></aside>
        `
        this.chrome.bodySlot.innerHTML = `
            <section class="letters-sheet__panel">
                <article class="letters-sheet__body" data-role="letter-body">
                    <p class="letters-sheet__empty">Tap a letter to read it.</p>
                </article>
            </section>
        `
        const root = this.chrome.root
        this.root    = root
        this.listEl  = root.querySelector('.letters-sheet__list')
        this.bodyEl  = root.querySelector('[data-role="letter-body"]')

        // Content-level click handler — letter rows, back button.
        // × button and Escape are owned by SheetChrome.
        this._onRootClick = (event) => this._onClick(event)
        root.addEventListener('click', this._onRootClick)
    }

    /**
     * Tear-down hook called from View.dispose().
     */
    dispose()
    {
        if(this._onRootClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onRootClick) } catch(_) {}
            this._onRootClick = null
        }
        try { this.chrome?.dispose?.() } catch(_) {}
        this.chrome = null
        this.root = null
    }

    open()
    {
        if(!this.chrome) return
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
        this.chrome.open()
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this.isOpen = false
        try { this.chrome?.close?.() } catch(_) {}
    }

    _render()
    {
        const sorted = [...this.letters.letters].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))

        // First-run users have zero letters; without a placeholder the list
        // pane reads as broken. Single short line + invitation, no CTA — the
        // teacher is the one who writes here, not the student.
        if(sorted.length === 0)
        {
            this.listEl.innerHTML = `<p class="letters-sheet__empty letters-sheet__empty--list">No letters yet. Your teacher will write when they notice something.</p>`
            this.bodyEl.innerHTML = ''
            return
        }

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
        // × button and Escape are owned by SheetChrome — no per-sheet close
        // handling needed here. The old `.letters-sheet__back` button has
        // been removed; the chrome's 860px responsive stack supplies the
        // narrow-viewport flow without a routed back affordance.
        const row = event.target.closest('.letter-row')
        if(row)
        {
            const id = row.dataset.letterId
            this.selectedId = id
            this.letters.markRead(id)        // idempotent; persists
            this._render()
            return
        }
    }
}
