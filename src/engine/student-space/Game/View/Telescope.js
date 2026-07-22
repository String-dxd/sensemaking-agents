import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildPlaceholderBlock } from './placeholderBlock.ts'

/**
 * Telescope — small prop on the NE rim of the plateau, tube pitched up at
 * the sky. Mirrors Mailbox.js in shape: a simple low-poly model parented to
 * a Group placed at the ground height under its XZ. HoverProbe picks it via
 * the group, KiraNarrator delivers a short line on click, and the CTA opens
 * the TrajectorySheet (overlay key 'trajectory').
 *
 * Palette stays in the v1 painterly band — warm brass tube, dark wood eyepiece,
 * pale tripod legs, matching the cream/sand-ink range of the island.
 */

// Rim coords. Plateau radius is 5.0; we sit at r ≈ 4.85 so the prop reads
// as standing on grass right at the rim. θ ≈ 1.30 rad ≈ NE.
const RIM_THETA  = 1.30
const RIM_RADIUS = 4.85
const TUBE_PITCH = Math.PI * 0.30   // ~54° above horizontal; aimed at the sky
// Tube yaw is set so the eyepiece faces inward (toward the island centre)
// and the long lens end points out over the ocean.
const TUBE_YAW   = Math.PI * 0.45

export default class Telescope
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        // Base placement is driven by the IslandLayout slice; fallback to the
        // authored rim constants so the constructor never throws if the slice is
        // not yet available (e.g. during isolated unit tests).
        const _telescopePlacement = this.state.islandLayout?.get('telescope-0')
        const x = _telescopePlacement ? _telescopePlacement.x : Math.cos(RIM_THETA) * RIM_RADIUS
        const z = _telescopePlacement ? _telescopePlacement.z : Math.sin(RIM_THETA) * RIM_RADIUS
        const groundY = this.island.heightAt(x, z)
        this.position = { x, y: groundY, z }

        this.group = new THREE.Group()
        this.group.position.set(x, groundY, z)
        // Whole prop yawed so the tripod's "front leg" points outward — the
        // model reads naturally from the default camera framing.
        this.group.rotation.y = Math.atan2(-x, -z) + Math.PI / 2
        this.scene.add(this.group)

        this._build()
    }

    _build()
    {
        // GREY PLACEHOLDER (world-port U7, R7): the telescope has no editor
        // asset yet, so it renders as a deliberately conspicuous grey block.
        // The raycast group, per-kind peek anchor lift (~1.0), move() API,
        // onboarding hide, and the idle headPivot sway all survive — only the
        // model is interim.
        const block = buildPlaceholderBlock({ width: 0.4, height: 0.7, depth: 0.4 })
        this.group.add(block.group)

        // A pitched top block keeps the "tube aimed at the sky" silhouette
        // hint and preserves the headPivot sway coupling in update().
        const headPivot = new THREE.Group()
        headPivot.position.y = 0.75
        headPivot.rotation.y = TUBE_YAW
        headPivot.rotation.x = -TUBE_PITCH
        const tube = buildPlaceholderBlock({ width: 0.14, height: 0.14, depth: 0.8 })
        tube.group.position.y = -0.07
        headPivot.add(tube.group)
        this.group.add(headPivot)

        this.headPivot = headPivot
    }

    /**
     * Pick-and-plant: relocate the telescope to a new (x, z). `opts.y` is
     * the lift-plane height during a drag; on release we snap to ground.
     */
    move(x, z, opts = {})
    {
        if(!this.group) return
        const groundY = this.island?.heightAt?.(x, z) ?? 0
        const y = (typeof opts.y === 'number') ? opts.y : groundY
        this.group.position.set(x, y, z)
    }

    /**
     * Onboarding mode toggle. Hides the telescope during the ceremony so
     * the empty island reads cleanly. Idempotent.
     */
    setOnboardingMode(on)
    {
        if(!this.group) return
        this.group.visible = !on
    }

    /**
     * Tear-down hook. Removes the prop group from the scene and disposes
     * its geometries + materials so GPU buffers release.
     */
    dispose()
    {
        if(this.group)
        {
            try { this.scene?.remove?.(this.group) } catch(_) {}
            this.group.traverse((node) =>
            {
                if(node.geometry) { try { node.geometry.dispose() } catch(_) {} }
                if(node.material) { try { node.material.dispose() } catch(_) {} }
            })
            this.group = null
        }
        this.headPivot = null
    }

    update()
    {
        if(!this.group) return    // post-dispose tick
        // Tiny breeze sway on the tube — under 1Hz, well inside the locked
        // motion envelope. Pitch is anchored; only yaw oscillates lightly so
        // the telescope reads as planted, not animatronic.
        const t = this.state.time?.elapsed ?? 0
        const sway = Math.sin(t * 0.45) * 0.012
        if(this.headPivot) this.headPivot.rotation.z = sway
    }
}
