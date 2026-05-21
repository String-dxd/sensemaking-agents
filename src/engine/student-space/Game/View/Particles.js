import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Particles — sparse floating motes that drift over the plateau. Pollen /
 * dust / pond-light feel; never enough to read as snow or rain. Each mote
 * loops a slow Lissajous around its own anchor point so the cluster has
 * varied direction without any of them ever picking up speed.
 *
 * They tuck away in heavy rain (matches the butterfly shelter rule) and
 * brighten gently at night — additive blending against a darker sky is
 * what gives that "firefly dust" hint.
 */
const COUNT     = 36           // intentionally small — ambient, not a snow scene
const SPRITE_R  = 32           // canvas size for the soft radial sprite
const RADIUS    = 4.4          // sample radius on the plateau
const Y_MIN     = 0.35
const Y_MAX     = 2.6
const DRIFT_R   = 0.55         // horizontal Lissajous radius
const BOB_AMP   = 0.18         // vertical bob amplitude in metres
const BASE_SIZE = 0.10         // particle world-size at base

function makeSprite()
{
    const c = document.createElement('canvas')
    c.width = c.height = SPRITE_R
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(SPRITE_R / 2, SPRITE_R / 2, 0, SPRITE_R / 2, SPRITE_R / 2, SPRITE_R / 2)
    g.addColorStop(0.0, 'rgba(255, 252, 235, 0.95)')
    g.addColorStop(0.5, 'rgba(255, 246, 215, 0.35)')
    g.addColorStop(1.0, 'rgba(255, 246, 215, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SPRITE_R, SPRITE_R)
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
}

export default class Particles
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.island = this.state.island

        const positions = new Float32Array(COUNT * 3)
        const sizes     = new Float32Array(COUNT)
        this.anchors    = new Float32Array(COUNT * 3)
        this.phaseA     = new Float32Array(COUNT)
        this.phaseB     = new Float32Array(COUNT)
        this.speed      = new Float32Array(COUNT)
        this.lifeOffset = new Float32Array(COUNT)

        for(let i = 0; i < COUNT; i++)
        {
            const theta  = Math.random() * Math.PI * 2
            const radial = Math.sqrt(Math.random()) * RADIUS
            const x = Math.cos(theta) * radial
            const z = Math.sin(theta) * radial
            const ground = this.island.heightAt(x, z)
            const y = ground + Y_MIN + Math.random() * (Y_MAX - Y_MIN)

            this.anchors[i * 3]     = x
            this.anchors[i * 3 + 1] = y
            this.anchors[i * 3 + 2] = z
            this.phaseA[i] = Math.random() * Math.PI * 2
            this.phaseB[i] = Math.random() * Math.PI * 2
            // Drift speed kept very low so the cluster always reads as floating.
            this.speed[i]  = 0.06 + Math.random() * 0.08
            this.lifeOffset[i] = Math.random() * 60

            positions[i * 3]     = x
            positions[i * 3 + 1] = y
            positions[i * 3 + 2] = z
            sizes[i] = BASE_SIZE * (0.7 + Math.random() * 0.6)
        }

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.baseSizes = sizes

        this.material = new THREE.PointsMaterial({
            map: makeSprite(),
            size: BASE_SIZE,
            sizeAttenuation: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            color: 0xfff4d8,
            opacity: 0.7,
        })

        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.points.renderOrder = 5
        this.view.scene.add(this.points)
    }

    update()
    {
        const t = this.state.time.elapsed
        const day = this.state.day && this.state.day.currentState
        const rain = day?.rain ?? 0
        const hour = day?.hour ?? 12

        // Tuck away in rain (mirror of the butterfly shelter rule). Fade-in
        // window: rain 0.25 (drizzle) → 0.60 (committed shower).
        const tRain = THREE.MathUtils.clamp((rain - 0.25) / 0.35, 0, 1)
        const shelter = tRain * tRain * (3 - 2 * tRain)
        // Subtle night lift — additive blending means a small bump reads as
        // glow against a dark sky without becoming flickery in the day.
        const nightFactor = hour < 6 ? 1 - hour / 6 : hour > 19.5 ? (hour - 19.5) / 4.5 : 0
        this.material.opacity = (0.55 + nightFactor * 0.25) * (1 - shelter)

        // Shared wind envelope — motes drift wider on a gust, settle on a lull.
        const gust = this.state.wind ? this.state.wind.gust : 0.7
        const driftR = DRIFT_R * gust
        const bobAmp = BOB_AMP * (0.6 + gust * 0.4)

        const arr = this.geometry.attributes.position.array
        for(let i = 0; i < COUNT; i++)
        {
            const ax = this.anchors[i * 3]
            const ay = this.anchors[i * 3 + 1]
            const az = this.anchors[i * 3 + 2]
            const s  = this.speed[i]
            const pa = this.phaseA[i]
            const pb = this.phaseB[i]
            // Lissajous-ish drift — two independent sinusoids on x/z plus a
            // slower vertical bob. Amplitudes ride the shared wind gust so
            // motes lull / drift with grass, leaves, and flowers.
            arr[i * 3]     = ax + Math.cos(t * s + pa) * driftR
            arr[i * 3 + 1] = ay + Math.sin(t * s * 0.6 + pb) * bobAmp
            arr[i * 3 + 2] = az + Math.sin(t * s * 0.85 + pa) * driftR * 0.7
        }
        this.geometry.attributes.position.needsUpdate = true
    }
}
