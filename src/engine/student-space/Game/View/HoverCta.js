import View from './View.js'
import State from '../State/State.js'
import { FACET_HEADERS, FACET_THEMES } from './facets.js'
import { VIPS_TAXONOMY } from '../Data/vipsTaxonomy.js'
import ThumbnailRenderer from './ThumbnailRenderer.js'
import { elementTitle, latestEvidenceLine, resolveElementEvidence, speciesIdOf } from './elementEvidence.js'

/**
 * HoverCta — small floating chip the student sees when their pointer is
 * over an interactive island element.
 *
 * v1.3 IA:
 *   row 1 — the facet question + a coloured facet badge
 *   row 2 — a 3D species thumbnail in a circle + the species name
 *   row 3 — one short line of meaning
 *
 * The chip itself stays non-interactive — clicking the island object opens
 * the half-sheet, and from there a "See all" CTA opens the full facet sheet.
 */

const SPECIES_LINE = {
    // Values (trees)
    oak:      'A value you keep returning to.',
    cherry:   'A value that’s tender, still growing.',
    // Interests (flowers)
    daisy:    'A small interest in motion.',
    tulip:    'Held close — like a secret.',
    rose:     'Something you tend with care.',
    lily:     'Reaching, generous.',
    pansy:    'Curious, watching.',
    hyacinth: 'A quiet build of attention.',
    // Skills (fruit bushes)
    apple:    'A practical skill — getting things done.',
    pear:     'An analytical skill — taking it apart.',
    plum:     'A creative skill — making something new.',
    fig:      'An interpersonal skill — reading the room.',
    citrus:   'A leadership skill — setting direction.',
    berry:    'A communication skill — saying what you mean.',
}

const KIND_TO_FACET = {
    tree:   'values',
    flower: 'interests',
    fruit:  'skills',
}

// species id → canonical claim id, derived once from the taxonomy so the
// tooltip's 3D thumbnail picks the right cached render.
const CLAIM_ID_BY_SPECIES = (() =>
{
    const map = {}
    for(const claim of VIPS_TAXONOMY)
    {
        const sp = claim.object?.species
        if(sp) map[sp] = claim.id
    }
    return map
})()

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }

export default class HoverCta
{
    constructor()
    {
        this.view = View.getInstance()

        // Lazy — only spin up the offscreen renderer when the user actually
        // hovers a species. Keeps the second WebGL context off the boot path.
        this._thumbs = null

        const root = document.createElement('div')
        root.className = 'hover-cta'
        root.setAttribute('role', 'tooltip')
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <header class="hover-cta__header">
                <span class="hover-cta__eyebrow"></span>
                <span class="hover-cta__badge"></span>
            </header>
            <div class="hover-cta__row">
                <span class="hover-cta__thumb" aria-hidden="true"></span>
                <span class="hover-cta__title"></span>
            </div>
            <p class="hover-cta__line"></p>
        `
        document.body.appendChild(root)

        this.root      = root
        this.eyebrowEl = root.querySelector('.hover-cta__eyebrow')
        this.badgeEl   = root.querySelector('.hover-cta__badge')
        this.thumbEl   = root.querySelector('.hover-cta__thumb')
        this.titleEl   = root.querySelector('.hover-cta__title')
        this.lineEl    = root.querySelector('.hover-cta__line')

        this.target = null

        this.update = this.update.bind(this)
    }

    showFor(target, screenX, screenY)
    {
        this.target = target
        this._renderContent(target)
        this.setAnchor(screenX, screenY)
        this.root.classList.add('is-open')
        this.root.setAttribute('aria-hidden', 'false')
    }

    _renderContent(target)
    {
        // Special-case mailbox + kira — they live outside the VIPS facets,
        // so the header takes a custom eyebrow/badge and the thumb is hidden.
        if(target.kind === 'mailbox')
        {
            const unread = State.getInstance()?.letters?.unreadCount?.() ?? 0
            this._setHeader('Letters from your teacher', 'Letters', null)
            this.titleEl.textContent = 'Mailbox'
            this.lineEl.textContent  = unread > 0
                ? (unread === 1 ? '1 unread letter.' : `${unread} unread letters.`)
                : 'All read.'
            this._setThumb(null)
            return
        }
        if(target.kind === 'kira')
        {
            this._setHeader('How today is landing', 'Mood', 'mood')
            this.titleEl.textContent = State.getInstance()?.profile?.displayCompanionName?.() || 'Kira'
            this.lineEl.textContent  = 'Your island’s resident finch.'
            this._setThumb(null)
            return
        }
        if(target.kind === 'telescope')
        {
            this._setHeader('Possible directions', 'Path Finder', null)
            this.titleEl.textContent = 'Telescope'
            this.lineEl.textContent  = 'Read the compass for paths your profile points at.'
            this._setThumb(null)
            return
        }

        const facetId = KIND_TO_FACET[target.kind]
        const header  = facetId ? FACET_HEADERS[facetId] : null
        const sp = speciesIdOf(target)
        const evidence = resolveElementEvidence(target, State.getInstance()?.profile)

        this._setHeader(
            header?.eyebrow ? cap(header.eyebrow.toLowerCase()) : '',
            header?.tag ?? '',
            facetId,
        )
        this.titleEl.textContent = elementTitle(evidence, cap(sp) || 'Element')
        this.lineEl.textContent  = evidence.claimId
            ? latestEvidenceLine(evidence, 72)
            : (SPECIES_LINE[sp] ?? '')

        const claimId = evidence.claimId || CLAIM_ID_BY_SPECIES[sp]
        this._setThumb(claimId)
    }

    _setHeader(eyebrowText, badgeText, facetId)
    {
        this.eyebrowEl.textContent = eyebrowText || ''
        this.badgeEl.textContent   = badgeText || ''
        this.badgeEl.style.display = badgeText ? '' : 'none'

        const theme = facetId ? FACET_THEMES[facetId] : null
        if(theme)
        {
            this.root.style.setProperty('--cta-accent', theme.accent)
            this.root.style.setProperty('--cta-soft',   theme.soft)
            this.root.style.setProperty('--cta-ink',    theme.ink)
        }
        else
        {
            this.root.style.removeProperty('--cta-accent')
            this.root.style.removeProperty('--cta-soft')
            this.root.style.removeProperty('--cta-ink')
        }
    }

    _setThumb(claimId)
    {
        if(!claimId)
        {
            this.thumbEl.style.display = 'none'
            this.thumbEl.style.backgroundImage = ''
            return
        }
        if(!this._thumbs)
        {
            try { this._thumbs = new ThumbnailRenderer() }
            catch(err)
            {
                console.warn('[HoverCta] thumbnail renderer init failed', err)
                this.thumbEl.style.display = 'none'
                return
            }
        }
        const url = this._thumbs.getThumbnail(claimId)
        if(url)
        {
            this.thumbEl.style.display = ''
            this.thumbEl.style.backgroundImage = `url(${url})`
        }
        else
        {
            this.thumbEl.style.display = 'none'
        }
    }

    setAnchor(screenX, screenY)
    {
        const x = screenX + 16
        const y = screenY - 12
        this.root.style.left = `${x}px`
        this.root.style.top  = `${y}px`
    }

    hide()
    {
        this.target = null
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
    }

    /**
     * Tear-down hook. Drops the chip from the DOM. No document/window
     * listeners are registered. The lazy thumbnail renderer (if created)
     * is detached so its WebGL resources can be collected — ThumbnailRenderer
     * doesn't expose a dispose() in v1, but nulling the ref removes one
     * source of retention.
     */
    dispose()
    {
        try { this._thumbs?.dispose?.() } catch(_) {}
        this._thumbs = null
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.eyebrowEl = null
        this.badgeEl = null
        this.thumbEl = null
        this.titleEl = null
        this.lineEl = null
        this.target = null
    }

    update() {}
}
