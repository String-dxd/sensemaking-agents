/**
 * Egg color picker + companion name input + hatch animation. Owns three
 * persisted stages: egg-color → egg-name → egg-hatch. Single DOM root with
 * sub-stage swapping.
 *
 * The egg itself is a small dedicated three.js scene (icosahedron, flat-
 * shaded Lambert) that lives on one canvas; on sub-stage swap the canvas
 * DOM node is re-parented into the new viewport so the renderer + scene
 * persist across color → name → hatch without rebuilding. Hatch-phase
 * wiggle is still driven by CSS on the wrapping shell div so the canvas
 * tilts cleanly; the warm-up + pre-fracture beats are 3D-only (no SVG).
 *
 * On `egg-hatch` completion: writes profile.identity.companionSpecies +
 * companionName, calls view.kira.setSpecies(), advances to 'first-chat'.
 */

import * as THREE from 'three'

import { EGG_COLORS, EGG_COLOR_BY_ID } from './copy.js'
import { SPECIES_BY_ID, buildStandingBird } from '../Kira.js'
import { escapeHtml } from '../../util/html.js'
import { wait } from '../../util/timing.js'

const ENTER_MS = 320
const EXIT_MS  = 240

const COLOR_LERP_MS = 320
const INITIAL_SHELL_COLOR = 0xf6efe1   // matches the previous SVG default

// Hatch sequence — 3.6s total. The "Duolingo joy" reads through radiant
// rays + a confident scale-to-1.0 (no overshoot), not through bounce.
const HATCH_WIGGLE_MS    = 1000
const HATCH_WARM_MS      = 1000   // emissive ramp + slow scale pulse (overlaps wiggle)
const HATCH_PREFRACTURE_MS = 600  // fragments push outward along face normals (replaces 2D cracks)
const HATCH_FLASH_MS     =  160
const HATCH_EMERGE_MS    =  640
const HATCH_RAY_MS       =  600   // ray fan-out, overlaps emerge
const HATCH_SETTLE_MS    = 1000

// Warm-up beat: emissive lerps from EM_FACTOR_FROM × swatch up to
// EM_FACTOR_TO × swatch over HATCH_WARM_MS; in parallel a 1.0 → 1.04 → 1.0
// scale pulse runs at ~0.4 Hz so the shell looks like it's gathering heat.
const EM_FACTOR_FROM = 0.06
const EM_FACTOR_TO   = 0.30

// Pre-fracture beat: each face fragment pushes from 0 → PREFRACTURE_OUT
// units along its face normal, with a warm point light at the egg's
// centre tinted by the chosen swatch.
const PREFRACTURE_OUT = 0.018

// Shatter — triggered at the flash beat. Each non-indexed triangle of
// the icosahedron becomes its own mesh, gets a radial-outward + slight
// upward initial velocity, gravity-pulled on Y, spins on a random axis,
// and fades alpha to 0. Tuned to read like a thin shell shattering, not
// a heavy stone exploding.
const SHATTER_MS         = 640
const SHATTER_BURST_VEL  = 1.6   // base outward speed (units/sec)
const SHATTER_BURST_JIT  = 0.55  // random jitter on outward speed
const SHATTER_UP_BIAS    = 0.7   // upward boost added to each fragment
const SHATTER_GRAVITY    = 5.4   // units/sec^2 down (light, eggshell-y)
const SHATTER_SPIN_MAX   = 9     // max angular vel per axis (rad/sec)

// Mini-Kira that emerges from the shattered shell — same buildStandingBird
// the world-scene Kira uses, kept inside the egg canvas so the hatch is
// visually self-contained. Final scale sized so the bird silhouette reads
// just under the egg's footprint (~38% canvas height). The 0.6 → 1.0 ratio
// drives the entrance growth.
const BIRD_EMERGE_MS     = 640
const BIRD_SCALE_FINAL   = 0.58
const BIRD_SCALE_START   = BIRD_SCALE_FINAL * 0.6
const BIRD_BASE_Y        = -0.55   // feet sit near where the egg-base was
const BIRD_HOP_AMP       = 0.18    // mid-emerge bounce
const BIRD_YAW           = -Math.PI / 2 + 0.28   // ~3/4 view facing camera

export default class EggHatcher
{
    constructor(flow)
    {
        this.flow = flow
        this._el = null
        this._advance = null
        this._subStage = null   // 'color' | 'name' | 'hatch'
        this._ctx = null
        this._selectedColor = null
        this._companionName = ''
        this._hatchTimer = null

        // 3D egg scene — built once on mount, disposed on unmount.
        // { canvas, renderer, scene, camera, mesh, mat, color, lastW, lastH }
        this._scene = null
        this._rafId = null
    }

    setAdvance(cb) { this._advance = cb }

    async mount(root, ctx)
    {
        this._ctx = ctx
        this._selectedColor = ctx.onboarding.eggColorId
        this._companionName = ctx.onboarding.companionName ?? ''

        const el = document.createElement('div')
        el.className = 'onb-egg'
        el.innerHTML = this._buildHtml(ctx)
        root.appendChild(el)
        this._el = el

        this._buildScene()
        this._wireEvents()
        this._renderSubStage(ctx.stage)
        this._startScene()

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

        // If we entered at egg-hatch directly (resume edge case), play the
        // hatch immediately.
        if(ctx.stage === 'egg-hatch') await this._playHatch()
    }

    async setStage(nextStage)
    {
        // Called when the orchestrator detects the same owner spans the new
        // persisted stage. Swap the visible sub-stage; the wrapper DOM stays.
        if(!this._el) return
        this._renderSubStage(nextStage)
        if(nextStage === 'egg-hatch') await this._playHatch()
    }

    async unmount()
    {
        if(this._hatchTimer) { clearTimeout(this._hatchTimer); this._hatchTimer = null }
        this._stopScene()
        this._disposeScene()
        if(!this._el) return
        const el = this._el
        this._el = null
        el.classList.remove('is-visible')
        el.classList.add('is-leaving')
        await wait(EXIT_MS)
        el.remove()
    }

    // ── DOM ────────────────────────────────────────────────────────────────

    _buildHtml(ctx)
    {
        const swatches = EGG_COLORS.map((c) => `
            <button type="button" class="onb-egg__swatch" data-color="${c.id}"
                    role="radio" aria-checked="false" tabindex="-1"
                    aria-label="${escapeHtml(ctx.copy.eggColor.swatchAria.replace('{colorName}', c.name))}">
                <span class="onb-egg__swatch-dot" style="background:${c.hex}"></span>
            </button>
        `).join('')

        // The 3D egg lives on a single canvas owned by _scene. The
        // canvas is re-parented into the active sub-stage's
        // [data-canvas-host] each time the sub-stage changes. The hatch
        // sub-stage wraps the canvas in an .onb-egg__egg-shell div so
        // the wiggle + dissolve CSS animations apply to both the canvas
        // and the cracks SVG together.
        return `
            <div class="onb-egg__stage" data-sub="color">
                <div class="onb-egg__viewport" data-canvas-host>
                    <div class="onb-egg__pedestal" aria-hidden="true"></div>
                </div>
                <h2 class="onb-egg__title">${escapeHtml(ctx.copy.eggColor.title)}</h2>
                <p class="onb-egg__sub">${escapeHtml(ctx.copy.eggColor.sub)}</p>
                <div class="onb-egg__swatches" role="radiogroup">${swatches}</div>
                <button type="button" class="onb-egg__cta" disabled data-action="color-next">${escapeHtml(ctx.copy.eggColor.cta)}</button>
            </div>
            <div class="onb-egg__stage" data-sub="name" hidden>
                <div class="onb-egg__viewport" data-canvas-host>
                    <div class="onb-egg__pedestal" aria-hidden="true"></div>
                </div>
                <h2 class="onb-egg__title">${escapeHtml(ctx.copy.eggName.title)}</h2>
                <p class="onb-egg__sub">${escapeHtml(ctx.copy.eggName.sub)}</p>
                <input
                    type="text"
                    class="onb-egg__name-input"
                    maxlength="16"
                    autocomplete="off"
                    autocapitalize="words"
                    spellcheck="false"
                    placeholder="${escapeHtml(ctx.copy.eggName.placeholder)}"
                    aria-label="${escapeHtml(ctx.copy.eggName.title)}"
                />
                <div class="onb-egg__name-actions">
                    <button type="button" class="onb-egg__back" data-action="back-to-color">${escapeHtml(ctx.copy.eggName.back)}</button>
                    <button type="button" class="onb-egg__cta" disabled data-action="name-next">${escapeHtml(ctx.copy.eggName.cta)}</button>
                </div>
            </div>
            <div class="onb-egg__stage onb-egg__stage--hatch" data-sub="hatch" hidden>
                <div class="onb-egg__hatch-stage">
                    <div class="onb-egg__rays" aria-hidden="true">
                        ${this._raysSvg()}
                    </div>
                    <div class="onb-egg__egg-wrap">
                        <div class="onb-egg__egg-shell" data-canvas-host></div>
                        <div class="onb-egg__bird-wrap" aria-hidden="true">
                            <div class="onb-egg__bird-inner"></div>
                        </div>
                    </div>
                    <div class="onb-egg__pedestal onb-egg__pedestal--hatch" aria-hidden="true"></div>
                    <div class="onb-egg__flash" aria-hidden="true"></div>
                </div>
                <p class="onb-egg__a11y" aria-live="polite">${escapeHtml(ctx.copy.eggHatch.a11yNarration)}</p>
            </div>
        `
    }

    _raysSvg()
    {
        // 12 short radiant rays fanning out from the centre. The CSS scales +
        // fades each one with a stagger so they read as a sunburst. We start
        // the ray a bit away from the centre (inner radius 18) so the bird
        // SVG itself isn't covered by stripes.
        let out = '<svg class="onb-egg__rays-svg" viewBox="-100 -100 200 200" aria-hidden="true">'
        const INNER = 22
        const OUTER = 88
        const COUNT = 12
        for(let i = 0; i < COUNT; i++)
        {
            const a = (i / COUNT) * Math.PI * 2 - Math.PI / 2
            const x1 = Math.cos(a) * INNER
            const y1 = Math.sin(a) * INNER
            const x2 = Math.cos(a) * OUTER
            const y2 = Math.sin(a) * OUTER
            out += `<line class="onb-egg__ray" data-i="${i}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`
        }
        out += '</svg>'
        return out
    }

    _renderBird(species)
    {
        // Procedural bird SVG matching the chosen species palette. The
        // silhouette echoes Kira's standing build at a glance: round body,
        // big head with cheek dot, accent-coloured crest + tail tuft,
        // dark beak. No animation here — the parent wrap drives the
        // scale-up + opacity fade-in.
        const sp = SPECIES_BY_ID[species] ?? SPECIES_BY_ID.flame
        const { back, belly, accent, beak, eye } = sp.palette
        return `
            <svg class="onb-egg__bird-svg" viewBox="-60 -80 120 140" aria-hidden="true">
                <!-- back-tail fan -->
                <path d="M-18 22 Q-44 38 -38 56 L-12 36 Z" fill="${accent}"/>
                <!-- body -->
                <ellipse cx="0"  cy="22" rx="28" ry="30" fill="${back}"/>
                <!-- belly -->
                <ellipse cx="0"  cy="32" rx="18" ry="20" fill="${belly}"/>
                <!-- crest tuft (top) -->
                <path d="M-6 -28 Q0 -44 6 -28 Z" fill="${accent}"/>
                <!-- head -->
                <circle cx="0"  cy="-10" r="22" fill="${back}"/>
                <!-- face plate (lighter) -->
                <ellipse cx="0"  cy="-4" rx="12" ry="10" fill="${belly}"/>
                <!-- beak -->
                <path d="M-4 -4 L4 -4 L0 6 Z" fill="${beak}"/>
                <!-- left eye -->
                <ellipse cx="-7" cy="-12" rx="3.5" ry="4.5" fill="#fff"/>
                <ellipse cx="-7" cy="-11" rx="2.0" ry="2.6" fill="${eye}"/>
                <!-- right eye -->
                <ellipse cx="7"  cy="-12" rx="3.5" ry="4.5" fill="#fff"/>
                <ellipse cx="7"  cy="-11" rx="2.0" ry="2.6" fill="${eye}"/>
                <!-- cheek blush -->
                <circle cx="-12" cy="-2" r="2.4" fill="#f1aeb6" opacity="0.7"/>
                <circle cx="12"  cy="-2" r="2.4" fill="#f1aeb6" opacity="0.7"/>
            </svg>
        `
    }

    _wireEvents()
    {
        const el = this._el
        // Swatch picks (event delegation so we don't lose handlers on re-render)
        el.addEventListener('click', (e) =>
        {
            const swatch = e.target.closest('.onb-egg__swatch')
            if(swatch) { this._onColorPick(swatch.dataset.color); return }

            const action = e.target.closest('[data-action]')?.dataset.action
            if(action === 'color-next')   this._onColorNext()
            if(action === 'name-next')    this._onNameNext()
            if(action === 'back-to-color') this._onBackToColor()
        })

        el.addEventListener('input', (e) =>
        {
            if(e.target.matches('.onb-egg__name-input')) this._onNameInput(e.target.value)
        })

        el.addEventListener('keydown', (e) =>
        {
            if(e.target.matches('.onb-egg__name-input') && e.key === 'Enter')
            {
                e.preventDefault()
                this._onNameNext()
                return
            }
            // Swatch radio-group nav: arrow keys move focus AND selection
            // (WAI-ARIA radiogroup convention); space/enter explicitly pick.
            // Grid is 3 cols × 2 rows so vertical step is ±3.
            if(e.target.matches('.onb-egg__swatch'))
            {
                const key = e.key
                if(key === ' ' || key === 'Enter')
                {
                    e.preventDefault()
                    this._onColorPick(e.target.dataset.color)
                    return
                }
                let step = 0
                if(key === 'ArrowLeft')       step = -1
                else if(key === 'ArrowRight') step =  1
                else if(key === 'ArrowUp')    step = -3
                else if(key === 'ArrowDown')  step =  3
                if(!step) return
                e.preventDefault()
                const list = Array.from(this._el.querySelectorAll('.onb-egg__swatch'))
                const i = list.indexOf(e.target)
                if(i < 0) return
                const next = list[(i + step + list.length) % list.length]
                next.focus()
                this._onColorPick(next.dataset.color)
            }
        })

        // Pre-fill from persisted state on resume.
        if(this._companionName)
        {
            const input = el.querySelector('.onb-egg__name-input')
            if(input) input.value = this._companionName
            this._refreshNameCtaState()
        }
        if(this._selectedColor) this._highlightSwatch(this._selectedColor)
    }

    _renderSubStage(persistedStage)
    {
        const map = { 'egg-color': 'color', 'egg-name': 'name', 'egg-hatch': 'hatch' }
        const sub = map[persistedStage] ?? 'color'
        this._subStage = sub
        for(const node of this._el.querySelectorAll('.onb-egg__stage'))
        {
            node.hidden = node.dataset.sub !== sub
        }

        // Re-park the 3D egg's canvas inside the active sub-stage's host.
        // The renderer + scene survive the DOM move; only the parent
        // element changes, so the egg keeps spinning + tinted across the
        // sub-stage swap with no flicker.
        const canvas = this._scene?.canvas
        if(canvas)
        {
            const host = this._el.querySelector(`.onb-egg__stage[data-sub="${sub}"] [data-canvas-host]`)
            if(host && canvas.parentElement !== host) host.appendChild(canvas)
        }

        if(sub === 'color')
        {
            // Place focus + the single tab-stop on the currently-selected
            // swatch (or the first one on a fresh entry) so keyboard users
            // can immediately arrow-pick.
            setTimeout(() =>
            {
                const list = Array.from(this._el.querySelectorAll('.onb-egg__swatch'))
                if(!list.length) return
                const sel = this._selectedColor
                const target = (sel && list.find((n) => n.dataset.color === sel)) || list[0]
                for(const node of list) node.tabIndex = (node === target) ? 0 : -1
                target.focus()
            }, 50)
        }
        if(sub === 'name')
        {
            const input = this._el.querySelector('.onb-egg__name-input')
            if(input) setTimeout(() => input.focus(), 50)
            this._refreshNameCtaState()
        }
    }

    // ── Sub-stage handlers ────────────────────────────────────────────────

    _onColorPick(id)
    {
        if(!id || !EGG_COLOR_BY_ID[id]) return
        this._selectedColor = id
        this._highlightSwatch(id)
        this._refreshColorCtaState()
    }

    _onColorNext()
    {
        if(!this._selectedColor) return
        this._ctx.onboarding.setEggColor(this._selectedColor)
        this._advance?.('egg-name')
    }

    _onNameInput(value)
    {
        this._companionName = value
        this._refreshNameCtaState()
    }

    _onBackToColor()
    {
        this._advance?.('egg-color')
    }

    _onNameNext()
    {
        const trimmed = (this._companionName ?? '').trim()
        if(trimmed.length === 0) return
        this._ctx.onboarding.setCompanionName(trimmed)
        const species = this._ctx.onboarding.eggColorId   // 1:1 to species id
        if(species)
        {
            this._ctx.profile.setIdentity({ companionSpecies: species, companionName: trimmed })
            // Live-swap Kira if the renderer is already running so the bird's
            // plumage matches the chosen color before the first-chat beat.
            this._ctx.view.kira?.setSpecies?.(species)
        }
        this._advance?.('egg-hatch')
    }

    async _playHatch()
    {
        // Route weak / older devices through the same collapsed path as
        // `prefers-reduced-motion`. The 3D shatter spawns ~80 transparent
        // BufferGeometries + a fresh standing-bird mesh inside the egg
        // canvas — fine on modern Macs and recent iPhones, but a risk on
        // sub-4-core mobiles and any device that can't get WebGL2. Goal
        // contract: "if shatter dies on mobile WebGL, fall back to
        // dissolve."
        const reduced = this._ctx.reducedMotion || this._isLowFidelityDevice()
        if(reduced)
        {
            // Collapsed path — show the bird immediately, no cinematic.
            this._populateBird()
            this._el?.querySelector('.onb-egg__hatch-stage')?.classList.add('is-reduced', 'is-reveal')
            await wait(160)
            this._advance?.('first-chat')
            return
        }

        const stage = this._el?.querySelector('.onb-egg__hatch-stage')
        if(!stage) { this._advance?.('first-chat'); return }

        this._populateBird()

        // Phase 1 — wiggle (1.0s). Warm-up beat (emissive ramp + slow scale
        // pulse) overlays the wiggle so the shell visibly "heats up" while
        // it rocks.
        stage.classList.add('is-wiggling')
        this._startWarmUp()
        await wait(HATCH_WIGGLE_MS)
        if(!this._el) return
        stage.classList.remove('is-wiggling')

        // Phase 2 — pre-fracture (0.6s). Build face fragments at zero
        // velocity and lerp each outward along its face normal so the
        // shell appears to crack from the inside. A warm point light at
        // the centre, tinted by the chosen swatch, paints the seams hot.
        this._startPreFracture()
        await wait(HATCH_PREFRACTURE_MS)
        if(!this._el) return

        // Phase 3 — flash (160ms up+down) overlapping with egg shatter +
        // bird emerge + rays. The pre-fracture fragments now get
        // velocities + spin and detach from the egg position.
        this._promotePreFractureToShatter()
        this._startBirdEmerge()
        stage.classList.add('is-flashing', 'is-revealing', 'has-3d-bird')
        await wait(HATCH_FLASH_MS)
        if(!this._el) return
        stage.classList.remove('is-flashing')

        // Phase 4 — rays fan + bird emerges. Most of the visible motion
        // happens here, all within ease-out cubic (no bounce/overshoot).
        await wait(Math.max(HATCH_EMERGE_MS, HATCH_RAY_MS))
        if(!this._el) return

        // Phase 5 — settle (1s) before advancing to first-chat.
        await wait(HATCH_SETTLE_MS)
        if(!this._el) return

        this._advance?.('first-chat')
    }

    _populateBird()
    {
        const inner = this._el?.querySelector('.onb-egg__bird-inner')
        if(!inner) return
        const species = this._ctx?.onboarding?.eggColorId
            || this._ctx?.profile?.identity?.companionSpecies
            || 'flame'
        inner.innerHTML = this._renderBird(species)
    }

    /**
     * Best-effort heuristic for "device that probably can't render the
     * 3D shatter + emergence smoothly." Cached on first call so the
     * cost doesn't repeat. Conservative — only triggers on the genuinely
     * weak end (sub-4-core CPU or no WebGL2). Recent iPhones, iPads and
     * Android flagships sail past this gate and get the full cinematic.
     */
    _isLowFidelityDevice()
    {
        if(EggHatcher._lowFiCached !== undefined) return EggHatcher._lowFiCached
        let lowFi = false
        try
        {
            const cores = navigator.hardwareConcurrency || 8
            if(cores < 4) lowFi = true
            if(!lowFi)
            {
                const probe = document.createElement('canvas')
                const gl = probe.getContext('webgl2')
                    || probe.getContext('webgl')
                    || probe.getContext('experimental-webgl')
                if(!gl) lowFi = true
            }
        }
        catch(_) { lowFi = true }
        EggHatcher._lowFiCached = lowFi
        return lowFi
    }

    // ── UI helpers ────────────────────────────────────────────────────────

    _highlightSwatch(id)
    {
        for(const node of this._el.querySelectorAll('.onb-egg__swatch'))
        {
            const picked = node.dataset.color === id
            node.classList.toggle('is-picked', picked)
            node.setAttribute('aria-checked', picked ? 'true' : 'false')
            // Keep the picked swatch in the tab order; remove others. The
            // pointer-pick path doesn't refocus, so leave focus where the
            // user clicked.
            node.tabIndex = picked ? 0 : -1
        }
        // Tween the 3D egg's material toward the picked color.
        const color = EGG_COLOR_BY_ID[id]
        if(color) this._setEggColor(color.hex)
    }

    _refreshColorCtaState()
    {
        const cta = this._el.querySelector('[data-action="color-next"]')
        if(cta) cta.disabled = !this._selectedColor
    }

    _refreshNameCtaState()
    {
        const cta = this._el.querySelector('[data-action="name-next"]')
        if(cta) cta.disabled = (this._companionName ?? '').trim().length === 0
    }

    // ── 3D egg scene ──────────────────────────────────────────────────────

    _buildScene()
    {
        const canvas = document.createElement('canvas')
        canvas.className = 'onb-egg__canvas'
        canvas.setAttribute('aria-hidden', 'true')

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

        const scene = new THREE.Scene()

        // FOV + distance picked so the egg's screen size lands close to
        // the old 120×160 SVG silhouette (~120px tall) inside a 160×200
        // canvas, so the cracks SVG overlay still reads as drawn on the
        // egg.
        const camera = new THREE.PerspectiveCamera(28, 160 / 200, 0.1, 100)
        camera.position.set(0, 0, 5.0)
        camera.lookAt(0, 0, 0)

        // 3-point + hemisphere. Lower ambient deepens facet contrast; the
        // hemisphere bounce keeps shadowed faces from going dead-grey. Rim
        // light (cool, behind) gives the egg silhouette presence against the
        // dim ceremony stage.
        scene.add(new THREE.AmbientLight(0xffffff, 0.34))
        scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a2f3a, 0.32))
        const key = new THREE.DirectionalLight(0xfff2dc, 1.05)
        key.position.set(2.2, 3.0, 2.4)
        scene.add(key)
        const fill = new THREE.DirectionalLight(0xc8d4ff, 0.42)
        fill.position.set(-2.4, 0.6, 1.4)
        scene.add(fill)
        const rim = new THREE.DirectionalLight(0xb8c4ff, 0.55)
        rim.position.set(-0.6, 1.2, -2.6)
        scene.add(rim)

        // Stretched icosahedron — detail=1 keeps the facet count low so
        // flat-shading reads as crisp polygons rather than mush.
        const geo = new THREE.IcosahedronGeometry(0.55, 1)
        geo.scale(1, 1.35, 1)
        // Lambert with a tiny emissive — when the student picks a swatch, the
        // emissive lerps toward 6% of that hue so the egg reads as "warming
        // to your choice" rather than just changing paint.
        const mat = new THREE.MeshLambertMaterial({
            color: INITIAL_SHELL_COLOR,
            emissive: 0x000000,
            emissiveIntensity: 1,
            flatShading: true,
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.rotation.set(0.18, 0.45, 0)
        scene.add(mesh)

        const color = {
            from:      new THREE.Color(INITIAL_SHELL_COLOR),
            target:    new THREE.Color(INITIAL_SHELL_COLOR),
            emFrom:    new THREE.Color(0x000000),
            emTarget:  new THREE.Color(0x000000),
            startTime: 0,
            duration:  0,
        }

        this._scene = { canvas, renderer, scene, camera, mesh, geo, mat, color, lastW: 0, lastH: 0 }

        // Apply a previously-persisted swatch immediately so a resume into
        // egg-name or egg-hatch shows the right tint without a flash.
        const sel = EGG_COLOR_BY_ID[this._selectedColor]
        if(sel)
        {
            mat.color.setStyle(sel.hex)
            color.from.copy(mat.color)
            color.target.copy(mat.color)
            const em = new THREE.Color(sel.hex).multiplyScalar(0.06)
            mat.emissive.copy(em)
            color.emFrom.copy(em)
            color.emTarget.copy(em)
        }
    }

    _setEggColor(hex)
    {
        const s = this._scene
        if(!s) return
        s.color.from.copy(s.mat.color)
        s.color.target.setStyle(hex)
        s.color.emFrom.copy(s.mat.emissive)
        s.color.emTarget.setStyle(hex).multiplyScalar(0.06)
        s.color.startTime = performance.now()
        s.color.duration  = COLOR_LERP_MS
    }

    _startScene()
    {
        if(this._rafId !== null || !this._scene) return
        this._rafId = requestAnimationFrame(this._tickScene)
    }

    _stopScene()
    {
        if(this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null }
    }

    _tickScene = () =>
    {
        const s = this._scene
        if(!s) { this._rafId = null; return }
        const now = performance.now()
        const t   = now * 0.001
        const dt  = s.lastTickAt ? Math.min(0.05, (now - s.lastTickAt) / 1000) : 0
        s.lastTickAt = now

        // Gentle idle, three asynchronous oscillators so the motion never
        // lines up into a single mechanical loop. Yaw stays inside ±0.12 rad
        // (~7°) to keep the silhouette square-on the cracks SVG. Pitch nod
        // and breath scale are phase-offset to read as "alive, not pulsing".
        // Skipped once the egg has shattered — at that point the mesh is
        // hidden and the per-fragment loop owns the canvas.
        if(!s.shatter)
        {
            s.mesh.position.y = Math.sin(t * 1.4) * 0.05
            s.mesh.rotation.y = 0.45 + Math.sin(t * 0.55) * 0.12
            s.mesh.rotation.x = 0.18 + Math.sin(t * 0.42 + 1.1) * 0.05
            const breath      = 1 + Math.sin(t * 1.6 + Math.PI / 3) * 0.012
            s.mesh.scale.set(1, breath, 1)
        }

        if(s.color.duration > 0)
        {
            const u = Math.min(1, (now - s.color.startTime) / s.color.duration)
            const e = u * u * (3 - 2 * u)
            s.mat.color.lerpColors(s.color.from, s.color.target, e)
            s.mat.emissive.lerpColors(s.color.emFrom, s.color.emTarget, e)
            if(u >= 1) s.color.duration = 0
        }

        if(s.warm)
        {
            this._tickWarmUp(s, now)
        }

        if(s.prefracture && dt > 0)
        {
            this._tickPreFracture(s, now)
        }

        if(s.shatter && dt > 0)
        {
            this._tickShatter(s, now, dt)
        }

        if(s.bird && !s.bird.done)
        {
            this._tickBirdEmerge(s, now)
        }

        // Only resize + draw when the canvas is actually composited.
        // Hidden sub-stages have display:none parents → offsetParent null.
        if(s.canvas.offsetParent !== null)
        {
            const rect = s.canvas.getBoundingClientRect()
            const w = Math.max(64, Math.floor(rect.width))
            const h = Math.max(64, Math.floor(rect.height))
            if(w !== s.lastW || h !== s.lastH)
            {
                s.renderer.setSize(w, h, false)
                s.camera.aspect = w / h
                s.camera.updateProjectionMatrix()
                s.lastW = w
                s.lastH = h
            }
            s.renderer.render(s.scene, s.camera)
        }

        this._rafId = requestAnimationFrame(this._tickScene)
    }

    /**
     * Shared helper: build one mini-mesh per triangle face, with
     * positions rebased around each face centroid so each fragment spins
     * about its own centre. Returns { fragments, fragMat } — caller
     * decides what to do with velocity / spin / outward push. The source
     * icosahedron mesh is hidden so the fragments visually take over.
     *
     * Each fragment entry carries:
     *   - mesh   the small one-tri mesh, already added to the scene
     *   - geo    its BufferGeometry (so we can dispose later)
     *   - origin the rest position (where the fragment sits before any
     *            outward push / velocity integration)
     *   - normal unit-length outward face normal (centroid direction)
     *
     * Velocity + spin start at 0; pre-fracture leaves them there and
     * pushes positions along `normal`; shatter writes them and integrates
     * normally.
     */
    _buildFragments()
    {
        const s = this._scene
        if(!s) return null

        const srcGeo = s.geo.index ? s.geo.toNonIndexed() : s.geo.clone()
        const posAttr = srcGeo.getAttribute('position')
        const triCount = posAttr.count / 3

        // Capture current display orientation so fragments inherit
        // exactly where the egg appears at this moment (mid-wobble).
        s.mesh.updateMatrixWorld(true)
        const localToWorldQ = s.mesh.quaternion.clone()
        const meshScaleY    = s.mesh.scale.y || 1

        // Hide the source mesh so the fragments are what the eye reads.
        s.mesh.visible = false

        // Shared material across all fragments — one fade for all. Cloned
        // from the live mat so it inherits the current color + emissive
        // tint (whichever swatch the student picked).
        const fragMat = s.mat.clone()
        fragMat.transparent = true
        fragMat.opacity = 1
        fragMat.depthWrite = false

        const fragments = []
        for(let i = 0; i < triCount; i++)
        {
            const i0 = i * 3
            const ax = posAttr.getX(i0),     ay = posAttr.getY(i0),     az = posAttr.getZ(i0)
            const bx = posAttr.getX(i0 + 1), by = posAttr.getY(i0 + 1), bz = posAttr.getZ(i0 + 1)
            const cx = posAttr.getX(i0 + 2), cy = posAttr.getY(i0 + 2), cz = posAttr.getZ(i0 + 2)
            const cxg = (ax + bx + cx) / 3
            const cyg = (ay + by + cy) / 3
            const czg = (az + bz + cz) / 3

            const tri = new THREE.BufferGeometry()
            tri.setAttribute('position', new THREE.Float32BufferAttribute([
                ax - cxg, ay - cyg, az - czg,
                bx - cxg, by - cyg, bz - czg,
                cx - cxg, cy - cyg, cz - czg,
            ], 3))
            tri.computeVertexNormals()

            const mesh = new THREE.Mesh(tri, fragMat)
            const ox = cxg
            const oy = cyg * meshScaleY
            const oz = czg
            mesh.position.set(ox, oy, oz)
            mesh.quaternion.copy(localToWorldQ)

            // Outward normal — centroid direction, normalized. Used both
            // by pre-fracture (push along this) and shatter (initial vel
            // direction).
            const len = Math.hypot(cxg, cyg, czg) || 1
            const normal = new THREE.Vector3(cxg / len, cyg / len, czg / len)

            s.scene.add(mesh)
            fragments.push({
                mesh,
                geo: tri,
                origin: new THREE.Vector3(ox, oy, oz),
                normal,
                vel: new THREE.Vector3(),
                spin: new THREE.Vector3(),
            })
        }

        return { fragments, fragMat }
    }

    /**
     * Build fragments at zero velocity and lerp each outward along its
     * face normal so the shell looks like it's cracking from the inside
     * before it shatters. A warm point light at the egg's centre, tinted
     * by the chosen swatch, paints the seams hot.
     */
    _startPreFracture()
    {
        const s = this._scene
        if(!s || s.prefracture || s.shatter) return

        const built = this._buildFragments()
        if(!built) return

        // Warm point light at the egg's centre. Color = current swatch
        // hex (falls back to the live material color if no swatch was
        // chosen). Intensity tuned to nudge the seams without blowing
        // out the rim light.
        const lightColor = new THREE.Color(s.mat.color.getHex())
        const light = new THREE.PointLight(lightColor, 1.4, 1.6, 1.7)
        light.position.set(0, 0, 0)
        s.scene.add(light)

        s.prefracture = {
            startTime: performance.now(),
            duration:  HATCH_PREFRACTURE_MS,
            fragments: built.fragments,
            fragMat:   built.fragMat,
            light,
        }
    }

    _tickPreFracture(s, now)
    {
        const pf = s.prefracture
        if(!pf) return
        const u = Math.min(1, (now - pf.startTime) / pf.duration)
        const e = u * u * (3 - 2 * u)

        const push = PREFRACTURE_OUT * e
        for(const f of pf.fragments)
        {
            f.mesh.position.set(
                f.origin.x + f.normal.x * push,
                f.origin.y + f.normal.y * push,
                f.origin.z + f.normal.z * push,
            )
        }

        // Light pulses up to full and holds — disposed when shatter
        // promotes (no fade-out here; the flash beat covers it).
        pf.light.intensity = 0.6 + e * 1.4
    }

    /**
     * Hand the pre-fracture fragments off to the shatter integrator:
     * write velocity + spin, drop the warm point light, and start the
     * shatter tick.
     */
    _promotePreFractureToShatter()
    {
        const s = this._scene
        if(!s) return
        if(s.shatter) return

        // If pre-fracture wasn't started (defensive), build fragments now.
        let fragments, fragMat
        if(s.prefracture)
        {
            fragments = s.prefracture.fragments
            fragMat   = s.prefracture.fragMat
            try { s.scene.remove(s.prefracture.light) } catch(_) {}
            try { s.prefracture.light.dispose?.() } catch(_) {}
            s.prefracture = null
        }
        else
        {
            const built = this._buildFragments()
            if(!built) return
            fragments = built.fragments
            fragMat   = built.fragMat
        }

        for(const f of fragments)
        {
            const speed = SHATTER_BURST_VEL + (Math.random() - 0.5) * 2 * SHATTER_BURST_JIT
            f.vel.set(
                f.normal.x * speed,
                f.normal.y * speed + SHATTER_UP_BIAS,
                f.normal.z * speed,
            )
            f.spin.set(
                (Math.random() - 0.5) * 2 * SHATTER_SPIN_MAX,
                (Math.random() - 0.5) * 2 * SHATTER_SPIN_MAX,
                (Math.random() - 0.5) * 2 * SHATTER_SPIN_MAX,
            )
        }

        s.shatter = {
            startTime: performance.now(),
            duration:  SHATTER_MS,
            fragments,
            fragMat,
        }
    }

    /**
     * Warm-up beat: ramp emissive intensity from EM_FACTOR_FROM × swatch
     * up to EM_FACTOR_TO × swatch over HATCH_WARM_MS, overlaid with a
     * 1.0 → 1.04 → 1.0 scale pulse at ~0.4 Hz. The pulse rides on top of
     * the idle breath scale; the emissive ramp overrides the idle color
     * lerp for the duration.
     */
    _startWarmUp()
    {
        const s = this._scene
        if(!s) return
        const swatch = EGG_COLOR_BY_ID[this._selectedColor]
        const baseHex = swatch ? swatch.hex : s.mat.color.getHex()
        const emFrom = new THREE.Color(baseHex).multiplyScalar(EM_FACTOR_FROM)
        const emTo   = new THREE.Color(baseHex).multiplyScalar(EM_FACTOR_TO)
        s.warm = {
            startTime: performance.now(),
            duration:  HATCH_WARM_MS,
            emFrom,
            emTo,
        }
    }

    _tickWarmUp(s, now)
    {
        const w = s.warm
        if(!w) return
        const u = Math.min(1, (now - w.startTime) / w.duration)
        const e = u * u * (3 - 2 * u)
        s.mat.emissive.lerpColors(w.emFrom, w.emTo, e)
        // Override idle color tween's emissive write so it doesn't fight.
        s.color.duration = 0

        // Slow scale pulse — 1.0 → 1.04 → 1.0 (one half-cycle inside the
        // 1s warm-up = ~0.4 Hz). Multiplies on top of the idle breath so
        // both reads as the same shell, gathering heat.
        const pulse = 1 + Math.sin(u * Math.PI) * 0.04
        s.mesh.scale.set(
            s.mesh.scale.x * pulse,
            s.mesh.scale.y * pulse,
            s.mesh.scale.z * pulse,
        )

        if(u >= 1) s.warm = null
    }

    _tickShatter(s, now, dt)
    {
        const sh = s.shatter
        if(!sh) return
        const elapsed = now - sh.startTime
        const u = Math.min(1, elapsed / sh.duration)

        // Position + spin integration. Cheap explicit Euler — at 60fps for
        // a 640ms burst the integration error is invisible.
        for(const f of sh.fragments)
        {
            f.vel.y -= SHATTER_GRAVITY * dt
            f.mesh.position.x += f.vel.x * dt
            f.mesh.position.y += f.vel.y * dt
            f.mesh.position.z += f.vel.z * dt
            f.mesh.rotation.x += f.spin.x * dt
            f.mesh.rotation.y += f.spin.y * dt
            f.mesh.rotation.z += f.spin.z * dt
        }

        // Fade alpha out over the full duration, with smootherstep so the
        // very last frames don't cliff to invisibility.
        const eFade = u * u * u * (u * (u * 6 - 15) + 10)
        sh.fragMat.opacity = 1 - eFade

        if(u >= 1)
        {
            this._disposeShatter()
        }
    }

    _disposeShatter()
    {
        const s = this._scene
        if(!s || !s.shatter) return
        for(const f of s.shatter.fragments)
        {
            s.scene.remove(f.mesh)
            try { f.geo.dispose() } catch(_) {}
        }
        try { s.shatter.fragMat.dispose() } catch(_) {}
        s.shatter = null
    }

    /**
     * Build a mini-Kira inside the egg canvas and animate it into the
     * shattered shell's footprint. Same buildStandingBird the world Kira
     * uses, so plumage matches the persisted companionSpecies. Scale and
     * y-hop are tweened in _tickBirdEmerge.
     */
    _startBirdEmerge()
    {
        const s = this._scene
        if(!s || s.bird) return

        const speciesId =
            this._ctx?.profile?.identity?.companionSpecies ||
            this._ctx?.onboarding?.eggColorId ||
            'flame'
        const spec = SPECIES_BY_ID[speciesId] || SPECIES_BY_ID.flame

        const parts = buildStandingBird(spec)
        const bird = parts.root
        bird.position.set(0, BIRD_BASE_Y, 0)
        bird.rotation.y = BIRD_YAW
        // buildStandingBird applies its own scale on `root` from the
        // character spec. Multiply our entrance scale in via a parent
        // group so we don't fight that internal scale.
        const holder = new THREE.Group()
        holder.add(bird)
        holder.scale.setScalar(BIRD_SCALE_START)
        holder.position.copy(bird.position)
        bird.position.set(0, 0, 0)
        s.scene.add(holder)

        s.bird = {
            holder,
            parts,
            startTime: performance.now(),
            duration:  BIRD_EMERGE_MS,
        }
    }

    _tickBirdEmerge(s, now)
    {
        const b = s.bird
        if(!b) return
        const u = Math.min(1, (now - b.startTime) / b.duration)
        const e = u * u * u * (u * (u * 6 - 15) + 10)   // smootherstep

        const scale = BIRD_SCALE_START + (BIRD_SCALE_FINAL - BIRD_SCALE_START) * e
        b.holder.scale.setScalar(scale)

        // Tiny hop: y rises to BIRD_BASE_Y + amp at u=0.5 then settles
        // back to BIRD_BASE_Y by u=1 — sin curve peaks symmetrically.
        b.holder.position.y = BIRD_BASE_Y + Math.sin(u * Math.PI) * BIRD_HOP_AMP

        if(u >= 1) b.done = true
    }

    _disposeBird()
    {
        const s = this._scene
        if(!s || !s.bird) return
        const holder = s.bird.holder
        s.scene.remove(holder)
        holder.traverse?.((node) =>
        {
            if(node.geometry) try { node.geometry.dispose() } catch(_) {}
            const m = node.material
            if(m)
            {
                if(m.map) try { m.map.dispose?.() } catch(_) {}
                try { m.dispose?.() } catch(_) {}
            }
        })
        s.bird = null
    }

    _disposeScene()
    {
        const s = this._scene
        if(!s) return
        if(s.prefracture)
        {
            for(const f of s.prefracture.fragments)
            {
                s.scene.remove(f.mesh)
                try { f.geo.dispose() } catch(_) {}
            }
            try { s.prefracture.fragMat.dispose() } catch(_) {}
            try { s.scene.remove(s.prefracture.light) } catch(_) {}
            s.prefracture = null
        }
        if(s.shatter)
        {
            for(const f of s.shatter.fragments)
            {
                s.scene.remove(f.mesh)
                try { f.geo.dispose() } catch(_) {}
            }
            try { s.shatter.fragMat.dispose() } catch(_) {}
            s.shatter = null
        }
        if(s.bird)
        {
            this._disposeBird()
        }
        this._scene = null
        try { s.geo.dispose() } catch(_) {}
        try { s.mat.dispose() } catch(_) {}
        try { s.renderer.dispose() } catch(_) {}
        if(s.canvas.parentElement) s.canvas.parentElement.removeChild(s.canvas)
    }
}
