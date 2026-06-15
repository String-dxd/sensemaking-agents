/**
 * Selection — tracks the currently selected island-layout object and
 * renders a lightweight highlight around it.
 *
 * Highlight strategy: a THREE.BoxHelper wraps the object's bounding box.
 * The helper is cheap (one LineSegments draw call) and doesn't require
 * WebGL extensions. A ground-ring mesh provides additional affordance at
 * foot level.
 *
 * Change callbacks: a Set of functions called whenever the selection
 * changes (deselect also calls them with null). Used by the 003 inspector.
 */

import * as THREE from 'three'

const HIGHLIGHT_COLOR = 0x00d4ff   // cyan — distinct from any island palette

export default class Selection
{
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene)
    {
        this._scene = scene
        /** @type {string | null} */
        this._id = null
        /** @type {THREE.BoxHelper | null} */
        this._helper = null
        /** @type {THREE.Mesh | null} */
        this._ring = null
        /** @type {Set<(id: string | null) => void>} */
        this._callbacks = new Set()
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Select an object by layout id.  Replaces any existing selection.
     *
     * @param {string} id
     * @param {THREE.Object3D} object3d
     */
    select(id, object3d)
    {
        this._disposeHighlight()
        this._id = id

        if(object3d)
        {
            // BoxHelper around the object.
            const helper = new THREE.BoxHelper(object3d, HIGHLIGHT_COLOR)
            this._scene.add(helper)
            this._helper = helper

            // Ground ring at the object's XZ position.
            const pos = new THREE.Vector3()
            object3d.getWorldPosition(pos)
            const ringGeo  = new THREE.RingGeometry(0.35, 0.42, 32)
            const ringMat  = new THREE.MeshBasicMaterial({
                color: HIGHLIGHT_COLOR,
                side:  THREE.DoubleSide,
                opacity:     0.6,
                transparent: true,
            })
            const ring = new THREE.Mesh(ringGeo, ringMat)
            ring.rotation.x = -Math.PI / 2
            ring.position.set(pos.x, pos.y + 0.02, pos.z)
            this._scene.add(ring)
            this._ring = ring
        }

        this._notify()
    }

    /** Clear the selection. */
    deselect()
    {
        if(this._id === null) return
        this._id = null
        this._disposeHighlight()
        this._notify()
    }

    /**
     * Returns the currently selected layout id, or null.
     * @returns {string | null}
     */
    get()
    {
        return this._id
    }

    /**
     * Update the highlight to track the object's current position
     * (called each frame or after a transform).
     *
     * @param {THREE.Object3D} object3d
     */
    update(object3d)
    {
        if(!object3d) return
        if(this._helper) this._helper.update()
        if(this._ring)
        {
            const pos = new THREE.Vector3()
            object3d.getWorldPosition(pos)
            this._ring.position.set(pos.x, pos.y + 0.02, pos.z)
        }
    }

    /**
     * Subscribe to selection changes. Callback receives the new layout id
     * (string) or null on deselect. Returns unsubscribe function.
     *
     * @param {(id: string | null) => void} cb
     * @returns {() => void}
     */
    onChange(cb)
    {
        this._callbacks.add(cb)
        return () => this._callbacks.delete(cb)
    }

    /** Dispose highlight objects and remove from scene. */
    dispose()
    {
        this._id = null
        this._disposeHighlight()
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _disposeHighlight()
    {
        if(this._helper)
        {
            try { this._scene?.remove(this._helper) } catch(_) {}
            try { this._helper.geometry?.dispose?.() } catch(_) {}
            this._helper = null
        }
        if(this._ring)
        {
            try { this._scene?.remove(this._ring) } catch(_) {}
            try { this._ring.geometry?.dispose?.() } catch(_) {}
            try { this._ring.material?.dispose?.() } catch(_) {}
            this._ring = null
        }
    }

    _notify()
    {
        for(const cb of this._callbacks)
        {
            try { cb(this._id) } catch(err) { console.warn('[Selection] callback threw', err) }
        }
    }
}
