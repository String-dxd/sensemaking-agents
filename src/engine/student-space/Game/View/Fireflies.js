import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

const COUNT = 8
const CORE = 0xFFF4C2
const HALO = 0xFFE8A8

const hash = (seed, n) =>
{
    let h = seed | 0
    h = Math.imul(h ^ n, 2654435761)
    h ^= h >>> 16
    return ((h >>> 0) % 10_000) / 10_000
}

function makeHaloTexture()
{
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0.0, 'rgba(255, 244, 194, 1)')
    g.addColorStop(0.35, 'rgba(255, 232, 168, 0.55)')
    g.addColorStop(1.0, 'rgba(255, 232, 168, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    return tex
}

export default class Fireflies
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.island = this.state.island
        this.scene = this.view.scene

        this.texture = makeHaloTexture()
        this.entries = []

        for(let i = 0; i < COUNT; i++)
            this._buildOne(20240511, i)
    }

    _buildOne(seed, i)
    {
        // Seeded land-cell scatter (world-port U10): pick a placeable cell
        // of the spec terrain, with a small in-cell jitter.
        const cells = this.island.placeableCells()
        const cell = cells[Math.min(cells.length - 1, Math.floor(hash(seed, i * 11 + 1) * cells.length))]
        const x = (cell?.x ?? 0) + (hash(seed, i * 11 + 2) - 0.5) * 0.3
        const z = (cell?.z ?? 0) + (hash(seed, i * 11 + 4) - 0.5) * 0.3
        const ground = this.island.heightAt(x, z)
        const baseY = ground + 0.75 + hash(seed, i * 11 + 3) * 1.15

        const group = new THREE.Group()
        group.position.set(x, baseY, z)

        const coreMat = new THREE.MeshBasicMaterial({
            color: CORE,
            transparent: true,
            opacity: 0.65,
        })
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), coreMat)
        group.add(core)

        const haloMat = new THREE.SpriteMaterial({
            map: this.texture,
            color: HALO,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
        const halo = new THREE.Sprite(haloMat)
        halo.scale.setScalar(0.32)
        group.add(halo)

        this.scene.add(group)
        this.entries.push({
            group,
            coreMat,
            halo,
            haloMat,
            baseX: x,
            baseY,
            baseZ: z,
            phase: hash(seed, i * 11 + 4) * Math.PI * 2,
            phaseY: hash(seed, i * 11 + 5) * Math.PI * 2,
            driftSpeed: 0.28 + hash(seed, i * 11 + 6) * 0.18,
        })
    }

    update()
    {
        const t = this.state.time.elapsed
        const day = this.state.day.currentState
        const hour = day?.hour ?? 12
        const rain = day?.rain ?? 0
        const night = THREE.MathUtils.clamp(
            hour < 6 ? 1 - hour / 6 : (hour > 19.5 ? (hour - 19.5) / 4.5 : 0),
            0, 1,
        )
        const rainT = THREE.MathUtils.clamp((rain - 0.25) / 0.45, 0, 1)
        const visibility = THREE.MathUtils.lerp(1.0, 0.35, rainT * rainT * (3 - 2 * rainT))
        const glow = (0.38 + night * 0.55) * visibility

        for(const e of this.entries)
        {
            const driftT = t * e.driftSpeed
            e.group.position.set(
                e.baseX + Math.sin(driftT + e.phase) * 0.55,
                e.baseY + Math.sin(t * 0.8 + e.phaseY) * 0.18,
                e.baseZ + Math.cos(driftT * 0.7 + e.phase) * 0.55,
            )
            const pulse = 1 + Math.sin(t * 1.6 + e.phase) * 0.18
            e.halo.scale.setScalar(0.32 * pulse)
            e.haloMat.opacity = 0.75 * glow
            e.coreMat.opacity = 0.65 * glow
        }
    }
}
