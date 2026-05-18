import * as THREE from 'three'

import { VIPS_BY_ID } from '../Data/vipsTaxonomy.js'

/**
 * ThumbnailRenderer — produces small per-claim PNG thumbnails by rendering
 * actual 3D meshes off-screen with the same flat-shaded, warm-sun palette
 * the island uses. One shared WebGLRenderer + scene is reused for every
 * render (the renderer is the expensive part); per-claim meshes are built,
 * snapped, and removed from the scene.
 *
 * Each canonical claim's `object` in vipsTaxonomy is mapped to a small
 * mesh that visually matches the island — same trunk/leaf/petal/fruit
 * geometry family, same colours. The output is a data URL the Profile
 * Collection grid uses as a background image, so the tiles read as
 * miniature versions of the island elements rather than flat icons.
 *
 * Renders happen lazily: the first call to `getThumbnail(id)` triggers
 * the render (synchronously, on the same frame), caches the result, and
 * returns it. A pre-warm pass at ProfileSheet open warms every cell.
 */

const CANVAS_SIZE = 192   // 2× the on-screen tile so the PNG stays sharp.
const SKY_TINT    = 0x000000 // transparent — premultipliedAlpha = false

const PALETTE = {
    // Tree palettes — paired with leaf colour for variety. Trunks use a
    // shared warm brown so the species reads through the leaves.
    oakLeaf:    0x80A659,
    cherryLeaf: 0xEAA6C7,
    pineLeaf:   0x3B6B47,
    palmLeaf:   0x7CB269,
    mapleLeaf:  0xD6743A,
    willowLeaf: 0x9FBE85,
    banyanLeaf: 0x6FA258,
    mangroveLeaf: 0x4C8C6A,
    trunk:      0x6B4A30,

    daisy:      0xFFF7B0,
    daisyCentre:0xE8C547,
    pansy:      0x7B5DA8,
    rose:       0xD6587C,
    lily:       0xF7E6A4,
    tulip:      0xE0506E,
    hyacinth:   0xB46AC8,
    stem:       0x4F7B45,

    apple:      0xD64242,
    pear:       0xC9D659,
    plum:       0x7B3F8E,
    fig:        0x6A3F62,
    citrus:     0xF1A22F,
    berry:      0xB02A5E,

    windStone:  0x9C9A93,
    poolWater:  0x9CC8DC,
    poolRim:    0xC4B89C,
}

export default class ThumbnailRenderer
{
    constructor()
    {
        this.canvas = document.createElement('canvas')
        this.canvas.width = CANVAS_SIZE
        this.canvas.height = CANVAS_SIZE

        this.renderer = new THREE.WebGLRenderer({
            canvas:    this.canvas,
            antialias: true,
            alpha:     true,
            premultipliedAlpha: false,
        })
        this.renderer.setClearColor(SKY_TINT, 0)
        this.renderer.setSize(CANVAS_SIZE, CANVAS_SIZE, false)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace

        this.scene = new THREE.Scene()

        // Island-mirroring lighting — warm key from above-front-right, soft
        // sky/ground hemisphere fill so flat-shaded normals read cleanly.
        const key = new THREE.DirectionalLight(0xFFE4BB, 1.05)
        key.position.set(2.6, 4.0, 2.4)
        this.scene.add(key)
        const fill = new THREE.HemisphereLight(0xCFE5FF, 0x6E5A40, 0.55)
        this.scene.add(fill)

        this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
        this.camera.position.set(0, 1.4, 4.3)
        this.camera.lookAt(0, 0.55, 0)

        this.cache = {}   // claimId → dataUrl
        this._currentSubject = null
    }

    /**
     * Return the PNG dataUrl for a canonical claim's 3D thumbnail. Renders
     * on first request and caches the result. Returns '' if the claim has
     * no recognised on-island object — caller should fall back to SVG.
     */
    getThumbnail(claimId)
    {
        if(this.cache[claimId]) return this.cache[claimId]
        const claim = VIPS_BY_ID[claimId]
        const subject = claim ? this._buildSubject(claim.object) : null
        if(!subject) return ''

        this.scene.add(subject)
        this.renderer.render(this.scene, this.camera)
        const url = this.canvas.toDataURL('image/png')
        this.scene.remove(subject)
        this._disposeSubject(subject)

        this.cache[claimId] = url
        return url
    }

    /** Render every canonical claim's thumbnail eagerly (one frame each). */
    warmAll(ids)
    {
        for(const id of ids) this.getThumbnail(id)
    }

    _disposeSubject(subject)
    {
        subject.traverse((node) =>
        {
            if(node.geometry) node.geometry.dispose?.()
            if(node.material)
            {
                if(Array.isArray(node.material)) node.material.forEach((m) => m.dispose?.())
                else node.material.dispose?.()
            }
        })
    }

    // ── Mesh factories ─────────────────────────────────────────────────────

    _buildSubject(obj)
    {
        if(!obj) return null
        if(obj.kind === 'tree')      return this._buildTree(obj.species)
        if(obj.kind === 'flower')    return this._buildFlower(obj.species)
        if(obj.kind === 'fruit')     return this._buildFruit(obj.species)
        if(obj.kind === 'windStone') return this._buildWindStone()
        if(obj.kind === 'pool')      return this._buildPool()
        return null
    }

    _flat(color)
    {
        return new THREE.MeshLambertMaterial({ color, flatShading: true })
    }

    _buildTree(species)
    {
        const leafColor = PALETTE[`${species}Leaf`] ?? PALETTE.oakLeaf
        const group = new THREE.Group()

        // Trunk — short, slightly tapered cylinder.
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.10, 0.14, 0.65, 8),
            this._flat(PALETTE.trunk),
        )
        trunk.position.y = 0.325
        group.add(trunk)

        // Leaf cloud — 3–5 icospheres clustered above the trunk, scaled to
        // a roughly conical silhouette to read as the tree's canopy.
        const leafMat = this._flat(leafColor)
        const blobs = [
            { x:  0.0, y: 1.30, z:  0.0, r: 0.55 },
            { x: -0.42, y: 1.05, z:  0.0, r: 0.42 },
            { x:  0.42, y: 1.05, z:  0.0, r: 0.42 },
            { x:  0.0, y: 0.95, z:  0.40, r: 0.34 },
            { x:  0.0, y: 0.95, z: -0.40, r: 0.34 },
        ]
        const geo = new THREE.IcosahedronGeometry(1, 0)
        for(const b of blobs)
        {
            const m = new THREE.Mesh(geo, leafMat)
            m.position.set(b.x, b.y, b.z)
            m.scale.setScalar(b.r)
            group.add(m)
        }

        // Pine: replace the round canopy with three stacked cones for a
        // recognisable silhouette without leaving the palette.
        if(species === 'pine')
        {
            while(group.children.length > 1) group.remove(group.children[1])
            const coneMat = this._flat(PALETTE.pineLeaf)
            const tiers = [
                { y: 1.55, r: 0.40, h: 0.55 },
                { y: 1.20, r: 0.55, h: 0.60 },
                { y: 0.85, r: 0.72, h: 0.60 },
            ]
            for(const t of tiers)
            {
                const cone = new THREE.Mesh(
                    new THREE.ConeGeometry(t.r, t.h, 8),
                    coneMat,
                )
                cone.position.y = t.y
                group.add(cone)
            }
        }

        // Palm: tall thin trunk with a star of leaves on top.
        if(species === 'palm')
        {
            while(group.children.length > 0) group.remove(group.children[0])
            const palmTrunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.10, 1.10, 8),
                this._flat(PALETTE.trunk),
            )
            palmTrunk.position.y = 0.55
            group.add(palmTrunk)
            const frondMat = this._flat(PALETTE.palmLeaf)
            const frondGeo = new THREE.BoxGeometry(0.85, 0.06, 0.16)
            for(let i = 0; i < 6; i++)
            {
                const frond = new THREE.Mesh(frondGeo, frondMat)
                frond.position.set(0, 1.15, 0)
                frond.rotation.y = (i / 6) * Math.PI * 2
                frond.rotation.z = -0.18
                frond.position.x = Math.cos(frond.rotation.y) * 0.4
                frond.position.z = Math.sin(frond.rotation.y) * 0.4
                group.add(frond)
            }
        }

        group.position.y = -0.5
        return group
    }

    _buildFlower(species)
    {
        const group = new THREE.Group()
        // Stem
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6),
            this._flat(PALETTE.stem),
        )
        stem.position.y = 0.425
        group.add(stem)

        const petalColor = PALETTE[species] ?? PALETTE.rose
        const centreColor = PALETTE.daisyCentre

        // Petals — a ring of squished icospheres around a small centre.
        const petalMat = this._flat(petalColor)
        const petalGeo = new THREE.IcosahedronGeometry(0.16, 0)
        const ringY = 0.95
        const ringR = species === 'hyacinth' ? 0.10 : 0.18
        const petalCount = species === 'pansy' ? 5
                         : species === 'tulip' ? 5
                         : species === 'lily'  ? 6
                         : species === 'hyacinth' ? 8
                         : 8
        for(let i = 0; i < petalCount; i++)
        {
            const a = (i / petalCount) * Math.PI * 2
            const p = new THREE.Mesh(petalGeo, petalMat)
            p.position.set(Math.cos(a) * ringR, ringY + (species === 'hyacinth' ? (i / petalCount) * 0.3 : 0), Math.sin(a) * ringR)
            p.scale.setScalar(species === 'rose' ? 1.05 : 0.9)
            group.add(p)
        }

        // Centre disc
        const centre = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.10, 0),
            this._flat(centreColor),
        )
        centre.position.y = ringY + 0.01
        centre.scale.set(1.0, 0.6, 1.0)
        group.add(centre)

        group.position.y = -0.45
        return group
    }

    _buildFruit(species)
    {
        const color = PALETTE[species] ?? PALETTE.apple
        const group = new THREE.Group()

        // Bush base — small dome (mirrors the on-island fruit bush so the
        // thumbnail reads as the same element kind even for tree-borne
        // fruits; we lean toward the bush silhouette since that's the
        // unambiguous "this is a fruit" reading).
        const bush = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.50, 1),
            this._flat(0x4C6C3D),
        )
        bush.position.y = 0.32
        bush.scale.set(1, 0.62, 1)
        group.add(bush)

        // Fruits perched on the bush.
        const fruitMat = this._flat(color)
        const fruitGeo = new THREE.IcosahedronGeometry(species === 'berry' ? 0.07 : 0.13, 0)
        for(let i = 0; i < 3; i++)
        {
            const a = (i / 3) * Math.PI * 2 + 0.3
            const r = 0.25
            const fruit = new THREE.Mesh(fruitGeo, fruitMat)
            fruit.position.set(Math.cos(a) * r, 0.55, Math.sin(a) * r)
            group.add(fruit)
        }

        group.position.y = -0.5
        return group
    }

    _buildWindStone()
    {
        const group = new THREE.Group()
        const stone = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.45, 0),
            this._flat(PALETTE.windStone),
        )
        stone.position.y = 0.40
        stone.rotation.y = 0.6
        group.add(stone)
        group.position.y = -0.4
        return group
    }

    _buildPool()
    {
        const group = new THREE.Group()
        // Rim — flat torus-ish ring.
        const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.62, 0.04, 24, 1, true),
            this._flat(PALETTE.poolRim),
        )
        rim.position.y = 0.02
        group.add(rim)
        // Water disc.
        const water = new THREE.Mesh(
            new THREE.CircleGeometry(0.58, 24),
            this._flat(PALETTE.poolWater),
        )
        water.rotation.x = -Math.PI / 2
        water.position.y = 0.025
        group.add(water)
        group.position.y = -0.3
        return group
    }
}
