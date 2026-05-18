import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import OverlayController from './OverlayController.js'
import { meaningForSpecies } from '../Data/flowerMeanings.js'

/**
 * ObjectPeek — the two-step "peek, then companion" interaction shared by
 * every clickable island object that wants more than a single zoom-and-open
 * beat. Replaces the per-kind branches that used to live in KiraNarrator.
 *
 *   Step 1 — peek
 *     - Camera tweens to the object for a close look.
 *     - A small DOM popover anchored near the object shows a per-kind
 *       eyebrow + title + short paragraph + single "Find out more" CTA.
 *
 *   Step 2 — companion
 *     - The peek popover hides. Camera re-frames on Kira.
 *     - For flowers, a small species-coloured bloom is "picked up" by Kira
 *       (tweened from ground to chest height inside her group). Other kinds
 *       skip the pickup mesh — Kira just talks.
 *     - A bottom-anchored Kira-style bubble appears with deeper lore and
 *       two CTAs: a "Talk about it more" route into AskSheet (seeded with
 *       a kind-specific prompt) and a kind-specific "Open detail page" CTA
 *       that hands off to the canonical destination — FacetView for
 *       flowers, LettersSheet for the mailbox, TrajectorySheet for the
 *       telescope.
 *
 * Adding a new clickable object: extend KIND_CONFIG below; HoverProbe is
 * already wired to route mailbox / telescope / flower through here.
 */

const ZOOM_DURATION = 600
const PICKUP_LIFT_MS = 520

const TYPER_BASE_MS  = 32
const TYPER_COMMA_MS = 140
const TYPER_STOP_MS  = 220
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }
function speciesIdOf(target)
{
    const raw = target?.species
    if(typeof raw === 'string') return raw
    return raw?.id ?? raw?.species ?? ''
}
function speciesColor(target)
{
    return target?.species?.petal ?? 0xE0A0C0
}

/**
 * Per-kind config — fed into a single rendering path so the UX stays
 * uniform across kinds. Each entry produces strings + handlers at runtime,
 * receiving the view/state instances + the picked target.
 */
const KIND_CONFIG = {
    flower: {
        eyebrow: 'FLOWER',
        title:   (target) => cap(speciesIdOf(target)) || 'Flower',
        peekText: (target) =>
        {
            const m = meaningForSpecies(speciesIdOf(target))
            return m?.peek || 'A small interest in motion.'
        },
        loreText: (target) =>
        {
            const m = meaningForSpecies(speciesIdOf(target))
            return m?.lore || 'A flower — small evidence of an interest still finding its shape.'
        },
        // Camera framing for the peek shot — tight on the bloom.
        cameraOffset: { dist: 1.8, lift: 0.42, lookLift: 0.20 },
        // Where the DOM popover sits relative to the object's base.
        peekAnchorLift: 0.32,
        // Tweens the species-coloured bloom up to Kira's hand during step 2.
        pickup: true,
        primaryCta:   { label: 'Talk about it more' },
        secondaryCta: { label: 'Open detail page', icon: true },
        primaryAction: (target) =>
        {
            const m = meaningForSpecies(speciesIdOf(target))
            const prompt = m?.ask || `Tell me about your interest in ${speciesIdOf(target) || 'this flower'}.`
            OverlayController.getInstance().open('ask', { prompt, dismissOnBack: true })
        },
        secondaryAction: (target, view) => view.facetView?.openFor(target),
    },

    mailbox: {
        eyebrow: 'MAIL',
        title:   () => 'Mailbox',
        peekText: (_target, _view, state) =>
        {
            const unread = state?.letters?.unreadCount?.() ?? 0
            if(unread === 0) return 'All read. The mailbox is quiet today.'
            return unread === 1 ? '1 unread letter from school.' : `${unread} unread letters from school.`
        },
        loreText: (_target, _view, state) =>
        {
            const unread = state?.letters?.unreadCount?.() ?? 0
            if(unread > 0)
            {
                return "The flag is up because something's waiting. Letters from teachers, the school, sometimes a parent — they sit here so you can read them on your own time, not when they're delivered. Want to look?"
            }
            return "Empty box, but the past letters are still in there. Sometimes it helps to reread what someone said to you weeks ago, when you've changed enough to hear it differently."
        },
        cameraOffset: { dist: 2.4, lift: 0.85, lookLift: 1.05 },
        peekAnchorLift: 1.40,
        pickup: false,
        primaryCta:   { label: 'Talk about it more' },
        secondaryCta: { label: 'Open mail', icon: true },
        primaryAction: () => OverlayController.getInstance().open('ask', {
            prompt: 'Tell me about a teacher or message that has stayed with you.',
            dismissOnBack: true,
        }),
        secondaryAction: () => OverlayController.getInstance().open('letters'),
    },

    telescope: {
        eyebrow: 'PATH FINDER',
        title:   () => 'Telescope',
        peekText: () => 'A small lens fixed on the future — pointed at the directions your profile already leans toward.',
        loreText: () => "The compass reads everything the island has noticed about you — values, interests, skills, the way you respond — and translates it into pathways worth trying next. Three at a time, not many; each one carries its own risks. You're not deciding here; you're picking what to test.",
        cameraOffset: { dist: 2.6, lift: 0.55, lookLift: 0.70 },
        peekAnchorLift: 1.10,
        pickup: false,
        primaryCta:   { label: 'Talk about it more' },
        secondaryCta: { label: 'Open Path Finder', icon: true },
        primaryAction: () => OverlayController.getInstance().open('ask', {
            prompt: "Tell me about a path you've been quietly curious about.",
            dismissOnBack: true,
        }),
        secondaryAction: () => OverlayController.getInstance().open('trajectory'),
    },
}

export default class ObjectPeek
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene

        // Step-1 popover — anchored to the object's screen position.
        const peek = document.createElement('div')
        peek.className = 'object-peek'
        peek.setAttribute('aria-hidden', 'true')
        peek.innerHTML = `
            <p class="object-peek__eyebrow"></p>
            <h3 class="object-peek__title"></h3>
            <p class="object-peek__meaning"></p>
            <button class="object-peek__cta" type="button">
                Find out more <span aria-hidden="true">→</span>
            </button>
        `
        document.body.appendChild(peek)
        this.peekEl    = peek
        this.peekEye   = peek.querySelector('.object-peek__eyebrow')
        this.peekTitle = peek.querySelector('.object-peek__title')
        this.peekMean  = peek.querySelector('.object-peek__meaning')
        this.peekCta   = peek.querySelector('.object-peek__cta')

        // Step-2 bubble — bottom-anchored, mirrors kira-dialogue with two CTAs.
        const pickup = document.createElement('div')
        pickup.className = 'kira-dialogue object-pickup'
        pickup.setAttribute('aria-hidden', 'true')
        pickup.innerHTML = `
            <div class="kira-dialogue__name">Kira</div>
            <button class="kira-dialogue__close" type="button" aria-label="Close">×</button>
            <div class="kira-dialogue__body">
                <p class="kira-dialogue__text"></p>
                <div class="kira-dialogue__row object-pickup__row">
                    <button class="kira-dialogue__cta object-pickup__talk" type="button"></button>
                    <button class="kira-dialogue__cta object-pickup__detail" type="button"></button>
                </div>
            </div>
        `
        document.body.appendChild(pickup)
        this.pickupEl    = pickup
        this.pickupText  = pickup.querySelector('.kira-dialogue__text')
        this.pickupTalk  = pickup.querySelector('.object-pickup__talk')
        this.pickupDetail= pickup.querySelector('.object-pickup__detail')
        this.pickupClose = pickup.querySelector('.kira-dialogue__close')

        this.peekCta.addEventListener('click', () => this._goPickup())
        this.pickupTalk.addEventListener('click', () => this._primary())
        this.pickupDetail.addEventListener('click', () => this._secondary())
        this.pickupClose.addEventListener('click', () => this.close())
        // Document-level handlers held on `this` so dispose() can detach
        // them; otherwise they outlive the detached peek/pickup roots and
        // keep the whole subsystem alive across remounts.
        this._onKeyDown = (event) =>
        {
            if(!this.isOpen) return
            if(event.key === 'Escape') this.close()
        }
        document.addEventListener('keydown', this._onKeyDown)

        this._onDocPointerDown = (event) =>
        {
            if(!this.isOpen) return
            const inside = event.target.closest?.('.object-peek, .object-pickup, .kira-dialogue')
            if(!inside && event.target?.tagName === 'CANVAS') this.close()
        }
        document.addEventListener('pointerdown', this._onDocPointerDown)

        this.isOpen = false
        this.step = null              // 'peek' | 'pickup' | null
        this.target = null
        this.config = null
        this.pickupGroup = null
        this.pickupTween = null
        this.typerId = 0
        this.tmpVec = new THREE.Vector3()
    }

    /** Whether ObjectPeek can handle this target kind. */
    canHandle(target) { return !!(target && KIND_CONFIG[target.kind]) }

    /** Open Step 1 for a clicked target. */
    open(target)
    {
        const config = target && KIND_CONFIG[target.kind]
        if(!config) return
        this.target = target
        this.config = config
        this.isOpen = true
        this.step = 'peek'

        // Suppress hover affordances and the ambient Kira bubble during the beat.
        if(this.view.hoverCta)     this.view.hoverCta.hide()
        if(this.view.hoverProbe)   this.view.hoverProbe.setEnabled(false)
        if(this.view.kiraDialogue) this.view.kiraDialogue.hide()
        if(this.view.facetView && this.view.facetView.isOpen) this.view.facetView.close()

        // Camera zoom to object — vantage along the student's current
        // viewing direction so the camera glides in rather than swinging.
        const anchor = this._objectAnchor(target)
        const liveCam = this.view.camera.instance.position
        const dx = liveCam.x - target.x
        const dz = liveCam.z - target.z
        const flatLen = Math.hypot(dx, dz) || 1
        const unitX = dx / flatLen
        const unitZ = dz / flatLen
        const { dist, lift, lookLift } = config.cameraOffset
        const camPos = new THREE.Vector3(
            target.x + unitX * dist,
            anchor.y + lift,
            target.z + unitZ * dist,
        )
        const camLook = new THREE.Vector3(target.x, anchor.y + lookLift, target.z)
        this.view.camera.zoomTo(camPos, camLook, ZOOM_DURATION, { owner: 'object-peek' })

        // Populate + show the peek popover.
        this.peekEye.textContent   = config.eyebrow
        this.peekTitle.textContent = config.title(target, this.view, this.state)
        this.peekMean.textContent  = config.peekText(target, this.view, this.state)

        setTimeout(() =>
        {
            if(this.step !== 'peek') return
            this.peekEl.classList.add('is-open')
            this.peekEl.setAttribute('aria-hidden', 'false')
            this._anchorPeek()
        }, 200)
    }

    /** Advance to Step 2 — companion bubble with deeper lore + 2 CTAs. */
    _goPickup()
    {
        if(!this.target) return
        const config = this.config
        this.step = 'pickup'

        // Hide the peek popover.
        this.peekEl.classList.remove('is-open')
        this.peekEl.setAttribute('aria-hidden', 'true')

        // Re-frame on Kira (reuse KiraNarrator's framing math so the
        // visual language matches the existing AC-style dialogue).
        const kira = this.view.kira
        if(kira)
        {
            const perch = kira.group.position
            const liveCam = this.view.camera.instance.position
            const dx = liveCam.x - perch.x
            const dz = liveCam.z - perch.z
            const flatLen = Math.hypot(dx, dz) || 1
            const unitX = dx / flatLen
            const unitZ = dz / flatLen
            const dist = 2.6
            const lift = 1.05
            const camPos = new THREE.Vector3(
                perch.x + unitX * dist,
                perch.y + lift,
                perch.z + unitZ * dist,
            )
            const camLook = new THREE.Vector3(perch.x, perch.y + 0.85, perch.z)
            this.view.camera.zoomTo(camPos, camLook, ZOOM_DURATION, { owner: 'object-peek' })
            if(config.pickup) this._spawnPickup(kira)
        }

        // Populate the bubble + CTAs.
        const loreText = config.loreText(this.target, this.view, this.state)
        this._scheduleType(this.pickupText, loreText, 280)
        this.pickupTalk.innerHTML = escapeHtml(config.primaryCta.label)
        this.pickupDetail.innerHTML = config.secondaryCta.icon
            ? `${escapeHtml(config.secondaryCta.label)} <span aria-hidden="true">→</span>`
            : escapeHtml(config.secondaryCta.label)

        setTimeout(() =>
        {
            if(this.step !== 'pickup') return
            this.pickupEl.classList.add('is-open')
            this.pickupEl.setAttribute('aria-hidden', 'false')
        }, 200)
    }

    _spawnPickup(kira)
    {
        const target = this.target
        if(!target || !kira?.group) return
        const colorHex = speciesColor(target)
        const grp = new THREE.Group()
        const petalMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true })
        const stemMat  = new THREE.MeshLambertMaterial({ color: 0x6F8A4A, flatShading: true })
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), stemMat)
        stem.position.y = 0.06
        grp.add(stem)
        for(let i = 0; i < 5; i++)
        {
            const a = (i / 5) * Math.PI * 2
            const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), petalMat)
            petal.position.set(Math.cos(a) * 0.05, 0.13, Math.sin(a) * 0.05)
            petal.scale.set(1.0, 0.5, 1.0)
            grp.add(petal)
        }
        grp.position.set(0.12, 0, 0.12)
        kira.group.add(grp)
        this.pickupGroup = grp
        this.pickupTween = { start: performance.now(), from: 0.02, to: 0.78, duration: PICKUP_LIFT_MS, mode: 'up' }
    }

    _despawnPickup()
    {
        if(!this.pickupGroup) return
        this.pickupTween = { start: performance.now(), from: this.pickupGroup.position.y, to: 0, duration: PICKUP_LIFT_MS, mode: 'down' }
    }

    _primary()
    {
        const config = this.config
        const target = this.target
        this.close()
        if(!config) return
        setTimeout(() => config.primaryAction(target, this.view, this.state), 240)
    }

    _secondary()
    {
        const config = this.config
        const target = this.target
        this.close()
        if(!config) return
        setTimeout(() => config.secondaryAction(target, this.view, this.state), 240)
    }

    /**
     * Tear-down hook called from View.dispose(). Detaches the document
     * keydown + pointerdown listeners (the leak risks that survive root
     * removal), bumps the typer id so any queued setTimeouts self-cancel,
     * removes the pickup mesh from the scene if it's still mid-tween, and
     * detaches both peek and pickup roots.
     */
    dispose()
    {
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        if(this._onDocPointerDown)
        {
            try { document.removeEventListener('pointerdown', this._onDocPointerDown) } catch(_) {}
            this._onDocPointerDown = null
        }
        // Bump so any queued type / close setTimeout chains short-circuit
        // before touching detached nodes.
        this.typerId += 1
        if(this.pickupGroup)
        {
            try
            {
                if(this.pickupGroup.parent) this.pickupGroup.parent.remove(this.pickupGroup)
                this.pickupGroup.traverse((node) =>
                {
                    if(node.geometry) { try { node.geometry.dispose() } catch(_) {} }
                    if(node.material) { try { node.material.dispose() } catch(_) {} }
                })
            }
            catch(_) {}
            this.pickupGroup = null
        }
        this.pickupTween = null
        try { this.peekEl?.remove?.() } catch(_) {}
        try { this.pickupEl?.remove?.() } catch(_) {}
        this.peekEl = null
        this.pickupEl = null
        this.peekEye = null
        this.peekTitle = null
        this.peekMean = null
        this.peekCta = null
        this.pickupText = null
        this.pickupTalk = null
        this.pickupDetail = null
        this.pickupClose = null
        this.isOpen = false
        this.target = null
        this.config = null
    }

    close()
    {
        if(!this.isOpen) return
        this.isOpen = false
        this.step = null
        this.typerId += 1

        this.peekEl.classList.remove('is-open')
        this.peekEl.setAttribute('aria-hidden', 'true')
        this.pickupEl.classList.remove('is-open')
        this.pickupEl.setAttribute('aria-hidden', 'true')

        this.view.camera.restoreZoom(ZOOM_DURATION, { owner: 'object-peek' })
        this._despawnPickup()

        setTimeout(() =>
        {
            if(this.view.hoverProbe) this.view.hoverProbe.setEnabled(true)
        }, ZOOM_DURATION + 80)

        setTimeout(() =>
        {
            this.target = null
            this.config = null
        }, ZOOM_DURATION + 200)
    }

    update()
    {
        if(!this.peekEl) return    // post-dispose tick
        if(this.isOpen && this.step === 'peek' && this.target) this._anchorPeek()

        if(this.pickupTween && this.pickupGroup)
        {
            const t = Math.min(1, (performance.now() - this.pickupTween.start) / this.pickupTween.duration)
            const eased = t * t * t * (t * (t * 6 - 15) + 10)
            const y = this.pickupTween.from + (this.pickupTween.to - this.pickupTween.from) * eased
            this.pickupGroup.position.y = y
            if(t >= 1)
            {
                const mode = this.pickupTween.mode
                this.pickupTween = null
                if(mode === 'down')
                {
                    if(this.pickupGroup.parent) this.pickupGroup.parent.remove(this.pickupGroup)
                    this.pickupGroup.traverse((node) =>
                    {
                        if(node.geometry) node.geometry.dispose()
                        if(node.material) node.material.dispose()
                    })
                    this.pickupGroup = null
                }
            }
        }
    }

    _objectAnchor(target)
    {
        const groundY = this.state.island.heightAt(target.x, target.z)
        return { y: groundY }
    }

    _anchorPeek()
    {
        const target = this.target
        const config = this.config
        if(!target || !config) return
        const groundY = this.state.island.heightAt(target.x, target.z)
        this.tmpVec.set(target.x, groundY + config.peekAnchorLift, target.z)
        const cam = this.view.camera.instance
        this.tmpVec.project(cam)
        const dom = this.view.renderer.instance.domElement
        const rect = dom.getBoundingClientRect()
        const sx = (this.tmpVec.x * 0.5 + 0.5) * rect.width + rect.left
        const sy = (-this.tmpVec.y * 0.5 + 0.5) * rect.height + rect.top
        this.peekEl.style.left = `${sx}px`
        this.peekEl.style.top  = `${sy}px`
    }

    _scheduleType(el, text, delay = 0)
    {
        this.typerId += 1
        const myId = this.typerId
        if(reduceMotion) { el.textContent = text; return }
        el.textContent = ''
        let i = 0
        const step = () =>
        {
            if(myId !== this.typerId) return
            if(i >= text.length) return
            const ch = text[i]
            el.textContent += ch
            i += 1
            const next = ch === '.' || ch === '?' || ch === '!' ? TYPER_STOP_MS
                : ch === ',' || ch === ';' || ch === ':' || ch === '—' ? TYPER_COMMA_MS
                : TYPER_BASE_MS
            setTimeout(step, next)
        }
        setTimeout(step, delay)
    }
}

function escapeHtml(s)
{
    return String(s || '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch])
}
