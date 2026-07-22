import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildPlaceholderBlock, PLACEHOLDER_GREY } from './placeholderBlock.ts'

/**
 * Fruits — Skills' on-island metaphor.
 *
 * World-port U7: fruit bushes render as deliberately conspicuous GREY
 * PLACEHOLDER BLOCKS (no editor asset yet — R7) with a species-tinted accent
 * cap. Every coupling survives: IslandLayout placement, heightAt snap,
 * moveEntry (sprout bloom targets), hideAll, ensureFromLayout reconciler,
 * and the SpeciesPalette subscription (it recolors the accent caps).
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


export default class Fruits
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.entries = []   // public: { kind, group, species, x, z, index, host }

        // GREY PLACEHOLDER (world-port U7, R7): fruit bushes have no editor
        // asset yet — each renders as a conspicuous grey block with a
        // species-tinted accent cap. Per-species SHARED accent materials so
        // the SpeciesPalette subscription keeps recoloring live entries.
        this._berryMats = {}
        for(const [id, cfg] of Object.entries(FRUIT_SPECIES))
        {
            this._berryMats[id] = new THREE.MeshStandardMaterial({
                color: cfg.color,
                roughness: 1,
                metalness: 0,
            })
        }

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

        // Bushes reuse Tree's billboard cloud + leaves shader; placement is
        // deferred to update() so we wait for Tree.ready.
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

    /** One grey-block bush at (x, z): grey body + species-accent cap that
     *  shares the per-species material (palette recolors propagate). */
    _buildBush(layoutId, species, x, z)
    {
        const groundY = this.island.heightAt(x, z)
        const group = new THREE.Group()
        group.position.set(x, groundY, z)
        group.userData.fruitBush = true
        this.scene.add(group)

        const block = buildPlaceholderBlock({ width: 0.5, height: 0.4, depth: 0.5 })
        group.add(block.group)
        // Swap the accent onto the SHARED species material so the palette
        // subscription recolors every bush of this species live.
        const capMat = this._berryMats[species]
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), capMat)
        cap.position.y = 0.44
        cap.castShadow = true
        group.add(cap)

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
                this.scene.remove(entry.group)
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
        for(const child of this.scene.children)
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
