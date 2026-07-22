import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import Debug from '../Debug/Debug.js'
import { loadGlb, MODEL_URLS } from './assetLoader.ts'
import { applyToonMaterials } from './Materials/toonMaterial.ts'
import { CanopySpring } from './wind.ts'
import { hashString, mulberry32 } from '../State/islandSpecCore/rand.ts'

/**
 * Tree manager — layout trees (the VALUES meaning layer) rendered with the
 * island editor's authored `tree.glb` (world-port U7). Replaces Bruno's
 * oak/cherry GLB + billboard-leaf-cloud system.
 *
 * Every coupling survives: IslandLayout placement + reconciler
 * (ensureFromLayout), heightAt snap, the onboarding reveal choreography
 * (hideAll/showIndex/showAll/growIn), pick-and-plant (moveEntry /
 * getEntryWorldXZ), the HoverProbe pick shape (`entries[].group`), and the
 * SpeciesPalette subscription — species tint lands on per-species foliage
 * materials cloned from the GLB's toon-converted set.
 *
 * Wind: the editor's spring-damper canopy sway (wind.ts) replaces the leaf
 * UV-rotation shader — each clone's 'canopy' node rocks in the traveling
 * gust front.
 */

// The GLB carries its color in baked vertex colors; the species tint
// multiplies on top. A full-strength multiply by a saturated palette color
// would crush the bake, so the tint is applied as a partial lerp from white.
const TINT_STRENGTH = 0.35

// Default species tints (matched to the legacy oak/cherry palette identity —
// the SpeciesPalette slice overrides these when diverged).
const DEFAULT_TINTS = {
    oak:    0x3A7D2A,
    cherry: 0xFF66A3,
}

export default class Tree
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.windSpeed = 1.0

        // Per-tree records — { group, species, x, z, index, authoredScale,
        // layoutId }. Public shape kept: HoverProbe raycasts entries[].group,
        // Sprouts routes drags through moveEntry, TermlyReveal calls growIn.
        this.entries = []
        this.ready = false
        this.assetsFailed = false

        this._disposed = false
        this._springs = []
        this._growIns = []
        this._pendingShow = null
        this._hidden = false

        // Per-species tinted material sets, cloned once from the GLB's
        // toon-converted materials so palette changes recolor in one place.
        this._speciesMaterials = {}

        this._loadAndBuild()
        this.setDebug()

        // Subscribe to live palette changes.
        const palette = this.state.speciesPalette
        if(palette)
        {
            this._unsubPalette = palette.subscribe((event) =>
            {
                if((event.type === 'paletteChanged' && event.kind === 'tree') || event.type === 'paletteReplaced')
                {
                    const species = event.type === 'paletteReplaced' ? Object.keys(DEFAULT_TINTS) : [event.species]
                    for(const s of species) this._applyTreeColors(s)
                }
            })
        }
    }

    _tintFor(species)
    {
        const palette = this.state.speciesPalette
        const c = palette?.get('tree', species)
        return c?.colorA ?? DEFAULT_TINTS[species] ?? 0xffffff
    }

    _applyTreeColors(species)
    {
        const mats = this._speciesMaterials[species]
        if(!mats) return
        const tint = new THREE.Color(this._tintFor(species))
        for(const m of mats)
        {
            m.color.set(0xffffff).lerp(tint, TINT_STRENGTH)
        }
    }

    /** Point a clone's meshes at the per-species tinted material set,
     *  cloning it from the GLB's toon-converted materials on first use
     *  (mesh traversal order is stable across clones of the same scene). */
    _materializeSpecies(species, model)
    {
        const existing = this._speciesMaterials[species]
        if(!existing)
        {
            const set = []
            model.traverse((n) =>
            {
                if(!n.isMesh) return
                if(Array.isArray(n.material))
                {
                    n.material = n.material.map((m) =>
                    {
                        const cloned = m.clone()
                        set.push(cloned)
                        return cloned
                    })
                }
                else
                {
                    const cloned = n.material.clone()
                    set.push(cloned)
                    n.material = cloned
                }
            })
            this._speciesMaterials[species] = set
            this._applyTreeColors(species)
            return
        }
        let cursor = 0
        model.traverse((n) =>
        {
            if(!n.isMesh) return
            if(Array.isArray(n.material)) n.material = n.material.map(() => existing[cursor++])
            else n.material = existing[cursor++] ?? n.material
        })
    }

    async _loadAndBuild()
    {
        const gltf = await loadGlb(MODEL_URLS.tree)
        if(this._disposed) return
        if(!gltf)
        {
            this.assetsFailed = true
            // ready still flips true so dependents (reveal beats) never hang.
            this.ready = true
            return
        }

        // Toon-convert the cached scene in place (idempotent, shared clones).
        applyToonMaterials(gltf.scene)
        this._template = gltf.scene

        this._placeAll()
        this.ready = true

        // Sparse-by-default: every static tree starts hidden; the onboarding
        // ceremony reveals entries[0] via showIndex/growIn. Any showIndex
        // queued during async boot is replayed here.
        this.hideAll()
        if(this._pendingShow)
        {
            const indices = Array.from(this._pendingShow)
            this._pendingShow = null
            for(const i of indices) this.showIndex(i)
        }
    }

    _placeAll()
    {
        for(const placement of this.state.islandLayout.listByKind('tree'))
        {
            const { id: layoutId, species, x, z, scale, yaw } = placement
            const groundY = this.island.heightAt(x, z)

            const group = new THREE.Group()
            group.position.set(x, groundY, z)
            group.scale.setScalar(scale)
            group.rotation.y = yaw

            const model = this._template.clone(true)
            model.userData.sharedAssets = true
            // Seeded per-instance variety on the safe 'canopy' handle
            // (meshopt quantization compensation lives on the mesh node).
            const canopy = model.getObjectByName('canopy')
            const rand = mulberry32(hashString(layoutId || `tree-${this.entries.length}`))
            if(canopy)
            {
                canopy.rotation.y = rand() * Math.PI * 2
                const girth = 0.92 + rand() * 0.16
                canopy.scale.x = girth
                canopy.scale.z = girth
            }
            this._materializeSpecies(species, model)
            model.traverse((n) =>
            {
                if(n.isMesh)
                {
                    n.castShadow = true
                    n.receiveShadow = true
                }
            })
            group.add(model)
            this.scene.add(group)

            if(canopy)
            {
                this._springs.push({
                    spring: new CanopySpring(((hashString(layoutId || String(this.entries.length)) % 1000) / 1000) * Math.PI * 2),
                    canopy,
                    entry: this.entries.length,
                    amp: canopy.userData.windAmp ?? 0.55,
                })
            }

            this.entries.push({
                group,
                species,
                x, z,
                index:         this.entries.length,
                authoredScale: scale,
                layoutId,
            })
        }
    }

    /**
     * Island editor reconcile: tears down all entry groups, then rebuilds
     * from the (already-mutated) IslandLayout slice. No-op until assets are
     * ready (guards against a pre-boot call).
     *
     * @param {readonly import('../State/IslandLayout.js').PlacedObject[]} _objs — provided by the
     *   caller for symmetry with Flowers/Fruits; Tree reads the slice directly.
     */
    ensureFromLayout(_objs)
    {
        if(!this.ready || !this._template) return
        try
        {
            this._teardownPlacements()
            this._placeAll()
            if(!this._hidden) this.showAll()
        }
        catch(err)
        {
            console.error('[Tree.ensureFromLayout] rebuild threw — layout may be partial', err)
        }
    }

    /** Tear down all placement groups (clones share the GLB cache — geometry
     *  and the per-species materials survive rebuilds). */
    _teardownPlacements()
    {
        for(const entry of (this.entries || []))
        {
            if(entry.group) this.scene.remove(entry.group)
        }
        this.entries = []
        this._springs = []
        this._hidden = false
    }

    /**
     * First-run ceremony helper. Hide every tree so the world reads as a
     * bare island until growIn() reveals the directed tree. Idempotent and
     * safe pre-ready (loops no-op on empty arrays).
     */
    hideAll()
    {
        for(const entry of this.entries)
        {
            entry.group.visible = false
            entry.group.scale.setScalar(0)
        }
        this._hidden = true
    }

    /**
     * Reveal a single tree without animation. Queued if assets are still
     * loading.
     */
    showIndex(index)
    {
        if(!this.ready)
        {
            if(!this._pendingShow) this._pendingShow = new Set()
            this._pendingShow.add(index)
            return
        }
        const entry = this.entries[index]
        if(!entry) return
        entry.group.visible = true
        entry.group.scale.setScalar(entry.authoredScale)
    }

    /** Dev / "mature island" preview helper — reveal every tree. */
    showAll()
    {
        if(!this.ready)
        {
            if(!this._pendingShow) this._pendingShow = new Set()
            for(let i = 0; i < this.entries.length; i++) this._pendingShow.add(i)
            return
        }
        for(let i = 0; i < this.entries.length; i++) this.showIndex(i)
    }

    /**
     * Reveal one tree by index and tween its scale from 0 to the authored
     * placement scale. Returns a Promise resolving when the tween completes
     * (or after the reduced-motion 80ms cap).
     */
    growIn(index, opts = {})
    {
        if(!this.ready) return Promise.resolve()
        const entry = this.entries[index]
        if(!entry) return Promise.resolve()
        const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const duration = reducedMotion ? 80 : (opts.duration ?? 1400)
        const delay    = opts.delay ?? 0
        entry.group.visible = true
        entry.group.scale.setScalar(0)
        return new Promise((resolve) =>
        {
            this._growIns.push({
                entry,
                target:     entry.authoredScale,
                duration,
                startTime:  performance.now() + delay,
                resolve,
            })
        })
    }

    setDebug()
    {
        if(!this.debug.active) return
        const folder = this.debug.ui.getFolder('view/trees')
        folder.add(this, 'windSpeed', 0, 3, 0.05).name('wind speed')
    }

    /**
     * Pick-and-plant: relocate a placement to (x, z), snapping y to terrain
     * (`opts.y` holds the drag lift plane). Idempotent; silent no-op on bad
     * index or before this.ready.
     */
    moveEntry(index, x, z, opts = {})
    {
        if(!this.ready) return
        if(typeof x !== 'number' || typeof z !== 'number') return
        const entry = this.entries[index]
        if(!entry) return
        const y = typeof opts.y === 'number' ? opts.y : this.island.heightAt(x, z)
        entry.group.position.set(x, y, z)
        entry.x = x
        entry.z = z
    }

    /** Read the live world XZ of a placement, or null if unavailable. */
    getEntryWorldXZ(index)
    {
        const entry = this.entries[index]
        if(!entry) return null
        return { x: entry.group.position.x, z: entry.group.position.z }
    }

    dispose()
    {
        this._disposed = true
        if(this._unsubPalette)
        {
            try { this._unsubPalette() } catch(_) {}
            this._unsubPalette = null
        }
    }

    update()
    {
        if(!this.ready) return

        // Spring-damper canopy sway (visible trees only — hidden groups
        // integrate anyway; cost is negligible at layout-tree counts).
        const t = this.state.time.elapsed * this.windSpeed
        const dt = this.state.time.delta || 0
        for(const s of this._springs)
        {
            const entry = this.entries[s.entry]
            if(!entry || !entry.group.visible) continue
            s.spring.step(t, dt, entry.group.position.x, entry.group.position.z, s.amp)
            s.canopy.rotation.x = s.spring.rotX
            s.canopy.rotation.z = s.spring.rotZ
            s.canopy.scale.y = s.spring.scaleY
        }

        // Onboarding growIns: tween group scale.
        if(this._growIns.length > 0)
        {
            const now = performance.now()
            const remaining = []
            for(const g of this._growIns)
            {
                if(now < g.startTime) { remaining.push(g); continue }
                const elapsed = now - g.startTime
                const p = Math.min(1, elapsed / g.duration)
                const eased = p * p * p * (p * (p * 6 - 15) + 10)
                g.entry.group.scale.setScalar(Math.max(g.target * eased, 1e-6))
                if(p < 1) remaining.push(g)
                else g.resolve?.()
            }
            this._growIns = remaining
        }
    }
}
