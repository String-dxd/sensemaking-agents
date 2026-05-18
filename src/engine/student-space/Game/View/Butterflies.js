import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Butterflies — small low-poly sprites that drift in slow figure-eight
 * orbits around random anchor points on the plateau. DESIGN.md folds them
 * with fireflies after dusk: the same instances render a tiny glowing
 * round-billboard variant at night instead of patterned wings.
 *
 * v1.1: replaces the two-flat-plates silhouette with a proper butterfly
 * recipe — a tapered abdomen + head, two forward-curling antennae, and
 * lobed (Bezier ShapeGeometry) wings that hinge at the body so the flap
 * reads as articulated motion rather than rectangle rotation. The insect now
 * faces its flight path instead of billboarding to the camera, so it reads as
 * a small creature moving through the island rather than staring at the lens.
 *
 * Species differ by wing aspect ratio + a contrasting eye-spot offset; the
 * firefly fold at night just collapses wings/body opacity to zero and
 * raises an additive emissive disc.
 */
const COUNT = 9
const WING_PALETTE = [0xFFAA00, 0x4488FF, 0xFF44AA, 0xFFFF44, 0xAA44FF]
const FIREFLY_CORE = 0xFFF4C2
const BODY_INK     = 0x2B2620

// Wing aspect-ratio "species" — w is wing root-to-tip length, h is span
// perpendicular to that (i.e. front-to-back wing depth). `spotPos` is a 0–1
// fraction along the wing length where the painterly eye-spot sits.
const SPECIES = [
    { id: 'common',      w: 0.34, h: 0.26, spotR: 0.048, spotPos: 0.66 },
    { id: 'tiger',       w: 0.30, h: 0.32, spotR: 0.042, spotPos: 0.58 },
    { id: 'swallowtail', w: 0.40, h: 0.22, spotR: 0.038, spotPos: 0.74 },
]

const hash = (seed, n) =>
{
    let h = seed | 0
    h = Math.imul(h ^ n, 2654435761)
    h ^= h >>> 16
    return ((h >>> 0) % 10_000) / 10_000
}

// Build a single right-side wing shape — a Bezier silhouette anchored at
// the body (x=0) and arcing outward to a soft tip at x=w. Two lobes give it
// the forewing/hindwing read without needing four separate meshes.
function buildWingGeometry(w, h)
{
    const top = h * 0.55
    const bot = h * 0.45

    const shape = new THREE.Shape()
    shape.moveTo(0, top * 0.15)
    // Forewing — curls up and out, tapers to a rounded leading-edge tip.
    shape.bezierCurveTo(
        w * 0.20,  top * 1.15,
        w * 0.70,  top * 1.05,
        w * 0.98,  top * 0.30,
    )
    // Outer tip — soft round-over between the forewing and hindwing.
    shape.bezierCurveTo(
        w * 1.05,  top * 0.00,
        w * 1.02, -bot * 0.35,
        w * 0.78, -bot * 0.70,
    )
    // Hindwing — scoops back toward the body with a gentler lobe.
    shape.bezierCurveTo(
        w * 0.55, -bot * 0.95,
        w * 0.25, -bot * 0.85,
        w * 0.05, -bot * 0.25,
    )
    shape.lineTo(0, top * 0.15)

    return new THREE.ShapeGeometry(shape, 12)
}

export default class Butterflies
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.group = new THREE.Group()
        this.scene.add(this.group)

        this._worldUp = new THREE.Vector3(0, 1, 0)
        this._forward = new THREE.Vector3()
        this._right = new THREE.Vector3()
        this._up = new THREE.Vector3()
        this._basis = new THREE.Matrix4()
        this._parentQuat = new THREE.Quaternion()
        this._billboardQuat = new THREE.Quaternion()

        this.entries = []
        for(let i = 0; i < COUNT; i++)
            this._buildOne(2024, i)
    }

    _buildOne(seed, i)
    {
        const anchorR = 1.5 + hash(seed, 100 + i) * 2.2
        const theta   = hash(seed, 200 + i) * Math.PI * 2
        const anchor = new THREE.Vector3(
            Math.cos(theta) * anchorR,
            1.0 + hash(seed, 300 + i) * 0.8,
            Math.sin(theta) * anchorR,
        )
        const orbitR    = 0.6 + hash(seed, 400 + i) * 0.5
        const orbitSpd  = 0.4 + hash(seed, 500 + i) * 0.45
        const wingColour = WING_PALETTE[i % WING_PALETTE.length]
        const species    = SPECIES[Math.floor(hash(seed, 700 + i) * SPECIES.length)]
        const scale      = 0.85 + hash(seed, 800 + i) * 0.30

        const group = new THREE.Group()
        group.position.copy(anchor)
        group.scale.setScalar(scale)

        // === Body =========================================================
        // Tapered abdomen + thorax + head along +Y so the figure reads as a
        // proper insect after lookAt orients +Z toward camera. flatShading
        // keeps it painterly with the rest of the island.
        const bodyMat = new THREE.MeshLambertMaterial({
            color: BODY_INK,
            flatShading: true,
            transparent: true,
            opacity: 1,
        })
        const abdomen = new THREE.Mesh(
            new THREE.CylinderGeometry(0.014, 0.024, 0.13, 6, 1),
            bodyMat,
        )
        abdomen.position.y = -0.005
        group.add(abdomen)

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.028, 8, 6),
            bodyMat,
        )
        head.position.y = 0.075
        group.add(head)

        // === Antennae =====================================================
        // Two slim tapered cones angled outward + forward from the head.
        // The geometry is pre-translated so the cone's BASE sits at local
        // origin (default ConeGeometry centres on its midpoint), letting
        // the mesh rotate around the attachment point instead of pivoting
        // about its middle. ±Z rotation tilts outward; +X rotation swings
        // the tip slightly forward (toward the camera after lookAt).
        const antennaGeo = new THREE.ConeGeometry(0.005, 0.10, 4)
        antennaGeo.translate(0, 0.05, 0)
        const antennaL = new THREE.Mesh(antennaGeo, bodyMat)
        antennaL.position.set(-0.015, 0.10, 0.005)
        antennaL.rotation.z =  Math.PI * 0.18
        antennaL.rotation.x = -Math.PI * 0.10
        const antennaR = new THREE.Mesh(antennaGeo, bodyMat)
        antennaR.position.set( 0.015, 0.10, 0.005)
        antennaR.rotation.z = -Math.PI * 0.18
        antennaR.rotation.x = -Math.PI * 0.10
        group.add(antennaL, antennaR)

        // === Wings ========================================================
        // Right-hand shape, mirrored to the other side via the left wing's
        // base orientation. Wings hinge at x=0 (the body root) so flap is a
        // pure rotation around the body's Y axis — what `update()` sets
        // each frame. ShapeGeometry's lobed outline is what makes the
        // silhouette read as a butterfly rather than a rectangle.
        const wingMat = new THREE.MeshBasicMaterial({
            color: wingColour,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95,
        })
        const wingGeo = buildWingGeometry(species.w, species.h)
        const wR = new THREE.Mesh(wingGeo, wingMat)
        const wL = new THREE.Mesh(wingGeo, wingMat)
        wL.rotation.y = Math.PI    // mirror to the other side
        group.add(wL, wR)

        // === Wingtip eye-spot ============================================
        // Darker contrasting disc near the outer edge of each wing, attached
        // as a child so the flap carries it. Tiny +Z offset keeps it above
        // the wing surface; DoubleSide so it reads from either face.
        const spotColor = new THREE.Color(wingColour).multiplyScalar(0.55)
        const spotMat = new THREE.MeshBasicMaterial({
            color: spotColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
        })
        const spotGeo = new THREE.CircleGeometry(species.spotR, 10)
        const spotR_ = new THREE.Mesh(spotGeo, spotMat)
        const spotL_ = new THREE.Mesh(spotGeo, spotMat)
        spotR_.position.set(species.w * species.spotPos, species.h * 0.05, 0.001)
        spotL_.position.set(species.w * species.spotPos, species.h * 0.05, 0.001)
        wR.add(spotR_)
        wL.add(spotL_)

        // === Firefly fold =================================================
        const fireflyMat = new THREE.MeshBasicMaterial({
            color: FIREFLY_CORE,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
        const firefly = new THREE.Mesh(new THREE.CircleGeometry(0.10, 12), fireflyMat)
        firefly.renderOrder = 999
        group.add(firefly)

        this.group.add(group)
        this.entries.push({
            group, wL, wR, wingMat, spotMat, bodyMat, firefly, fireflyMat,
            anchor, orbitR, orbitSpd,
            phase: hash(seed, 600 + i) * Math.PI * 2,
        })
    }

    update()
    {
        const t = this.state.time.elapsed
        const day = this.state.day.currentState
        // After-dusk fold: butterflies hide their wings, fireflies emerge.
        // 1 = full firefly, 0 = full butterfly.
        let nightFactor = 0
        if(day)
        {
            const h = day.hour
            nightFactor = THREE.MathUtils.clamp(
                h < 6 ? 1 - h / 6 : (h > 19.5 ? (h - 19.5) / 4.5 : 0),
                0, 1,
            )
        }

        // Shelter dim — butterflies thin out in a downpour but never fully
        // disappear. Visibility floors at 0.55 even in a heavy shower so the
        // island always reads as inhabited (v1.2: previously they vanished).
        const rain = day?.rain ?? 0
        const tRain = THREE.MathUtils.clamp((rain - 0.25) / 0.45, 0, 1)
        const shelter = tRain * tRain * (3 - 2 * tRain)
        const visibility = THREE.MathUtils.lerp(1.0, 0.55, shelter)

        const cam = this.view.camera.instance

        for(const e of this.entries)
        {
            // Slow figure-8 orbit around the anchor — bracket each lap with a
            // wing flap so the motion reads alive rather than mechanical.
            const a = t * e.orbitSpd + e.phase
            e.group.position.set(
                e.anchor.x + Math.cos(a) * e.orbitR,
                e.anchor.y + Math.sin(a * 0.7) * 0.20,
                e.anchor.z + Math.sin(a) * e.orbitR * 0.6,
            )

            // Body + wings face the path of travel, not the camera. Local +Y
            // is the abdomen/head axis, so the basis maps +Y to the orbit
            // tangent and keeps local +Z as the wing-up axis for flapping.
            this._forward.set(
                -Math.sin(a) * e.orbitR,
                0,
                 Math.cos(a) * e.orbitR * 0.6,
            )
            if(this._forward.lengthSq() > 0.0001)
            {
                this._forward.normalize()
                this._right.crossVectors(this._forward, this._worldUp).normalize()
                this._up.crossVectors(this._right, this._forward).normalize()
                this._basis.makeBasis(this._right, this._forward, this._up)
                e.group.quaternion.setFromRotationMatrix(this._basis)
            }

            // The night firefly fold remains a small billboard even though the
            // butterfly body no longer billboards.
            e.group.getWorldQuaternion(this._parentQuat)
            e.firefly.quaternion.copy(
                this._billboardQuat.copy(this._parentQuat).invert().multiply(cam.quaternion),
            )

            // Flap wings ~6Hz around the body's vertical axis. Right wing
            // pivots positive, left wing (already π-rotated) pivots negative
            // so the flap is symmetric. Amplitude drops to 0 at night so the
            // firefly doesn't read as a flickering moth, and drops with
            // shelter so the few visible ones in light rain flap less briskly.
            const flap = Math.sin(t * 12 + e.phase) * 0.6 * (1 - nightFactor) * visibility
            e.wR.rotation.y =  flap
            e.wL.rotation.y = Math.PI - flap

            // Day → wings opaque, firefly invisible. Night → opposite.
            // Shelter scales both so a downpour empties the air.
            const dayOpacity = (1 - nightFactor) * visibility
            e.wingMat.opacity = 0.95 * dayOpacity
            e.spotMat.opacity = 0.85 * dayOpacity
            e.bodyMat.opacity = dayOpacity
            e.fireflyMat.opacity = 0.85 * nightFactor * visibility
            // Gentle firefly pulse (more atmospheric than uniform).
            e.fireflyMat.opacity *= 0.7 + 0.3 * Math.sin(t * 2.5 + e.phase * 1.7)
        }
    }
}
