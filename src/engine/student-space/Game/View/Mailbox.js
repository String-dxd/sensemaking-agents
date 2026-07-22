import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildPlaceholderBlock } from './placeholderBlock.ts'

/**
 * Mailbox — the on-island entry into LettersSheet. A classic American-style
 * red mailbox: arched red body mounted on a red post with a black base
 * plate, and a red signal flag on the side that rises when there is unread
 * mail.
 *
 * Raycast: HoverProbe picks `mailbox` ahead of trees/flowers (priority sits
 * with Kira and the mailbox — small, deliberate targets). On click, the
 * mailbox flows through KiraNarrator like every other island element:
 * camera zooms to Kira, she says something letter-state-aware, and the
 * CTA opens LettersSheet (instead of FacetView's facet card).
 *
 * Subscribes to TeacherLetters and swings the flag up when there is
 * at least one unread letter, drops it again when the inbox is fully read.
 * The swing animation matches the locked motion envelope (320–700ms,
 * cubic-bezier(0.22,1,0.36,1)) at the same 1.6/s rate Kira uses.
 */

const COLORS = {
    red: 0xC8202A,   // classic mailbox red — the unread-letters flag signal
}

const FLAG_DOWN_RAD = -Math.PI * 0.45   // pole tilted back, flag tucked low
const FLAG_UP_RAD   =  0                // pole straight up — "you have mail"

export default class Mailbox
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        // Front-left of the plateau, mirroring Kira (0.6, 2.1) on the right
        // so the two interactables flank the default camera frame. Tucked
        // closer to the centre line than before to keep clear of the cherry
        // tree at (-1.8, 2.1) — the previous (-1.8, 2.4) spot overlapped its
        // foliage envelope.
        // Base placement is driven by the IslandLayout slice; fallback to the
        // authored constants so the constructor never throws if the slice is not
        // yet available (e.g. during isolated unit tests).
        const _mailboxPlacement = this.state.islandLayout?.get('mailbox-0')
        const x = _mailboxPlacement ? _mailboxPlacement.x : -0.6
        const z = _mailboxPlacement ? _mailboxPlacement.z : 2.5
        const groundY = this.island.heightAt(x, z)
        this.position = { x, y: groundY, z }

        this.group = new THREE.Group()
        this.group.position.set(x, groundY, z)
        // Face the box slightly toward the default camera so the door and
        // flag read from the front.
        this.group.rotation.y = Math.PI * 0.92
        this.scene.add(this.group)

        this._build()

        // Initial flag posture from current letter state.
        this._flagTarget = this._flagRestForLetterState()
        this._flagCurrent = this._flagTarget
        this._setFlagAngle(this._flagCurrent)

        this._unsubLetters = this.state.letters.subscribe(() => this._refreshFlag())
    }

    _build()
    {
        // GREY PLACEHOLDER (world-port U7, R7): the mailbox has no editor
        // asset yet, so it renders as a deliberately conspicuous grey block
        // sized so the peek anchor lift (~1.35) still points sensibly. The
        // raycast group, letters-flag subscription (the small red block on
        // the flagAnchor still tilts up/down + sways), move() API, and the
        // onboarding hide all survive — only the model is interim.
        const block = buildPlaceholderBlock({ width: 0.35, height: 1.1, depth: 0.35 })
        this.group.add(block.group)
        this.body = block.body

        // FLAG — the unread-letters signal keeps its motion coupling: a red
        // block on a pivot that _setFlagAngle tilts and update() sways.
        const flagAnchor = new THREE.Group()
        flagAnchor.position.set(0.19, 1.02, 0.1)
        this.group.add(flagAnchor)
        this.flagAnchor = flagAnchor

        const matFlag = new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 1, metalness: 0 })
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), matFlag)
        flag.position.y = 0.11
        flag.castShadow = true
        flagAnchor.add(flag)
        this.flag = flag

        this._flagAxisGroup = flagAnchor
    }

    /**
     * @returns the rest-state flag angle for the current letter state —
     *   up if any letter is unread, down if all are read.
     */
    _flagRestForLetterState()
    {
        return this.state.letters.unreadCount() > 0 ? FLAG_UP_RAD : FLAG_DOWN_RAD
    }

    _refreshFlag()
    {
        this._flagTarget = this._flagRestForLetterState()
    }

    _setFlagAngle(rad)
    {
        // Rotation about X tilts the whole pole/flag assembly forward and
        // back along the body length — UP = vertical, DOWN = laid back.
        this._flagAxisGroup.rotation.x = rad
    }

    /**
     * Pick-and-plant: relocate the mailbox to a new (x, z) on the plateau.
     * `opts.y` allows the drag handler to hold the mesh at the lift plane
     * height during a drag; on release it omits opts.y and we snap to the
     * island's ground heightAt(x, z).
     */
    move(x, z, opts = {})
    {
        if(!this.group) return
        const groundY = this.island?.heightAt?.(x, z) ?? 0
        const y = (typeof opts.y === 'number') ? opts.y : groundY
        this.group.position.set(x, y, z)
        if(typeof opts.y !== 'number') this.position = { x, y: groundY, z }
    }

    /**
     * Onboarding mode toggle. Hides the mailbox during the ceremony so
     * the empty island reads cleanly. Idempotent.
     */
    setOnboardingMode(on)
    {
        if(!this.group) return
        this.group.visible = !on
    }

    /**
     * Tear-down hook called from View.dispose(). Drops the letters
     * subscription and removes the group from the scene. Geometries and
     * materials are disposed via a depth traversal so the GPU buffers
     * release; otherwise they'd survive Renderer.dispose() through their
     * scene-graph parent.
     */
    dispose()
    {
        if(this._unsubLetters)
        {
            try { this._unsubLetters() } catch(_) {}
            this._unsubLetters = null
        }
        if(this.group)
        {
            try { this.scene?.remove?.(this.group) } catch(_) {}
            this.group.traverse((node) =>
            {
                if(node.geometry) { try { node.geometry.dispose() } catch(_) {} }
                if(node.material) { try { node.material.dispose() } catch(_) {} }
            })
            this.group = null
        }
        this.flag = null
        this.flagAnchor = null
        this.body = null
        this._flagAxisGroup = null
    }

    update()
    {
        if(!this.group) return    // post-dispose tick
        // Ease flag toward target at the same 1.6/s rate Kira uses on her
        // brow tween — under 1Hz, no spring, no overshoot.
        if(Math.abs(this._flagCurrent - this._flagTarget) > 0.001)
        {
            const dt = this.state.time.delta
            const step = dt * 1.6
            const diff = this._flagTarget - this._flagCurrent
            this._flagCurrent += Math.sign(diff) * Math.min(Math.abs(diff), step)
            this._setFlagAngle(this._flagCurrent)
        }

        // Gentle idle sway when the flag is up — rotate around the pole's
        // own vertical axis so the flag plate swings side-to-side like a
        // tin flag catching a light breeze.
        if(Math.abs(this._flagTarget - FLAG_UP_RAD) < 0.05)
        {
            const t = this.state.time.elapsed
            const sway = Math.sin(t * Math.PI * 1.4) * 0.08
            this._flagAxisGroup.rotation.y = sway
        }
        else
        {
            this._flagAxisGroup.rotation.y = 0
        }
    }
}
