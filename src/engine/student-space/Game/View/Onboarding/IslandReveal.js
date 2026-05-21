/**
 * Closing sequence — owns the persisted stages first-grow / tree-narration
 * / closing. Click-gated: each beat waits for the student to tap a CTA
 * chip before the next narration line + scene change fires.
 *
 * Flow:
 *   - pin manualHour = 18.5 (twilight) on mount so the reveal lands in the
 *     signature sky regardless of wall-clock
 *   - chip "Show me what just bloomed" → camera close-up + plant-setup
 *     line + bloom sfx + flowers.bloomInstance(0). Hold on done-line.
 *   - chip "What else is here?"        → wide camera + seeded line + grow
 *     sfx + tree.growIn(0). Hold on islandFinal line.
 *   - chip "Begin"                     → camera.resetToDefault, clear
 *     manual hour, onboarding.complete().
 *
 * The orchestrator's `_finish()` then writes the legacy ColdStart "seen"
 * flag and resumes the chrome.
 */

import * as THREE from 'three'

import { EMOTIONS } from '../MoodSheet.js'
import { wait } from '../../util/timing.js'
import { escapeHtml } from '../../util/html.js'

const ENTER_MS        = 200
const EXIT_MS         = 320
const TWILIGHT_HOUR   = 18.5
const SETUP_HOLD_MS   = 1600    // hold the setup line before triggering bloom
const BLOOM_MS        = 520     // matches Flowers.bloomInstance default
const POST_BLOOM_MS   = 1200    // hold after bloom, before chip re-appears
const SEEDED_HOLD_MS  = 1600    // hold the seeded line before triggering grow
const GROW_MS         = 1400    // matches Tree.growIn default
const POST_GROW_MS    = 1400    // hold after grow, before chip re-appears
const FINAL_HOLD_MS   = 1200    // hold the final line before begin chip
const SKY_LEAD_MS     = 800     // clearManualHour this far ahead of camera reset

export default class IslandReveal
{
    constructor(flow)
    {
        this.flow = flow
        this._el = null
        this._advance = null
        this._aborted = false
    }

    setAdvance(cb) { this._advance = cb }

    async mount(root, ctx)
    {
        this._ctx = ctx
        const el = document.createElement('div')
        el.className = 'onb-reveal'
        // Near-transparent sheen + a chip layer. The chip layer holds the
        // click-gating CTAs that drive each beat forward.
        el.innerHTML = `
            <div class="onb-reveal__sheen" aria-hidden="true"></div>
            <div class="onb-reveal__chips" role="group" hidden></div>
        `
        root.appendChild(el)
        this._el = el
        this._chipsEl = el.querySelector('.onb-reveal__chips')

        // Pin the sky to twilight for the duration of the reveal. The
        // orchestrator's _finish() handles the eventual clearManualHour;
        // this surface releases it 800ms before its closing camera reset
        // so the sky drift lands together with the camera home pose.
        ctx.state?.day?.setManualHour?.(TWILIGHT_HOUR)

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

        // Resolve the emotion the student just committed in FirstMood and
        // re-skin flower 0 to match. Must run before _beat1 reads
        // `flowers.flowers[0]` since setFirstSpeciesForEmotion mutates
        // that flower's species + bloom mesh in place.
        const flowers   = ctx.view.flowers
        const firstPinId = ctx.onboarding?.firstMoodPinId
        const firstPin = firstPinId
            ? ctx.moodPins?.pins?.find((p) => p.id === firstPinId)
            : null
        const emotionId = firstPin?.emotion
        const emotionDef = emotionId ? EMOTIONS.find((e) => e.id === emotionId) : null
        if(flowers && emotionId && emotionDef && typeof flowers.setFirstSpeciesForEmotion === 'function')
        {
            flowers.setFirstSpeciesForEmotion(emotionId, emotionDef.color)
        }

        // First chip — bloom.
        this._showChip(ctx.copy.islandReveal.bloomCta, () => this._beatBloom(ctx))
    }

    async setStage(/* nextStage */)
    {
        // Sub-stage progression is driven by chip clicks below.
    }

    async unmount()
    {
        this._aborted = true
        if(!this._el) return
        const el = this._el
        this._el = null
        el.classList.remove('is-visible')
        el.classList.add('is-leaving')
        await wait(EXIT_MS)
        el.remove()
    }

    // ── Chip helpers ──────────────────────────────────────────────────

    _showChip(label, onClick, { primary = true } = {})
    {
        if(!this._chipsEl) return
        this._chipsEl.hidden = false
        this._chipsEl.innerHTML = `
            <button type="button" class="onb-reveal__chip${primary ? ' onb-reveal__chip--primary' : ''}">
                ${escapeHtml(label)}
            </button>
        `
        const btn = this._chipsEl.querySelector('.onb-reveal__chip')
        btn?.focus({ preventScroll: true })
        btn?.addEventListener('click', () =>
        {
            this._hideChips()
            onClick?.()
        }, { once: true })
    }

    _hideChips()
    {
        if(!this._chipsEl) return
        this._chipsEl.hidden = true
        this._chipsEl.innerHTML = ''
    }

    // ── Beats ─────────────────────────────────────────────────────────

    async _beatBloom(ctx)
    {
        const dialogue = ctx.view.kiraDialogue
        const camera   = ctx.view.camera
        const flowers  = ctx.view.flowers
        const flower   = flowers?.flowers?.[0]
        const reduced  = ctx.reducedMotion
        const ms = (full) => reduced ? Math.min(full, 80) : full
        const cameraMs = (full) => reduced ? 200 : full

        dialogue?.sayOnboarding?.(ctx.copy.kira.islandPlantSetup)

        if(camera && flower)
        {
            const lookAt = new THREE.Vector3(flower.x, 0.7, flower.z)
            const camPos = new THREE.Vector3(
                flower.x + 0.0,
                lookAt.y + 1.1,
                flower.z + 1.8,
            )
            camera.zoomTo(camPos, lookAt, cameraMs(1100))
        }

        await wait(ms(SETUP_HOLD_MS)); if(this._aborted) return

        ctx.view.sound?.playOneShot?.('bloom')
        if(flowers && flower)
        {
            await flowers.bloomInstance(0, { duration: BLOOM_MS })
        }
        if(this._aborted) return

        dialogue?.sayOnboarding?.(ctx.copy.kira.islandPlantDone)
        await wait(ms(POST_BLOOM_MS)); if(this._aborted) return

        ctx.setStage('tree-narration')
        this._showChip(ctx.copy.islandReveal.treeCta, () => this._beatTree(ctx))
    }

    async _beatTree(ctx)
    {
        const dialogue = ctx.view.kiraDialogue
        const camera   = ctx.view.camera
        const tree     = ctx.view.tree
        const treeEntry = tree?.entries?.[0]
        const reduced  = ctx.reducedMotion
        const ms = (full) => reduced ? Math.min(full, 80) : full
        const cameraMs = (full) => reduced ? 200 : full

        if(camera)
        {
            const lookAt = new THREE.Vector3(0, 1.8, 0)
            const camPos = new THREE.Vector3(3, 5.5, 8)
            camera.zoomTo(camPos, lookAt, cameraMs(1400))
        }
        dialogue?.sayOnboarding?.(ctx.copy.kira.islandSeeded)
        await wait(ms(SEEDED_HOLD_MS)); if(this._aborted) return

        ctx.view.sound?.playOneShot?.('grow')
        if(tree && treeEntry)
        {
            await tree.growIn(0, { duration: GROW_MS })
        }
        if(this._aborted) return
        await wait(ms(POST_GROW_MS)); if(this._aborted) return

        ctx.setStage('closing')
        dialogue?.sayOnboarding?.(ctx.copy.kira.islandFinal)
        await wait(ms(FINAL_HOLD_MS)); if(this._aborted) return

        this._showChip(ctx.copy.islandReveal.beginCta, () => this._beatBegin(ctx))
    }

    _beatBegin(ctx)
    {
        const camera  = ctx.view.camera
        const reduced = ctx.reducedMotion
        const cameraMs = (full) => reduced ? 200 : full

        // Release twilight pin a bit before the camera reset so the sky
        // drift starts mid-move and lands as the camera settles.
        setTimeout(() => ctx.state?.day?.clearManualHour?.(), reduced ? 40 : SKY_LEAD_MS)

        camera?.resetToDefault?.(cameraMs(1800))
        ctx.view.kiraDialogue?.clearOnboardingBubble?.()
        ctx.onboarding.complete()
    }
}

