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
    // Flower palette — small, vivid, varied. Picked by hash on createdAt.
    flowerStem:    0x4C7B2D,
    flowerCenter:  0xF6C84C, // warm yellow center
    flowerPetals:  [0xFF7AA2, 0xFFFFFF, 0xE08CFF, 0xFF9F4A, 0xFFE066, 0x8FD3FF],
    // Butterfly palette
    butterflyBody:  0x2B2A28,
    butterflyWings: [0xFF7AA2, 0xFFD24A, 0x8FD3FF, 0xFF9F4A, 0xC78EFF],
    // Fruit palette — bush + fruits
    fruitBush:   0x4C7B2D,
    fruitBerries: [0xC8202A, 0xE8632E, 0xF0B044], // red, orange, amber
}

// Pre-bloom species hints. Once a sprout's species locks (from the
// student's V/I/P/S tag), the still-growing sprout subtly foreshadows
// the bloomed-object look so the eventual bloom doesn't feel arbitrary.
// Recolor existing materials — never spawn new ones per sprout.
// Reduced motion: tint only (no sparkle / no berry dot).
export const SPECIES_HINT = {
    tree: {
        leafLight: 0x6B9445,   // darker, oak-leaning canopy preview
        leafDark:  0x375D1F,
        glow:      0xFFE38C,   // unchanged warm gold
    },
    flower: {
        leafLight: 0xC9D67A,   // pale yellow-green — warm tinge
        leafDark:  0x9DB07A,
        glow:      0xFFB088,   // warm rose ring
    },
    butterfly: {
        leafLight: 0xB8D898,
        leafDark:  0x5E8E40,
        glow:      0xC4B5E5,   // pale violet ring
    },
    fruit: {
        leafLight: 0xA0BE6A,
        leafDark:  0x6A8A36,
        glow:      0xE4906A,   // amber ring
    },
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

/**
 * Resolve a sprout or bloomedTree descriptor to a concrete world
 * placement. An explicit `position: {x,z}` overrides the seeded hash
 * so student-moved objects render where they were planted; absent or
 * cleared positions fall back to the deterministic seed.
 *
 * Returns `{ x, y, z, theta }` — `theta` is the seeded yaw used by
 * spawned meshes for adjacent-sprout variety; when an explicit
 * position overrides the seed we still derive a deterministic yaw
 * from the seed so the visual orientation stays stable across moves.
 */
function resolveWorldPlacement(descriptor, island)
{
    const seed = typeof descriptor.placementSeed === 'number' ? descriptor.placementSeed : 0
    const { theta, radius } = seededAngleAndRadius(seed)
    const pos = descriptor.position
    if(pos && typeof pos.x === 'number' && typeof pos.z === 'number' &&
       Number.isFinite(pos.x) && Number.isFinite(pos.z))
    {
        return { x: pos.x, y: island.heightAt(pos.x, pos.z), z: pos.z, theta }
    }
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius
    return { x, y: island.heightAt(x, z), z, theta }
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

        // Pick-and-plant: register hit targets for the onboarding tree
        // and flower (Tree.js entries[0] / Flowers.js flowers[0]) so
        // the drag flow treats them as student-owned. Apply persisted
        // offsets so reloads land them where the student left them.
        // Deferred a frame to give Tree.js / Flowers.js time to finish
        // their async boot (templates load via fetch).
        // Maps keyed by index (`decorIndex` in the hit's userData). Every
        // authored static decor instance gets its own hit target so the
        // student can arrange anything on the island, not just the
        // onboarding pair.
        this._decorHits = { tree: new Map(), flower: new Map() }
        this._decorReady = false
        this._installDecorHitTargets()

        // Camera flow state — ensures only one flow runs at a time.
        // Rapid-fire captures during an in-flight flow are visualised
        // (badge, sprout scale tick) but don't enqueue another camera
        // moment — the existing flow finishes first.
        this._camFlow = null  // null | { sproutId, phase, startMs, autoBloom }

        // Pick-and-plant edit mode. Flipped via the 'ss:edit-mode'
        // CustomEvent dispatched by the React overlay's Arrange button.
        // While on: pointer drag relocates the object; while off: taps
        // flow through the existing bloom-on-tap / not-ready paths.
        this._editMode = false
        this._onEditMode = (e) =>
        {
            const next = !!(e && e.detail && e.detail.on)
            this._editMode = next
            if(this.badgeLayer)
            {
                if(next) this.badgeLayer.classList.add('edit-mode')
                else this.badgeLayer.classList.remove('edit-mode')
            }
            // Exiting edit mode mid-drag cancels the gesture so the
            // half-moved object doesn't strand in the air with no way
            // to commit.
            if(!next && this._drag) this._cancelDrag()
        }
        if(typeof window !== 'undefined')
        {
            window.addEventListener('ss:edit-mode', this._onEditMode)
        }

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
            else if(event.type === 'speciesLocked')
            {
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.sprout = event.sprout
                    this._applySpeciesHint(node)
                }
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
            else if(event.type === 'sproutMoved')
            {
                // Pick-and-plant: a sprout's position changed. Move the
                // mesh in place so the visual stays in sync with state.
                // Drag-in-flight uses direct mesh manipulation; this
                // branch handles commit (and any future programmatic
                // position updates).
                const node = this.nodes.get(event.sprout.id)
                if(node)
                {
                    node.sprout = event.sprout
                    const placement = resolveWorldPlacement(event.sprout, this.island)
                    node.group.position.set(placement.x, placement.y, placement.z)
                }
            }
            else if(event.type === 'bloomedMoved')
            {
                const bNode = this.bloomedNodes.get(event.bloomedTree.id)
                if(bNode)
                {
                    bNode.tree = event.bloomedTree
                    const placement = resolveWorldPlacement(event.bloomedTree, this.island)
                    bNode.group.position.set(placement.x, placement.y, placement.z)
                }
            }
            else if(event.type === 'decorMoved')
            {
                // Onboarding-decor offset changed. Apply via Tree/Flowers'
                // move methods and re-sync the hit-target's position so
                // the next drag picks it up at its current spot.
                this._applyDecorMove(event.kind, event.index, event.position)
            }
        })

        // Click handler — raycast against sprout hit targets; ready
        // sprouts bloom on tap. Bound to the renderer's DOM element so
        // OrbitControls drag events don't false-fire.
        this._raycaster = new THREE.Raycaster()
        this._pointer = new THREE.Vector2()
        this._dragGuard = { isDragging: false, downX: 0, downY: 0 }

        // Pick-and-plant drag state. Non-null while a drag is in
        // flight; cleared on commit or snap-back. Holds the original
        // group position + scale so cancelling a drag (off-plateau
        // drop, edit-mode toggled off mid-drag, or dispose) can restore
        // visual state without consulting the slice.
        this._drag = null
        this._dragLiftOffset = 0.15  // metres lifted while held
        // Ground plane reused per drag. Its `constant` is updated on
        // each pointerdown to `-pickupGroundY` so the cursor-to-world
        // projection lands at the height the object was grabbed from
        // (≈ plateauTopY of 1.0m). A plane at y=0 would put the
        // intersection far behind the visible terrain and make the
        // mesh trail the cursor by metres.
        this._dragGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

        this._onPointerDown = (e) => this._handlePointerDown(e)
        this._onPointerUp = (e) => this._handlePointerUp(e)
        this._onPointerMove = (e) => this._handlePointerMove(e)
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

        if(!this._editMode) return
        const target = this._raycastDraggable(e)
        if(!target) return

        // Begin a pick-and-plant drag. Resolve the drag target's
        // group depending on what was hit — sprout / bloomed Sprouts
        // view nodes use the same key; decor uses the underlying
        // Tree/Flowers view's group directly so the trunk + leaves (or
        // stem + petals) move as one piece.
        const camera = this.view.camera
        let dragGroup = null
        if(target.kind === 'sprout')
        {
            const node = this.nodes.get(target.id)
            if(node) dragGroup = node.group
        }
        else if(target.kind === 'bloomed')
        {
            const node = this.bloomedNodes.get(target.id)
            if(node) dragGroup = node.group
        }
        else if(target.kind === 'decor')
        {
            if(target.decorKind === 'tree') dragGroup = this.view.tree?.entries?.[target.decorIndex]?.group
            else if(target.decorKind === 'flower') dragGroup = this.view.flowers?.flowers?.[target.decorIndex]?.group
        }
        if(!dragGroup) return

        const originPos = dragGroup.position.clone()
        const originScale = dragGroup.scale.x  // uniform scale assumed
        const reduce = reduceMotion()
        const pickupGroundY = this.island.heightAt(originPos.x, originPos.z)
        const liftHeight = pickupGroundY + (reduce ? 0 : this._dragLiftOffset)

        // Plane must sit at the mesh's actual rendered height, not the
        // ground beneath it. Putting the plane at the ground produces
        // a parallax offset under perspective camera: the cursor
        // projects onto the ground plane, but the mesh visually sits
        // `lift` above that, so the mesh appears to trail the cursor
        // by however many screen pixels `lift` projects to.
        this._dragGroundPlane.constant = -liftHeight

        this._drag = {
            kind: target.kind,
            id: target.id,
            decorKind: target.decorKind,
            decorIndex: target.decorIndex,
            group: dragGroup,
            originPos,
            originScale,
            pickupGroundY,
            liftHeight,
            lifted: !reduce,
            valid: true,
            pointerId: e.pointerId,
        }

        // Lift by adjusting y to the plane height; multiply scale
        // slightly so the held object feels picked up (skipped under
        // reduced motion).
        dragGroup.position.y = liftHeight
        if(!reduce) dragGroup.scale.setScalar(originScale * 1.05)

        if(camera?.controls) camera.controls.enabled = false
        if(this._canvasEl)
        {
            try { this._canvasEl.setPointerCapture?.(e.pointerId) } catch(_) {}
            this._canvasEl.addEventListener('pointermove', this._onPointerMove)
        }
        e.preventDefault?.()
    }

    /**
     * Cast against the full draggable set (sprouts + bloomed) for a
     * pointer event and return `{ kind, id } | null`. Skips dissolving
     * sprouts so the still-fading mesh from a recent bloom can't catch
     * the drag.
     */
    _raycastDraggable(e)
    {
        const camera = this.view.camera?.instance
        if(!camera || !this._canvasEl) return null
        const rect = this._canvasEl.getBoundingClientRect()
        this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this._raycaster.setFromCamera(this._pointer, camera)

        const targets = []
        for(const node of this.nodes.values())
        {
            if(node.dissolveStartMs === null && node.parts.hitTarget)
            {
                targets.push(node.parts.hitTarget)
            }
        }
        for(const node of this.bloomedNodes.values())
        {
            if(node.parts?.hitTarget) targets.push(node.parts.hitTarget)
        }
        for(const hit of this._decorHits.tree.values()) targets.push(hit)
        for(const hit of this._decorHits.flower.values()) targets.push(hit)
        if(targets.length === 0) return null
        const intersects = this._raycaster.intersectObjects(targets, false)
        const hit = intersects[0]
        if(!hit) return null
        const ud = hit.object?.userData
        if(ud?.kind === 'sprout' && ud.sproutId) return { kind: 'sprout', id: ud.sproutId }
        if(ud?.kind === 'bloomed' && ud.bloomedId) return { kind: 'bloomed', id: ud.bloomedId }
        if(ud?.kind === 'decor') return { kind: 'decor', decorKind: ud.decorKind, decorIndex: ud.decorIndex }
        return null
    }

    _handlePointerMove(e)
    {
        const drag = this._drag
        if(!drag) return

        const camera = this.view.camera?.instance
        if(!camera || !this._canvasEl) return
        const rect = this._canvasEl.getBoundingClientRect()
        this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this._raycaster.setFromCamera(this._pointer, camera)

        const hit = new THREE.Vector3()
        const intersected = this._raycaster.ray.intersectPlane(this._dragGroundPlane, hit)
        if(!intersected) return

        // Lock the mesh at the plane's exact y (drag.liftHeight) so the
        // cursor and the object stay perfectly aligned regardless of
        // the gentle plateau bumpiness. The terrain snap is applied
        // ONCE at pointerup so the final committed position sits on
        // the ground at the actual heightAt of the drop point.
        const x = hit.x
        const z = hit.z
        if(drag.kind === 'decor' && drag.decorKind === 'tree')
        {
            // Route through Tree.moveEntry so the canopy InstancedMesh
            // re-projects from the new trunk transform every frame.
            this.view.tree?.moveEntry(drag.decorIndex, x, z, { y: drag.liftHeight })
        }
        else if(drag.kind === 'decor' && drag.decorKind === 'flower')
        {
            this.view.flowers?.moveInstance(drag.decorIndex, x, z, { y: drag.liftHeight })
        }
        else
        {
            drag.group.position.set(x, drag.liftHeight, z)
        }
        drag.valid = this.island.isPlaceable(x, z)

        // Lightweight validity cue — tint a sprout's glow ring red on
        // invalid drops; bloomed objects don't have a glow so we rely
        // on the snap-back to communicate "didn't take." Cheap and
        // doesn't add new materials.
        if(drag.kind === 'sprout')
        {
            const node = this.nodes.get(drag.id)
            if(node?.parts.glow)
            {
                node.parts.glow.material.color.setHex(drag.valid ? COLORS.glow : 0xC8202A)
                node.parts.glow.material.opacity = 0.55
            }
        }
    }

    _handlePointerUp(e)
    {
        if(this._drag) { this._finishDrag(e); return }

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

    /**
     * Build invisible hit-target spheres at the onboarding tree and
     * flower positions, attached to the respective groups so they
     * follow any future re-positioning automatically. Re-runs each
     * frame in update() until Tree.js is ready (its templates load
     * asynchronously).
     */
    _installDecorHitTargets()
    {
        if(this._decorReady) return
        const tree = this.view.tree
        const flowers = this.view.flowers
        const treeEntries = tree?.ready ? (tree?.entries || []) : []
        const flowerEntries = flowers?.flowers || []
        if(treeEntries.length === 0 && flowerEntries.length === 0) return

        for(let i = 0; i < treeEntries.length; i++)
        {
            if(this._decorHits.tree.has(i)) continue
            const entry = treeEntries[i]
            if(!entry?.group) continue
            const off = this.state.sprouts.getDecorOffset('tree', i)
            if(off) tree.moveEntry(i, off.x, off.z)
            const hit = new THREE.Mesh(
                new THREE.SphereGeometry(0.55, 8, 6),
                new THREE.MeshBasicMaterial({ visible: false }),
            )
            hit.position.y = 0.6
            hit.userData = { kind: 'decor', decorKind: 'tree', decorIndex: i }
            entry.group.add(hit)
            this._decorHits.tree.set(i, hit)
        }
        for(let i = 0; i < flowerEntries.length; i++)
        {
            if(this._decorHits.flower.has(i)) continue
            const f = flowerEntries[i]
            if(!f?.group) continue
            const off = this.state.sprouts.getDecorOffset('flower', i)
            if(off) flowers.moveInstance(i, off.x, off.z)
            const hit = new THREE.Mesh(
                new THREE.SphereGeometry(0.25, 8, 6),
                new THREE.MeshBasicMaterial({ visible: false }),
            )
            hit.position.y = 0.15
            hit.userData = { kind: 'decor', decorKind: 'flower', decorIndex: i }
            f.group.add(hit)
            this._decorHits.flower.set(i, hit)
        }
        const treeReadyAll = treeEntries.length > 0 && this._decorHits.tree.size >= treeEntries.length
        const flowersReadyAll = flowerEntries.length > 0 && this._decorHits.flower.size >= flowerEntries.length
        this._decorReady = treeReadyAll || flowersReadyAll
    }

    /**
     * Apply a decor offset move via the appropriate view module. Called
     * from the 'decorMoved' slice subscriber so reloads + remote
     * mutations both flow through one code path.
     */
    _applyDecorMove(kind, index, position)
    {
        if(kind === 'tree' && this.view.tree?.moveEntry)
        {
            const pos = position ?? this._authoredTreeXZ(index)
            if(pos) this.view.tree.moveEntry(index, pos.x, pos.z)
        }
        else if(kind === 'flower' && this.view.flowers?.moveInstance)
        {
            const pos = position ?? this._authoredFlowerXZ(index)
            if(pos) this.view.flowers.moveInstance(index, pos.x, pos.z)
        }
    }

    /** Lazily-cached authored placement for tree[index]. */
    _authoredTreeXZ(index)
    {
        const tree = this.view.tree
        const entry = tree?.entries?.[index]
        if(!entry) return null
        // entry.x/z carry the live coordinates; if offsets exist they've
        // already overridden them. The authored coords are the constructor
        // arguments — not stored separately on entry. For the v1 scope
        // (only entry 0), the authored coord is (0, 0).
        return index === 0 ? { x: 0, z: 0 } : { x: entry.x, z: entry.z }
    }

    /** Lazily-cached authored placement for flowers[index]. */
    _authoredFlowerXZ(index)
    {
        const f = this.view.flowers?.flowers?.[index]
        if(!f) return null
        // For v1 scope (flower 0), Flowers.js seeds it deterministically.
        // Return its current world XZ as a best-effort "authored" anchor.
        return { x: f.x, z: f.z }
    }

    /**
     * Resolve an in-flight drag on pointerup. If the drop is valid,
     * commit the new position to the slice (which fires sproutMoved /
     * bloomedMoved and the subscriber re-positions cleanly without the
     * lift offset). If invalid, snap the mesh back to its original
     * position. Either way: restore controls, drop scale, clear drag.
     */
    _finishDrag(e)
    {
        const drag = this._drag
        if(!drag) return
        this._drag = null

        if(this._canvasEl)
        {
            try { this._canvasEl.releasePointerCapture?.(e?.pointerId ?? drag.pointerId) } catch(_) {}
            this._canvasEl.removeEventListener('pointermove', this._onPointerMove)
        }

        const camera = this.view.camera
        if(camera?.controls) camera.controls.enabled = true

        // Restore scale + sprout glow color regardless of commit/cancel.
        drag.group.scale.setScalar(drag.originScale)
        if(drag.kind === 'sprout')
        {
            const node = this.nodes.get(drag.id)
            if(node?.parts.glow)
            {
                // Glow returns to its species-appropriate color; the
                // ready-to-bloom pulse logic in update() takes over on
                // the next frame, including resetting opacity.
                const speciesHint = node.sprout?.species && SPECIES_HINT[node.sprout.species]
                node.parts.glow.material.color.setHex(speciesHint?.glow ?? COLORS.glow)
            }
        }

        if(drag.valid)
        {
            const finalX = drag.group.position.x
            const finalZ = drag.group.position.z
            // Commit to state — subscriber will re-position to the same
            // place idempotently (and for decor will also snap to
            // terrain via the moveEntry/moveInstance no-y path).
            if(drag.kind === 'sprout')
            {
                drag.group.position.set(finalX, this.island.heightAt(finalX, finalZ), finalZ)
                this.state.sprouts.setSproutPosition(drag.id, { x: finalX, z: finalZ })
            }
            else if(drag.kind === 'bloomed')
            {
                drag.group.position.set(finalX, this.island.heightAt(finalX, finalZ), finalZ)
                this.state.sprouts.setBloomedPosition(drag.id, { x: finalX, z: finalZ })
            }
            else if(drag.kind === 'decor')
            {
                // The slice fires decorMoved → _applyDecorMove which
                // calls moveEntry/moveInstance with no `y` opt so the
                // terrain snap happens there in one place.
                this.state.sprouts.setDecorOffset(drag.decorKind, drag.decorIndex, { x: finalX, z: finalZ })
            }
        }
        else
        {
            // Snap back — no slice mutation; the visual returns to
            // origin so the student sees "didn't take" feedback.
            if(drag.kind === 'decor' && drag.decorKind === 'tree')
            {
                this.view.tree?.moveEntry(drag.decorIndex, drag.originPos.x, drag.originPos.z, { y: drag.originPos.y })
            }
            else if(drag.kind === 'decor' && drag.decorKind === 'flower')
            {
                this.view.flowers?.moveInstance(drag.decorIndex, drag.originPos.x, drag.originPos.z, { y: drag.originPos.y })
            }
            else
            {
                drag.group.position.copy(drag.originPos)
            }
        }
    }

    /**
     * Cancel an in-flight drag without committing (edit mode toggled
     * off mid-drag, or dispose). Restores visuals to origin.
     */
    _cancelDrag()
    {
        const drag = this._drag
        if(!drag) return
        this._drag = null

        if(this._canvasEl)
        {
            this._canvasEl.removeEventListener('pointermove', this._onPointerMove)
        }
        const camera = this.view.camera
        if(camera?.controls) camera.controls.enabled = true
        drag.group.scale.setScalar(drag.originScale)
        if(drag.kind === 'decor' && drag.decorKind === 'tree')
        {
            this.view.tree?.moveEntry(drag.decorIndex, drag.originPos.x, drag.originPos.z, { y: drag.originPos.y })
        }
        else if(drag.kind === 'decor' && drag.decorKind === 'flower')
        {
            this.view.flowers?.moveInstance(drag.decorIndex, drag.originPos.x, drag.originPos.z, { y: drag.originPos.y })
        }
        else
        {
            drag.group.position.copy(drag.originPos)
        }
        if(drag.kind === 'sprout')
        {
            const node = this.nodes.get(drag.id)
            if(node?.parts.glow)
            {
                const speciesHint = node.sprout?.species && SPECIES_HINT[node.sprout.species]
                node.parts.glow.material.color.setHex(speciesHint?.glow ?? COLORS.glow)
            }
        }
    }

    /**
     * Replace the visible bloomed objects with a historical subset, or
     * restore the live slice state when called with null.
     *
     * Used by GrowthSheet (timelapse mode) to render the island as it was
     * at the end of a chosen year. Diffs against `this.bloomedNodes` by id
     * so only the delta (additions + removals) touches the scene — no full
     * reconcile, no THREE allocations for unchanged nodes.
     *
     * CRITICAL INVARIANT: this method never calls slice mutators
     * (`state.sprouts.bloom`, `.hydrate`, `.add`, `.markReady`, etc.).
     * Scrubbing through past years must not destroy real present-day state.
     *
     * @param {Array | null} bloomedTrees
     *   - Array: bloomed-tree shapes (same fields as `state.sprouts.listBloomedTrees()`).
     *     Anything present in `bloomedNodes` but not in this array is removed; anything in
     *     this array but not in `bloomedNodes` is spawned (no animation — historical state
     *     doesn't grow in front of the user).
     *   - null: restores live slice state by re-reading `state.sprouts.listBloomedTrees()`.
     */
    setTimelapseSubset(bloomedTrees)
    {
        const target = bloomedTrees === null
            ? this.state.sprouts.listBloomedTrees()
            : bloomedTrees

        const targetIds = new Set()
        for(const tree of target) targetIds.add(tree.id)

        // Remove nodes not in the target set.
        for(const id of Array.from(this.bloomedNodes.keys()))
        {
            if(!targetIds.has(id)) this._disposeBloomedNode(id)
        }

        // Spawn nodes present in the target set but missing from the scene.
        for(const tree of target)
        {
            if(!this.bloomedNodes.has(tree.id)) this._spawnBloomedTree(tree, /*animate=*/ false)
        }
    }

    _disposeBloomedNode(id)
    {
        const node = this.bloomedNodes.get(id)
        if(!node) return
        if(node.group)
        {
            try { this.root?.remove(node.group) } catch(_) {}
            node.group.traverse((obj) =>
            {
                if(obj.geometry) { try { obj.geometry.dispose() } catch(_) {} }
                if(obj.material) { try { obj.material.dispose() } catch(_) {} }
            })
        }
        this.bloomedNodes.delete(id)
    }

    _spawnBloomedTree(tree, animate = false)
    {
        // Renamed semantically: dispatches mesh construction by sprout
        // species. 'tree' (or legacy missing species) → mini-tree;
        // 'flower' → flower cluster; 'butterfly' → butterfly perched
        // above ground; 'fruit' → small bush with fruits.
        if(this.bloomedNodes.has(tree.id)) return

        const group = new THREE.Group()
        const { x, y, z, theta } = resolveWorldPlacement(tree, this.island)
        group.position.set(x, y, z)
        group.rotation.y = theta + 0.3
        this.root.add(group)

        const species = tree.species || 'tree'
        let parts
        if(species === 'flower')        parts = this._buildBloomedFlower(group, tree.placementSeed)
        else if(species === 'butterfly') parts = this._buildBloomedButterfly(group, tree.placementSeed)
        else if(species === 'fruit')     parts = this._buildBloomedFruit(group, tree.placementSeed)
        else                             parts = this._buildBloomedTree(group, tree.treeSpecies)

        const targetScale = 1.0
        if(animate)
        {
            group.scale.setScalar(0.001)  // animate up from ~zero
        }
        else
        {
            group.scale.setScalar(targetScale)
        }

        // Invisible hit target — gives drag (and any future tap-on-
        // bloomed feature) a uniform raycast surface regardless of
        // species. Radius chosen to cover the bounding extent of every
        // species; per-species variations are small enough that one
        // size fits all here.
        const hitTarget = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 6),
            new THREE.MeshBasicMaterial({ visible: false }),
        )
        hitTarget.position.y = 0.25
        hitTarget.userData = { kind: 'bloomed', bloomedId: tree.id }
        group.add(hitTarget)
        parts.hitTarget = hitTarget

        this.bloomedNodes.set(tree.id, {
            tree,
            group,
            parts,
            growStartMs: animate ? performance.now() : null,
            targetScale,
        })
    }

    _buildBloomedTree(group, treeSpeciesId)
    {
        const isOak = treeSpeciesId === 'oak'
        const trunkColor = isOak ? COLORS.trunkOak : COLORS.trunkCherry
        const leafColor  = isOak ? COLORS.leafOak  : COLORS.leafCherry

        const matTrunk = new THREE.MeshLambertMaterial({ color: trunkColor, flatShading: true })
        const matLeaf  = new THREE.MeshLambertMaterial({ color: leafColor,  flatShading: true })

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.55, 8), matTrunk)
        trunk.position.y = 0.275
        group.add(trunk)

        const canopyA = new THREE.Mesh(new THREE.IcosahedronGeometry(0.20, 1), matLeaf)
        canopyA.position.set(0, 0.62, 0)
        const canopyB = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), matLeaf)
        canopyB.position.set(0.13, 0.56, 0.05)
        const canopyC = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), matLeaf)
        canopyC.position.set(-0.10, 0.55, -0.07)
        group.add(canopyA, canopyB, canopyC)

        return { kind: 'tree', trunk, canopyA, canopyB, canopyC }
    }

    _buildBloomedFlower(group, seed)
    {
        const matStem = new THREE.MeshLambertMaterial({ color: COLORS.flowerStem, flatShading: true })
        const matCenter = new THREE.MeshLambertMaterial({ color: COLORS.flowerCenter, flatShading: true })
        const petalColor = COLORS.flowerPetals[seed % COLORS.flowerPetals.length]
        const matPetal = new THREE.MeshLambertMaterial({ color: petalColor, flatShading: true })

        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.030, 0.34, 6), matStem)
        stem.position.y = 0.17
        group.add(stem)

        // Two small leaves on the stem
        const leafGeo = new THREE.IcosahedronGeometry(0.06, 0)
        const leafA = new THREE.Mesh(leafGeo, matStem)
        leafA.position.set(0.06, 0.18, 0)
        leafA.scale.set(1.2, 0.5, 0.6)
        const leafB = new THREE.Mesh(leafGeo, matStem)
        leafB.position.set(-0.05, 0.14, 0.03)
        leafB.scale.set(1.0, 0.5, 0.6)
        group.add(leafA, leafB)

        // Flower head — 6 petals arranged radially + a center
        const flowerGroup = new THREE.Group()
        flowerGroup.position.y = 0.37
        const center = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), matCenter)
        flowerGroup.add(center)
        const petalGeo = new THREE.IcosahedronGeometry(0.07, 0)
        const petalCount = 6
        for(let i = 0; i < petalCount; i++)
        {
            const angle = (i / petalCount) * Math.PI * 2
            const petal = new THREE.Mesh(petalGeo, matPetal)
            petal.position.set(Math.cos(angle) * 0.085, 0, Math.sin(angle) * 0.085)
            petal.scale.set(1.1, 0.45, 0.85)
            flowerGroup.add(petal)
        }
        group.add(flowerGroup)

        return { kind: 'flower', stem, flowerGroup, center }
    }

    _buildBloomedButterfly(group, seed)
    {
        const wingColor = COLORS.butterflyWings[seed % COLORS.butterflyWings.length]
        const matBody = new THREE.MeshLambertMaterial({ color: COLORS.butterflyBody, flatShading: true })
        const matWing = new THREE.MeshLambertMaterial({
            color: wingColor,
            flatShading: true,
            side: THREE.DoubleSide,
        })

        // Anchor lifted off the ground so the butterfly hovers
        const anchor = new THREE.Group()
        anchor.position.y = 0.42
        group.add(anchor)

        // Body
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.10, 6), matBody)
        body.rotation.z = Math.PI / 2
        anchor.add(body)

        // Wings — two thin planes per side
        const wingGeo = new THREE.PlaneGeometry(0.16, 0.12)
        const wL = new THREE.Mesh(wingGeo, matWing)
        wL.position.set(0, 0.02, 0.08)
        wL.rotation.x = -Math.PI / 6
        wL.rotation.y = -Math.PI / 2.6
        const wR = new THREE.Mesh(wingGeo, matWing)
        wR.position.set(0, 0.02, -0.08)
        wR.rotation.x = -Math.PI / 6
        wR.rotation.y = Math.PI / 2.6
        anchor.add(wL, wR)

        // Smaller back wings
        const wingGeo2 = new THREE.PlaneGeometry(0.10, 0.08)
        const wLb = new THREE.Mesh(wingGeo2, matWing)
        wLb.position.set(-0.04, -0.02, 0.06)
        wLb.rotation.x = -Math.PI / 6
        wLb.rotation.y = -Math.PI / 2.6
        const wRb = new THREE.Mesh(wingGeo2, matWing)
        wRb.position.set(-0.04, -0.02, -0.06)
        wRb.rotation.x = -Math.PI / 6
        wRb.rotation.y = Math.PI / 2.6
        anchor.add(wLb, wRb)

        // Thin stem holding the butterfly above ground so it doesn't
        // look like it's resting on grass — gives the floating effect
        // without animation.
        const matStem = new THREE.MeshLambertMaterial({ color: COLORS.flowerStem, flatShading: true })
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), matStem)
        stem.position.y = 0.21
        group.add(stem)

        return { kind: 'butterfly', anchor, body, wingL: wL, wingR: wR }
    }

    _buildBloomedFruit(group, seed)
    {
        const matBush = new THREE.MeshLambertMaterial({ color: COLORS.fruitBush, flatShading: true })
        const berryColor = COLORS.fruitBerries[seed % COLORS.fruitBerries.length]
        const matBerry = new THREE.MeshLambertMaterial({ color: berryColor, flatShading: true })

        // Bush — three overlapping icospheres for a fuller shape
        const bushA = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), matBush)
        bushA.position.set(0, 0.13, 0)
        const bushB = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), matBush)
        bushB.position.set(0.10, 0.10, 0.04)
        const bushC = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), matBush)
        bushC.position.set(-0.08, 0.10, -0.05)
        group.add(bushA, bushB, bushC)

        // 3 berries sprinkled across the bush
        const berryGeo = new THREE.SphereGeometry(0.035, 10, 8)
        const positions = [
            [0.04, 0.20, 0.05],
            [-0.08, 0.18, 0.02],
            [0.02, 0.16, -0.10],
        ]
        for(const [bx, by, bz] of positions)
        {
            const berry = new THREE.Mesh(berryGeo, matBerry)
            berry.position.set(bx, by, bz)
            group.add(berry)
        }

        return { kind: 'fruit', bushA, bushB, bushC }
    }

    _spawnNode(sprout)
    {
        if(this.nodes.has(sprout.id)) return

        const group = new THREE.Group()
        const { x, y, z, theta } = resolveWorldPlacement(sprout, this.island)
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

        const node = {
            sprout,
            group,
            parts,
            badgeEl,
            targetScale: Math.min(1.0, 0.7 + 0.1 * sprout.count),
            pulsePhase: 0,
            bobPhase: 0,
            dissolveStartMs: null,
            // Track which species hint is currently painted, so re-firing
            // 'speciesLocked' on the same species is a cheap no-op.
            hintedSpecies: null,
        }
        this.nodes.set(sprout.id, node)
        // Hydrated sprouts may already carry a locked species; paint
        // the hint immediately so the visual matches state on load.
        if(sprout.species && sprout.species !== 'pending') this._applySpeciesHint(node)
    }

    /**
     * Recolor an existing sprout node's materials + (for butterfly /
     * fruit) attach a small decorative mesh so the still-growing sprout
     * foreshadows its eventual bloomed form. Idempotent: re-applying the
     * same species is a no-op. Reduced motion drops the decorative mesh
     * and keeps tint only.
     */
    _applySpeciesHint(node)
    {
        const species = node.sprout?.species
        const hint = species && SPECIES_HINT[species]
        if(!hint) return
        if(node.hintedSpecies === species) return
        node.hintedSpecies = species

        // Each sprout owns its own MeshLambertMaterials (built in
        // _buildSproutMesh), so mutating .color affects this sprout only.
        try {
            node.parts.leafA.material.color.setHex(hint.leafLight)
            node.parts.leafC.material.color.setHex(hint.leafLight)
            node.parts.leafB.material.color.setHex(hint.leafDark)
            node.parts.glow.material.color.setHex(hint.glow)
        } catch(_) { /* defensive: post-dispose race */ }

        // Decorative accents — skipped under reduced motion.
        if(reduceMotion()) return
        if(species === 'butterfly')
        {
            this._addSparkleHint(node)
        }
        else if(species === 'fruit')
        {
            this._addBerryHint(node)
        }
    }

    _addSparkleHint(node)
    {
        if(node.parts.sparkleHint) return
        // Three tiny dots above the leaf cluster, in butterfly-wing tones.
        const group = new THREE.Group()
        group.position.y = 0.32
        const geo = new THREE.SphereGeometry(0.012, 6, 4)
        const tones = [0xFFD24A, 0xFF7AA2, 0x8FD3FF]
        for(let i = 0; i < 3; i++)
        {
            const a = (i / 3) * Math.PI * 2
            const mat = new THREE.MeshBasicMaterial({ color: tones[i], transparent: true, opacity: 0.85 })
            const dot = new THREE.Mesh(geo, mat)
            dot.position.set(Math.cos(a) * 0.06, Math.sin(a * 1.7) * 0.02, Math.sin(a) * 0.06)
            group.add(dot)
        }
        node.group.add(group)
        node.parts.sparkleHint = group
    }

    _addBerryHint(node)
    {
        if(node.parts.berryHint) return
        const mat = new THREE.MeshLambertMaterial({ color: 0xC8202A, flatShading: true })
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat)
        berry.position.set(0.012, 0.27, 0)
        node.group.add(berry)
        node.parts.berryHint = berry
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

        // While the student is arranging the island, suppress the
        // auto-fly cinematic — flying the camera around would yank them
        // out of edit mode. State updates (badge, scale, glow) still
        // happen; only the camera moment is skipped. Auto-bloom is
        // intentionally NOT triggered here either: the threshold may
        // re-cross on the next grow event after edit mode is off, and
        // exiting edit mode shouldn't fire a deferred bloom they may
        // have moved past mentally. The tap-on-ready escape hatch in
        // _handlePointerUp keeps the bloom reachable.
        if(this._editMode) return

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
        camera.zoomTo(camPos, camLook, CAM_ZOOM_IN_MS, { owner: 'sprouts' })

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
        if(camera && camera.restoreZoom) camera.restoreZoom(CAM_ZOOM_OUT_MS, { owner: 'sprouts' })
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

        // Late-install decor hit targets once Tree.js finishes loading
        // its async templates. No-op once installed.
        if(!this._decorReady) this._installDecorHitTargets()

        const toDelete = []

        for(const [id, node] of this.nodes)
        {
            // While this sprout is being dragged, skip the targetScale
            // smoothing — the drag start applied a 1.05x grab scale and
            // the smoothing loop would fight to pull it back to the
            // count-driven target.
            const isDragging = this._drag?.kind === 'sprout' && this._drag.id === id

            // Smoothly approach targetScale (set on grow/spawn).
            if(!isDragging)
            {
                const targetX = node.targetScale
                const curX = node.group.scale.x
                if(Math.abs(curX - targetX) > 0.001)
                {
                    const step = delta * 1.6
                    const diff = targetX - curX
                    const next = curX + Math.sign(diff) * Math.min(Math.abs(diff), step)
                    node.group.scale.setScalar(next)
                }
            }

            // Tap-acknowledgement bump for not-ready taps — brief 6% scale
            // overshoot that decays over ~280ms. Visible feedback that the
            // tap registered even though the threshold isn't met yet.
            // Suppressed during drag so the grab scale isn't fought.
            if(!isDragging && node.tapAckUntilMs && node.tapAckUntilMs > now)
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
                // Fade leaves + stem + any species-hint accents
                const fadeParts = [node.parts.stem, node.parts.leafA, node.parts.leafB, node.parts.leafC]
                if(node.parts.berryHint) fadeParts.push(node.parts.berryHint)
                if(node.parts.sparkleHint) fadeParts.push(...node.parts.sparkleHint.children)
                for(const part of fadeParts)
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
        // Cancel any in-flight drag BEFORE removing listeners so the
        // cleanup path can reach the canvas to detach pointermove and
        // restore controls.
        if(this._drag) { try { this._cancelDrag() } catch(_) {} }

        if(this._unsubscribe) { try { this._unsubscribe() } catch(_) {} this._unsubscribe = null }
        if(this._canvasEl && this._onPointerDown)
        {
            try { this._canvasEl.removeEventListener('pointerdown', this._onPointerDown) } catch(_) {}
            try { this._canvasEl.removeEventListener('pointerup', this._onPointerUp) } catch(_) {}
            try { this._canvasEl.removeEventListener('pointermove', this._onPointerMove) } catch(_) {}
        }
        this._canvasEl = null
        if(typeof window !== 'undefined' && this._onEditMode)
        {
            try { window.removeEventListener('ss:edit-mode', this._onEditMode) } catch(_) {}
        }
        this._onEditMode = null
        // Defensive: if dispose fires mid-drag (HMR / route change),
        // restore camera controls so the next mount isn't camera-locked.
        try
        {
            const controls = this.view?.camera?.controls
            if(controls) controls.enabled = true
        }
        catch(_) {}
        for(const id of Array.from(this.nodes.keys()))
        {
            this._disposeNode(id)
        }
        for(const id of Array.from(this.bloomedNodes.keys()))
        {
            this._disposeBloomedNode(id)
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
