import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Fruits — Skills' on-island metaphor.
 *
 * v1.3: fruits-on-trees disabled (the tree canopy reads better as pure
 * foliage). All Skill fruits live on **fruit bushes** scattered around the
 * plateau. Each bush is a cluster of Bruno-style billboard leaf-blobs
 * (same shader as the tree foliage) topped with a small berry cluster per
 * fruit slot — five-ish small spheres on a short brown peduncle, coloured
 * by species. That gives an AC-quality "ripe berries on a shrub" silhouette
 * without modelling per-species fruit geometry (apple, plum, citrus, …).
 *
 * `entries` is the public shape FacetView + HoverProbe consume — each
 * carries `{ kind: 'fruit', group, species, x, z, host: 'bush' }`. The leaf
 * cloud lives inside the same group so hovering anywhere on the bush picks
 * the fruit (matches the affordance the geometric dome had before).
 */

const FRUIT_SPECIES = {
    // Skill domain mapping is canonical in vipsTaxonomy. Colours here are
    // chosen so a berry reads cleanly against the foliage palette.
    apple:  { color: 0xD64242 },   // practical    — red
    pear:   { color: 0xC9D659 },   // analytical   — pale chartreuse
    plum:   { color: 0x7B3F8E },   // creative     — violet
    fig:    { color: 0x6A3F62 },   // interpersonal — dusky purple
    citrus: { color: 0xF1A22F },   // leadership   — orange
    berry:  { color: 0xB02A5E },   // communication — carmine
}

// Standalone fruit bushes — placed in spots clear of the existing trees
// (see Tree.js PLACEMENTS), flowers, Kira (0.6, 2.1), and mailbox (-0.6, 2.5).
const BUSH_PLACEMENTS = [
    { species: 'plum',   x:  2.6, z:  0.1 },
    { species: 'fig',    x: -2.4, z:  0.9 },
    { species: 'citrus', x:  0.8, z: -2.6 },
    { species: 'berry',  x: -1.0, z: -2.4 },
]

const FRUITS_PER_BUSH = 4

// Berry cluster geometry knobs. Each "fruit" is a 5–7 sphere clump on a tiny
// brown stem, ~6–8 cm across — reads as a ripe cluster against the leaves.
const BERRY_RADIUS = 0.022          // each berry's radius (world m)
const BERRY_SCATTER = 0.030         // clump-shell radius for berry centres
const BERRIES_MIN = 5
const BERRIES_MAX = 7
const PEDUNCLE_COLOR = 0x5A4327

export default class Fruits
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.entries = []   // public: { kind, group, species, x, z, index, host }

        // Shared berry geometry — one icosphere, instanced visually through
        // many small meshes per cluster. Per-species materials so colour reads
        // consistently. Peduncle (stem) material is shared across all clusters.
        this._berryGeo = new THREE.IcosahedronGeometry(BERRY_RADIUS, 0)
        this._berryMats = {}
        for(const [id, cfg] of Object.entries(FRUIT_SPECIES))
        {
            this._berryMats[id] = new THREE.MeshLambertMaterial({
                color: cfg.color,
                flatShading: true,
            })
        }
        this._peduncleGeo = new THREE.CylinderGeometry(0.005, 0.006, 0.03, 5)
        this._peduncleMat = new THREE.MeshLambertMaterial({ color: PEDUNCLE_COLOR, flatShading: true })

        // Bushes reuse Tree's billboard cloud + leaves shader; placement is
        // deferred to update() so we wait for Tree.ready.
        this._placed = false
    }

    _placeBushes()
    {
        const tree = this.view.tree
        if(!tree?.ready) return

        const leafGeo = tree.leafCloudGeo
        const leafMat = tree.templates.oak.leavesMat   // shared shader — wind + sun sync for free

        for(const placement of BUSH_PLACEMENTS)
        {
            const { species, x, z } = placement
            const cfg = FRUIT_SPECIES[species]
            if(!cfg) continue

            const groundY = this.island.heightAt(x, z)
            const rnd = mulberry32(hashSeed(x, z, species))

            const group = new THREE.Group()
            group.position.set(x, groundY, z)
            group.userData.fruitBush = true
            this.scene.add(group)

            // 2 leaf blobs per bush — one main, one smaller offset blob, so
            // the silhouette is irregular and reads as a clump of foliage
            // rather than a perfect sphere. Bumped from v1.2 sizes so the
            // bush sits closer to a small shrub than a pillow.
            const blobs = [
                {
                    dx: 0,
                    dz: 0,
                    r:  0.32 + rnd() * 0.04,
                },
                {
                    dx: (rnd() - 0.5) * 0.42,
                    dz: (rnd() - 0.5) * 0.42,
                    r:  0.20 + rnd() * 0.05,
                },
            ]

            // Build a small InstancedMesh of leaf-cloud instances *inside* the
            // bush group. Instance matrices are local to the group; this lets
            // HoverProbe pick the bush by raycasting against group children.
            const matrices = blobs.map((b) =>
            {
                return new THREE.Matrix4().compose(
                    new THREE.Vector3(b.dx, b.r * 0.88, b.dz),
                    new THREE.Quaternion(),
                    new THREE.Vector3(b.r, b.r, b.r),
                )
            })

            const inst = new THREE.InstancedMesh(leafGeo, leafMat, matrices.length)
            inst.frustumCulled = false
            for(let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i])
            inst.instanceMatrix.needsUpdate = true
            group.add(inst)

            // Berry clusters scattered across the bush canopy.
            const canopy = blobs.map((b) => ({
                cx: b.dx,
                cy: b.r * 0.88,
                cz: b.dz,
                r:  b.r,
            }))

            for(let i = 0; i < FRUITS_PER_BUSH; i++)
            {
                const blob = i < canopy.length
                    ? canopy[i]
                    : canopy[Math.floor(rnd() * canopy.length)]

                const theta = rnd() * Math.PI * 2
                const phi   = Math.acos(2 * rnd() - 1)
                const r     = blob.r * (0.94 + rnd() * 0.12)
                const dx = r * Math.sin(phi) * Math.cos(theta)
                const dy = r * Math.cos(phi) - blob.r * 0.05
                const dz = r * Math.sin(phi) * Math.sin(theta)

                const cluster = this._buildBerryCluster(species, rnd)
                cluster.position.set(blob.cx + dx, blob.cy + dy, blob.cz + dz)
                group.add(cluster)
            }

            this.entries.push({
                kind:    'fruit',
                group,
                species,
                x, z,
                host:    'bush',
                index:   this.entries.length,
            })
        }
    }

    /**
     * Berry cluster: 5–7 small spheres tightly packed on a short peduncle.
     * The orientation faces "up" by default; the parent group rotates with
     * the bush so the cluster sits naturally on the canopy.
     */
    _buildBerryCluster(species, rnd)
    {
        const grp = new THREE.Group()

        // Peduncle — a tiny brown stem stub anchoring the cluster.
        const stem = new THREE.Mesh(this._peduncleGeo, this._peduncleMat)
        stem.position.y = 0.018
        stem.rotation.z = (rnd() - 0.5) * 0.4
        grp.add(stem)

        const mat = this._berryMats[species]
        const count = BERRIES_MIN + Math.floor(rnd() * (BERRIES_MAX - BERRIES_MIN + 1))

        for(let i = 0; i < count; i++)
        {
            const berry = new THREE.Mesh(this._berryGeo, mat)
            // Pack berries in a flattened hemisphere below the stem tip so the
            // cluster looks like a bunch hanging just under its attachment.
            const theta = rnd() * Math.PI * 2
            const phi   = Math.acos(rnd())                  // upper hemisphere
            const r     = BERRY_SCATTER * (0.55 + rnd() * 0.5)
            berry.position.set(
                Math.sin(phi) * Math.cos(theta) * r,
                -BERRY_RADIUS * 0.4 - r * Math.cos(phi) * 0.6,
                Math.sin(phi) * Math.sin(theta) * r,
            )
            // Tiny size jitter so the cluster doesn't read as identical balls.
            berry.scale.setScalar(0.88 + rnd() * 0.28)
            berry.castShadow = true
            grp.add(berry)
        }

        return grp
    }

    update()
    {
        if(!this._placed && this.view.tree?.ready)
        {
            this._placeBushes()
            this._placed = true
            // If hideAll was requested while we were waiting for tree.ready,
            // apply it now that the bushes exist.
            if(this._hidePending) this.hideAll()
        }
    }

    /**
     * First-run ceremony helper. Hide every fruit bush so the plateau reads
     * as bare alongside the hidden trees + flowers. Like the other trees,
     * bushes stay hidden after the ceremony — they're not part of the
     * directed reveal. They'll re-enter the world via future capture beats.
     */
    hideAll()
    {
        if(!this._placed) { this._hidePending = true; return }
        for(const child of this.scene.children)
        {
            if(child.userData?.fruitBush) child.visible = false
        }
        this._hidden = true
    }
}

// Tiny deterministic RNG — same seed → same sequence — so a bush's berries
// stay in the same spots across reloads without us storing them.
function mulberry32(seed)
{
    let t = seed >>> 0
    return function()
    {
        t = (t + 0x6D2B79F5) >>> 0
        let x = t
        x = Math.imul(x ^ (x >>> 15), x | 1)
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
        return (((x ^ (x >>> 14)) >>> 0) / 0xFFFFFFFF)
    }
}
function hashSeed(x, z, key)
{
    let s = Math.floor(x * 7919) ^ Math.floor(z * 6173)
    if(typeof key === 'string')
        for(let i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) >>> 0
    return s >>> 0
}
