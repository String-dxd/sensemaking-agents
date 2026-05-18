import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Telescope — small prop on the NE rim of the plateau, tube pitched up at
 * the sky. Mirrors Mailbox.js in shape: a simple low-poly model parented to
 * a Group placed at the ground height under its XZ. HoverProbe picks it via
 * the group, KiraNarrator delivers a short line on click, and the CTA opens
 * the TrajectorySheet (overlay key 'trajectory').
 *
 * Palette stays in the v1 painterly band — warm brass tube, dark wood eyepiece,
 * pale tripod legs, matching the cream/sand-ink range of the island.
 */

const COLORS = {
    brass:    0xB58C5A,   // warm brass — tube body
    brassDk:  0x806240,   // darker brass — eyepiece
    wood:     0x6B4A2F,   // wood ring
    leg:      0xDCC9A3,   // pale tripod leg (sun-bleached)
    lens:     0x2A2620,   // dark lens disc
}

// Rim coords. Plateau radius is 5.0; we sit at r ≈ 4.85 so the prop reads
// as standing on grass right at the rim. θ ≈ 1.30 rad ≈ NE.
const RIM_THETA  = 1.30
const RIM_RADIUS = 4.85
const TUBE_PITCH = Math.PI * 0.30   // ~54° above horizontal; aimed at the sky
// Tube yaw is set so the eyepiece faces inward (toward the island centre)
// and the long lens end points out over the ocean.
const TUBE_YAW   = Math.PI * 0.45

export default class Telescope
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        const x = Math.cos(RIM_THETA) * RIM_RADIUS
        const z = Math.sin(RIM_THETA) * RIM_RADIUS
        const groundY = this.island.heightAt(x, z)
        this.position = { x, y: groundY, z }

        this.group = new THREE.Group()
        this.group.position.set(x, groundY, z)
        // Whole prop yawed so the tripod's "front leg" points outward — the
        // model reads naturally from the default camera framing.
        this.group.rotation.y = Math.atan2(-x, -z) + Math.PI / 2
        this.scene.add(this.group)

        this._build()
    }

    _build()
    {
        const matBrass   = new THREE.MeshLambertMaterial({ color: COLORS.brass,   flatShading: true })
        const matBrassDk = new THREE.MeshLambertMaterial({ color: COLORS.brassDk, flatShading: true })
        const matWood    = new THREE.MeshLambertMaterial({ color: COLORS.wood,    flatShading: true })
        const matLeg     = new THREE.MeshLambertMaterial({ color: COLORS.leg,     flatShading: true })
        const matLens    = new THREE.MeshLambertMaterial({ color: COLORS.lens,    flatShading: true })

        const TRIPOD_HEIGHT = 0.62
        const HEAD_Y        = TRIPOD_HEIGHT + 0.04
        const tripod = new THREE.Group()
        this.group.add(tripod)

        // 3 legs splayed outward from the apex. Each leg is a thin cylinder
        // rotated about its top end so the bottom end lands on the ground in
        // an equilateral triangle.
        const LEG_LEN = TRIPOD_HEIGHT + 0.04
        const LEG_R   = 0.018
        const SPLAY   = 0.24   // tan of the lean angle
        for(let i = 0; i < 3; i++)
        {
            const a = (i / 3) * Math.PI * 2 + Math.PI / 6
            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(LEG_R * 0.85, LEG_R, LEG_LEN, 8),
                matLeg,
            )
            // Hinge geometry pivot at the leg's top end so we can rotate it
            // about XZ without offsetting from the apex.
            leg.geometry.translate(0, -LEG_LEN / 2, 0)
            leg.position.y = HEAD_Y - 0.02
            // Lean the leg outward in the +X/+Z direction defined by `a`.
            // Compose a small tilt around the perpendicular axis.
            const tiltAxis = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
            leg.quaternion.setFromAxisAngle(tiltAxis, Math.atan(SPLAY))
            tripod.add(leg)
        }

        // Small cap at the tripod apex — reads as the leg yoke.
        const yoke = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.06, 0.04, 10),
            matWood,
        )
        yoke.position.y = HEAD_Y
        tripod.add(yoke)

        // Pivot for the tube assembly so we can pitch the whole tube together.
        const headPivot = new THREE.Group()
        headPivot.position.y = HEAD_Y + 0.02
        headPivot.rotation.y = TUBE_YAW
        headPivot.rotation.x = -TUBE_PITCH   // negative tilt → points sky-ward along yaw axis
        this.group.add(headPivot)

        // TUBE — main brass cylinder. Lying along the local +X axis after we
        // rotate it; pivot at its centre, the tube reads as a real telescope
        // because the eyepiece + objective end-caps are slightly different
        // diameters and colours.
        const TUBE_LEN = 0.92
        const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.065, 0.085, TUBE_LEN, 14),
            matBrass,
        )
        // Cylinder default axis is Y — rotate to Z to align with the
        // headPivot's forward direction (which already carries the pitch).
        tube.rotation.x = Math.PI / 2
        headPivot.add(tube)

        // Front (objective) wood ring.
        const frontRing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.10, 0.10, 0.04, 14),
            matWood,
        )
        frontRing.rotation.x = Math.PI / 2
        frontRing.position.z = TUBE_LEN / 2 + 0.005
        headPivot.add(frontRing)

        // Objective lens disc
        const lens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.078, 0.078, 0.006, 14),
            matLens,
        )
        lens.rotation.x = Math.PI / 2
        lens.position.z = TUBE_LEN / 2 + 0.026
        headPivot.add(lens)

        // Eyepiece — short narrow cylinder behind the tube, slightly tilted.
        const eyepiece = new THREE.Mesh(
            new THREE.CylinderGeometry(0.034, 0.04, 0.14, 10),
            matBrassDk,
        )
        eyepiece.rotation.x = Math.PI / 2
        eyepiece.position.z = -TUBE_LEN / 2 - 0.07
        headPivot.add(eyepiece)

        // A small focuser knob on the side — adds character without much cost.
        const knob = new THREE.Mesh(
            new THREE.SphereGeometry(0.024, 8, 6),
            matBrassDk,
        )
        knob.position.set(0.072, 0, -TUBE_LEN / 4)
        headPivot.add(knob)

        this.headPivot = headPivot
    }

    update()
    {
        // Tiny breeze sway on the tube — under 1Hz, well inside the locked
        // motion envelope. Pitch is anchored; only yaw oscillates lightly so
        // the telescope reads as planted, not animatronic.
        const t = this.state.time?.elapsed ?? 0
        const sway = Math.sin(t * 0.45) * 0.012
        if(this.headPivot) this.headPivot.rotation.z = sway
    }
}
