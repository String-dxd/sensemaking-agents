import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

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
    base:    0x1A1A1A,   // matte black base plate
    bracket: 0x2A2520,   // dark mounting bracket where post meets body
    red:     0xC8202A,   // classic mailbox red — gloss vermillion
    redDark: 0x9F161E,   // door panel — slightly darker for inset depth
    knob:    0x707070,   // brushed-metal latch
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
        const x = -0.6, z = 2.5
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
        const matBase    = new THREE.MeshLambertMaterial({ color: COLORS.base,    flatShading: true })
        const matBracket = new THREE.MeshLambertMaterial({ color: COLORS.bracket, flatShading: true })
        const matRed     = new THREE.MeshLambertMaterial({ color: COLORS.red,     flatShading: true })
        const matDoor    = new THREE.MeshLambertMaterial({ color: COLORS.redDark, flatShading: true })
        const matKnob    = new THREE.MeshLambertMaterial({ color: COLORS.knob,    flatShading: true })
        const matFlag    = new THREE.MeshLambertMaterial({ color: COLORS.red,     flatShading: true, side: THREE.DoubleSide })

        // BASE PLATE — flat black square at ground level so the post reads
        // as bolted down rather than driven into the soil.
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.02, 0.24),
            matBase,
        )
        base.position.y = 0.01
        this.group.add(base)

        // POST — square red column, the classic painted-steel stand.
        const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.93, 0.07),
            matRed,
        )
        post.position.y = 0.02 + 0.465
        this.group.add(post)

        // BRACKET — small dark mounting plate atop the post that the box
        // sits on. Wider than the post to read as a saddle.
        const bracket = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.018, 0.18),
            matBracket,
        )
        bracket.position.y = 0.96
        this.group.add(bracket)

        // BODY — tombstone cross-section extruded along Z. Flat bottom,
        // short straight sides, then a half-circle dome on top. This is the
        // canonical US mailbox silhouette.
        const halfW = 0.17
        const flatH = 0.05
        const length = 0.48

        const shape = new THREE.Shape()
        shape.moveTo(-halfW, 0)
        shape.lineTo(halfW, 0)
        shape.lineTo(halfW, flatH)
        shape.absarc(0, flatH, halfW, 0, Math.PI, false)
        shape.lineTo(-halfW, 0)

        const bodyGeo = new THREE.ExtrudeGeometry(shape, {
            depth: length,
            bevelEnabled: false,
            curveSegments: 18,
        })
        const body = new THREE.Mesh(bodyGeo, matRed)
        // Bottom of body sits flush on the bracket; cross-section centered
        // on Z so the door faces +Z (toward the camera after the group's
        // 0.92π yaw).
        body.position.set(0, 0.97, -length / 2)
        this.group.add(body)
        this.body = body

        // DOOR — slightly darker tombstone plate floating a hair in front
        // of the body's front cap so it reads as an inset hinged panel.
        const dInset = 0.014
        const dHalfW = halfW - dInset
        const dArcR  = halfW - dInset
        const doorShape = new THREE.Shape()
        doorShape.moveTo(-dHalfW, 0)
        doorShape.lineTo(dHalfW, 0)
        doorShape.lineTo(dHalfW, flatH)
        doorShape.absarc(0, flatH, dArcR, 0, Math.PI, false)
        doorShape.lineTo(-dHalfW, 0)

        const doorGeo = new THREE.ExtrudeGeometry(doorShape, {
            depth: 0.006,
            bevelEnabled: false,
            curveSegments: 18,
        })
        const door = new THREE.Mesh(doorGeo, matDoor)
        door.position.set(0, 0.97 + 0.008, length / 2 + 0.0005)
        this.group.add(door)

        // LATCH KNOB — small steel button at the lower-centre of the door,
        // matching the catch on a real curbside mailbox.
        const knob = new THREE.Mesh(
            new THREE.CylinderGeometry(0.013, 0.013, 0.012, 12),
            matKnob,
        )
        knob.rotation.x = Math.PI / 2
        knob.position.set(0, 0.97 + 0.05, length / 2 + 0.012)
        this.group.add(knob)

        // FLAG ASSEMBLY — vertical red pole anchored at the side of the
        // box near the front, with a rectangular red flag at the top. The
        // whole anchor rotates about X so the pole tilts back along the
        // body when "down" (no mail) and stands straight up when "up"
        // (unread letters waiting).
        const flagAnchor = new THREE.Group()
        flagAnchor.position.set(halfW + 0.006, 0.97 + flatH + 0.02, length / 2 - 0.07)
        this.group.add(flagAnchor)
        this.flagAnchor = flagAnchor

        // Pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8),
            matRed,
        )
        pole.position.y = 0.11
        flagAnchor.add(pole)

        // Flag plate — small red rectangle at the top of the pole,
        // projecting outward (along +X in anchor space) so the broadside
        // faces forward when the pole is upright.
        const flagGeo = new THREE.PlaneGeometry(0.11, 0.08)
        // Pivot at inner edge so the flag attaches to the pole rather than
        // floating with its centre offset.
        flagGeo.translate(0.055, 0, 0)
        const flag = new THREE.Mesh(flagGeo, matFlag)
        flag.position.set(0, 0.20, 0)
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
