/**
 * Shared visual primitives for the engine's full-viewport sheets.
 *
 * Composed by ProfileSheet, TrajectorySheet, and any future surface that
 * wants to read as part of the same family:
 *
 *   - tldrHeroHTML       — glanceable summary card at the top of a sheet
 *   - disclosureHTML     — collapsible content block with chevron toggle
 *   - statTileRowHTML    — 2-up grid of stat tiles (big number + label)
 *   - calloutStripHTML   — soft-tinted prompt strip with left accent border
 *   - bindDisclosureToggles — wires chevron clicks inside a root element
 *
 * Each helper returns an HTML string suitable for `innerHTML`. CSS lives in
 * `src/engine/student-space/style.css` under matching class selectors.
 * The design system page (`src/routes/dev.design.tsx`) mirrors each primitive.
 *
 * Plan: docs/plans/2026-05-20-003-refactor-profile-path-finder-tldr-progressive-disclosure-plan.md
 */

import { escapeAttr, escapeHtml } from '../util/html.js'

/**
 * TLDR hero. Optional eyebrow + title + chip row + meta footer.
 * @param {object} opts
 * @param {string} [opts.eyebrow] short sentence-case label above the title
 * @param {string} [opts.title] one-line headline
 * @param {Array<{label: string, accent?: string, id?: string}>} [opts.chips]
 * @param {string} [opts.meta] muted meta line beneath the chips
 * @param {string} [opts.accent] accent token used for the chip dot color
 */
export function tldrHeroHTML(opts = {})
{
    const { eyebrow = '', title = '', chips = [], meta = '', accent = '' } = opts
    const eyebrowH = eyebrow
        ? `<p class="tldr-hero__eyebrow">${escapeHtml(eyebrow)}</p>`
        : ''
    const titleH = title
        ? `<h2 class="tldr-hero__title">${escapeHtml(title)}</h2>`
        : ''
    const chipsH = chips.length
        ? `<div class="tldr-hero__chips">${chips.map((c) => `
            <button class="tldr-chip" type="button"
                    data-tldr-chip-id="${escapeAttr(c.id || '')}"
                    data-accent="${escapeAttr(c.accent || accent || '')}">
                <span class="tldr-chip__dot" aria-hidden="true"></span>
                <span class="tldr-chip__label">${escapeHtml(c.label)}</span>
            </button>`).join('')}</div>`
        : ''
    const metaH = meta
        ? `<p class="tldr-hero__meta">${escapeHtml(meta)}</p>`
        : ''
    return `<section class="tldr-hero" data-accent="${escapeAttr(accent)}">${eyebrowH}${titleH}${chipsH}${metaH}</section>`
}

/**
 * Disclosure — collapsible section with chevron toggle.
 * Empty content returns an empty string so consumers can splat unconditionally.
 * @param {object} opts
 * @param {string} [opts.id] stable id used for in-session expand memory
 * @param {string} opts.summary headline rendered next to the chevron
 * @param {string} opts.content HTML to reveal when expanded
 * @param {boolean} [opts.expanded=false] initial state
 */
export function disclosureHTML(opts = {})
{
    const { id = '', summary = '', content = '', expanded = false } = opts
    if (!content) return ''
    const state = expanded ? 'true' : 'false'
    return `<section class="disclosure" data-disclosure-id="${escapeAttr(id)}" data-expanded="${state}">
        <button class="disclosure__toggle" type="button" aria-expanded="${state}">
            <span class="disclosure__chevron" aria-hidden="true"></span>
            <span class="disclosure__summary">${escapeHtml(summary)}</span>
        </button>
        <div class="disclosure__panel"><div class="disclosure__panel-inner">${content}</div></div>
    </section>`
}

/**
 * Stat tile row — 2-up grid (responsive). Empty list returns an empty string.
 * @param {Array<{value: string|number, label: string, icon?: string}>} tiles
 */
export function statTileRowHTML(tiles = [])
{
    if (!Array.isArray(tiles) || tiles.length === 0) return ''
    const tilesH = tiles.map((t) => `
        <div class="stat-tile">
            <div class="stat-tile__value">${escapeHtml(String(t.value ?? ''))}</div>
            <div class="stat-tile__label">${escapeHtml(t.label || '')}</div>
            ${t.icon ? `<div class="stat-tile__icon" aria-hidden="true">${escapeHtml(t.icon)}</div>` : ''}
        </div>`).join('')
    return `<div class="stat-tile-row" data-count="${tiles.length}">${tilesH}</div>`
}

/**
 * Callout strip — left-accent prompt block. Empty body returns an empty string.
 * @param {object} opts
 * @param {string} [opts.eyebrow] small sentence-case label above the body
 * @param {string} opts.body italic prompt copy
 * @param {string} [opts.accent] accent token (cream / blue / amber etc.)
 */
export function calloutStripHTML(opts = {})
{
    const { eyebrow = '', body = '', accent = '' } = opts
    if (!body) return ''
    const eyebrowH = eyebrow
        ? `<p class="callout-strip__eyebrow">${escapeHtml(eyebrow)}</p>`
        : ''
    return `<aside class="callout-strip" data-accent="${escapeAttr(accent)}">${eyebrowH}<p class="callout-strip__body">${escapeHtml(body)}</p></aside>`
}

/**
 * Wires chevron clicks inside `root` so every `.disclosure` becomes
 * interactive. Returns a teardown function that removes the listener.
 *
 * The handler flips `data-expanded` on the `.disclosure` element AND
 * `aria-expanded` on its `.disclosure__toggle` button. CSS animates the
 * panel via the `data-expanded` attribute.
 */
export function bindDisclosureToggles(root)
{
    if (!root) return () => {}
    const handler = (event) =>
    {
        const toggle = event.target.closest('.disclosure__toggle')
        if (!toggle || !root.contains(toggle)) return
        const section = toggle.closest('.disclosure')
        if (!section) return
        const next = section.getAttribute('data-expanded') === 'true' ? 'false' : 'true'
        section.setAttribute('data-expanded', next)
        toggle.setAttribute('aria-expanded', next)
    }
    root.addEventListener('click', handler)
    return () => root.removeEventListener('click', handler)
}
