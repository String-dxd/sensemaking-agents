/**
 * Post-hatch chat beat. The onboarding overlay drops to a translucent
 * sheen so the 3D Kira shows through, the bird glides in from off-canvas
 * onto its perch (kira.flyTo), the camera zooms to the bird's face, and
 * Kira speaks the intro line.
 *
 * After the intro, two chips appear:
 *   - "Chat a bit more"          → Kira speaks one extra line, chips re-show.
 *   - "Tell me how I feel now"   → camera.restoreZoom(), advance to first-mood.
 *
 * The two chips are the only way out of this beat — no auto-advance.
 */

import * as THREE from 'three'

import { wait } from '../../util/timing.js'
import { escapeHtml } from '../../util/html.js'

const ENTER_MS        = 320
const EXIT_MS         = 200
const FLY_DURATION_S  = 2.4
const ZOOM_MS         = 1200
const INTRO_LINE_MS   = 1800
const CHAT_MORE_MS    = 1800
// Off-canvas start (high + far behind the camera-left edge), arc apex
// nudged forward + up via the flyTo default midOffset, landing on the
// bird's perch. Tunable per plan §"kira.flyTo()".
const FLY_START = { x: -14, y: 12, z: 8 }
// Mid-arc offset pulls the bezier apex above the straight start→perch
// line so the path reads as a glide rather than a sag.
const FLY_MID_OFFSET = { x: 0, y: 4, z: 0 }

export default class FirstChat
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
        el.className = 'onb-firstchat'
        // Translucent layer — lets the 3D Kira show through while keeping the
        // chrome suppressed. Chips are appended after the intro line.
        el.innerHTML = `
            <div class="onb-firstchat__sheen" aria-hidden="true"></div>
            <div class="onb-firstchat__chips" role="group" hidden></div>
        `
        root.appendChild(el)
        this._el = el
        this._chipsEl = el.querySelector('.onb-firstchat__chips')

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

        // Fly the bird in from off-canvas onto its perch. The flight kicks
        // off as soon as the sheen has faded in so the canvas is readable.
        const kira = ctx.view.kira
        if(kira && typeof kira.flyTo === 'function')
        {
            await kira.flyTo({
                startPos:  FLY_START,
                endPos:    { x: kira.perchX, y: kira.perchY, z: kira.perchZ },
                midOffset: FLY_MID_OFFSET,
                duration:  FLY_DURATION_S,
                endYaw:    kira.perchYaw,
                reducedMotion: ctx.reducedMotion,
            })
        }
        if(this._aborted) return

        // Camera close-up on Kira's face. The Kira silhouette is built
        // facing local +X (see Kira.js:508), so rotated by yaw around Y
        // the face direction in world is (cos yaw, 0, -sin yaw). Camera
        // sits 1.6 units in front of the bird with a slight downward tilt
        // so the eyes land near the middle of the frame.
        this._zoomedIn = false
        const camera = ctx.view.camera
        if(camera && kira && !ctx.reducedMotion)
        {
            const lookAt = new THREE.Vector3(kira.perchX, kira.perchY + 0.55, kira.perchZ)
            const yaw = kira.perchYaw ?? 0
            const fx =  Math.cos(yaw)
            const fz = -Math.sin(yaw)
            const camPos = new THREE.Vector3(
                lookAt.x + fx * 1.6,
                lookAt.y + 0.35,        // slight downward tilt
                lookAt.z + fz * 1.6,
            )
            camera.zoomTo(camPos, lookAt, ZOOM_MS)
            this._zoomedIn = true
            await wait(ZOOM_MS)
            if(this._aborted) return
        }

        const dialogue = ctx.view.kiraDialogue
        const name = ctx.profile.identity?.companionName?.trim() ||
                     (ctx.onboarding.companionName?.trim() || 'your bird')
        const intro = ctx.copy.kira.firstChatIntro.replace('{companionName}', name)

        dialogue?.sayOnboarding?.(intro)
        await wait(ctx.reducedMotion ? 80 : INTRO_LINE_MS)
        if(this._aborted) return

        this._renderChips(ctx)
    }

    _renderChips(ctx)
    {
        if(!this._chipsEl) return
        this._chipsEl.hidden = false
        this._chipsEl.innerHTML = `
            <button type="button" class="onb-firstchat__chip" data-action="chat-more">
                ${escapeHtml(ctx.copy.firstChatActions.chatMore)}
            </button>
            <button type="button" class="onb-firstchat__chip onb-firstchat__chip--primary" data-action="feel">
                ${escapeHtml(ctx.copy.firstChatActions.feel)}
            </button>
        `
        // Park focus on the primary chip so keyboard users land on the
        // "advance" action by default.
        setTimeout(() => this._chipsEl?.querySelector('[data-action="feel"]')?.focus({ preventScroll: true }), 60)

        const onClick = (e) =>
        {
            const action = e.target.closest('[data-action]')?.dataset.action
            if(action === 'chat-more') this._onChatMore(ctx)
            else if(action === 'feel') this._onFeel(ctx)
        }
        this._chipsEl.onclick = onClick
    }

    async _onChatMore(ctx)
    {
        if(this._aborted) return
        this._chipsEl.hidden = true
        this._chipsEl.innerHTML = ''
        const dialogue = ctx.view.kiraDialogue
        const line = ctx.copy.kira.firstChatChatMore
        dialogue?.sayOnboarding?.(line)
        await wait(ctx.reducedMotion ? 80 : CHAT_MORE_MS)
        if(this._aborted) return
        // A second tap of "chat more" should still feel personal — vary
        // the prompt line on the re-show so it's not literally identical.
        const prompt = ctx.copy.kira.firstChatChatPrompt
        dialogue?.sayOnboarding?.(prompt)
        if(this._aborted) return
        this._renderChips(ctx)
    }

    _onFeel(ctx)
    {
        if(this._aborted) return
        this._chipsEl.hidden = true
        this._chipsEl.innerHTML = ''
        if(this._zoomedIn) ctx.view.camera?.restoreZoom?.(700)
        this._advance?.('first-mood')
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
}

