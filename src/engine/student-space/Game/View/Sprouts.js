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
    stem:      0x5C8A3A,   // mid green stem (sprout)
    leafLight: 0x9DC36F,   // bright top leaves
    leafDark:  0x4C7B2D,   // shaded base leaves
    glow:      0xFFE38C,   // warm gold glow for ready-to-bloom
    trunkOak:    0x6B4A2A, // oak trunk
    trunkCherry: 0x7B5238, // cherry trunk (slightly warmer)
    leafOak:     0x7CA73E, // oak canopy
    leafCherry:  0xE7B6CB, // cherry canopy (soft pink)
}

const BOB_AMPLITUDE = 0.05   // metres of vertical bob when ready
const BOB_PERIOD_S  = 2.5    // seconds per bob cycle
const PULSE_PERIOD_S = 2.5   // seconds per pulse cycle
const DISSOLVE_MS = 700      // bloomed sprout dissolve duration

const PLATEAU_RADIUS = 2.6   // safe placement radius on the central plateau

// Camera flow timings — total ≈1.5s for a normal grow, ≈2.7s for a bloom.
const CAM_ZOOM_IN_MS    = 500
const CAM_HOLD_MS       = 500     // non-bloom hold before returning
const CAM_HOLD_BLOOM_MS = 350     // shorter; bloom animation provides the dwell
const CAM_ZOOM_OUT_MS   = 500
const BLOOM_GROW_MS     = 1000    // bloomed-object grow-in duration (was 1200)

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
        // Map<bloomedTreeId, { tree, group }>
        this.bloomedNodes = new Map()

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

        // Initial reconcile against any hydrated sprouts + bloomed trees.
        for(const sprout of this.state.sprouts.recent(50))
        {
            this._spawnNode(sprout)
        }
        for(const tree of this.state.sprouts.listBloomedTrees())
        {
            this._spawnBloomedTree(tree)
        }

        // Camera flow state — ensures only one flow runs at a time.
        // Rapid-fire captures during an in-flight flow are visualised
        // (badge, sprout scale tick) but don't enqueue another camera
        // moment — the existing flow finishes first.
        this._camFlow = null  // null | { sproutId, phase, startMs, autoBloom }

        // Subscribe to live mutations.
        this._unsubscribe = this.state.sprouts.subscribe((event) =>
        {
            if(event.type === 'spawned')
            {
                this._spawnNode(event.sprout)
                this._startCameraFlow(event.sprout.id, { autoBloom: false })
            }
            else if(event.type === 'grew')
            {
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.sprout = event.sprout
                    node.targetScale = Math.min(1.0, 0.7 + 0.1 * event.sprout.count)
                }
                this._startCameraFlow(event.sprout.id, { autoBloom: false })
            }
            else if(event.type === 'markedReady')
            {
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.sprout = event.sprout
                    node.targetScale = Math.min(1.0, 0.7 + 0.1 * event.sprout.count)
                }
                // Threshold crossed — camera flies, holds briefly, then
                // bloom triggers automatically within the same cinematic
                // beat. No tap, no tray.
                this._startCameraFlow(event.sprout.id, { autoBloom: true })
            }
            else if(event.type === 'bloomed')
            {
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.dissolveStartMs = performance.now()
                }
                // Spawn the persistent tree at the same position with a
                // growIn animation. The dissolving sprout and the growing
                // tree overlap visually for ~700ms — the celebration moment.
                if(event.bloomedTree)
                {
                    this._spawnBloomedTree(event.bloomedTree, /*animate=*/ true)
                }
            }
        })

        // Click handler — raycast against sprout hit targets; ready
        // sprouts bloom on tap. Bound to the renderer's DOM element so
        // OrbitControls drag events don't false-fire.
        this._raycaster = new THREE.Raycaster()
        this._pointer = new THREE.Vector2()
        this._dragGuard = { isDragging: false, downX: 0, downY: 0 }
        this._onPointerDown = (e) => this._handlePointerDown(e)
        this._onPointerUp = (e) => this._handlePointerUp(e)
        this._canvasEl = this.view.renderer?.instance?.domElement || null
        if(this._canvasEl)
        {
            this._canvasEl.addEventListener('pointerdown', this._onPointerDown)
            this._canvasEl.addEventListener('pointerup', this._onPointerUp)
        }
    }

    _handlePointerDown(e)
    {
        this._dragGuard.isDragging = false
        this._dragGuard.downX = e.clientX
        this._dragGuard.downY = e.clientY
    }

    _handlePointerUp(e)
    {
        const dx = Math.abs(e.clientX - this._dragGuard.downX)
        const dy = Math.abs(e.clientY - this._dragGuard.downY)
        if(dx > 4 || dy > 4) return  // drag, not click
        const camera = this.view.camera?.instance
        if(!camera || !this._canvasEl) return
        const rect = this._canvasEl.getBoundingClientRect()
        this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this._raycaster.setFromCamera(this._pointer, camera)

        // Collect hit-target meshes for ALL active sprouts (not just ready).
        // We separate the bloom decision into the post-hit branch below so
        // tapping a still-growing sprout still produces feedback rather than
        // a silent no-op.
        const targets = []
        for(const node of this.nodes.values())
        {
            if(node.dissolveStartMs === null && node.parts.hitTarget)
            {
                targets.push(node.parts.hitTarget)
            }
        }
        if(targets.length === 0) return
        const intersects = this._raycaster.intersectObjects(targets, false)
        const hit = intersects[0]
        if(!hit) return
        const sproutId = hit.object?.userData?.sproutId
        if(!sproutId) return
        const node = this.nodes.get(sproutId)
        if(!node) return
        if(node.sprout.readyToBloom)
        {
            // Fallback path — auto-bloom should have already fired on
            // the markedReady event. If somehow the sprout is still
            // sitting ready (event missed, reduced-motion edge case),
            // the tap still works as an escape hatch.
            this._triggerBloom(sproutId)
            return
        }
        // Not-ready tap — acknowledge so the tap doesn't feel ignored. Brief
        // scale bump on the sprout itself + a CustomEvent for the React
        // overlay to surface a "still growing" toast. The slice does not
        // mutate; this is pure UI feedback for a non-mutation interaction.
        node.tapAckUntilMs = performance.now() + 280
        if(typeof window !== 'undefined')
        {
            window.dispatchEvent(new CustomEvent('ss:sprout-tap-not-ready', {
                detail: {
                    sproutId,
                    count: node.sprout.count,
                    threshold: node.sprout.threshold,
                },
            }))
        }
    }

    _spawnBloomedTree(tree, animate = false)
    {
        if(this.bloomedNodes.has(tree.id)) return

        const group = new THREE.Group()
        const { theta, radius } = seededAngleAndRadius(tree.placementSeed)
        const x = Math.cos(theta) * radius
        const z = Math.sin(theta) * radius
        const y = this.island.heightAt(x, z)
        group.position.set(x, y, z)
        group.rotation.y = theta + 0.3
        this.root.add(group)

        const isOak = tree.treeSpecies === 'oak'
        const trunkColor = isOak ? COLORS.trunkOak : COLORS.trunkCherry
        const leafColor  = isOak ? COLORS.leafOak  : COLORS.leafCherry

        const matTrunk = new THREE.MeshLambertMaterial({ color: trunkColor, flatShading: true })
        const matLeaf  = new THREE.MeshLambertMaterial({ color: leafColor,  flatShading: true })

        // TRUNK — taller cylinder than a sprout's stem.
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.075, 0.55, 8),
            matTrunk,
        )
        trunk.position.y = 0.275
        group.add(trunk)

        // CANOPY — three overlapping icospheres for a fluffy silhouette.
        const canopyA = new THREE.Mesh(new THREE.IcosahedronGeometry(0.20, 1), matLeaf)
        canopyA.position.set(0, 0.62, 0)
        const canopyB = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), matLeaf)
        canopyB.position.set(0.13, 0.56, 0.05)
        const canopyC = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), matLeaf)
        canopyC.position.set(-0.10, 0.55, -0.07)
        group.add(canopyA)
        group.add(canopyB)
        group.add(canopyC)

        const targetScale = 1.0
        if(animate)
        {
            group.scale.setScalar(0.001)  // animate up from ~zero
        }
        else
        {
            group.scale.setScalar(targetScale)
        }

        this.bloomedNodes.set(tree.id, {
            tree,
            group,
            parts: { trunk, canopyA, canopyB, canopyC },
            growStartMs: animate ? performance.now() : null,
            targetScale,
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

    /**
     * Start the per-capture camera flow: glide camera to the sprout,
     * hold, then either restore or trigger auto-bloom. If a flow is
     * already running, skip silently — the visual badge / scale tick
     * still updates from the event itself, this just avoids fighting
     * camera animations against each other.
     *
     * Reduced-motion: no camera fly. Instead a brief glow flash on the
     * sprout via `node.tapAckUntilMs` (already used by not-ready taps);
     * auto-bloom still fires but with the existing reduced-motion path
     * (200ms cross-fade) inside the dissolve/grow code.
     */
    _startCameraFlow(sproutId, { autoBloom })
    {
        const node = this.nodes.get(sproutId)
        if(!node) return

        // Reduced-motion path: skip camera, flash, kick auto-bloom if
        // applicable. The dissolve/grow code already has reduced-motion
        // branches.
        if(reduceMotion())
        {
            node.tapAckUntilMs = performance.now() + 240
            if(autoBloom) this._triggerBloom(sproutId)
            return
        }

        // Skip if a flow is in flight — the new event's visuals still
        // appear (badge updates, scale tick) but we don't restart the
        // camera. This prevents jittery overlapping zooms.
        if(this._camFlow) return

        const camera = this.view.camera
        if(!camera || !camera.zoomTo) return

        // Compute camera pose along the student's current viewing axis
        // so the camera glides toward the sprout rather than swinging
        // around. Mirror of ObjectPeek's targeting math.
        const tgt = node.group.position
        const liveCam = camera.instance.position
        const dx = liveCam.x - tgt.x
        const dz = liveCam.z - tgt.z
        const flatLen = Math.hypot(dx, dz) || 1
        const unitX = dx / flatLen
        const unitZ = dz / flatLen
        const dist = 1.7   // ~1.7m back from the sprout
        const lift = 0.8   // 0.8m above ground
        const lookLift = 0.22  // look slightly above the sprout's base
        const camPos = new (this._tmpVec.constructor)(
            tgt.x + unitX * dist,
            tgt.y + lift,
            tgt.z + unitZ * dist,
        )
        const camLook = new (this._tmpVec.constructor)(tgt.x, tgt.y + lookLift, tgt.z)
        camera.zoomTo(camPos, camLook, CAM_ZOOM_IN_MS)

        this._camFlow = {
            sproutId,
            phase: 'flying',  // → 'holding' → ('blooming' →) 'returning' → done
            startMs: performance.now(),
            autoBloom,
        }
    }

    _tickCameraFlow(now)
    {
        const flow = this._camFlow
        if(!flow) return

        const elapsed = now - flow.startMs

        if(flow.phase === 'flying')
        {
            if(elapsed >= CAM_ZOOM_IN_MS)
            {
                flow.phase = 'holding'
                flow.startMs = now
            }
            return
        }

        if(flow.phase === 'holding')
        {
            const holdMs = flow.autoBloom ? CAM_HOLD_BLOOM_MS : CAM_HOLD_MS
            if(elapsed >= holdMs)
            {
                if(flow.autoBloom)
                {
                    const ok = this._triggerBloom(flow.sproutId)
                    if(ok)
                    {
                        flow.phase = 'blooming'
                        flow.startMs = now
                        return
                    }
                    // Bloom refused (e.g., state changed); fall through to return.
                }
                this._returnCamera(flow)
            }
            return
        }

        if(flow.phase === 'blooming')
        {
            if(elapsed >= BLOOM_GROW_MS)
            {
                this._returnCamera(flow)
            }
            return
        }

        if(flow.phase === 'returning')
        {
            if(elapsed >= CAM_ZOOM_OUT_MS)
            {
                this._camFlow = null
            }
        }
    }

    _returnCamera(flow)
    {
        const camera = this.view.camera
        if(camera && camera.restoreZoom) camera.restoreZoom(CAM_ZOOM_OUT_MS)
        flow.phase = 'returning'
        flow.startMs = performance.now()
    }

    /**
     * Dispatch a bloom on the slice. Returns true if the slice
     * accepted the bloom; false if it refused (e.g., the sprout is
     * not actually ready). Plays the bloom chime on success.
     */
    _triggerBloom(sproutId)
    {
        const result = this.state.sprouts.bloom(sproutId)
        if(!result) return false
        try { this.view.sound?.playOneShot?.('bloom') } catch(_) {}
        return true
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

        // Drive the per-capture camera-flow state machine.
        this._tickCameraFlow(now)

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

            // Tap-acknowledgement bump for not-ready taps — brief 6% scale
            // overshoot that decays over ~280ms. Visible feedback that the
            // tap registered even though the threshold isn't met yet.
            if(node.tapAckUntilMs && node.tapAckUntilMs > now)
            {
                const remaining = (node.tapAckUntilMs - now) / 280
                const bump = remaining * 0.06
                node.group.scale.multiplyScalar(1 + bump)
            }
            else if(node.tapAckUntilMs)
            {
                node.tapAckUntilMs = 0
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

        // Animate growing bloomed trees (scale 0 → 1 over ~1200ms with
        // ease-out, matching the brainstorm's 1.5s bloom envelope).
        for(const node of this.bloomedNodes.values())
        {
            if(node.growStartMs === null) continue
            const dt = now - node.growStartMs
            const duration = reduce ? 200 : BLOOM_GROW_MS
            const t = Math.min(1, dt / duration)
            // Ease out cubic
            const eased = 1 - Math.pow(1 - t, 3)
            node.group.scale.setScalar(node.targetScale * eased)
            if(t >= 1) node.growStartMs = null
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
        if(this._canvasEl && this._onPointerDown)
        {
            try { this._canvasEl.removeEventListener('pointerdown', this._onPointerDown) } catch(_) {}
            try { this._canvasEl.removeEventListener('pointerup', this._onPointerUp) } catch(_) {}
        }
        this._canvasEl = null
        for(const id of Array.from(this.nodes.keys()))
        {
            this._disposeNode(id)
        }
        for(const id of Array.from(this.bloomedNodes.keys()))
        {
            const bn = this.bloomedNodes.get(id)
            if(bn?.group)
            {
                this.root?.remove(bn.group)
                bn.group.traverse((obj) =>
                {
                    if(obj.geometry) { try { obj.geometry.dispose() } catch(_) {} }
                    if(obj.material) { try { obj.material.dispose() } catch(_) {} }
                })
            }
            this.bloomedNodes.delete(id)
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
