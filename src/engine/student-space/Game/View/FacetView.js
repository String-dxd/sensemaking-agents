import View from './View.js'
import State from '../State/State.js'
import { FACET_THEMES as VIPS_THEMES, FACET_HEADERS as VIPS_HEADERS } from './facets.js'
import { VIPS_BY_FACET, claimLabel } from '../Data/vipsTaxonomy.js'
import OverlayController from './OverlayController.js'
import {
    elementTitle,
    evidenceCountText,
    metaphorLine,
    resolveElementEvidence,
    speciesIdOf,
} from './elementEvidence.js'

/**
 * FacetView — bottom-rising half-sheet that opens when the student picks
 * an island element. Two display states:
 *
 *   • half   — sheet occupies the lower 50vh, summary + three-row breakdown
 *              visible. The handle hover-morphs into a chevron-up to signal
 *              that there is more below.
 *   • full   — sheet rises to 92vh, showing the per-element details below
 *              the summary. Handle hover-morphs into a chevron-down.
 *
 * The handle is two CSS-rotatable bars that pivot at their inner ends to
 * form ^ on hover (or v when full). The handle's own geometry morphs —
 * there is no cross-fade to a separate icon.
 *
 * Per-facet content:
 *   • Values (tree)     → ranked claims via Profile.countByClaim('values')
 *   • Interests (flower) → Profile.countByClaim('interests')
 *   • Skills (fruit)     → Profile.countByClaim('skills')
 *   • Mood (kira)        → recent mood pins, no three-row breakdown
 *
 * The four VIPS facets share their token table with ProfileSheet via
 * ./facets.js. Mood is a FacetView-only theme.
 */
const FACET_HEADERS = {
    ...VIPS_HEADERS,
    mood: {
        eyebrow:  'HOW TODAY IS LANDING',
        tag:      'Mood',
        title:    'What you’re carrying today',
        subtitle: 'Small weather across the week',
    },
}

const FACET_THEMES = {
    values:    VIPS_THEMES.values,
    interests: VIPS_THEMES.interests,
    skills:    VIPS_THEMES.skills,
    mood:      { accent: '#7FB3D9', soft: '#DBE9F3', ink: '#365770' },
}

const TREE_COPY = {
    oak:    'Oaks hold the things you don’t outgrow — the principles you act on without naming them. They take a long time to grow, and a long time to leave.',
    cherry: 'Cherry trees mark something you’ve said once or twice but not anchored yet. They bloom early, fade if ignored — they need return visits to root.',
}

const FLOWER_COPY = {
    daisy:    'Daisies move with attention — opening when you look at them, closing when you don’t. They mark interests that breathe with curiosity.',
    tulip:    'Tulips stay cupped. They mark interests you protect — not yet ready to share, but worth keeping warm.',
    rose:     'Roses take effort. They mark practiced interests — things you return to, prune, refine.',
    lily:     'Lilies face outward. They mark interests that pull other people in — making, performing, sharing, hosting.',
    pansy:    'Pansies are observational interests. Reading, noticing patterns, taking small notes about how things work.',
    hyacinth: 'Hyacinths stack. Small repeated noticings, each adding to the pillar — interests that don’t reveal themselves until they’re tall.',
}

const FRUIT_COPY = {
    apple:  'Apples are the practical skills — getting things done, finishing what you start, adapting plans to constraints.',
    pear:   'Pears are the analytical skills — taking a problem apart, reasoning with evidence, reaching defensible conclusions.',
    plum:   'Plums are the creative skills — making something where the path wasn’t pre-drawn.',
    fig:    'Figs are the interpersonal skills — reading the room, building trust, working across differences.',
    citrus: 'Citrus is the leadership skill — setting direction, coordinating others, taking responsibility for outcomes.',
    berry:  'Berries are the communication skills — saying what you mean, in the register your audience needs.',
}

const KIRA_BODY = 'Kira watches the shape of what you say and places things on the ground that match — oaks for values, blooms for interests, fruits for skills, butterflies for thoughts passing through.'

function facetIdForTarget(target)
{
    if(target.kind === 'tree')   return 'values'
    if(target.kind === 'flower') return 'interests'
    if(target.kind === 'fruit')  return 'skills'
    if(target.kind === 'kira')   return 'mood'
    return 'values'
}

function elementTitleForTarget(target)
{
    if(target.kind === 'kira') return 'Kira'
    const sp = speciesIdOf(target)
    return sp ? sp.charAt(0).toUpperCase() + sp.slice(1) : 'Element'
}

function elementBodyForTarget(target)
{
    if(target.kind === 'kira')   return KIRA_BODY
    const sp = speciesIdOf(target)
    if(target.kind === 'tree')   return TREE_COPY[sp]   ?? ''
    if(target.kind === 'flower') return FLOWER_COPY[sp] ?? ''
    if(target.kind === 'fruit')  return FRUIT_COPY[sp]  ?? ''
    return ''
}

function elementBodyForEvidence(evidence, target)
{
    if(!evidence?.claimId) return elementBodyForTarget(target)
    const line = metaphorLine(evidence)
    if(evidence.hasEvidence)
        return `${line} It is backed by ${evidenceCountText(evidence).toLowerCase()} in your profile timeline.`
    return `${line} No saved noticings have landed here yet.`
}

// 8-compass bucket from world XZ.
function compassBucket(x, z)
{
    if(Math.hypot(x, z) < 0.6) return 'centre of the island'
    const angle = Math.atan2(x, z)
    const slice = Math.PI / 8
    if(angle >= -slice     && angle <  slice)         return 'north of the plateau'
    if(angle >=  slice     && angle <  3 * slice)     return 'northeast slope'
    if(angle >=  3 * slice && angle <  5 * slice)     return 'east toward the shore'
    if(angle >=  5 * slice && angle <  7 * slice)     return 'southeast bend'
    if(angle >=  7 * slice || angle <  -7 * slice)    return 'south side'
    if(angle >= -7 * slice && angle < -5 * slice)     return 'southwest bend'
    if(angle >= -5 * slice && angle < -3 * slice)     return 'west toward the shore'
    return 'northwest slope'
}

/**
 * Rank the canonical claims for a facet into three buckets:
 *   most-common      — the claim with the highest quote count
 *   right-alongside  — the second-highest
 *   quietly-emerging — the smallest non-zero, or first unseen claim if all
 *                      counted ones are exhausted
 *
 * Falls back to the first three canonical claims in registry order when
 * the student has not yet generated any quotes for the facet.
 */
function rankClaims(facetId, profile)
{
    const canonical = VIPS_BY_FACET[facetId] ?? []
    if(canonical.length === 0) return null

    const counts = profile.countByClaim ? profile.countByClaim(facetId) : {}
    const ranked = canonical
        .map((c) => ({ id: c.id, label: c.label, count: counts[c.id] ?? 0 }))
        .sort((a, b) => b.count - a.count)

    // Pick three distinct slots in this priority order: most common (highest
    // count, anything ≥ 0), right alongside (next-highest, distinct from
    // most common), quietly emerging (the first unseen claim, or the lowest
    // seen if there are no unseen left). Falls back gracefully when there
    // are < 3 canonical claims.
    const used = new Set()
    const take = (candidate) =>
    {
        if(!candidate || used.has(candidate.id)) return null
        used.add(candidate.id)
        return candidate
    }

    const mostCommon     = take(ranked[0])

    const seen   = ranked.filter((c) => c.count > 0)
    const unseen = ranked.filter((c) => c.count === 0)

    const rightAlongside = take(seen[1])
                        ?? take(unseen[0])
                        ?? take(ranked.find((c) => !used.has(c.id)))

    const quietlyEmerging = take(unseen.find((c) => !used.has(c.id)))
                         ?? take([...seen].reverse().find((c) => !used.has(c.id)))
                         ?? take(ranked.find((c) => !used.has(c.id)))
                         ?? mostCommon   // last-resort placeholder

    return {
        mostCommon:      mostCommon      ?? { label: '' },
        rightAlongside:  rightAlongside  ?? { label: '' },
        quietlyEmerging: quietlyEmerging ?? { label: '' },
    }
}

export default class FacetView
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()

        const root = document.createElement('div')
        root.className = 'half-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-modal', 'true')
        root.setAttribute('aria-label', 'Element detail')
        root.innerHTML = `
            <div class="half-sheet__scrim" aria-hidden="true"></div>
            <section class="half-sheet__sheet">
                <button class="half-sheet__handle" type="button" aria-label="Expand to full page" aria-expanded="false">
                    <span class="half-sheet__handle-bar half-sheet__handle-bar--l"></span>
                    <span class="half-sheet__handle-bar half-sheet__handle-bar--r"></span>
                </button>
                <button class="half-sheet__close" type="button" aria-label="Close">×</button>
                <div class="half-sheet__inner">
                    <header class="half-sheet__head">
                        <div class="half-sheet__eyebrow-row">
                            <span class="half-sheet__eyebrow"></span>
                            <span class="half-sheet__tag"></span>
                        </div>
                        <h2 class="half-sheet__title"></h2>
                        <p class="half-sheet__subtitle"></p>
                    </header>
                    <ul class="vips-rows" role="list">
                        <li class="vips-row">
                            <span class="vips-row__label">Most common</span>
                            <p class="vips-row__body" data-row="most"></p>
                        </li>
                        <li class="vips-row">
                            <span class="vips-row__label">Quietly emerging</span>
                            <p class="vips-row__body" data-row="emerge"></p>
                        </li>
                    </ul>
                    <section class="half-sheet__detail">
                        <h3 class="half-sheet__detail-title"></h3>
                        <p class="half-sheet__detail-body"></p>
                        <div class="half-sheet__bento"></div>
                    </section>
                    <button class="half-sheet__cta" type="button"></button>
                </div>
            </section>
        `
        document.body.appendChild(root)
        this.root = root

        this.scrim       = root.querySelector('.half-sheet__scrim')
        this.sheet       = root.querySelector('.half-sheet__sheet')
        this.handle      = root.querySelector('.half-sheet__handle')
        this.closeBtn    = root.querySelector('.half-sheet__close')
        this.eyebrow     = root.querySelector('.half-sheet__eyebrow')
        this.tag         = root.querySelector('.half-sheet__tag')
        this.titleEl     = root.querySelector('.half-sheet__title')
        this.subtitleEl  = root.querySelector('.half-sheet__subtitle')
        this.rowMost     = root.querySelector('[data-row="most"]')
        this.rowEmerge   = root.querySelector('[data-row="emerge"]')
        this.detailTitle = root.querySelector('.half-sheet__detail-title')
        this.detailBody  = root.querySelector('.half-sheet__detail-body')
        this.bentoEl     = root.querySelector('.half-sheet__bento')
        this.ctaBtn      = root.querySelector('.half-sheet__cta')

        this.isOpen = false
        this.isFull = false
        this.activeFacetId = null
        this.activeClaimId = null

        this.closeBtn.addEventListener('click', () => this.close())
        this.scrim.addEventListener('click',    () => this.close())
        this.handle.addEventListener('click',   () => this.toggleFull())
        this.ctaBtn.addEventListener('click',   () => this._openProfile())

        this._onKeyDown = (event) =>
        {
            if(!this.isOpen) return
            if(event.key === 'Escape')   this.close()
            if(event.key === 'ArrowUp')   { this._setFull(true);  event.preventDefault() }
            if(event.key === 'ArrowDown') { this._setFull(false); event.preventDefault() }
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Detaches the page-level
     * keydown listener (the leak that survives root.remove()) and the
     * sheet root. All other listeners are bound to descendants of root.
     */
    dispose()
    {
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.scrim = null
        this.sheet = null
        this.handle = null
        this.closeBtn = null
        this.eyebrow = null
        this.tag = null
        this.titleEl = null
        this.subtitleEl = null
        this.rowMost = null
        this.rowEmerge = null
        this.detailTitle = null
        this.detailBody = null
        this.bentoEl = null
        this.ctaBtn = null
    }

    /**
     * Open the sheet for a HoverProbe target.
     *   target = { kind: 'tree'|'flower'|'fruit'|'kira', species?, group, x, z }
     */
    openFor(target)
    {
        const evidence = resolveElementEvidence(target, this.state.profile)
        const facetId = evidence.facetId || facetIdForTarget(target)
        const theme   = FACET_THEMES[facetId]   ?? FACET_THEMES.values
        const header  = FACET_HEADERS[facetId]  ?? FACET_HEADERS.values

        this.root.style.setProperty('--facet-accent', theme.accent)
        this.root.style.setProperty('--facet-soft',   theme.soft)
        this.root.style.setProperty('--facet-ink',    theme.ink)

        this.eyebrow.textContent    = header.eyebrow
        this.tag.textContent        = header.tag
        this.titleEl.textContent    = header.title
        this.subtitleEl.textContent = header.subtitle

        this._renderRows(facetId)
        this._renderDetail(target, facetId, evidence)
        this._renderCta(facetId, header, evidence)

        this.activeFacetId = facetId
        this.activeClaimId = evidence.claimId

        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this._setFull(false)
        this.isOpen = true

        // Move focus to the handle so keyboard users can immediately
        // pull-to-expand or tab to the close button. defer one frame so
        // the focus moves AFTER aria-hidden flips.
        requestAnimationFrame(() => this.handle?.focus({ preventScroll: true }))
    }

    close()
    {
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
        this.isOpen = false
        this._setFull(false)
        // No DOM trigger to restore (the trigger is a 3D canvas click);
        // blur so focus rests on the body / orbit-control surface.
        if(document.activeElement && this.root.contains(document.activeElement))
            document.activeElement.blur()
    }

    toggleFull()
    {
        this._setFull(!this.isFull)
    }

    _setFull(full)
    {
        this.isFull = full
        this.root.classList.toggle('is-full', full)
        this.handle.setAttribute('aria-expanded', full ? 'true' : 'false')
        this.handle.setAttribute('aria-label', full ? 'Collapse to half view' : 'Expand to full page')
    }

    _renderRows(facetId)
    {
        if(facetId === 'mood')
        {
            const pins  = this.state.moodPins?.recent?.(5) ?? []
            const top   = pins[0]
            const last  = pins[pins.length - 1]
            this.rowMost.textContent   = top  ? `${cap(top.emotion)} — ${top.intensity}/4` : 'Still listening.'
            this.rowEmerge.textContent = last && last !== top
                ? `${cap(last.emotion)} — ${last.intensity}/4`
                : 'Capture one today to seed the picture.'
            return
        }

        const ranked = rankClaims(facetId, this.state.profile)
        if(!ranked)
        {
            this.rowMost.textContent = this.rowEmerge.textContent = ''
            return
        }
        this.rowMost.textContent   = ranked.mostCommon.label
        this.rowEmerge.textContent = ranked.quietlyEmerging.label
    }

    _renderDetail(target, facetId, evidence = null)
    {
        this.detailTitle.textContent = elementTitle(evidence, elementTitleForTarget(target))
        this.detailBody.textContent  = elementBodyForEvidence(evidence, target)

        if(facetId === 'mood')
        {
            const pins = this.state.moodPins?.recent?.(5) ?? []
            this.bentoEl.innerHTML = pins.length === 0
                ? `<p class="bento-empty">No mood pins yet — tap Capture to log one.</p>`
                : pins.map((p) => `
                    <div class="bento bento--pin">
                        <span class="bento__dot" style="background:${this._pinColor(p.emotion)}"></span>
                        <div class="bento__body">
                            <div class="bento__head">${cap(p.emotion)}</div>
                            <div class="bento__sub">${p.intensity}/4 · ${p.entryDate ?? ''}</div>
                        </div>
                    </div>
                `).join('')
            return
        }

        const place = compassBucket(target.x ?? 0, target.z ?? 0)
        const sp = speciesIdOf(target)
        const rows = []
        if(evidence?.claimId)
        {
            rows.push(this._bentoRow('Claim', evidence.claimLabel))
            rows.push(this._bentoRow('Evidence', evidenceCountText(evidence)))
            if(evidence.latestQuoteText)
                rows.push(this._bentoRow('Latest noticing', `“${truncate(evidence.latestQuoteText, 96)}”`))
        }
        rows.push(this._bentoRow('Where it lives', place))

        const sameSpecies = (e) => speciesIdOf(e) === sp

        if(facetId === 'values' && this.view.tree?.entries)
        {
            const others = this.view.tree.entries.filter(sameSpecies).length - 1
            rows.push(this._bentoRow('Companions', others <= 0 ? 'only one of its kind' : `${others} other ${pluralize(sp, others)} on the island`))
        }
        else if(facetId === 'interests' && this.view.flowers?.flowers)
        {
            const others = this.view.flowers.flowers.filter(sameSpecies).length - 1
            rows.push(this._bentoRow('Companions', others <= 0 ? 'first of its species' : `${others} other ${pluralize(sp, others)} nearby`))
        }
        else if(facetId === 'skills' && this.view.fruits)
        {
            const all = this.view.fruits.entries ?? []
            const others = all.filter(sameSpecies).length - 1
            rows.push(this._bentoRow('Companions', others <= 0 ? 'only one ripening' : `${others} other ${pluralize(sp, others)} ripening nearby`))
        }
        this.bentoEl.innerHTML = rows.join('')
    }

    _bentoRow(label, value)
    {
        return `
            <div class="bento bento--row">
                <span class="bento__label">${escapeHtml(label)}</span>
                <span class="bento__value">${escapeHtml(value)}</span>
            </div>
        `
    }

    /**
     * The "see all" CTA at the bottom of the half-sheet. From a specific
     * Daisy card it reads "See all your interests →" and lifts the student
     * into the Interests tab of the ProfileSheet. Hidden for mood (Kira)
     * since the mood thread doesn't have a corresponding VIPS tab.
     */
    _renderCta(facetId, header, evidence = null)
    {
        if(!facetId || facetId === 'mood')
        {
            this.ctaBtn.hidden = true
            return
        }
        const tag = (header?.tag || facetId).toLowerCase()
        this.ctaBtn.hidden = false
        this.ctaBtn.textContent = evidence?.claimLabel
            ? `Open ${evidence.claimLabel} timeline →`
            : `See all your ${tag} →`
        this.ctaBtn.dataset.facet = facetId
    }

    _openProfile()
    {
        const facetId = this.activeFacetId
        if(!facetId || facetId === 'mood') return
        const controller = OverlayController.getInstance()
        // Close the half-sheet first so we don't leave two surfaces stacked.
        this.close()
        controller.open('profile', {
            tab: facetId,
            ...(this.activeClaimId ? { claimId: this.activeClaimId } : {}),
        })
    }

    _pinColor(emotion)
    {
        const palette = {
            joy: '#FFD66B', sadness: '#7FB3D9', anger: '#E36A55', fear: '#B49AD6',
            disgust: '#9CC36E', anxiety: '#F1A04E', envy: '#6FC2B3',
            embarrassment: '#F0A6B5', ennui: '#A8A5BD',
        }
        return palette[emotion] || '#888'
    }

    update() {}
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }

// Light English pluralisation for the small species set we use. Singular is
// passed in when n === 1 (the caller does its own ≤1 branch).
const PLURALS = { cherry: 'cherries', lily: 'lilies', daisy: 'daisies', berry: 'berries' }
function pluralize(word, n)
{
    if(n === 1) return word
    if(!word) return word
    if(PLURALS[word]) return PLURALS[word]
    if(/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, 'ies')
    if(/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
    return `${word}s`
}

function truncate(text, maxLength)
{
    const clean = String(text || '').replace(/\s+/g, ' ').trim()
    if(clean.length <= maxLength) return clean
    return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function escapeHtml(s)
{
    return String(s || '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch])
}
