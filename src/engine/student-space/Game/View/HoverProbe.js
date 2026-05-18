import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import OverlayController from './OverlayController.js'

/**
 * HoverProbe — continuous raycast on pointer-move (desktop) and pointer-up
 * (touch), maintaining a single `hoveredTarget` of shape
 *   { kind, index, species?, group, x, z }
 *
 * On hover change it:
 *   - flips the canvas cursor to `pointer`
 *   - parks a soft 3D ring on the ground at the element's base, scaled to
 *     the element's footprint, so the student gets an unmistakable "this
 *     is clickable" signifier
 *   - tells HoverCta to show a small floating chip near the element with
 *     the per-species identity + an Open verb
 *
 * On a click (filtered to ignore camera drags), it forwards the target to
 * `view.facetView.openFor(target)` which renders the compact card.
 *
 * Butterflies are excluded for v1.1 — they move and the small target makes
 * hit detection unreliable; we'll layer them in once the hover-ring code
 * for billboards is settled.
 */
const RING_COLOR = 0xFFE9C2     // soft warm-ink — matches DESIGN.md ink-on-cream
const RING_PULSE_HZ = 0.9       // gentle attention pulse

export default class HoverProbe
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.camera = this.view.camera.instance
        this.dom = this.view.renderer.instance.domElement

        this.ray = new THREE.Raycaster()
        this.pointer = new THREE.Vector2()
        this.tempScreen = new THREE.Vector3()

        this.hovered = null   // { kind, index, species, group, x, z }
        this.lastHovered = null
        this.enabled = true

        this._buildRing()
        this._bindPointer()
    }

    setEnabled(on)
    {
        this.enabled = !!on
        if(!on) this._setHover(null)
    }

    _buildRing()
    {
        // RingGeometry creates a flat annulus in XY plane; rotate to lie on
        // the ground (XZ) and lift a hair so it doesn't z-fight grass.
        const geo = new THREE.RingGeometry(0.42, 0.55, 36, 1)
        geo.rotateX(-Math.PI / 2)
        const mat = new THREE.MeshBasicMaterial({
            color: RING_COLOR,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
        this.ring = new THREE.Mesh(geo, mat)
        this.ring.renderOrder = 5
        this.ring.visible = false
        this.scene.add(this.ring)
    }

    _bindPointer()
    {
        // Desktop hover — pointermove. Throttled by requestAnimationFrame in
        // the View update loop instead; here we just stash the latest event
        // coords and re-raycast at update time.
        this._latestPointer = null
        // Listener refs held on `this` for dispose(). The dom (canvas) is
        // torn down by Renderer.dispose(), but the document.pointerdown
        // survives Renderer teardown and would keep this whole probe alive.
        this._onPointerMove = (event) =>
        {
            this._latestPointer = { x: event.clientX, y: event.clientY, type: event.pointerType }
        }
        this.dom.addEventListener('pointermove', this._onPointerMove)

        this._onPointerLeave = () =>
        {
            this._latestPointer = null
            this._setHover(null)
        }
        this.dom.addEventListener('pointerleave', this._onPointerLeave)

        // Click pick — re-uses FacetView's existing drag-guard pattern so
        // OrbitControls drags don't fire pick events.
        let downX = 0, downY = 0
        this._onDomPointerDown = (event) =>
        {
            downX = event.clientX
            downY = event.clientY
        }
        this.dom.addEventListener('pointerdown', this._onDomPointerDown)

        this._onPointerUp = (event) =>
        {
            const dx = event.clientX - downX
            const dy = event.clientY - downY
            if(Math.hypot(dx, dy) > 6) return

            // Touch: pointerup also acts as hover input (since touch has no
            // hover). Re-pick at the up position so a tap lands on what was
            // visually beneath the finger.
            const hit = this._pick(event.clientX, event.clientY)
            if(hit)
            {
                // On touch, first tap shows the chip; second tap on the chip
                // opens the dialogue. Desktop with hover already has the chip
                // visible, so any click on the element is a confirmed pick.
                if(event.pointerType === 'touch' && (!this.lastHovered ||
                   this.lastHovered.group !== hit.group))
                {
                    this._setHover(hit)
                    return
                }
                this._setHover(hit)
                        // Pick handoff. ObjectPeek owns the two-step "peek, then
                // companion" interaction for flowers + mailbox + telescope.
                // Everything else (kira, trees, fruits) still routes
                // through KiraNarrator's single-bubble AC dialogue.
                if(this.view.objectPeek && this.view.objectPeek.canHandle(hit))
                {
                    this.view.objectPeek.open(hit)
                }
                else if(this.view.kiraNarrator)
                {
                    this.view.kiraNarrator.narrate(hit)
                }
                else
                {
                    this.view.facetView.openFor(hit)
                }
            }
            else
            {
                // Tap on empty space dismisses chip + ring.
                this._setHover(null)
            }
        }
        this.dom.addEventListener('pointerup', this._onPointerUp)

        // Tap outside the canvas (DOM CTA, etc) — dismiss hover.
        this._onDocPointerDown = (event) =>
        {
            // If the tap is inside the CTA chip, the chip handles it.
            // If it's outside both canvas and CTA, clear hover.
            const onCanvas = event.target === this.dom
            const onChip   = !!event.target.closest?.('.hover-cta')
            const onCard   = !!event.target.closest?.('.facet-view')
            if(!onCanvas && !onChip && !onCard) this._setHover(null)
        }
        document.addEventListener('pointerdown', this._onDocPointerDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Detaches the document-
     * level pointerdown listener (the leak that outlives Renderer.dispose),
     * removes the canvas listeners, drops the hover ring from the scene
     * and disposes its geometry + material.
     */
    dispose()
    {
        if(this._onDocPointerDown)
        {
            try { document.removeEventListener('pointerdown', this._onDocPointerDown) } catch(_) {}
            this._onDocPointerDown = null
        }
        if(this.dom)
        {
            if(this._onPointerMove)    { try { this.dom.removeEventListener('pointermove', this._onPointerMove) }   catch(_) {} }
            if(this._onPointerLeave)   { try { this.dom.removeEventListener('pointerleave', this._onPointerLeave) } catch(_) {} }
            if(this._onDomPointerDown) { try { this.dom.removeEventListener('pointerdown', this._onDomPointerDown) } catch(_) {} }
            if(this._onPointerUp)      { try { this.dom.removeEventListener('pointerup', this._onPointerUp) }       catch(_) {} }
        }
        this._onPointerMove = null
        this._onPointerLeave = null
        this._onDomPointerDown = null
        this._onPointerUp = null
        if(this.ring)
        {
            try { this.scene?.remove?.(this.ring) } catch(_) {}
            try { this.ring.geometry?.dispose?.() } catch(_) {}
            try { this.ring.material?.dispose?.() } catch(_) {}
            this.ring = null
        }
        this.hovered = null
        this.lastHovered = null
        this._latestPointer = null
        this.enabled = false
    }

    update()
    {
        if(!this.enabled || !this.ring) return    // post-dispose tick guard

        // Continuous hover ray each frame using the latest pointer coords.
        if(this._latestPointer)
        {
            const hit = this._pick(this._latestPointer.x, this._latestPointer.y)
            // Only mouse moves drive hover; touch goes through pointerup.
            if(this._latestPointer.type !== 'touch')
                this._setHover(hit)
        }

        // Pulse the ring opacity so it draws the eye without strobing.
        if(this.hovered)
        {
            const t = this.state.time.elapsed
            const pulse = 0.55 + 0.25 * Math.sin(t * Math.PI * 2 * RING_PULSE_HZ)
            this.ring.material.opacity = pulse
        }

        // Keep CTA chip glued to the element's screen position.
        if(this.hovered && this.view.hoverCta)
        {
            const pos = this._screenPos(this.hovered)
            this.view.hoverCta.setAnchor(pos.x, pos.y)
        }
    }

    _pick(clientX, clientY)
    {
        const rect = this.dom.getBoundingClientRect()
        this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
        this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
        this.ray.setFromCamera(this.pointer, this.camera)

        // Order: smallest hit targets first (telescope → mailbox → kira →
        // fruits → flowers → trees) so small high-priority targets win
        // against the big foliage canopy behind them. Fruits sit ahead of
        // trees so a fruit hanging on a tree picks as the fruit, not the
        // tree.
        const telescopeGroup = this.view.telescope?.group
        if(telescopeGroup)
        {
            const telescopeHit = this.ray.intersectObject(telescopeGroup, true)[0]
            if(telescopeHit)
            {
                return {
                    kind:  'telescope',
                    group: telescopeGroup,
                    x:     telescopeGroup.position.x,
                    z:     telescopeGroup.position.z,
                }
            }
        }
        const mailboxGroup = this.view.mailbox?.group
        if(mailboxGroup)
        {
            const mailboxHit = this.ray.intersectObject(mailboxGroup, true)[0]
            if(mailboxHit)
            {
                return {
                    kind:  'mailbox',
                    group: mailboxGroup,
                    x:     mailboxGroup.position.x,
                    z:     mailboxGroup.position.z,
                }
            }
        }

        const kiraGroup = this.view.kira.group
        const kiraHit = this.ray.intersectObject(kiraGroup, true)[0]
        if(kiraHit)
        {
            return { kind: 'kira', group: kiraGroup, x: kiraGroup.position.x, z: kiraGroup.position.z }
        }

        const fruits = this.view.fruits?.entries ?? []
        for(const f of fruits)
        {
            const hit = this.ray.intersectObject(f.group, true)[0]
            if(hit)
            {
                return {
                    kind:    'fruit',
                    group:   f.group,
                    index:   f.index,
                    species: f.species,
                    host:    f.host,
                    x: f.x, z: f.z,
                }
            }
        }

        for(const f of this.view.flowers.flowers)
        {
            const hit = this.ray.intersectObject(f.group, true)[0]
            if(hit)
            {
                return {
                    kind: 'flower',
                    group: f.group,
                    index: f.index,
                    species: f.species,
                    x: f.x, z: f.z,
                }
            }
        }
        for(const e of this.view.tree.entries)
        {
            const hit = this.ray.intersectObject(e.group, true)[0]
            if(hit)
            {
                return {
                    kind: 'tree',
                    group: e.group,
                    index: e.index,
                    species: e.species,
                    x: e.x, z: e.z,
                }
            }
        }
        return null
    }

    _setHover(target)
    {
        const sameAsLast = this._sameTarget(target, this.hovered)
        if(sameAsLast) return

        this.hovered = target
        this.lastHovered = target

        if(target)
        {
            this.dom.style.cursor = 'pointer'

            // Park the ground ring at the element's base. Scale to a hint
            // appropriate to element size (trees footprint > flower > Kira).
            const ringScale = target.kind === 'tree'      ? 1.6
                            : target.kind === 'flower'    ? 0.65
                            : target.kind === 'fruit'     ? 0.55
                            : target.kind === 'kira'      ? 1.0
                            : target.kind === 'mailbox'   ? 0.85
                            : target.kind === 'telescope' ? 0.7
                            : 1.0
            const groundY = this.state.island.heightAt(target.x ?? 0, target.z ?? 0)
            this.ring.position.set(target.x ?? 0, groundY + 0.02, target.z ?? 0)
            this.ring.scale.setScalar(ringScale)
            this.ring.visible = true

            if(this.view.hoverCta)
            {
                const pos = this._screenPos(target)
                this.view.hoverCta.showFor(target, pos.x, pos.y)
            }
        }
        else
        {
            this.dom.style.cursor = ''
            this.ring.visible = false
            this.ring.material.opacity = 0
            if(this.view.hoverCta) this.view.hoverCta.hide()
        }
    }

    _sameTarget(a, b)
    {
        if(a === b) return true
        if(!a || !b) return false
        return a.kind === b.kind && a.index === b.index && a.group === b.group
    }

    _screenPos(target)
    {
        // Project element world-pos to screen. For trees we lift to roughly
        // canopy height so the chip floats above the foliage rather than at
        // the trunk base; flowers + Kira + mailbox sit at element-top.
        const lift = target.kind === 'tree'      ? 1.8
                    : target.kind === 'kira'      ? 0.5
                    : target.kind === 'flower'    ? 0.25
                    : target.kind === 'fruit'     ? (target.host === 'bush' ? 0.35 : 1.6)
                    : target.kind === 'mailbox'   ? 1.35
                    : target.kind === 'telescope' ? 1.0
                    : 0
        this.tempScreen.set(target.x ?? 0,
                            this.state.island.heightAt(target.x ?? 0, target.z ?? 0) + lift,
                            target.z ?? 0)
        this.tempScreen.project(this.camera)

        const rect = this.dom.getBoundingClientRect()
        const x = (this.tempScreen.x * 0.5 + 0.5) * rect.width + rect.left
        const y = (-this.tempScreen.y * 0.5 + 0.5) * rect.height + rect.top
        return { x, y }
    }
}
