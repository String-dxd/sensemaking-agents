import State from '../State/State.js'
import Game from '../Game.js'
import { escapeAttr, escapeHtml } from '../util/html.js'
import SheetChrome from './SheetChrome.js'
import { trajectoryFor, traitChipOf, ecgChipOf } from './trajectoryHeuristics.js'
import {
    statusFor,
    statusLabelOf,
    statusCopyOf,
    actionsForCluster,
    DIFFUSED_NUDGES,
    STARTER_PROMPT,
    FORECLOSED_CHALLENGE_PROMPT,
} from './statusHeuristics.js'
import { disclosureHTML, bindDisclosureToggles, statTileRowHTML } from './visualPrimitives.js'
import { _auditEcgAffinities } from '../Data/ecgClusters.js'

// Companion display name — falls back to 'Kira' before the first-run
// ceremony writes identity.companionName. Inlined per-site to keep this
// sheet's read footprint small.
function _companionName()
{
    return State.getInstance()?.profile?.displayCompanionName?.() || 'Kira'
}


/**
 * TrajectorySheet — full-viewport "Path Finder" overlay reachable from the
 * top-right Path Finder chip and from the telescope on the island rim.
 *
 * CCE redesign (2026-05-19, plan: docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md):
 *
 * The sheet now branches by inferred Marcia identity status (Starter /
 * Diffused / Searching / Foreclosed / Achieved). Status is classified by
 * statusHeuristics.js from current Profile / Captures / Choices state at
 * open time — never cached across opens so a newly-logged decision moves
 * the student to a new quadrant on the next open.
 *
 *   - Starter   → single CTA opening Ask with a starter prompt
 *   - Diffused  → three reflection nudges (each opens Ask with a seed)
 *   - Searching → existing through-line + bearings layout (current UX)
 *   - Foreclosed→ committed direction + adjacent bearings + challenge CTA
 *   - Achieved  → bearings re-skinned with per-cluster concrete action lists
 *
 * "Show me all paths" escape hatch is available on every non-starter status
 * so a student can step out of the inferred frame.
 */
export default class TrajectorySheet
{
    constructor()
    {
        this.state    = State.getInstance()
        this.captures = this.state.captures
        this.profile  = this.state.profile
        this.choices  = this.state.choices || null
        this.backend  = this.state.backend || null
        this.statusOverride = this.state.identityStatusOverride || null

        // Cheap sanity audit at construct time — surface any taxonomy drift
        // before the first user open. The function only console.warns.
        _auditEcgAffinities()

        // SheetChrome owns backdrop, blur, fade, z-tier, the × button, the
        // Escape-to-close listener, AND the shared header (eyebrow + title +
        // subtitle). Under the Gather-style split layout, the left pane
        // (introSlot) carries the status pill + meta + head actions + reason
        // tooltip, and the right pane (bodySlot) carries the pathway content.
        // Header text is dynamic per status and updated each open via
        // chrome.setHeader(...). See CLAUDE.md "Sheet chrome contract".
        this.chrome = new SheetChrome({
            key:            'trajectory',
            sheetClassName: 'trajectory-sheet',
            // Path Finder is now a routed page (/trajectory) — close is via
            // browser back / SideRail / Escape, not a × button.
            withCloseButton: false,
            closeOnBackdrop: false,
            layout:         'split',
            // Escape and other dismiss paths go through the router so the
            // URL stays the source of truth.
            onCloseRequest: () => Game.getInstance()?.navigate('/'),
            header: {
                title:    'Path Finder',
                subtitle: 'Bearings the evidence points toward as you explore who you might become.',
            },
        })
        this.chrome.introSlot.innerHTML = `
            <div class="trajectory-sheet__status-row" data-role="status-row" hidden>
                <span class="trajectory-sheet__status-pill" data-role="status-pill"
                      tabindex="0"
                      role="button"
                      aria-haspopup="true"
                      aria-expanded="false">
                    <span class="trajectory-sheet__status-dot" aria-hidden="true"></span>
                    <span class="trajectory-sheet__status-label" data-role="status-label"></span>
                </span>
                <span class="trajectory-sheet__status-reason" data-role="status-reason" hidden></span>
            </div>

            <h2 class="trajectory-sheet__status-title" data-role="status-title"></h2>
            <p class="trajectory-sheet__status-tldr" data-role="status-tldr" hidden></p>

            <p class="trajectory-sheet__meta" data-role="meta" hidden></p>
            <div class="trajectory-sheet__head-actions" data-role="head-actions"></div>
            <div class="trajectory-sheet__why-slot" data-role="why-slot"></div>
        `
        this.chrome.bodySlot.innerHTML = `
            <div class="trajectory-sheet__scroll">
                <section class="trajectory-sheet__body" data-role="body"></section>
            </div>
        `

        const root = this.chrome.root
        this.root      = root
        // Chrome scrolls the viewport; we still reset its scrollTop on open.
        this.scrollEl  = root
        this.metaEl    = root.querySelector('[data-role="meta"]')
        this.statusRowEl    = root.querySelector('[data-role="status-row"]')
        this.statusPillEl   = root.querySelector('[data-role="status-pill"]')
        this.statusLabelEl  = root.querySelector('[data-role="status-label"]')
        this.statusReasonEl = root.querySelector('[data-role="status-reason"]')
        this.statusTitleEl  = root.querySelector('[data-role="status-title"]')
        this.statusTldrEl   = root.querySelector('[data-role="status-tldr"]')
        this.headActionsEl  = root.querySelector('[data-role="head-actions"]')
        this.whySlotEl      = root.querySelector('[data-role="why-slot"]')
        this.bodyEl    = root.querySelector('[data-role="body"]')

        // Wire chevron toggles for the "Why this status" disclosure and any
        // future disclosures rendered into the sheet's root.
        this._unbindDisclosure = bindDisclosureToggles(root)

        this.isOpen      = false
        this.activeIndex = 0
        this.bearings    = []
        this.escapeHatch = false  // when true, force "Show me all paths" layout

        // Toggle the reason tooltip on pill click. Keyboard users get the same
        // affordance via Enter/Space (tabindex on the pill).
        this.statusPillEl.addEventListener('click', () => this._toggleStatusReason())
        this.statusPillEl.addEventListener('keydown', (event) =>
        {
            if(event.key === 'Enter' || event.key === ' ')
            {
                event.preventDefault()
                this._toggleStatusReason()
            }
        })

        // Re-render the sheet body when the override changes from elsewhere
        // (the StatusPreviewHud floating widget owns the UI; this sheet only
        // listens so it re-skins itself when the override flips while open).
        if(this.statusOverride?.subscribe)
        {
            this._unwireStatusOverride = this.statusOverride.subscribe(() =>
            {
                if(this.isOpen) this._refreshFromOverride()
            })
        }
    }

    /**
     * Tear-down hook called from View.dispose() via SUBSYSTEMS.
     */
    dispose()
    {
        if(this._unwireStatusOverride)
        {
            try { this._unwireStatusOverride() } catch(_) {}
            this._unwireStatusOverride = null
        }
        if(this._unbindDisclosure)
        {
            try { this._unbindDisclosure() } catch(_) {}
            this._unbindDisclosure = null
        }
        try { this.chrome?.dispose?.() } catch(_) {}
        this.chrome = null
        this.root = null
    }

    open()
    {
        if(!this.chrome) return
        // Recompute status fresh every open — never cached. A newly-logged
        // decision should move the student to the next quadrant on reopen.
        this.escapeHatch = false
        const audit = this._currentAudit()
        const capture = this._needsBearings(audit.status) ? this._ensureCapture(audit) : null
        this._renderForStatus(audit, capture)

        this.chrome.open()
        this.isOpen = true
        if(this.scrollEl) this.scrollEl.scrollTop = 0
    }

    close()
    {
        if(!this.isOpen) return
        if(this.root?.contains?.(document.activeElement)) document.activeElement.blur()
        this.isOpen = false
        try { this.chrome?.close?.() } catch(_) {}
    }

    // ── Status & data ─────────────────────────────────────────────────────

    _currentAudit()
    {
        const inferred = statusFor({
            facets:     this.profile?.facets,
            captures:   this.captures?.entries,
            decisions:  this.choices?.decisions,
            intentions: this.choices?.intentions,
            dominantPatternTag: this.choices?.dominantPatternTag?.() || null,
        })
        // A manual override from the Profile controller wins over the
        // inferred status. We keep the inferred audit's exploration +
        // commitment data so the reason line is honest about both the
        // chosen quadrant *and* what the real evidence looks like.
        const overrideId = this.statusOverride?.current || null
        if(!overrideId) return inferred
        // If the override happens to match what the evidence already infers,
        // there's nothing to *override* — return the inferred audit so the
        // pill doesn't read "PREVIEW · Searching · inferred Searching", which
        // is tautological and signals a state that isn't actually being
        // shadowed.
        if(overrideId === inferred.status) return inferred
        return {
            ...inferred,
            status:        overrideId,
            isOverride:    true,
            inferredStatus: inferred.status,
            reason: `Previewing as ${statusLabelOf(overrideId)}. ` +
                    `Inferred status from current evidence is ${statusLabelOf(inferred.status)}. ` +
                    inferred.reason,
        }
    }

    _needsBearings(status)
    {
        // Starter + Diffused do not show pathway bearings — the student
        // doesn't have enough profile signal for bearings to be honest.
        if(status === 'starter') return false
        if(status === 'diffused') return false
        return true
    }

    _ensureCapture(audit = null)
    {
        const existing = this._latestTrajectoryCapture()
        if(existing && existing.trajectory && Array.isArray(existing.trajectory.bearings) && existing.trajectory.bearings.length > 0)
            return existing
        if(this.state.backendActive) return null
        // Don't mint a fresh trajectory capture for a preview-only flip. The
        // override HUD is an admin affordance — writing to Captures would
        // fan to Sprouts.grow and pollute the on-island state with bearings
        // the student's real evidence never asked for. Return an in-memory
        // capture so the panel still renders; nothing persists.
        const trajectory = trajectoryFor(this.profile?.facets, this.profile?.identity)
        if(audit?.isOverride)
        {
            return {
                kind:      'trajectory',
                trajectory,
                createdAt: new Date().toISOString(),
                _previewOnly: true,
            }
        }
        const capture = this.captures.add({
            kind: 'trajectory',
            trajectory,
        })
        return capture
    }

    async _runBackendTrajectory(button)
    {
        if(!this.backend?.runTrajectory) return
        const target = button || this.headActionsEl.querySelector('[data-action="run"]')
        if(target)
        {
            target.disabled = true
            target.textContent = 'Running...'
        }
        try
        {
            await this.backend.runTrajectory()
            const snapshot = await this.backend.refreshSnapshot?.()
            if(snapshot) this.state.applyBackendSnapshot?.(snapshot)
            const audit = this._currentAudit()
            const capture = this._latestTrajectoryCapture()
            this._renderForStatus(audit, capture)
            if(target) target.textContent = 'Updated'
        }
        catch(err)
        {
            console.warn('[TrajectorySheet] backend trajectory run failed', err)
            if(target) target.textContent = 'Run failed'
        }
        finally
        {
            setTimeout(() =>
            {
                const live = this.headActionsEl.querySelector('[data-action="run"]')
                if(!live) return
                live.disabled = false
                live.textContent = 'Run sense-making'
            }, 1600)
        }
    }

    _latestTrajectoryCapture()
    {
        const entries = this.captures?.entries
        if(!Array.isArray(entries)) return null
        for(let i = entries.length - 1; i >= 0; i--)
        {
            const c = entries[i]
            if(c.kind === 'trajectory' && c.trajectory && c.backendCartographerOutputId) return c
        }
        if(this.state.backendActive) return null
        for(let i = entries.length - 1; i >= 0; i--)
        {
            const c = entries[i]
            if(c.kind === 'trajectory' && c.trajectory) return c
        }
        return null
    }

    // ── Render ────────────────────────────────────────────────────────────

    _renderForStatus(audit, capture)
    {
        const status = this.escapeHatch ? 'searching' : audit.status
        const copy = statusCopyOf(status, this.profile?.identity)

        // Chrome header stays static ("Path Finder" + general subtitle).
        // The status-driven title + tldr live in the intro slot below the
        // chrome divider so the page reads as "Path Finder · description
        // · then the per-status orientation" rather than the page name
        // shape-shifting per status. The full long-form `lead` paragraph
        // moves into a "Why this status" disclosure beneath the head
        // actions so the cold-open weight drops.
        if(this.statusTitleEl)
        {
            this.statusTitleEl.textContent = copy.title || ''
            this.statusTitleEl.hidden = !copy.title
        }
        if(this.statusTldrEl)
        {
            const tldr = copy.tldr || ''
            this.statusTldrEl.textContent = tldr
            this.statusTldrEl.hidden = !tldr
        }

        // "Why this status" disclosure — collapsed by default once the sheet
        // has been open. Contains the full lead paragraph that used to live
        // in the chrome subtitle.
        if(this.whySlotEl)
        {
            if(copy.lead && copy.lead !== (copy.tldr || copy.lead))
            {
                this.whySlotEl.innerHTML = disclosureHTML({
                    id:       `why-${status}`,
                    summary:  'Why this status',
                    content:  `<p class="trajectory-sheet__why-body">${escapeHtml(copy.lead)}</p>`,
                    expanded: false,
                })
            }
            else
            {
                this.whySlotEl.innerHTML = ''
            }
        }

        // Status pill is always shown (even on escape) so the student can
        // see what status they were classified as. The label tracks the
        // underlying audit, not the escape-hatch override.
        this.root.dataset.status = audit.status
        this.root.dataset.preview = audit.isOverride ? 'on' : 'off'
        this.statusRowEl.hidden = false
        const previewPrefix = audit.isOverride ? 'PREVIEW · ' : ''
        this.statusLabelEl.textContent = `${previewPrefix}${statusLabelOf(audit.status)}`
        this.statusReasonEl.textContent = audit.reason
        this.statusReasonEl.hidden = true
        this.statusPillEl.setAttribute('aria-expanded', 'false')

        // Head actions: per-status buttons + universal "Show me all paths".
        this.headActionsEl.innerHTML = ''
        this._renderHeadActions(audit, status)

        // Body branches by status. capture is non-null only for the
        // bearings-bearing statuses (searching / foreclosed / achieved /
        // escape).
        if(status === 'starter')        this._renderStarter()
        else if(status === 'diffused')  this._renderDiffused()
        else if(!capture?.trajectory)   this._renderEmptyBearings(status)
        else if(status === 'searching') this._renderSearching(capture)
        else if(status === 'foreclosed')this._renderForeclosed(capture)
        else if(status === 'achieved')  this._renderAchieved(capture)
        else                            this._renderSearching(capture)

        this._renderMeta(capture, status)
    }

    _renderHeadActions(audit, status)
    {
        // Run-sense-making button — only when a backend is wired AND the
        // status uses bearings. Starter/Diffused students don't have enough
        // signal for a useful Cartographer run yet.
        if(this.backend?.runTrajectory && this._needsBearings(status))
        {
            const run = document.createElement('button')
            run.type = 'button'
            run.className = 'trajectory-sheet__run'
            run.dataset.action = 'run'
            run.textContent = 'Run sense-making'
            run.addEventListener('click', (event) => this._runBackendTrajectory(event.currentTarget))
            this.headActionsEl.appendChild(run)
        }

        // "Show me all paths" escape hatch — when the audit picked a non-
        // searching status, offer the student a one-tap return to the full
        // bearings layout. They should never feel typecast.
        if(audit.status !== 'starter' && audit.status !== 'searching' && !this.escapeHatch)
        {
            const escape = document.createElement('button')
            escape.type = 'button'
            escape.className = 'trajectory-sheet__escape'
            escape.textContent = 'Show me all paths'
            escape.addEventListener('click', () =>
            {
                this.escapeHatch = true
                const capture = this._ensureCapture(audit)
                this._renderForStatus(audit, capture)
            })
            this.headActionsEl.appendChild(escape)
        }

        // When escape is engaged, offer a way back to the inferred frame.
        if(this.escapeHatch)
        {
            const back = document.createElement('button')
            back.type = 'button'
            back.className = 'trajectory-sheet__escape'
            back.textContent = `Back to ${statusLabelOf(audit.status)}`
            back.addEventListener('click', () =>
            {
                this.escapeHatch = false
                const capture = this._needsBearings(audit.status) ? this._ensureCapture(audit) : null
                this._renderForStatus(audit, capture)
            })
            this.headActionsEl.appendChild(back)
        }
    }

    _renderMeta(capture, status)
    {
        if(!capture?.trajectory || !this._needsBearings(status))
        {
            this.metaEl.hidden = true
            this.metaEl.textContent = ''
            return
        }
        const bearings = capture.trajectory.bearings || []
        const when = new Date(capture.createdAt)
        const dateStr = `${when.toLocaleDateString()}, ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        const count = bearings.length === 1 ? '1 pathway' : `${bearings.length} pathways`
        // Stat tile row replaces the flat meta line — gives the cold open
        // visual rhythm. Screen readers still get the count + date via the
        // tile labels and the sr-only fallback paragraph.
        this.metaEl.hidden = false
        this.metaEl.innerHTML = statTileRowHTML([
            { value: String(bearings.length), label: 'Pathways' },
            { value: this._relativeTime(when), label: 'Last generated' },
        ]) + `<span class="sr-only">Generated ${dateStr} · ${count}</span>`
    }

    /**
     * Compact "N ago" relative-time formatter for the Last generated tile.
     * Falls back to the local date string for anything older than a week.
     */
    _relativeTime(date)
    {
        const ms = Date.now() - date.getTime()
        const mins = Math.round(ms / 60000)
        if(mins < 1)   return 'Just now'
        if(mins < 60)  return `${mins}m ago`
        const hours = Math.round(mins / 60)
        if(hours < 24) return `${hours}h ago`
        const days = Math.round(hours / 24)
        if(days < 7)   return `${days}d ago`
        return date.toLocaleDateString()
    }

    _renderStarter()
    {
        const card = document.createElement('div')
        card.className = 'trajectory-sheet__starter'
        card.innerHTML = `
            <div class="trajectory-starter__card">
                <p class="trajectory-starter__title">${escapeHtml(STARTER_PROMPT.title.replace('{companionName}', _companionName()))}</p>
                <p class="trajectory-starter__prompt">${escapeHtml(STARTER_PROMPT.prompt)}</p>
                <button type="button" class="trajectory-starter__cta">
                    Start a chat with ${escapeHtml(_companionName())} <span aria-hidden="true">→</span>
                </button>
            </div>
        `
        const cta = card.querySelector('.trajectory-starter__cta')
        cta.addEventListener('click', () => this._openAskWithPrompt(STARTER_PROMPT.prompt))
        this.bodyEl.replaceChildren(card)
    }

    _renderDiffused()
    {
        const wrap = document.createElement('div')
        wrap.className = 'trajectory-sheet__nudges'
        wrap.innerHTML = `
            <p class="trajectory-nudges__label">PICK A NUDGE</p>
            <ul class="trajectory-nudges__list" role="list"></ul>
        `
        const list = wrap.querySelector('.trajectory-nudges__list')
        for(const nudge of DIFFUSED_NUDGES)
        {
            const li = document.createElement('li')
            li.className = 'trajectory-nudges__item'
            li.innerHTML = `
                <button type="button" class="trajectory-nudge">
                    <span class="trajectory-nudge__title">${escapeHtml(nudge.title)}</span>
                    <span class="trajectory-nudge__prompt">${escapeHtml(nudge.prompt)}</span>
                    <span class="trajectory-nudge__cta" aria-hidden="true">Reflect with ${escapeHtml(_companionName())} →</span>
                </button>
            `
            li.querySelector('button').addEventListener('click', () => this._openAskWithPrompt(nudge.prompt))
            list.appendChild(li)
        }
        this.bodyEl.replaceChildren(wrap)
    }

    _renderEmptyBearings(status)
    {
        const card = document.createElement('div')
        card.className = 'trajectory-sheet__empty'
        const lead = this.state.backendActive
            ? 'No backend trajectory has been generated yet.'
            : 'No trajectory has been generated yet.'
        const sub = this.backend?.runTrajectory
            ? 'Run sense-making to generate a Cartographer trajectory.'
            : 'Open Path Finder after more profile evidence is available.'
        card.innerHTML = `
            <p class="trajectory-empty__lead">${escapeHtml(lead)}</p>
            <p class="trajectory-empty__sub">${escapeHtml(sub)}</p>
        `
        this.bodyEl.replaceChildren(card)
    }

    /**
     * Searching quadrant — the existing UX. Through-line is already in the
     * lead, so we render the tabs + panel for the bearings.
     */
    _renderSearching(capture)
    {
        const trajectory = capture.trajectory
        const bearings = trajectory.bearings || []
        this.bearings = bearings

        const throughLine = (trajectory.throughLine || '').trim()
        const wrap = document.createElement('div')
        wrap.className = 'trajectory-sheet__bearings'
        wrap.innerHTML = `
            ${throughLine ? `<p class="trajectory-sheet__throughline">${escapeHtml(throughLine)}</p>` : ''}
            <nav class="trajectory-sheet__tabs" role="tablist" data-role="tabs"></nav>
            <section class="trajectory-sheet__panel" data-role="panel">
                <header class="trajectory-panel__head">
                    <span class="trajectory-panel__index" data-role="panel-index"></span>
                    <h3 class="trajectory-panel__title" data-role="panel-title"></h3>
                </header>
                <p class="trajectory-panel__prompt" data-role="panel-prompt"></p>

                <section class="disclosure trajectory-panel__evidence"
                         data-role="panel-evidence"
                         data-expanded="false"
                         hidden>
                    <button class="disclosure__toggle trajectory-panel__evidence-toggle"
                            type="button"
                            aria-expanded="false">
                        <span class="disclosure__chevron" aria-hidden="true"></span>
                        <span class="disclosure__summary">See evidence</span>
                    </button>
                    <div class="disclosure__panel">
                        <div class="disclosure__panel-inner">
                            <div class="trajectory-panel__chips" data-role="panel-trait-group" hidden>
                                <p class="trajectory-panel__chip-label">TRAIT COMBINATION</p>
                                <div class="trajectory-panel__chip-row" data-role="panel-traits"></div>
                            </div>

                            <div class="trajectory-panel__chips" data-role="panel-ecg-group" hidden>
                                <p class="trajectory-panel__chip-label">ECG REGION TAGS</p>
                                <div class="trajectory-panel__chip-row" data-role="panel-ecg"></div>
                            </div>

                            <div class="trajectory-panel__risk" data-role="panel-risk-group" hidden>
                                <p class="trajectory-panel__chip-label">RISKS AND TRADEOFFS</p>
                                <p class="trajectory-panel__risk-text" data-role="panel-risk"></p>
                            </div>
                        </div>
                    </div>
                </section>

                <a class="trajectory-panel__cta" data-role="panel-cta"
                   target="_blank" rel="noopener noreferrer" hidden>
                    Explore on MySkillsFuture
                    <span class="trajectory-panel__cta-arrow" aria-hidden="true">↗</span>
                </a>
            </section>
        `

        this.bodyEl.replaceChildren(wrap)
        this.tabsEl       = wrap.querySelector('[data-role="tabs"]')
        this.panelEl      = wrap.querySelector('[data-role="panel"]')
        this.panelIndexEl = wrap.querySelector('[data-role="panel-index"]')
        this.panelTitleEl = wrap.querySelector('[data-role="panel-title"]')
        this.panelPromptEl= wrap.querySelector('[data-role="panel-prompt"]')
        this.panelEvidenceEl = wrap.querySelector('[data-role="panel-evidence"]')
        this.panelTraitGrp= wrap.querySelector('[data-role="panel-trait-group"]')
        this.panelTraitsEl= wrap.querySelector('[data-role="panel-traits"]')
        this.panelEcgGrp  = wrap.querySelector('[data-role="panel-ecg-group"]')
        this.panelEcgEl   = wrap.querySelector('[data-role="panel-ecg"]')
        this.panelRiskGrp = wrap.querySelector('[data-role="panel-risk-group"]')
        this.panelRiskEl  = wrap.querySelector('[data-role="panel-risk"]')
        this.panelCtaEl   = wrap.querySelector('[data-role="panel-cta"]')

        this.tabsEl.innerHTML = bearings.map((b, i) => `
            <button type="button"
                    class="trajectory-tab${i === 0 ? ' is-active' : ''}"
                    role="tab"
                    aria-selected="${i === 0 ? 'true' : 'false'}"
                    data-index="${i}">
                <span class="trajectory-tab__num">${i + 1}</span>
                <span class="trajectory-tab__label">${escapeHtml(b.title)}</span>
            </button>
        `).join('')

        this.tabsEl.addEventListener('click', (event) =>
        {
            const tab = event.target.closest?.('.trajectory-tab')
            if(!tab) return
            const idx = parseInt(tab.dataset.index, 10)
            if(!Number.isNaN(idx)) this._setActive(idx)
        })

        this._setActive(0)
    }

    /**
     * Foreclosed quadrant — surface the committed direction first, then
     * the top 2 adjacent bearings (slicing off the most-confident first
     * one to leave room for "widen the lens"). Adds a challenge prompt CTA.
     */
    _renderForeclosed(capture)
    {
        const trajectory = capture.trajectory
        const bearings = (trajectory.bearings || []).slice(0, 2)
        const committed = this._readCommittedDirection()

        const wrap = document.createElement('div')
        wrap.className = 'trajectory-sheet__foreclosed-frame'
        const directionBlock = committed
            ? `<section class="trajectory-foreclosed__direction">
                   <p class="trajectory-foreclosed__label">YOUR COMMITTED DIRECTION</p>
                   <p class="trajectory-foreclosed__direction-text">${escapeHtml(committed)}</p>
               </section>`
            : ''

        wrap.innerHTML = `
            ${directionBlock}
            <section class="trajectory-foreclosed__widen">
                <p class="trajectory-foreclosed__label">WORTH HOLDING UP NEXT TO YOURS</p>
                <ol class="trajectory-foreclosed__list"></ol>
            </section>
            <section class="trajectory-foreclosed__challenge">
                <p class="trajectory-foreclosed__challenge-q">${escapeHtml(FORECLOSED_CHALLENGE_PROMPT.title)}</p>
                <button type="button" class="trajectory-foreclosed__cta">Open the question with ${escapeHtml(_companionName())} →</button>
            </section>
        `

        const list = wrap.querySelector('.trajectory-foreclosed__list')
        for(const [i, bearing] of bearings.entries())
        {
            const li = document.createElement('li')
            li.className = 'trajectory-foreclosed__item'
            li.innerHTML = `
                <h3 class="trajectory-foreclosed__title">
                    <span class="trajectory-foreclosed__index">${i + 1}</span>
                    ${escapeHtml(bearing.title || '')}
                </h3>
                <p class="trajectory-foreclosed__prompt">${escapeHtml(bearing.prompt || '')}</p>
            `
            list.appendChild(li)
        }

        wrap.querySelector('.trajectory-foreclosed__cta')
            .addEventListener('click', () => this._openAskWithPrompt(FORECLOSED_CHALLENGE_PROMPT.prompt))

        this.bodyEl.replaceChildren(wrap)
    }

    /**
     * Achieved quadrant — bearings are re-skinned as cards with a
     * per-cluster 3-item concrete action list. No tabs; the student is
     * meant to see all three at once and pick one to act on this term.
     */
    _renderAchieved(capture)
    {
        const trajectory = capture.trajectory
        const bearings = trajectory.bearings || []

        const wrap = document.createElement('div')
        wrap.className = 'trajectory-sheet__achieved'
        wrap.innerHTML = `<ol class="trajectory-achieved__list"></ol>`
        const list = wrap.querySelector('.trajectory-achieved__list')

        for(const [i, bearing] of bearings.entries())
        {
            const actions = actionsForCluster(bearing.clusterId)
            const li = document.createElement('li')
            li.className = 'trajectory-achieved__item'
            li.innerHTML = `
                <header class="trajectory-achieved__head">
                    <span class="trajectory-achieved__index">${i + 1}</span>
                    <h3 class="trajectory-achieved__title">${escapeHtml(bearing.title || '')}</h3>
                </header>
                <p class="trajectory-achieved__prompt">${escapeHtml(bearing.prompt || '')}</p>
                <p class="trajectory-achieved__actions-label">NEXT CONCRETE STEPS</p>
                <ol class="trajectory-achieved__actions">
                    ${actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
                </ol>
                ${bearing.msfUrl ? `
                    <a class="trajectory-achieved__cta" href="${escapeAttr(bearing.msfUrl)}"
                       target="_blank" rel="noopener noreferrer">
                        Explore on MySkillsFuture
                        <span aria-hidden="true">↗</span>
                    </a>
                ` : ''}
            `
            list.appendChild(li)
        }

        this.bodyEl.replaceChildren(wrap)
    }

    _readCommittedDirection()
    {
        // Prefer the most recent intention's `change` (forward-facing direction
        // the student has named). Fall back to the most recent decision's
        // `chose` if no intentions are logged yet.
        const intentions = this.choices?.intentions
        if(Array.isArray(intentions) && intentions.length > 0)
        {
            const latest = intentions[intentions.length - 1]
            if(latest?.change) return latest.change
        }
        const decisions = this.choices?.decisions
        if(Array.isArray(decisions) && decisions.length > 0)
        {
            const latest = decisions[decisions.length - 1]
            if(latest?.chose) return latest.chose
            if(latest?.decision) return latest.decision
        }
        return null
    }

    _setActive(idx)
    {
        if(idx < 0 || idx >= this.bearings.length) return
        this.panelEl.hidden = false
        this.activeIndex = idx
        const bearing = this.bearings[idx]

        for(const tab of this.tabsEl.querySelectorAll('.trajectory-tab'))
        {
            const tabIdx = parseInt(tab.dataset.index, 10)
            const on = tabIdx === idx
            tab.classList.toggle('is-active', on)
            tab.setAttribute('aria-selected', on ? 'true' : 'false')
        }

        this.panelIndexEl.textContent = `PATH ${idx + 1}`
        this.panelTitleEl.textContent = bearing.title || ''
        this.panelPromptEl.textContent = bearing.prompt || ''

        const traits = bearing.traitTags || []
        this.panelTraitGrp.hidden = traits.length === 0
        this.panelTraitsEl.innerHTML = traits.map((id) =>
        {
            const c = traitChipOf(id)
            const kicker = c.kicker
                ? `<span class="trajectory-chip__kicker">${escapeHtml(c.kicker)}</span>
                   <span class="trajectory-chip__sep" aria-hidden="true">→</span>`
                : ''
            return `<span class="trajectory-chip" title="${escapeAttr(c.title)}">
                ${kicker}<span class="trajectory-chip__label">${escapeHtml(c.label)}</span>
            </span>`
        }).join('')

        const ecg = bearing.ecgTags || []
        this.panelEcgGrp.hidden = ecg.length === 0
        this.panelEcgEl.innerHTML = ecg.map((id) =>
        {
            const c = ecgChipOf(id)
            return `<span class="trajectory-chip trajectory-chip--ecg" title="${escapeAttr(c.title)}">${escapeHtml(c.label)}</span>`
        }).join('')

        this.panelRiskGrp.hidden = !bearing.risk
        this.panelRiskEl.textContent = bearing.risk || ''

        // Show the "See evidence" disclosure only when there's evidence to
        // reveal; reset to collapsed on every tab switch so each pathway
        // opens glanceable.
        if(this.panelEvidenceEl)
        {
            const hasEvidence = traits.length > 0 || ecg.length > 0 || !!bearing.risk
            this.panelEvidenceEl.hidden = !hasEvidence
            this.panelEvidenceEl.setAttribute('data-expanded', 'false')
            const toggle = this.panelEvidenceEl.querySelector('.disclosure__toggle')
            toggle?.setAttribute('aria-expanded', 'false')
        }

        if(bearing.msfUrl)
        {
            this.panelCtaEl.hidden = false
            this.panelCtaEl.href = bearing.msfUrl
        }
        else
        {
            this.panelCtaEl.hidden = true
            this.panelCtaEl.removeAttribute('href')
        }

        // Cross-fade hint — opacity reset triggers the panel transition.
        this.panelEl.classList.remove('is-fading')
        this.panelEl.offsetWidth   // force reflow so the next class re-runs
        this.panelEl.classList.add('is-fading')
    }

    _openAskWithPrompt(prompt)
    {
        // Same shape ObjectPeek + KiraNarrator use. Closes Path Finder so
        // Ask owns the viewport without two full-screen sheets stacking.
        this.close()
        OverlayController.getInstance().open('ask', { prompt, dismissOnBack: true })
    }

    _toggleStatusReason()
    {
        const willShow = this.statusReasonEl.hidden
        this.statusReasonEl.hidden = !willShow
        this.statusPillEl.setAttribute('aria-expanded', willShow ? 'true' : 'false')
    }

    /**
     * Re-render the sheet body after the override slice changes from the
     * floating StatusPreviewHud. We also reset the escape-hatch flag so a
     * fresh preview always starts from the inferred-or-overridden body, not
     * a previously-engaged "show all paths" view (confusing after a swap).
     */
    _refreshFromOverride()
    {
        if(!this.isOpen) return
        this.escapeHatch = false
        const audit = this._currentAudit()
        const capture = this._needsBearings(audit.status) ? this._ensureCapture(audit) : null
        this._renderForStatus(audit, capture)
    }
}

