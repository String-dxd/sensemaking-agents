import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import Debug from '../Debug/Debug.js'
import { BLADES_PER_CELL, fillGrassBlades } from '../State/islandSpecCore/grassField.ts'
import { createGrassBladeMaterial } from './Materials/GrassBladeMaterial.ts'

/**
 * Grass view — the editor's painted-cell BOTW meadow (world-port U5).
 * Replaces Bruno's plateau-wide grass and its 256² terrain DataTexture: blades
 * render EXACTLY the spec's painted grass cells (WYSIWYG with the editor, no
 * auto-painting), in one instanced draw call.
 *
 * Blade transforms come from the pure `fillGrassBlades` scatter (jittered past
 * cell borders so painted regions interlock, terrain-height-following,
 * water- and cliff-clipped), written straight into the instanced attributes.
 * Wind is entirely vertex-shader-side. Blade density and wind cadence key off
 * the Performance quality tiers (KTD-10/R13).
 */

// Blades per painted cell by quality tier (editor authors at 64).
const BLADES_BY_TIER = { high: BLADES_PER_CELL, medium: 32, low: 16 }

// One tapered blade card: 5 vertices / 3 triangles, base at y=0, unit height.
// uv.y = height fraction (0 base → 1 tip; the shader bends by uv.y);
// uv.x = 0..1 across the blade (the fragment's soft-edge feather reads it).
const BLADE_W = 0.018

function bladeCard()
{
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array([
        -BLADE_W / 2, 0, 0,
        BLADE_W / 2, 0, 0,
        -BLADE_W / 4, 0.6, 0,
        BLADE_W / 4, 0.6, 0,
        0, 1, 0,
    ])
    const uvs = new Float32Array([0, 0, 1, 0, 0.25, 0.6, 0.75, 0.6, 0.5, 1])
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4])
    return geo
}

export default class Grass
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene
        this.island = this.state.island
        this.spec = this.island.spec

        // Debug knobs.
        this.windSpeed = 1.0

        this._appliedTier = null
        this._frame = 0

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setDebug()
        this._fill()
    }

    setGeometry()
    {
        const spec = this.spec
        // Capacity = the committed spec's painted-cell worst case at full
        // density; the spec never changes at runtime.
        const capacity = spec.grid.cols * spec.grid.rows * BLADES_PER_CELL

        this.geometry = new THREE.InstancedBufferGeometry()
        this.geometry.copy(bladeCard())
        this.geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3))
        this.geometry.setAttribute('aYawScale', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
        this.geometry.setAttribute('aShadePhase', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
        this.geometry.instanceCount = 0
    }

    setMaterial()
    {
        this.material = createGrassBladeMaterial()
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.name = 'grass'
        // Per-blade shadows are noise at this scale; the ground's painted
        // under-tint plays the grounding role instead.
        this.mesh.castShadow = false
        this.mesh.receiveShadow = false
        // Instance bounds aren't tracked; the island is always in frame.
        this.mesh.frustumCulled = false
        this.scene.add(this.mesh)
    }

    /** Blades per painted cell for the current quality tier. */
    _perCell()
    {
        const tier = this.state.performance?.tier || 'high'
        return BLADES_BY_TIER[tier] || BLADES_PER_CELL
    }

    /** (Re)fill the instanced attributes from the spec at the current tier's
     *  density — the arrays are exactly the scatter's SoA layout, no per-blade
     *  objects. */
    _fill()
    {
        const perCell = this._perCell()
        const offset = this.geometry.getAttribute('aOffset')
        const yawScale = this.geometry.getAttribute('aYawScale')
        const shadePhase = this.geometry.getAttribute('aShadePhase')
        const count = fillGrassBlades(
            this.spec,
            {
                offsets: offset.array,
                yawScales: yawScale.array,
                shadePhases: shadePhase.array,
            },
            perCell,
            this.island._blurred,
        )
        this.geometry.instanceCount = count
        offset.needsUpdate = true
        yawScale.needsUpdate = true
        shadePhase.needsUpdate = true
        this._appliedTier = this.state.performance?.tier || 'high'
    }

    setDebug()
    {
        if(!this.debug || !this.debug.active) return
        const folder = this.debug.ui.getFolder('view/grass')
        folder.add(this, 'windSpeed', 0, 3, 0.05).name('wind speed')
    }

    update()
    {
        // Density follows the quality tier (refill only on tier change).
        const tier = this.state.performance?.tier || 'high'
        if(tier !== this._appliedTier) this._fill()

        // Wind clock — cadence keys off the tier's ambient frame modulo so
        // low tier updates the sway every Nth frame.
        this._frame++
        const modulo = Math.max(1, this.state.performance?.settings?.ambientFrameModulo || 1)
        if(this._frame % modulo === 0)
            this.material.uniforms.uTime.value = this.time.elapsed * this.windSpeed

        // Character bend/fade disc follows the live character.
        const kira = this.view.kira
        const charPos = this.material.uniforms.uCharPos.value
        if(kira && kira.group)
        {
            const p = kira.group.position
            charPos.set(p.x, p.y, p.z, 1)
        }
        else
        {
            charPos.w = 0
        }

        // Day-cycle tint (KTD-8): blades darken with the world at night and
        // pick up the warm key at sunset. Normalized against the noon
        // keyframe (sunInt 0.78), floored so night grass stays readable.
        const day = this.state.day.currentState
        if(day)
        {
            const s = Math.min(1.15, Math.max(0.3, 0.25 + 0.75 * (day.sunInt / 0.78)))
            const tint = this.material.uniforms.uDayTint.value
            tint.setRGB(day.sunColor[0] / 255, day.sunColor[1] / 255, day.sunColor[2] / 255)
            tint.lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(s)
        }
    }
}
