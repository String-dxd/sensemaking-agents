import State from '../State/State.js'
import { STATUS_IDS, statusLabelOf } from './statusHeuristics.js'

/**
 * StatusPreviewHud — floating admin-style control to force the Path Finder
 * into a chosen Marcia identity status quadrant
 * (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).
 *
 * Visual posture matches the island's HourHud / ZoomHud / MoodHud cluster:
 * dark glass panel, top-left corner of the viewport, fixed positioning,
 * pointer-events auto. The dark chrome (rather than a cream chip row inside
 * a sheet) signals that this is a developer / admin affordance, not a
 * normal student-facing toggle.
 *
 * Mounts to document.body and survives sheet open/close — visible on the
 * island home AND while the Path Finder sheet is open, so a teacher can
 * flip quadrants and watch the sheet re-skin in real time.
 *
 * The picker is a collapsed pill by default; expands to a vertical option
 * list on click. A `data-active="override"` attribute hangs off the root
 * whenever the override is on, so any CSS that wants to flag the preview
 * state has a hook.
 */
export default class StatusPreviewHud
{
    constructor()
    {
        this.state = State.getInstance()
        this.override = this.state?.identityStatusOverride || null

        const wrap = document.createElement('div')
        wrap.className = 'status-preview-hud'
        wrap.innerHTML = `
            <button class="status-preview-hud__toggle" type="button"
                    aria-haspopup="listbox" aria-expanded="false">
                <span class="status-preview-hud__eyebrow">PREVIEW AS</span>
                <span class="status-preview-hud__current">
                    <span class="status-preview-hud__dot" data-status-dot="auto" aria-hidden="true"></span>
                    <span class="status-preview-hud__label" data-role="current-label">Auto</span>
                </span>
                <span class="status-preview-hud__caret" aria-hidden="true">▾</span>
            </button>
            <ul class="status-preview-hud__menu" role="listbox" data-role="menu" hidden></ul>
        `

        document.body.appendChild(wrap)
        this.root      = wrap
        this.toggleEl  = wrap.querySelector('.status-preview-hud__toggle')
        this.currentEl = wrap.querySelector('[data-role="current-label"]')
        this.currentDotEl = wrap.querySelector('.status-preview-hud__dot')
        this.menuEl    = wrap.querySelector('[data-role="menu"]')

        this.isOpen = false

        this._onToggleClick = () => this._toggleMenu()
        this._onMenuClick = (event) =>
        {
            const item = event.target.closest?.('.status-preview-hud__item')
            if(!item) return
            const next = item.dataset.status === 'auto' ? null : item.dataset.status
            this.override?.setOverride(next)
            this._closeMenu()
        }
        this._onDocClick = (event) =>
        {
            if(!this.isOpen) return
            if(this.root.contains(event.target)) return
            this._closeMenu()
        }
        this._onKeyDown = (event) =>
        {
            if(this.isOpen && event.key === 'Escape') this._closeMenu()
        }

        this.toggleEl.addEventListener('click', this._onToggleClick)
        this.menuEl.addEventListener('click', this._onMenuClick)
        document.addEventListener('click', this._onDocClick)
        document.addEventListener('keydown', this._onKeyDown)

        this._renderMenu()
        this._refreshCurrent()

        if(this.override?.subscribe)
        {
            this._unwireOverride = this.override.subscribe(() =>
            {
                this._renderMenu()
                this._refreshCurrent()
            })
        }
    }

    _renderMenu()
    {
        const active = this.override?.current || null
        const items = [
            { id: null, label: 'Auto (real)' },
            ...STATUS_IDS.map((id) => ({ id, label: statusLabelOf(id) })),
        ]
        this.menuEl.innerHTML = items.map((it) =>
        {
            const isOn = (it.id === null && !active) || it.id === active
            const dataId = it.id === null ? 'auto' : it.id
            return `
                <li class="status-preview-hud__item${isOn ? ' is-on' : ''}"
                    role="option"
                    aria-selected="${isOn ? 'true' : 'false'}"
                    data-status="${dataId}">
                    <span class="status-preview-hud__dot" data-status-dot="${dataId}" aria-hidden="true"></span>
                    <span class="status-preview-hud__label">${escapeHtml(it.label)}</span>
                    ${isOn ? '<span class="status-preview-hud__check" aria-hidden="true">✓</span>' : ''}
                </li>
            `
        }).join('')
    }

    _refreshCurrent()
    {
        const active = this.override?.current || null
        const label = active ? statusLabelOf(active) : 'Auto'
        this.currentEl.textContent = label
        const dataId = active || 'auto'
        this.currentDotEl.dataset.statusDot = dataId
        this.root.dataset.active = active ? 'override' : 'auto'
        this.toggleEl.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false')
    }

    _toggleMenu()
    {
        if(this.isOpen) this._closeMenu()
        else this._openMenu()
    }

    _openMenu()
    {
        this.menuEl.hidden = false
        this.root.classList.add('is-open')
        this.isOpen = true
        this.toggleEl.setAttribute('aria-expanded', 'true')
    }

    _closeMenu()
    {
        this.menuEl.hidden = true
        this.root.classList.remove('is-open')
        this.isOpen = false
        this.toggleEl.setAttribute('aria-expanded', 'false')
    }

    /**
     * Tear-down hook. Drops the document-level listeners and the override
     * subscription, then removes the root from body. Mirrors HourHud's
     * pattern — listeners on the root itself are GC'd with the detached tree.
     */
    dispose()
    {
        try { document.removeEventListener('click', this._onDocClick) } catch(_) {}
        try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
        if(this._unwireOverride)
        {
            try { this._unwireOverride() } catch(_) {}
            this._unwireOverride = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
    }
}

function escapeHtml(s)
{
    return String(s || '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch])
}
