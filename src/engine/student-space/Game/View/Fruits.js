import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Fruits — Skills' on-island metaphor.
 *
 * All Skill fruits live on **fruit bushes** scattered around the plateau.
 * Each bush is a cluster of flat-shaded leaf-blob spheres (self-contained —
 * the pre-port shared tree leaf shader is gone with the GLB tree lane)
 * topped with a small berry cluster per fruit slot — five-ish small spheres
 * on a short brown peduncle, coloured by species. That gives an AC-quality
 * "ripe berries on a shrub" silhouette without modelling per-species fruit
 * geometry (apple, plum, citrus, …).
 *
 * `entries` is the public shape FacetView + HoverProbe consume — each
 * carries `{ kind: 'fruit', group, species, x, z, host: 'bush' }`. The leaf
 * blobs live inside the same group so hovering anywhere on the bush picks
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
const LEAF_COLOR = 0x5E823C         // flat-shaded shrub green (matches flower leaves)
const LEAF_COLOR_DARK = 0x4E6E32    // secondary blob — slight two-tone variety


export default class Fruits
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.entries = []   // public: { kind, group, species, x, z, index, host }

        // Root group so every bush hangs off one node. Bushes parent here
        // (world-positioned, root stays at origin) instead of the scene.
        this.group = new THREE.Group()
        this.scene.add(this.group)

        // Shared berry geometry — one icosphere, instanced visually through
        // many small meshes per cluster. Per-species SHARED materials so the
        // SpeciesPalette subscription keeps recoloring live entries.
        // Peduncle (stem) + leaf materials are shared across all bushes.
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
        this._leafMat     = new THREE.MeshLambertMaterial({ color: LEAF_COLOR, flatShading: true })
        this._leafMatDark = new THREE.MeshLambertMaterial({ color: LEAF_COLOR_DARK, flatShading: true })
        this._leafGeo     = new THREE.IcosahedronGeometry(1, 1)   // unit blob, scaled per bush

        // Apply palette colors from SpeciesPalette if diverged from defaults.
        const palette = this.state.speciesPalette
        if(palette)
        {
            for(const [id] of Object.entries(FRUIT_SPECIES))
            {
                const c = palette.get('fruit', id)
                if(c?.color) this._berryMats[id]?.color.set(c.color)
            }
            this._unsubPalette = palette.subscribe((event) =>
            {
                if((event.type === 'paletteChanged' && event.kind === 'fruit') || event.type === 'paletteReplaced')
                {
                    const kinds = event.type === 'paletteReplaced'
                        ? Object.keys(FRUIT_SPECIES)
                        : [event.species]
                    for(const id of kinds)
                    {
                        const c = palette.get('fruit', id)
                        if(c?.color && this._berryMats[id]) this._berryMats[id].color.set(c.color)
                    }
                }
            })
        }

        // Placement is deferred to the first update() tick so the island
        // heightfield is settled before bushes snap to ground.
        this._placed = false
    }

    _placeBushes()
    {
        for(const placement of this.state.islandLayout.listByKind('fruit'))
        {
            const { id: layoutId, species, x, z } = placement
            if(!FRUIT_SPECIES[species]) continue
            this._buildBush(layoutId, species, x, z)
        }
    }

    /** One bush at (x, z): 2 flat-shaded leaf blobs (irregular silhouette)
     *  studded with berry clusters that share the per-species material
     *  (palette recolors propagate to every bush of that species). */
    _buildBush(layoutId, species, x, z)
    {
        const groundY = this.island.heightAt(x, z)
        const rnd = mulberry32(hashSeed(x, z, species))

        const group = new THREE.Group()
        group.position.set(x, groundY, z)
        group.userData.fruitBush = true
        this.group.add(group)

        // 2 leaf blobs per bush — one main, one smaller offset blob, so the
        // silhouette is irregular and reads as a clump of foliage rather
        // than a perfect sphere.
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
        blobs.forEach((b, i) =>
        {
            const blob = new THREE.Mesh(this._leafGeo, i === 0 ? this._leafMat : this._leafMatDark)
            blob.position.set(b.dx, b.r * 0.88, b.dz)
            blob.scale.setScalar(b.r)
            group.add(blob)
        })

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
            layoutId,
        })
        return group
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
        if(!this._placed)
        {
            this._placeBushes()
            this._placed = true
            // If hideAll was requested before first placement, apply it now.
            if(this._hidePending) this.hideAll()
            // If ensureFromLayout was called before placement, run it now.
            if(this._pendingEnsure)
            {
                const objs = this._pendingEnsure
                this._pendingEnsure = null
                this.ensureFromLayout(objs)
            }
        }
    }

    /**
     * Island editor (plan 003): reconcile live fruit entries with a new
     * layout list. Adds groups for new layout ids; disposes and removes
     * groups for ids no longer in the layout.
     *
     * Defers if not yet placed.
     *
     * @param {readonly import('../State/IslandLayout.js').PlacedObject[]} objs
     */
    ensureFromLayout(objs)
    {
        if(!this._placed)
        {
            // Not yet placed — schedule a reconcile after _placeBushes runs.
            this._pendingEnsure = objs
            return
        }

        const existing = new Map(this.entries.map((e) => [e.layoutId, e]))
        const newIds   = new Set(objs.map((o) => o.id))

        // Remove entries whose layout id is gone.
        const kept = []
        for(const entry of this.entries)
        {
            if(!entry.layoutId || newIds.has(entry.layoutId))
            {
                kept.push(entry)
            }
            else
            {
                this.group.remove(entry.group)
                entry.group.traverse?.((n) =>
                {
                    if(n.geometry) try { n.geometry.dispose() } catch(_) {}
                    if(n.material) try { n.material.dispose() } catch(_) {}
                })
            }
        }
        this.entries = kept

        // Build bushes for new ids.
        for(const obj of objs)
        {
            if(existing.has(obj.id)) continue
            if(!FRUIT_SPECIES[obj.species]) continue
            const group = this._buildBush(obj.id, obj.species, obj.x, obj.z)
            group.visible = true
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
        for(const child of this.group.children)
        {
            if(child.userData?.fruitBush) child.visible = false
        }
        this._hidden = true
    }

    /**
     * Pick-and-plant: relocate the bush at `index` to a new (x, z). Mirrors
     * Tree.moveEntry / Flowers.moveInstance — `opts.y` holds at the drag
     * lift plane during a drag, omitted on release to snap to ground.
     */
    moveEntry(index, x, z, opts = {})
    {
        const entry = this.entries?.[index]
        if(!entry?.group) return
        const groundY = this.island?.heightAt?.(x, z) ?? 0
        const y = (typeof opts.y === 'number') ? opts.y : groundY
        entry.group.position.set(x, y, z)
        if(typeof opts.y !== 'number')
        {
            entry.x = x
            entry.z = z
        }
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
