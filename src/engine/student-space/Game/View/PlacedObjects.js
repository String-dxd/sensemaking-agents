import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import View from './View.js'
import State from '../State/State.js'
import { loadGlb, MODEL_URLS } from './assetLoader.ts'
import { buildObjectModel } from './buildObjectModel.ts'
import { applyToonMaterials } from './Materials/toonMaterial.ts'
import { CanopySpring } from './wind.ts'
import { hashString, mulberry32 } from '../State/islandSpecCore/rand.ts'
import { worldPositionOfObject } from '../State/islandSpecCore/terrainGrid.ts'

/**
 * Decorative objects view (world-port U6, KTD-5) — renders the committed
 * spec's placed objects (kinds tree/bush/rock) with the editor's models.
 * `character` entries are skipped here (the character view owns them).
 *
 * RAYCAST EXCLUSION IS BY CONSTRUCTION: both pick surfaces (HoverProbe._pick
 * in WorldInteractions.tsx and the Sprouts drag) intersect explicit registered
 * group lists — this view's group is simply never registered. Decorative
 * objects never enter IslandLayout and carry no meaning couplings.
 *
 * Async loads follow Kira's placeholder-then-swap guard: a load resolving
 * after dispose() must not touch the scene; a load failure logs inside the
 * shared assetLoader and this view simply keeps nothing on screen for that
 * kind (decorative objects have no functional fallback obligation).
 */

// Models are authored ~1 world-unit tall/footprint, so the per-object jitter
// scale multiplies directly.
const BASE_OBJECT_SCALE = 1.0

/**
 * Seeded per-instance variety on a GLB clone, written to the 'canopy' node.
 * Meshopt QUANTIZES vertex positions and compensates with a translate+scale
 * on the node that holds the mesh, so rotating/scaling THAT node would pivot
 * the tree about the quantization offset — 'canopy' is authored, quantization
 * never touches it, and it is the one safe handle. Only X/Z scale and Y
 * rotation are ours: the wind spring writes rotation.x/z and scale.y.
 */
function randomizeInstance(model, seed)
{
    const canopy = model.getObjectByName('canopy')
    if(!canopy) return // rock — stones don't sway
    const rand = mulberry32(seed)
    canopy.rotation.y = rand() * Math.PI * 2
    const girth = 0.92 + rand() * 0.16
    canopy.scale.x = girth
    canopy.scale.z = girth
}

function enableShadows(model)
{
    model.traverse((node) =>
    {
        if(node.isMesh)
        {
            node.castShadow = true
            node.receiveShadow = true
        }
        if(node.isSkinnedMesh) node.frustumCulled = false
    })
}

export default class PlacedObjects
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island
        this.spec = this.island.spec
        this.time = this.state.time

        this.group = new THREE.Group()
        this.group.name = 'placed-objects'
        this.scene.add(this.group)

        this._disposed = false
        // { spring, canopy, x, z, amp } per wind-driven crown.
        this._springs = []

        /** Settles when every decorative object has resolved (model or noop). */
        this.ready = this._build()
    }

    async _build()
    {
        const blurred = this.island._blurred
        const jobs = []
        for(const o of this.spec.objects)
        {
            if(o.kind === 'character') continue // U8's character view owns it
            jobs.push(this._place(o, blurred))
        }
        await Promise.all(jobs)
    }

    async _place(o, blurred)
    {
        let model = null
        if(o.kind === 'bush')
        {
            model = buildObjectModel('bush', hashString(o.id))
        }
        else
        {
            const url = MODEL_URLS[o.kind]
            if(!url) return
            const gltf = await loadGlb(url)
            if(!gltf || this._disposed) return
            // Toon-convert the CACHED scene in place (idempotent) BEFORE
            // cloning, so every clone shares the converted materials and the
            // never-dispose-shared rule holds.
            applyToonMaterials(gltf.scene)
            model = o.kind === 'character'
                ? cloneSkinned(gltf.scene)
                : gltf.scene.clone(true)
            model.userData.sharedAssets = true
            randomizeInstance(model, hashString(o.id))
        }
        if(this._disposed) return

        enableShadows(model)

        const { x, y, z } = worldPositionOfObject(this.spec, o, blurred)
        const holder = new THREE.Group()
        holder.position.set(x, y, z)
        holder.rotation.y = o.yaw
        holder.scale.setScalar(o.scale * BASE_OBJECT_SCALE)
        holder.add(model)
        this.group.add(holder)

        // Spring-damper wind on the crown: the world position feeds the
        // traveling gust front, the object id seeds the flutter phase.
        const canopy = model.getObjectByName('canopy')
        if(canopy)
        {
            this._springs.push({
                spring: new CanopySpring(((hashString(o.id) % 1000) / 1000) * Math.PI * 2),
                canopy,
                x,
                z,
                amp: canopy.userData.windAmp ?? 1,
            })
        }
    }

    update()
    {
        const t = this.time.elapsed
        const dt = this.time.delta || 0
        for(const s of this._springs)
        {
            s.spring.step(t, dt, s.x, s.z, s.amp)
            s.canopy.rotation.x = s.spring.rotX
            s.canopy.rotation.z = s.spring.rotZ
            s.canopy.scale.y = s.spring.scaleY
        }
    }

    dispose()
    {
        this._disposed = true
        this._springs.length = 0
        this.scene.remove(this.group)
        // GLB clones share the assetLoader cache (never disposed); only the
        // procedural bushes own their geometry/materials.
        this.group.traverse((n) =>
        {
            if(!n.isMesh) return
            let shared = false
            for(let p = n; p; p = p.parent)
            {
                if(p.userData && p.userData.sharedAssets) { shared = true; break }
            }
            if(shared) return
            n.geometry?.dispose?.()
            const mats = Array.isArray(n.material) ? n.material : [n.material]
            for(const m of mats) m?.dispose?.()
        })
    }
}
