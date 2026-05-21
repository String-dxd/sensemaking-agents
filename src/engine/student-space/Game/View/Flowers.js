import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Plateau flowers — six rng-seeded species per island (3 picked per island
 * for ecosystem coherence), 18 instances total scattered on the grass.
 * Maps to the I facet (interests, present-tense).
 *
 * v1.1: ported the v0.3 6-species shape library (daisy, tulip, rose, lily,
 * pansy, hyacinth) so every bloom has real 3D form instead of a flat petal
 * fan. Petals are flattened/elongated Sphere or Cone primitives, lit with
 * MeshLambertMaterial + flatShading to stay in the v1 painterly palette.
 *
 * Stem + two side leaves are shared via `buildStem`. Each species supplies
 * its own bloom recipe; the bloom group rotates on a slow per-flower sin so
 * the field never reads as a synchronised clone-stamp.
 */
const SPECIES = [
    { id: 'daisy',    petal: 0xFF8E8E, centre: 0xFFD45A },
    { id: 'tulip',    petal: 0xFFB0D5 },
    { id: 'rose',     petal: 0xF0A86A },
    { id: 'lily',     petal: 0xFFD45A, centre: 0xFAF1DC },
    { id: 'pansy',    petal: 0xD09EE8, face:   0x2B2620 },
    { id: 'hyacinth', petal: 0xFAF1DC },
]
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]))

// First-bloom mapping. The ceremony flower (index 0) reflects the
// emotion the student picks in FirstMood — silhouette via species,
// hue via the emotion's color. Two emotions can share a species so
// the silhouette stays balanced (e.g. envy + fear both → lily).
const EMOTION_FLOWER_MAP = {
    joy:           'daisy',
    sadness:       'hyacinth',
    anger:         'rose',
    fear:          'lily',
    disgust:       'pansy',
    anxiety:       'tulip',
    envy:          'lily',
    embarrassment: 'rose',
    ennui:         'pansy',
}
export { EMOTION_FLOWER_MAP }

// Deterministic 32-bit hash → 0..1 float. Seeded by the global game seed +
// the per-flower index so the picks survive reloads without storing state.
const hash = (seed, n) =>
{
    let h = seed | 0
    h = Math.imul(h ^ n, 2654435761)
    h ^= h >>> 16
    return ((h >>> 0) % 10_000) / 10_000
}

const INSTANCES   = 18
const STEM_HEIGHT = 0.22
const STEM_R      = 0.014
const BLOOM_SIZE  = 0.10
const CENTRE_SIZE = 0.07
const STEM_COLOR  = 0x6F8A4A
const LEAF_COLOR  = 0x5E823C   // base-leaf green — slightly darker than the stem

const lambert = (color, opts = {}) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts })

// AC flower silhouettes always show a fan of long blade-like base leaves
// poking up around the stem. Without them the flower reads as a pin on a
// stick; with them the plant feels rooted and the bloom sits in context.
function buildStem()
{
    const grp = new THREE.Group()
    const stemMat = lambert(STEM_COLOR)
    const leafMat = lambert(LEAF_COLOR)

    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(STEM_R * 0.85, STEM_R, STEM_HEIGHT, 6, 1),
        stemMat,
    )
    stem.position.y = STEM_HEIGHT * 0.5
    grp.add(stem)

    // 4–5 elongated cones around the base, lifted at the tip — reads as a
    // grass-blade rosette. Cones are flattened on Z so each blade is a
    // strap, not a spike.
    const bladeCount = 5
    for(let b = 0; b < bladeCount; b++)
    {
        const a    = (b / bladeCount) * Math.PI * 2 + 0.6
        const tilt = 0.55 + (b % 2) * 0.12       // alternate lean for variety
        const blade = new THREE.Mesh(
            new THREE.ConeGeometry(0.022, 0.20 + (b % 2) * 0.04, 4),
            leafMat,
        )
        blade.position.set(Math.cos(a) * 0.025, 0.07, Math.sin(a) * 0.025)
        blade.scale.set(1.0, 1.0, 0.32)          // flatten Z → blade strap
        blade.rotation.y = a
        // Lean blade outward and slightly forward; tilt around its own X so
        // the tip rises away from the stem.
        blade.rotation.z = Math.cos(a) * tilt
        blade.rotation.x = Math.sin(a) * tilt
        grp.add(blade)
    }
    return grp
}

// === Per-species bloom builders ============================================
// Each returns a Group anchored at y=0; the caller lifts it to stem-top and
// attaches it to a `petalGroup` that the sway uses as a pivot.

function buildDaisy(species)
{
    const grp = new THREE.Group()
    const petalMat = lambert(species.petal)
    const centreMat = lambert(species.centre)

    const centre = new THREE.Mesh(new THREE.SphereGeometry(CENTRE_SIZE, 10, 8), centreMat)
    centre.position.y = 0.04
    grp.add(centre)

    const petalCount = 6
    for(let p = 0; p < petalCount; p++)
    {
        const a = (p / petalCount) * Math.PI * 2
        const petal = new THREE.Mesh(new THREE.SphereGeometry(BLOOM_SIZE, 10, 8), petalMat)
        petal.position.set(Math.cos(a) * 0.13, 0.03, Math.sin(a) * 0.13)
        petal.scale.set(1.1, 0.42, 1.1)
        grp.add(petal)
    }
    return grp
}

function buildTulip(species)
{
    const grp = new THREE.Group()
    const petalMat = lambert(species.petal)

    // AC tulips read as a closed teardrop cup — three tall petals meeting at
    // the top, slight gap between them. We use half-spheres (sphere with
    // phiLength = π) so each petal's flat side faces in toward the cup axis,
    // and tilt them inward at the top.
    const petalCount = 3
    for(let p = 0; p < petalCount; p++)
    {
        const a = (p / petalCount) * Math.PI * 2
        const petal = new THREE.Mesh(
            new THREE.SphereGeometry(BLOOM_SIZE * 0.95, 10, 8, 0, Math.PI),
            petalMat,
        )
        petal.position.set(Math.cos(a) * 0.045, 0.10, Math.sin(a) * 0.045)
        petal.scale.set(0.78, 1.7, 0.95)
        petal.rotation.y = -a + Math.PI / 2
        petal.rotation.x = -0.18                       // bow tips inward
        grp.add(petal)
    }

    // A small cap closes the top of the cup so the bloom doesn't look
    // hollow from above.
    const cap = new THREE.Mesh(
        new THREE.SphereGeometry(BLOOM_SIZE * 0.55, 10, 8),
        petalMat,
    )
    cap.position.y = 0.20
    cap.scale.set(0.85, 0.45, 0.85)
    grp.add(cap)

    return grp
}

function buildRose(species)
{
    const grp = new THREE.Group()
    const petalMat = lambert(species.petal)

    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(BLOOM_SIZE * 0.6, 0),
        petalMat,
    )
    core.position.y = 0.08
    grp.add(core)

    for(let layer = 0; layer < 2; layer++)
    {
        const count  = layer === 0 ? 6 : 4
        const radius = layer === 0 ? 0.11 : 0.07
        const y      = layer === 0 ? 0.06 : 0.10
        for(let p = 0; p < count; p++)
        {
            const a = (p / count) * Math.PI * 2 + layer * 0.4
            const petal = new THREE.Mesh(
                new THREE.SphereGeometry(BLOOM_SIZE * 0.85, 10, 8),
                petalMat,
            )
            petal.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius)
            petal.scale.set(0.95, 0.62, 0.95)
            grp.add(petal)
        }
    }
    return grp
}

function buildLily(species)
{
    const grp = new THREE.Group()
    const petalMat = lambert(species.petal)
    const centreMat = lambert(species.centre)
    const stamenMat = lambert(0xC58A36)   // amber anthers — AC lily detail

    const centre = new THREE.Mesh(
        new THREE.SphereGeometry(CENTRE_SIZE * 0.55, 8, 6),
        centreMat,
    )
    centre.position.y = 0.10
    grp.add(centre)

    // 6 petals splayed almost horizontally — AC lilies open into a flat-ish
    // trumpet, not the upright funnel the previous build read as.
    const petalCount = 6
    for(let p = 0; p < petalCount; p++)
    {
        const a = (p / petalCount) * Math.PI * 2
        const petal = new THREE.Mesh(
            new THREE.ConeGeometry(BLOOM_SIZE * 0.5, BLOOM_SIZE * 2.0, 6),
            petalMat,
        )
        petal.position.set(Math.cos(a) * 0.12, 0.085, Math.sin(a) * 0.12)
        petal.rotation.z = -Math.PI / 2.0          // almost horizontal
        petal.rotation.y = -a
        petal.scale.set(1.0, 1.0, 0.65)            // flatten cone → petal blade
        grp.add(petal)
    }

    // Stamens — short amber filaments rising from the centre. Five thin
    // sticks topped with tiny anther beads.
    for(let s = 0; s < 5; s++)
    {
        const ang = (s / 5) * Math.PI * 2 + 0.3
        const filament = new THREE.Mesh(
            new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4),
            stamenMat,
        )
        filament.position.set(Math.cos(ang) * 0.02, 0.135, Math.sin(ang) * 0.02)
        filament.rotation.z = Math.cos(ang) * 0.45
        filament.rotation.x = Math.sin(ang) * 0.45
        grp.add(filament)

        const anther = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.012, 0),
            stamenMat,
        )
        anther.position.set(Math.cos(ang) * 0.045, 0.175, Math.sin(ang) * 0.045)
        grp.add(anther)
    }
    return grp
}

function buildPansy(species)
{
    const grp = new THREE.Group()
    const petalMat = lambert(species.petal)
    const faceMat = lambert(species.face)
    const eyeMat  = lambert(0xFFD45A)         // saturated yellow eye

    // AC pansy layout — two upper petals + two side + one prominent bottom
    // petal. Each is a flattened disc-like sphere; the bottom petal is wider
    // because AC pansies always show one big lobe pointing down.
    const layout = [
        { x: -0.5,  z:  0.7,  s: 1.05 },   // upper left
        { x:  0.5,  z:  0.7,  s: 1.05 },   // upper right
        { x: -0.95, z: -0.10, s: 1.05 },   // left
        { x:  0.95, z: -0.10, s: 1.05 },   // right
        { x:  0,    z: -0.85, s: 1.25 },   // bottom — the big lobe
    ]
    for(const { x, z, s } of layout)
    {
        const petal = new THREE.Mesh(
            new THREE.SphereGeometry(BLOOM_SIZE * 1.05, 12, 8),
            petalMat,
        )
        petal.position.set(x * 0.12, 0.05, z * 0.12)
        // Very flat petals so the bloom reads as a face-on disc, not a
        // hemisphere. Slight upward tilt at the rim through scale on y.
        petal.scale.set(s, 0.26, s)
        grp.add(petal)
    }

    // Darker "face" mask near the centre — AC pansies have a dark blotch
    // covering the inner halves of all five petals.
    const face = new THREE.Mesh(
        new THREE.SphereGeometry(CENTRE_SIZE * 0.65, 12, 8),
        faceMat,
    )
    face.position.set(0, 0.072, 0.005)
    face.scale.set(0.95, 0.22, 0.95)
    grp.add(face)

    // Tiny yellow eye dead-centre. Reads as the floral pip in AC art.
    const eye = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.015, 0),
        eyeMat,
    )
    eye.position.set(0, 0.10, 0)
    grp.add(eye)

    return grp
}

function buildHyacinth(species)
{
    const grp = new THREE.Group()
    const petalMat = lambert(species.petal)

    // Vertical spike — 5 levels × 4 small blobs tightening toward the tip.
    const levels = 5
    for(let lv = 0; lv < levels; lv++)
    {
        const y = 0.04 + lv * 0.075
        const r = 0.08 - lv * 0.012
        for(let p = 0; p < 4; p++)
        {
            const a = (p / 4) * Math.PI * 2 + lv * 0.35
            const blob = new THREE.Mesh(
                new THREE.IcosahedronGeometry(BLOOM_SIZE * 0.55, 0),
                petalMat,
            )
            blob.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
            grp.add(blob)
        }
    }
    return grp
}

const SHAPE_BUILDERS = {
    daisy:    buildDaisy,
    tulip:    buildTulip,
    rose:     buildRose,
    lily:     buildLily,
    pansy:    buildPansy,
    hyacinth: buildHyacinth,
}

export default class Flowers
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.group = new THREE.Group()
        this.scene.add(this.group)

        // v1.2: surface ALL six species per island. Earlier we picked 3 for
        // ecosystem coherence but the result looked like every island had
        // the same flowers; with 18 instances across 6 species the field
        // reads as varied without becoming chaotic.
        const seed = 1337
        this.species = SPECIES.slice()

        this.flowers = []
        for(let i = 0; i < INSTANCES; i++)
            this._buildOne(seed, i)
    }

    _buildOne(seed, i)
    {
        const species = this.species[i % this.species.length]

        // Flower 0 is the ceremony anchor — pinned to a deliberate spot
        // forward-left of the centre tree so IslandReveal's beat J
        // close-up and beat K wide both compose cleanly. Every other
        // flower samples a position uniformly inside the plateau, inset
        // from the rim so they don't poke through the cliff face.
        let x, z
        if(i === 0)
        {
            x = -1.4
            z =  1.0
        }
        else
        {
            const radiusMax = this.island.radius - 0.6
            const theta  = hash(seed, 1000 + i) * Math.PI * 2
            const radial = Math.sqrt(hash(seed, 2000 + i)) * radiusMax
            x = Math.cos(theta) * radial
            z = Math.sin(theta) * radial
        }
        const y = this.island.heightAt(x, z)

        const flower = new THREE.Group()
        flower.position.set(x, y, z)
        flower.rotation.y = hash(seed, 3000 + i) * Math.PI * 2

        flower.add(buildStem())

        const petalGroup = new THREE.Group()
        petalGroup.position.y = STEM_HEIGHT
        const bloom = SHAPE_BUILDERS[species.id](species)
        petalGroup.add(bloom)
        flower.add(petalGroup)

        this.group.add(flower)
        this.flowers.push({
            group: flower,
            petalGroup,
            species,
            index: i,
            x, z,
            phase: hash(seed, 4000 + i) * Math.PI * 2,
        })
    }

    /**
     * Re-skin flower 0's bloom so it matches the student's first-mood
     * pick. Tears down the existing bloom mesh and rebuilds it with the
     * mapped species, tinted with the emotion's hue. The stem + base
     * leaves stay green so the silhouette still reads as a flower.
     *
     * Called from IslandReveal between the mood pick and the bloom
     * tween; safe to no-op if the emotion isn't mapped.
     */
    setFirstSpeciesForEmotion(emotionId, tintHex)
    {
        const speciesId = EMOTION_FLOWER_MAP[emotionId]
        const baseSpecies = speciesId ? SPECIES_BY_ID[speciesId] : null
        const f = this.flowers[0]
        if(!baseSpecies || !f) return false

        // Tinted variant — keep centre/face untouched so e.g. pansies
        // still read as pansies even when the petals turn green.
        const tinted = { ...baseSpecies, petal: tintHex ?? baseSpecies.petal }

        // Dispose the previous bloom so HMR + emotion re-picks don't
        // leak geometry/materials over the life of the page.
        for(let c = f.petalGroup.children.length - 1; c >= 0; c--)
        {
            const child = f.petalGroup.children[c]
            f.petalGroup.remove(child)
            child.traverse?.((n) =>
            {
                if(n.geometry) try { n.geometry.dispose() } catch(_) {}
                if(n.material) try { n.material.dispose() } catch(_) {}
            })
        }

        const bloom = SHAPE_BUILDERS[speciesId](tinted)
        f.petalGroup.add(bloom)
        f.species = tinted
        return true
    }

    /**
     * First-run ceremony helper. Hide every flower group so the plateau
     * reads as bare until bloomInstance() reveals the directed one.
     */
    hideAll()
    {
        for(const f of this.flowers)
        {
            f.group.visible = false
            f.petalGroup.scale.setScalar(0)
        }
    }

    /**
     * Pick-and-plant: relocate a flower to (x, z), snap y to terrain,
     * and update the flower's own x/z record so other systems reading
     * `flower.x` (e.g., IslandReveal's camera anchor) stay in sync.
     *
     * Silent no-op on bad index.
     */
    moveInstance(flowerIndex, x, z, opts = {})
    {
        if(typeof x !== 'number' || typeof z !== 'number') return
        const f = this.flowers[flowerIndex]
        if(!f) return
        const y = typeof opts.y === 'number' ? opts.y : this.island.heightAt(x, z)
        f.group.position.set(x, y, z)
        f.x = x
        f.z = z
    }

    /** Read the live world XZ of a flower, or null if unavailable. */
    getInstanceWorldXZ(flowerIndex)
    {
        const f = this.flowers[flowerIndex]
        if(!f) return null
        return { x: f.group.position.x, z: f.group.position.z }
    }

    /**
     * Reveal flower #flowerIndex by tweening its petalGroup scale 0 → 1.
     * Stem appears at full size immediately (root sprouts), petals bloom in
     * over `duration` ms. Reduced motion caps duration to 80ms.
     */
    bloomInstance(flowerIndex, opts = {})
    {
        const f = this.flowers[flowerIndex]
        if(!f) return Promise.resolve()
        const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const duration = reducedMotion ? 80 : (opts.duration ?? 520)
        const delay    = opts.delay ?? 0
        f.group.visible = true
        f.petalGroup.scale.setScalar(0)
        if(!this._blooms) this._blooms = []
        return new Promise((resolve) =>
        {
            this._blooms.push({
                flower:    f,
                duration,
                startTime: performance.now() + delay,
                resolve,
            })
        })
    }

    update()
    {
        const t = this.state.time.elapsed
        // Rain amplifies sway — flowers shoulder more weight in a downpour.
        // Still bounded by the DESIGN.md "under 1Hz, no spring" envelope
        // (peak amplitude at rain=1 is ~0.16 rad, ~9° tilt). The shared
        // `wind.gust` envelope (0.35..1.0) lulls / gusts the field in step
        // with grass, leaves, and floating particles.
        const rain = this.state.day.currentState?.rain ?? 0
        const gust = this.state.wind ? this.state.wind.gust : 0.7

        // Process onboarding-reveal blooms before the sway pass so the
        // petalGroup scale is current when sway rotations apply.
        if(this._blooms && this._blooms.length > 0)
        {
            const now = performance.now()
            const remaining = []
            for(const b of this._blooms)
            {
                if(now < b.startTime) { remaining.push(b); continue }
                const u = Math.min(1, (now - b.startTime) / b.duration)
                const eased = u * u * u * (u * (u * 6 - 15) + 10)
                b.flower.petalGroup.scale.setScalar(eased)
                if(u < 1) remaining.push(b)
                else b.resolve?.()
            }
            this._blooms = remaining
        }
        const swayGain = (1 + rain * 1.0) * gust
        for(const f of this.flowers)
        {
            f.petalGroup.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.08 * swayGain
            f.petalGroup.rotation.x = Math.cos(t * 0.7 + f.phase) * 0.05 * swayGain
        }
    }
}
