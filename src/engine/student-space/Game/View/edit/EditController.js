/**
 * EditController — engine core of the island editor (plan 002).
 *
 * Responsibilities:
 *   1. activate()/deactivate() — adds/removes canvas pointer listeners.
 *   2. Raycast pick — on pointerdown over a recognised object, call
 *      selection.select(id). Clicking empty space deselects.
 *   3. applyTransform(id, patch) — the API the 003 inspector calls.
 *      Validates bounds, applies via the adapter, pushes a CommandStack
 *      entry, and commits to state.islandLayout.
 *   4. Coarse-move drag — pointer-drag the selected object across the
 *      plateau (ground-plane projection, same pattern as Sprouts.js).
 *      Suppresses camera.controls during drag; commits on release inside
 *      bounds, snaps back on out-of-bounds release.
 *   5. Subscribe to objectUpdated — keeps mesh in sync when layout changes
 *      from the outside (undo, inspector).
 *
 * NOT active by default. Plan 003 calls activate(). Exposed via
 * window.__islandEditor in dev for pre-UI testing (see View.js).
 *
 * No 3D gizmo — transforms are numeric (003 inspector) + ground-plane
 * drag for coarse move. This makes the core unit-testable without WebGL.
 */

import * as THREE from 'three'
import { buildEditableViews } from './editableViews.js'
import Selection from './Selection.js'
import CommandStack from './CommandStack.js'

// Drag lift while held — slight visual separation from terrain.
const DRAG_LIFT = 0.15

export default class EditController
{
    /**
     * @param {{
     *   view:  import('../View.js').default,
     *   state: import('../../State/State.js').default,
     * }} params
     */
    constructor({ view, state })
    {
        this._view  = view
        this._state = state

        this._island  = state.island
        this._camera  = view.camera
        this._scene   = view.scene

        this.editableViews = buildEditableViews(view, this._island, state.islandLayout)
        this.selection     = new Selection(this._scene)
        this.commandStack  = new CommandStack()

        this._active = false

        // Raycast helpers (reused per event)
        this._raycaster = new THREE.Raycaster()
        this._pointer   = new THREE.Vector2()

        // Drag state — non-null while a drag is in-flight.
        // @type {{ id: string, kind: string, group: THREE.Object3D,
        //          originPos: THREE.Vector3, originScale: number,
        //          originYaw: number, liftHeight: number,
        //          valid: boolean, pointerId: number } | null}
        this._drag = null
        this._dragGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

        // Bound event handlers
        this._onPointerDown = (e) => this._handlePointerDown(e)
        this._onPointerMove = (e) => this._handlePointerMove(e)
        this._onPointerUp   = (e) => this._handlePointerUp(e)

        this._canvasEl = view.renderer?.instance?.domElement ?? null

        // Subscribe to layout mutations so meshes stay in sync when layout
        // changes come from undo, the inspector, or external callers.
        this._unsubLayout = this._state.islandLayout?.subscribe((event) =>
        {
            if(event.type === 'objectUpdated')
            {
                this._syncMesh(event.object)
                return
            }

            // Structural events — reconcile the appropriate view kind.
            if(event.type === 'objectAdded' || event.type === 'objectRemoved' || event.type === 'layoutReplaced')
            {
                this._reconcileAfterStructural(event)
            }
        })
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Activate the editor. Called by the 003 panel when #editor is open.
     * Adds the canvas pointer-down listener.
     */
    activate()
    {
        if(this._active) return
        this._active = true
        if(this._canvasEl)
        {
            this._canvasEl.addEventListener('pointerdown', this._onPointerDown)
        }
    }

    /**
     * Deactivate the editor. Removes listeners, cancels any in-flight drag,
     * restores camera.controls.
     */
    deactivate()
    {
        if(!this._active) return
        this._active = false
        if(this._drag) this._cancelDrag()
        if(this._canvasEl)
        {
            this._canvasEl.removeEventListener('pointerdown', this._onPointerDown)
        }
        this._restoreControls()
    }

    /**
     * Dispose everything. Called from View.dispose().
     * Always restores camera.controls.enabled regardless of active state.
     */
    dispose()
    {
        if(this._drag) this._cancelDrag()
        if(this._canvasEl)
        {
            this._canvasEl.removeEventListener('pointerdown', this._onPointerDown)
            this._canvasEl.removeEventListener('pointermove', this._onPointerMove)
            this._canvasEl.removeEventListener('pointerup',   this._onPointerUp)
        }
        this._active = false
        // Always restore controls — dispose may be called with controls stuck
        // false from a drag or external manipulation.
        this._restoreControls()
        if(this._unsubLayout)
        {
            try { this._unsubLayout() } catch(_) {}
            this._unsubLayout = null
        }
        this.selection.dispose()
        this.commandStack.clear()
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Apply a partial transform `{ x?, z?, yaw?, scale? }` to the object
     * with the given layout id.
     *
     * - Validates XZ against isPlaceable (if x or z are changing).
     * - Applies the mesh transform via the adapter.
     * - Pushes an undo-able command onto the command stack.
     * - Commits to state.islandLayout.updateObject (y always derived).
     *
     * @param {string} id
     * @param {{ x?: number, z?: number, yaw?: number, scale?: number }} patch
     * @returns {boolean} false if rejected (not placeable, unknown id, etc.)
     */
    applyTransform(id, patch)
    {
        if(typeof id !== 'string' || !patch || typeof patch !== 'object') return false

        const layout = this._state.islandLayout
        const current = layout?.get(id)
        if(!current) return false

        const kind    = current.kind
        const adapter = this.editableViews[kind]
        if(!adapter) return false

        // Compute new XZ (patch may be partial).
        const newX = typeof patch.x === 'number' ? patch.x : current.x
        const newZ = typeof patch.z === 'number' ? patch.z : current.z

        // Placeable check only when position is changing.
        const posChanging = typeof patch.x === 'number' || typeof patch.z === 'number'
        if(posChanging && !this._island.isPlaceable(newX, newZ)) return false

        // Snapshot before state for undo.
        const before = {
            x:     current.x,
            z:     current.z,
            yaw:   current.yaw,
            scale: current.scale,
        }
        const after = {
            x:     newX,
            z:     newZ,
            yaw:   typeof patch.yaw   === 'number' ? patch.yaw   : current.yaw,
            scale: typeof patch.scale === 'number' ? patch.scale : current.scale,
        }

        // Apply live to mesh.
        adapter.applyTransform(id, after)

        // Update highlight if this is the selected object.
        if(this.selection.get() === id)
        {
            const obj3d = adapter.getObject3D(id)
            if(obj3d) this.selection.update(obj3d)
        }

        // Commit to layout slice (y omitted — derived by heightAt in the view).
        layout.updateObject(id, after)

        // Push undo entry.
        this.commandStack.push({
            do:   () => { adapter.applyTransform(id, after);  layout.updateObject(id, after) },
            undo: () => { adapter.applyTransform(id, before); layout.updateObject(id, before) },
        })

        return true
    }

    // ── Private: pick ─────────────────────────────────────────────────────────

    _handlePointerDown(e)
    {
        if(!this._active) return
        if(e.button !== 0) return   // left-button only

        const camera = this._camera?.instance
        if(!camera || !this._canvasEl) return

        const rect = this._canvasEl.getBoundingClientRect()
        this._pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
        this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this._raycaster.setFromCamera(this._pointer, camera)

        // Collect all hit targets across all kinds.
        const targets = []
        for(const adapter of Object.values(this.editableViews))
        {
            for(const t of adapter.hitTargets()) targets.push(t)
        }

        const intersects = this._raycaster.intersectObjects(targets, true)
        const hit = intersects[0]

        if(!hit)
        {
            this.selection.deselect()
            return
        }

        // Walk up to find which adapter group was hit and resolve its layout id.
        const resolved = this._resolveHit(hit.object)
        if(!resolved)
        {
            this.selection.deselect()
            return
        }

        const { id, kind } = resolved
        const adapter = this.editableViews[kind]
        const obj3d   = adapter?.getObject3D(id)

        this.selection.select(id, obj3d)

        // Start coarse-move drag.
        this._startDrag(e, id, kind, obj3d)

        e.preventDefault?.()
    }

    // ── Private: drag ─────────────────────────────────────────────────────────

    _startDrag(e, id, kind, group)
    {
        if(!group) return
        const layout = this._state.islandLayout
        const current = layout?.get(id)
        if(!current) return

        const originX   = group.position.x
        const originZ   = group.position.z
        const originY   = group.position.y
        const originYaw   = group.rotation.y
        const originScale = group.scale.x

        const pickupGroundY = this._island.heightAt(originX, originZ)
        const liftHeight    = pickupGroundY + DRAG_LIFT

        // Set the ground plane constant so the cursor projects correctly.
        this._dragGroundPlane.constant = -liftHeight

        this._drag = {
            id,
            kind,
            group,
            originPos:   new THREE.Vector3(originX, originY, originZ),
            originYaw,
            originScale,
            liftHeight,
            valid:       true,
            pointerId:   e.pointerId,
            // snapshot for undo
            before: { x: current.x, z: current.z, yaw: current.yaw, scale: current.scale },
        }

        // Lift the mesh visually.
        group.position.y = liftHeight

        if(this._camera?.controls) this._camera.controls.enabled = false

        if(this._canvasEl)
        {
            try { this._canvasEl.setPointerCapture?.(e.pointerId) } catch(_) {}
            this._canvasEl.addEventListener('pointermove', this._onPointerMove)
            this._canvasEl.addEventListener('pointerup',   this._onPointerUp)
        }
    }

    _handlePointerMove(e)
    {
        const drag = this._drag
        if(!drag) return

        const camera = this._camera?.instance
        if(!camera || !this._canvasEl) return

        const rect = this._canvasEl.getBoundingClientRect()
        this._pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
        this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this._raycaster.setFromCamera(this._pointer, camera)

        const hit = new THREE.Vector3()
        const intersected = this._raycaster.ray.intersectPlane(this._dragGroundPlane, hit)
        if(!intersected) return

        const x = hit.x
        const z = hit.z

        // Route through the kind's adapter live-move (keeps InstancedMesh
        // leaf clouds in sync for trees, etc.).
        const adapter = this.editableViews[drag.kind]
        if(adapter)
        {
            adapter.applyTransform(drag.id, { x, z, yaw: drag.group.rotation.y })
            drag.group.position.y = drag.liftHeight
        }
        else
        {
            drag.group.position.set(x, drag.liftHeight, z)
        }

        drag.valid = this._island.isPlaceable(x, z)

        // Update highlight ring to follow.
        if(this.selection.get() === drag.id) this.selection.update(drag.group)
    }

    _handlePointerUp(e)
    {
        this._finishDrag(e)
    }

    _finishDrag(e)
    {
        const drag = this._drag
        if(!drag) return
        this._drag = null

        if(this._canvasEl)
        {
            try { this._canvasEl.releasePointerCapture?.(e?.pointerId ?? drag.pointerId) } catch(_) {}
            this._canvasEl.removeEventListener('pointermove', this._onPointerMove)
            this._canvasEl.removeEventListener('pointerup',   this._onPointerUp)
        }

        this._restoreControls()

        const adapter = this.editableViews[drag.kind]

        if(drag.valid)
        {
            const finalX = drag.group.position.x
            const finalZ = drag.group.position.z

            // Snap to ground (remove the lift).
            if(adapter) adapter.applyTransform(drag.id, { x: finalX, z: finalZ })
            else drag.group.position.set(finalX, this._island.heightAt(finalX, finalZ), finalZ)

            // Commit to layout (y not stored — always heightAt).
            const after  = { x: finalX, z: finalZ, yaw: drag.group.rotation.y, scale: drag.group.scale.x }
            const before = drag.before
            const id     = drag.id
            const layout = this._state.islandLayout

            layout?.updateObject(id, { x: finalX, z: finalZ })

            // Push undo entry for the drag.
            this.commandStack.push({
                do:   () => { adapter?.applyTransform(id, after);  layout?.updateObject(id, after) },
                undo: () => { adapter?.applyTransform(id, before); layout?.updateObject(id, before) },
            })
        }
        else
        {
            // Snap back — restore visual without touching the layout.
            const { originPos, originYaw, originScale } = drag
            if(adapter)
            {
                adapter.applyTransform(drag.id, {
                    x:     originPos.x,
                    z:     originPos.z,
                    yaw:   originYaw,
                    scale: originScale,
                })
            }
            else
            {
                drag.group.position.copy(originPos)
                drag.group.rotation.y = originYaw
                drag.group.scale.setScalar(originScale)
            }
        }

        // Refresh selection highlight.
        if(this.selection.get() === drag.id) this.selection.update(drag.group)
    }

    _cancelDrag()
    {
        const drag = this._drag
        if(!drag) return
        this._drag = null

        if(this._canvasEl)
        {
            this._canvasEl.removeEventListener('pointermove', this._onPointerMove)
            this._canvasEl.removeEventListener('pointerup',   this._onPointerUp)
        }

        this._restoreControls()

        const adapter = this.editableViews[drag.kind]
        const { originPos, originYaw, originScale } = drag

        if(adapter)
        {
            adapter.applyTransform(drag.id, {
                x:     originPos.x,
                z:     originPos.z,
                yaw:   originYaw,
                scale: originScale,
            })
        }
        else
        {
            drag.group.position.copy(originPos)
            drag.group.rotation.y = originYaw
            drag.group.scale.setScalar(originScale)
        }
    }

    _restoreControls()
    {
        try
        {
            if(this._camera?.controls) this._camera.controls.enabled = true
        }
        catch(_) {}
    }

    // ── Private: hit resolution ───────────────────────────────────────────────

    /**
     * Walk up the scene graph from the intersected object to find which
     * adapter group it belongs to. Returns `{ id, kind }` or null.
     *
     * Strategy: for each kind, check if the hit object (or any of its ancestors
     * up to adapter.hitTargets()) matches one of the known groups, then resolve
     * the layout id by reverse-looking up the adapter record.
     *
     * @param {THREE.Object3D} hitObject
     * @returns {{ id: string, kind: string } | null}
     */
    _resolveHit(hitObject)
    {
        // Tree entries
        const tree = this._view.tree
        if(tree?.entries)
        {
            for(const entry of tree.entries)
            {
                if(entry.group && this._isDescendant(hitObject, entry.group))
                {
                    if(entry.layoutId) return { id: entry.layoutId, kind: 'tree' }
                }
            }
        }

        // Flower entries
        const flowers = this._view.flowers
        if(flowers?.flowers)
        {
            for(const f of flowers.flowers)
            {
                if(f.group && this._isDescendant(hitObject, f.group))
                {
                    if(f.layoutId) return { id: f.layoutId, kind: 'flower' }
                }
            }
        }

        // Fruit entries
        const fruits = this._view.fruits
        if(fruits?.entries)
        {
            for(const entry of fruits.entries)
            {
                if(entry.group && this._isDescendant(hitObject, entry.group))
                {
                    if(entry.layoutId) return { id: entry.layoutId, kind: 'fruit' }
                }
            }
        }

        // Mailbox — singleton; layout id is 'mailbox-0'
        const mailbox = this._view.mailbox
        if(mailbox?.group && this._isDescendant(hitObject, mailbox.group))
        {
            return { id: 'mailbox-0', kind: 'mailbox' }
        }

        // Telescope — singleton; layout id is 'telescope-0'
        const telescope = this._view.telescope
        if(telescope?.group && this._isDescendant(hitObject, telescope.group))
        {
            return { id: 'telescope-0', kind: 'telescope' }
        }

        return null
    }

    /**
     * True if `node` is `ancestor` or a descendant of it.
     *
     * @param {THREE.Object3D} node
     * @param {THREE.Object3D} ancestor
     */
    _isDescendant(node, ancestor)
    {
        let cur = node
        while(cur)
        {
            if(cur === ancestor) return true
            cur = cur.parent
        }
        return false
    }

    // ── Private: reactive sync ────────────────────────────────────────────────

    /**
     * Called when objectUpdated fires (e.g. from undo or an external
     * inspector write). Syncs the mesh to the new layout state.
     *
     * @param {{ id: string, kind: string, x: number, z: number, yaw: number, scale: number }} obj
     */
    _syncMesh(obj)
    {
        const adapter = this.editableViews[obj.kind]
        if(!adapter) return
        try
        {
            adapter.applyTransform(obj.id, {
                x:     obj.x,
                z:     obj.z,
                yaw:   obj.yaw,
                scale: obj.scale,
            })
        }
        catch(err) { console.warn('[EditController] _syncMesh threw', err) }
    }

    /**
     * Called when objectAdded / objectRemoved / layoutReplaced fires.
     * Reconciles the affected view kind(s) via ensureFromLayout.
     *
     * @param {{ type: string, object?: { kind: string }, kind?: string }} event
     */
    _reconcileAfterStructural(event)
    {
        const layout = this._state.islandLayout
        if(!layout) return

        // Determine which kinds to reconcile.
        const kindsToReconcile = new Set()

        if(event.type === 'layoutReplaced')
        {
            // All editable kinds.
            for(const k of ['tree', 'flower', 'fruit', 'mailbox', 'telescope']) kindsToReconcile.add(k)
        }
        else if(event.object?.kind)
        {
            kindsToReconcile.add(event.object.kind)
        }

        for(const kind of kindsToReconcile)
        {
            const objs = layout.listByKind(kind)
            try
            {
                // Trees and flowers/fruits have ensureFromLayout.
                if(kind === 'tree')
                {
                    this._view.tree?.ensureFromLayout?.(objs)
                }
                else if(kind === 'flower')
                {
                    this._view.flowers?.ensureFromLayout?.(objs)
                }
                else if(kind === 'fruit')
                {
                    this._view.fruits?.ensureFromLayout?.(objs)
                }
                else if(kind === 'mailbox')
                {
                    const obj = objs[0]
                    if(obj) this._view.mailbox?.move?.(obj.x, obj.z)
                }
                else if(kind === 'telescope')
                {
                    const obj = objs[0]
                    if(obj) this._view.telescope?.move?.(obj.x, obj.z)
                }
            }
            catch(err)
            {
                console.warn(`[EditController] reconcile threw for kind=${kind}`, err)
            }
        }
    }
}
