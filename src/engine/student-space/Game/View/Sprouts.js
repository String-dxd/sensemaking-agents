import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Sprouts view — renders the engine's Sprouts state slice as small 3D
 * meshes on the island, each with a screen-anchored DOM count badge.
 *
 * Lifecycle:
 *  - subscribe to state.sprouts → reconcile a Map<sproutId, sproutNode>
 *    on 'spawned' / 'bloomed' / 'grew' / 'markedReady'
 *  - bloomed sprouts play a brief dissolve animation, then are removed
 *    (the actual Tree spawn is owned by U5 — see ../State/Sprouts.js
 *    bloom() and Game/View/Tree.revealAt)
 *  - per-frame update animates the ready-to-bloom pulse + bob and any
 *    in-flight dissolve tweens, and re-projects every count badge to
 *    its world-anchored screen position
 *
 * Visual: stem (small green cylinder) + leaf cluster (3 small spheres)
 * + emissive glow ring (zero intensity while growing, pulsed when
 * ready-to-bloom). Non-instanced — sprout counts are small (typically
 * < 8 simultaneously) and lifetimes short, so per-sprout meshes are
 * the simplest correct choice.
 *
 * Reduced motion: inline `window.matchMedia('(prefers-reduced-motion:
 * reduce)').matches` check (matching the engine's existing pattern at
 * Tree.js:536 / Flowers.js:476). When set, bob → 0, pulse → static
 * glow, dissolve → 200ms cross-fade.
 *
 * Placement: seeds → world coords via a multiplicative hash mapped
 * into the central plateau (radius ~3 from origin), then state.island.
 * heightAt(x, z) for terrain-snapped y.
 */

const COLORS = {
    stem:      0x5C8A3A,   // mid green stem
    leafLight: 0x9DC36F,   // bright top leaves
    leafDark:  0x4C7B2D,   // shaded base leaves
    glow:      0xFFE38C,   // warm gold glow for ready-to-bloom
}

const BOB_AMPLITUDE = 0.05   // metres of vertical bob when ready
const BOB_PERIOD_S  = 2.5    // seconds per bob cycle
const PULSE_PERIOD_S = 2.5   // seconds per pulse cycle
const DISSOLVE_MS = 700      // bloomed sprout dissolve duration

const PLATEAU_RADIUS = 2.6   // safe placement radius on the central plateau

/** Stable PRNG from a seed integer. Deterministic + fast. */
function seededAngleAndRadius(seed)
{
    // Two independent hashes derived from the same seed.
    const a = Math.sin(seed * 12.9898) * 43758.5453
    const b = Math.sin(seed * 78.233) * 12345.6789
    const theta = (a - Math.floor(a)) * Math.PI * 2
    const radius = ((b - Math.floor(b)) * 0.55 + 0.35) * PLATEAU_RADIUS
    return { theta, radius }
}

function reduceMotion()
{
    if(typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default class Sprouts
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        // Map<sproutId, { sprout, group, parts, badgeEl, pulsePhase, bobPhase, dissolveStartMs }>
        this.nodes = new Map()

        // Container Group so sprouts share a parent in the scene graph —
        // makes disposing all sprouts atomic.
        this.root = new THREE.Group()
        this.scene.add(this.root)

        // Badge layer — DOM container that hosts the count chip for every
        // live sprout. Appended to document.body to match ObjectPeek's
        // overlay pattern; the engine's body classes are not touched.
        this.badgeLayer = null
        if(typeof document !== 'undefined')
        {
            this.badgeLayer = document.createElement('div')
            this.badgeLayer.className = 'sprouts-badge-layer'
            this.badgeLayer.style.position = 'fixed'
            this.badgeLayer.style.inset = '0'
            this.badgeLayer.style.pointerEvents = 'none'
            this.badgeLayer.style.zIndex = '20'  // below ObjectPeek (z=26), above the canvas
            document.body.appendChild(this.badgeLayer)
        }

        // Cached screen-projection vector reused per frame.
        this._tmpVec = new THREE.Vector3()

        // Initial reconcile against any hydrated sprouts.
        for(const sprout of this.state.sprouts.recent(50))
        {
            this._spawnNode(sprout)
        }

        // Subscribe to live mutations.
        this._unsubscribe = this.state.sprouts.subscribe((event) =>
        {
            if(event.type === 'spawned')
            {
                this._spawnNode(event.sprout)
            }
            else if(event.type === 'grew' || event.type === 'markedReady')
            {
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.sprout = event.sprout
                    // Subtle scale-up tick on grow so each capture has a
                    // visible echo on the sprout itself, not just the badge.
                    node.targetScale = Math.min(1.0, 0.7 + 0.1 * event.sprout.count)
                }
            }
            else if(event.type === 'bloomed')
            {
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.dissolveStartMs = performance.now()
                }
                else
                {
                    // Already disposed somehow — nothing to animate.
                }
            }
        })
    }

    _spawnNode(sprout)
    {
        if(this.nodes.has(sprout.id)) return

        const group = new THREE.Group()
        const { theta, radius } = seededAngleAndRadius(sprout.placementSeed)
        const x = Math.cos(theta) * radius
        const z = Math.sin(theta) * radius
        const y = this.island.heightAt(x, z)
        group.position.set(x, y, z)
        // Subtle yaw so adjacent sprouts don't look like clones.
        group.rotation.y = theta
        this.root.add(group)

        const parts = this._buildSproutMesh()
        group.add(parts.stem)
        group.add(parts.leafA)
        group.add(parts.leafB)
        group.add(parts.leafC)
        group.add(parts.glow)
        group.scale.set(0.7, 0.7, 0.7)  // grows up to 1.0 as count rises

        // DOM badge — small chip showing `n/threshold` (or "Ready" when
        // readyToBloom). Positioned in update() via camera projection.
        let badgeEl = null
        if(this.badgeLayer)
        {
            badgeEl = document.createElement('div')
            badgeEl.className = 'sprout-badge'
            badgeEl.dataset.sproutId = sprout.id
            badgeEl.style.position = 'absolute'
            badgeEl.style.transform = 'translate(-50%, -100%)'
            badgeEl.style.padding = '2px 8px'
            badgeEl.style.borderRadius = '999px'
            badgeEl.style.fontSize = '11px'
            badgeEl.style.fontFamily = 'system-ui, sans-serif'
            badgeEl.style.fontWeight = '600'
            badgeEl.style.color = '#1a3a14'
            badgeEl.style.background = 'rgba(255, 251, 230, 0.92)'
            badgeEl.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.18)'
            badgeEl.style.whiteSpace = 'nowrap'
            badgeEl.style.pointerEvents = 'none'
            badgeEl.style.userSelect = 'none'
            badgeEl.textContent = `${sprout.count}/${sprout.threshold}`
            this.badgeLayer.appendChild(badgeEl)
        }

        // Invisible hit target for U5's click handler. A simple
        // bounding sphere so raycasting picks the sprout regardless of
        // which leaf the ray hits.
        const hitTarget = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 8, 6),
            new THREE.MeshBasicMaterial({ visible: false }),
        )
        hitTarget.position.y = 0.18
        hitTarget.userData = { kind: 'sprout', sproutId: sprout.id }
        group.add(hitTarget)
        parts.hitTarget = hitTarget

        this.nodes.set(sprout.id, {
            sprout,
            group,
            parts,
            badgeEl,
            targetScale: Math.min(1.0, 0.7 + 0.1 * sprout.count),
            pulsePhase: 0,
            bobPhase: 0,
            dissolveStartMs: null,
        })
    }

    _buildSproutMesh()
    {
        const matStem = new THREE.MeshLambertMaterial({ color: COLORS.stem, flatShading: true })
        const matLeafLight = new THREE.MeshLambertMaterial({ color: COLORS.leafLight, flatShading: true })
        const matLeafDark  = new THREE.MeshLambertMaterial({ color: COLORS.leafDark,  flatShading: true })
        const matGlow = new THREE.MeshBasicMaterial({
            color: COLORS.glow,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        })

        // STEM — slim green cylinder
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.024, 0.18, 8),
            matStem,
        )
        stem.position.y = 0.09

        // LEAVES — three small spheres clustered at the top of the stem
        const leafGeo = new THREE.IcosahedronGeometry(0.06, 0)
        const leafA = new THREE.Mesh(leafGeo, matLeafLight)
        leafA.position.set(0, 0.22, 0)
        const leafB = new THREE.Mesh(leafGeo, matLeafDark)
        leafB.position.set(0.045, 0.20, 0.02)
        leafB.scale.setScalar(0.85)
        const leafC = new THREE.Mesh(leafGeo, matLeafLight)
        leafC.position.set(-0.04, 0.20, -0.03)
        leafC.scale.setScalar(0.9)

        // GLOW — flat ring around the base; emissive when ready-to-bloom
        const glow = new THREE.Mesh(
            new THREE.RingGeometry(0.10, 0.18, 24),
            matGlow,
        )
        glow.rotation.x = -Math.PI / 2
        glow.position.y = 0.01

        return { stem, leafA, leafB, leafC, glow }
    }

    /**
     * Public: called by U5's click handler when the student taps a
     * ready-to-bloom sprout. Returns the world position where the new
     * Tree should spawn, plus the treeSpecies derived from the sprout.
     * The view module retains the dissolve animation; the consumer
     * (Tree.revealAt) handles the actual reveal.
     */
    getSproutSpawnInfo(sproutId)
    {
        const node = this.nodes.get(sproutId)
        if(!node) return null
        return {
            position: node.group.position.clone(),
            treeSpecies: node.sprout.treeSpecies,
        }
    }

    update()
    {
        if(!this.root) return

        const elapsed = this.state.time.elapsed
        const delta = this.state.time.delta
        const reduce = reduceMotion()
        const now = performance.now()
        const camera = this.view.camera?.instance

        const toDelete = []

        for(const [id, node] of this.nodes)
        {
            // Smoothly approach targetScale (set on grow/spawn).
            const targetX = node.targetScale
            const curX = node.group.scale.x
            if(Math.abs(curX - targetX) > 0.001)
            {
                const step = delta * 1.6
                const diff = targetX - curX
                const next = curX + Math.sign(diff) * Math.min(Math.abs(diff), step)
                node.group.scale.setScalar(next)
            }

            // Dissolve animation
            if(node.dissolveStartMs !== null)
            {
                const dt = now - node.dissolveStartMs
                const duration = reduce ? 200 : DISSOLVE_MS
                const t = Math.min(1, dt / duration)
                const scale = node.targetScale * (1 - t)
                node.group.scale.setScalar(scale)
                node.group.position.y += delta * 0.6  // gentle rise
                // Fade leaves + stem
                for(const part of [node.parts.stem, node.parts.leafA, node.parts.leafB, node.parts.leafC])
                {
                    if(!part.material.transparent)
                    {
                        part.material.transparent = true
                    }
                    part.material.opacity = 1 - t
                }
                if(node.badgeEl) node.badgeEl.style.opacity = String(1 - t)
                if(t >= 1)
                {
                    toDelete.push(id)
                }
                continue
            }

            // Ready-to-bloom: pulse + bob.
            if(node.sprout.readyToBloom)
            {
                if(reduce)
                {
                    node.parts.glow.material.opacity = 0.55
                }
                else
                {
                    const pulse = (Math.sin((elapsed / PULSE_PERIOD_S) * Math.PI * 2) + 1) / 2
                    node.parts.glow.material.opacity = 0.35 + pulse * 0.45

                    const bob = Math.sin((elapsed / BOB_PERIOD_S) * Math.PI * 2) * BOB_AMPLITUDE
                    // Apply bob to the local group position via a separate
                    // y-offset on the leaves cluster, NOT the root group —
                    // moving the root would also displace the hit target
                    // unpredictably for raycasting.
                    node.parts.leafA.position.y = 0.22 + bob
                    node.parts.leafB.position.y = 0.20 + bob
                    node.parts.leafC.position.y = 0.20 + bob
                    node.parts.stem.scale.y = 1 + bob * 1.5
                }
            }
            else
            {
                // Idle (growing) sprouts: faint glow off
                if(node.parts.glow.material.opacity > 0.01)
                {
                    node.parts.glow.material.opacity = Math.max(0, node.parts.glow.material.opacity - delta * 1.5)
                }
                // Settle leaves back to rest if previously bobbed.
                node.parts.leafA.position.y = 0.22
                node.parts.leafB.position.y = 0.20
                node.parts.leafC.position.y = 0.20
                node.parts.stem.scale.y = 1
            }

            // Badge projection + label update
            if(node.badgeEl && camera)
            {
                this._tmpVec.set(node.group.position.x, node.group.position.y + 0.36, node.group.position.z)
                this._tmpVec.project(camera)
                const sx = (this._tmpVec.x * 0.5 + 0.5) * window.innerWidth
                const sy = (-this._tmpVec.y * 0.5 + 0.5) * window.innerHeight
                // Hide if behind camera or off-screen by a margin
                if(this._tmpVec.z > 1 || sx < -40 || sx > window.innerWidth + 40 || sy < -20 || sy > window.innerHeight + 20)
                {
                    node.badgeEl.style.opacity = '0'
                }
                else
                {
                    node.badgeEl.style.opacity = '1'
                    node.badgeEl.style.left = `${sx}px`
                    node.badgeEl.style.top = `${sy}px`
                    node.badgeEl.textContent = node.sprout.readyToBloom
                        ? 'Ready'
                        : `${node.sprout.count}/${node.sprout.threshold}`
                }
            }
        }

        for(const id of toDelete)
        {
            this._disposeNode(id)
        }
    }

    _disposeNode(id)
    {
        const node = this.nodes.get(id)
        if(!node) return
        this.root.remove(node.group)
        node.group.traverse((obj) =>
        {
            if(obj.geometry) { try { obj.geometry.dispose() } catch(_) {} }
            if(obj.material) { try { obj.material.dispose() } catch(_) {} }
        })
        if(node.badgeEl && node.badgeEl.parentNode)
        {
            node.badgeEl.parentNode.removeChild(node.badgeEl)
        }
        this.nodes.delete(id)
    }

    dispose()
    {
        if(this._unsubscribe) { try { this._unsubscribe() } catch(_) {} this._unsubscribe = null }
        for(const id of Array.from(this.nodes.keys()))
        {
            this._disposeNode(id)
        }
        if(this.root)
        {
            try { this.scene?.remove?.(this.root) } catch(_) {}
            this.root = null
        }
        if(this.badgeLayer && this.badgeLayer.parentNode)
        {
            try { this.badgeLayer.parentNode.removeChild(this.badgeLayer) } catch(_) {}
            this.badgeLayer = null
        }
    }
}
