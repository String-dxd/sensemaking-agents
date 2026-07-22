import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildPlaceholderBlock } from './placeholderBlock.ts'

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

// (The v1 procedural stem/bloom builders were removed in the world-port U7
// grey-block interim — authored flower assets arrive in follow-up work.)

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

        // Sparse-by-default. Every flower group starts hidden with its
        // petal scale collapsed; the onboarding ceremony reveals flower[0]
        // explicitly via showIndex / bloomInstance, and the dev "mature
        // island" preview reveals the rest via showAll. The 17 background
        // flowers stay invisible during normal play so the island grows
        // only with the student's actual captures.
        this.flowers = []
        // Read base placements from the IslandLayout slice so the layout is
        // data-driven. The slice's default reproduces the seed=1337 formula
        // exactly (visual no-op). Each entry carries a layoutId for plan 002+.
        const layoutPlacements = this.state.islandLayout.listByKind('flower')
        const count = layoutPlacements.length > 0 ? layoutPlacements.length : INSTANCES
        for(let i = 0; i < count; i++)
        {
            const placement = layoutPlacements[i]
            this._buildOne(seed, i, placement)
        }
        for(const f of this.flowers)
        {
            f.group.visible = false
            f.petalGroup.scale.setScalar(0)
        }
    }

    /**
     * Build one flower instance. If `placement` is provided, its `x`, `z`,
     * `yaw`, and `species` override the seeded defaults; otherwise the hash
     * formula is used (backward-compatible fallback).
     *
     * @param {number} seed
     * @param {number} i
     * @param {{ id?: string, x?: number, z?: number, yaw?: number, species?: string } | undefined} [placement]
     */
    _buildOne(seed, i, placement)
    {
        // Species: from placement if provided, otherwise cycle through SPECIES
        let speciesObj
        if(placement?.species)
        {
            speciesObj = SPECIES_BY_ID[placement.species] || this.species[i % this.species.length]
        }
        else
        {
            speciesObj = this.species[i % this.species.length]
        }

        // Position: from placement if provided, otherwise seeded formula
        let x, z, yaw
        if(placement && typeof placement.x === 'number' && typeof placement.z === 'number')
        {
            x   = placement.x
            z   = placement.z
            yaw = typeof placement.yaw === 'number' ? placement.yaw : hash(seed, 3000 + i) * Math.PI * 2
        }
        else if(i === 0)
        {
            x   = -1.4
            z   =  1.0
            yaw = hash(seed, 3000 + i) * Math.PI * 2
        }
        else
        {
            const radiusMax = this.island.radius - 0.6
            const theta  = hash(seed, 1000 + i) * Math.PI * 2
            const radial = Math.sqrt(hash(seed, 2000 + i)) * radiusMax
            x   = Math.cos(theta) * radial
            z   = Math.sin(theta) * radial
            yaw = hash(seed, 3000 + i) * Math.PI * 2
        }
        const y = this.island.heightAt(x, z)

        const flower = new THREE.Group()
        flower.position.set(x, y, z)
        flower.rotation.y = yaw

        // GREY PLACEHOLDER (world-port U7, R7): flowers have no editor asset
        // yet — a small conspicuous grey block with a species-tinted cap.
        // The petalGroup survives so bloomInstance/hideAll keep scaling the
        // bloom exactly as before; only the model is interim.
        const base = buildPlaceholderBlock({ width: 0.07, height: STEM_HEIGHT * 0.5, depth: 0.07 })
        flower.add(base.group)

        const petalGroup = new THREE.Group()
        petalGroup.position.y = STEM_HEIGHT * 0.5
        const bloom = buildPlaceholderBlock({
            width: 0.14,
            height: 0.14,
            depth: 0.14,
            accent: speciesObj.petal,
        })
        petalGroup.add(bloom.group)
        flower.add(petalGroup)

        this.group.add(flower)
        this.flowers.push({
            group: flower,
            petalGroup,
            species:  speciesObj,
            index:    i,
            x, z,
            layoutId: placement?.id,
            phase:    hash(seed, 4000 + i) * Math.PI * 2,
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

        // Placeholder-era reskin (U7): the bloom stays a grey block; the
        // emotion tint lands on its accent cap so the mood pick still reads.
        const bloom = buildPlaceholderBlock({
            width: 0.14,
            height: 0.14,
            depth: 0.14,
            accent: tinted.petal,
        })
        f.petalGroup.add(bloom.group)
        f.species = tinted
        return true
    }

    /**
     * Island editor (plan 003): reconcile the live flowers array with
     * a new layout list. Adds groups for new layout ids; disposes and
     * removes groups for ids that are no longer in the layout.
     *
     * @param {readonly import('../State/IslandLayout.js').PlacedObject[]} objs
     */
    ensureFromLayout(objs)
    {
        const seed = 1337

        // Build an id→flower map for quick lookup.
        const existing = new Map(this.flowers.map((f) => [f.layoutId, f]))
        const newIds   = new Set(objs.map((o) => o.id))

        // Remove flowers whose layout id is no longer present.
        const kept = []
        for(const f of this.flowers)
        {
            if(!f.layoutId || newIds.has(f.layoutId))
            {
                kept.push(f)
            }
            else
            {
                // Dispose bloom
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
                this.group.remove(f.group)
                f.group.traverse?.((n) =>
                {
                    if(n.geometry) try { n.geometry.dispose() } catch(_) {}
                    if(n.material) try { n.material.dispose() } catch(_) {}
                })
            }
        }
        this.flowers = kept

        // Add flowers for new layout ids not yet in the array.
        for(let i = 0; i < objs.length; i++)
        {
            const obj = objs[i]
            if(existing.has(obj.id)) continue
            this._buildOne(seed, this.flowers.length, obj)
            // New flowers start visible in the editor preview.
            const f = this.flowers[this.flowers.length - 1]
            if(f)
            {
                f.group.visible = true
                f.petalGroup.scale.setScalar(1)
            }
        }
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
     * Reveal a single flower without animation — sets the group visible
     * and the petalGroup at full scale. Used by the dev "mature island"
     * preview and by hydration paths that need a flower already present
     * (e.g., the ceremony anchor when reloading mid-game).
     */
    showIndex(flowerIndex)
    {
        const f = this.flowers[flowerIndex]
        if(!f) return
        f.group.visible = true
        f.petalGroup.scale.setScalar(1)
    }

    /** Dev / "mature island" preview helper — reveal every flower at full scale. */
    showAll()
    {
        for(const f of this.flowers)
        {
            f.group.visible = true
            f.petalGroup.scale.setScalar(1)
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
