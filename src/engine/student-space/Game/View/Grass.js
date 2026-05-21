import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import Debug from '../Debug/Debug.js'
import GrassMaterial from './Materials/GrassMaterial.js'

const CURVE_K        = 0.13
const CURVE_STRENGTH = 0.65

/**
 * Bruno's Grass — only changes from his original:
 *   - `this.size` no longer reads `state.chunks.minSize` (we don't have Chunks).
 *     We default to 16 m and let Game.bindTerrain() override.
 *   - `update()` doesn't query Chunks every frame. We bind one terrain texture
 *     once at boot and tick only uTime / uSunPosition.
 * Geometry and shader are byte-for-byte his.
 */
export default class Grass
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.time = this.state.time
        this.scene = this.view.scene
        this.noises = this.view.noises
        this.island = this.state.island

        // Knobs (debug-tweakable). windSpeed multiplies the uTime feed —
        // higher = blades flicker faster. windAmp scales the wind gust
        // input before the shader uses it for displacement.
        this.windSpeed = 1.0
        this.windAmp   = 1.0

        this.details = 200
        this.size = 16
        this.count = this.details * this.details
        this.fragmentSize = this.size / this.details
        this.bladeWidthRatio = 1.5
        this.bladeHeightRatio = 4
        this.bladeHeightRandomness = 0.5
        this.positionRandomness = 0.5
        this.noiseTexture = this.noises.create(128, 128)

        // Camera-distance fade — blades collapse to base between these world-units.
        // Tuned for our OrbitControls (default distance 14, max 30).
        this.cameraFadeNear = 18
        this.cameraFadeFar  = 32

        // Bruno's grass shader shrinks blades by `distance(player, blade) /
        // uGrassDistance` (see getGrassAttenuation). His infinite world wants
        // blades to fade with distance from the player; our static island has
        // a fixed plateau radius 5, so any value tied to `chunkSize=16` makes
        // blades half-height at the cliff edge and leaves a visibly "bare"
        // ring on the plateau outer rim. Bumped to 50 so smoothstep(0.3, 1.0)
        // input at the cliff lip (r=5) is 2*5/50 = 0.2 < 0.3 — fade hasn't
        // started, blades stay at full height all the way to the rim.
        this.grassDistance = 50

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setDebug()
    }

    setGeometry()
    {
        // Pass 1: walk the full 200×200 grid, but keep only cells that
        // fall inside the plateau silhouette. This costs ~70 % of cells on
        // our 5 m island disc inside a 16 m chunk — exactly the sand/water
        // regions we don't want grass on. Reduces blade count from 40 000
        // to ~12 000, no per-cell shader cost for empty cells.
        const placements = []
        for(let iX = 0; iX < this.details; iX++)
        {
            const fragmentX = (iX / this.details - 0.5) * this.size + this.fragmentSize * 0.5
            for(let iZ = 0; iZ < this.details; iZ++)
            {
                const fragmentZ = (iZ / this.details - 0.5) * this.size + this.fragmentSize * 0.5
                const centerX = fragmentX + (Math.random() - 0.5) * this.fragmentSize * this.positionRandomness
                const centerZ = fragmentZ + (Math.random() - 0.5) * this.fragmentSize * this.positionRandomness
                if(this.island.isOnPlateau(centerX, centerZ))
                    placements.push(centerX, centerZ)
            }
        }
        const actualCount = placements.length / 2
        this.count = actualCount

        // Pass 2: build the vertex buffers from the filtered placements.
        const centers = new Float32Array(actualCount * 3 * 2)
        const positions = new Float32Array(actualCount * 3 * 3)
        for(let i = 0; i < actualCount; i++)
        {
            const centerX = placements[i * 2]
            const centerZ = placements[i * 2 + 1]
            const iStride6 = i * 6
            const iStride9 = i * 9
            centers[iStride6    ] = centerX
            centers[iStride6 + 1] = centerZ
            centers[iStride6 + 2] = centerX
            centers[iStride6 + 3] = centerZ
            centers[iStride6 + 4] = centerX
            centers[iStride6 + 5] = centerZ

            const bladeWidth = this.fragmentSize * this.bladeWidthRatio
            const bladeHalfWidth = bladeWidth * 0.5
            const bladeHeight = this.fragmentSize * this.bladeHeightRatio * (1 - this.bladeHeightRandomness + Math.random() * this.bladeHeightRandomness)

            positions[iStride9    ] = - bladeHalfWidth
            positions[iStride9 + 1] = 0
            positions[iStride9 + 2] = 0
            positions[iStride9 + 3] = 0
            positions[iStride9 + 4] = bladeHeight
            positions[iStride9 + 5] = 0
            positions[iStride9 + 6] = bladeHalfWidth
            positions[iStride9 + 7] = 0
            positions[iStride9 + 8] = 0
        }

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('center', new THREE.Float32BufferAttribute(centers, 2))
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    }

    setMaterial()
    {
        this.material = new GrassMaterial()
        this.material.uniforms.uTime.value = 0
        this.material.uniforms.uGrassDistance.value = this.grassDistance
        this.material.uniforms.uPlayerPosition.value = new THREE.Vector3()
        this.material.uniforms.uTerrainSize.value = this.size
        // Texture resolution — must match the DataTexture our Island produces.
        this.material.uniforms.uTerrainTextureSize.value = 256
        this.material.uniforms.uTerrainATexture.value = null
        this.material.uniforms.uTerrainAOffset.value = new THREE.Vector2()
        this.material.uniforms.uTerrainBTexture.value = null
        this.material.uniforms.uTerrainBOffset.value = new THREE.Vector2()
        this.material.uniforms.uTerrainCTexture.value = null
        this.material.uniforms.uTerrainCOffset.value = new THREE.Vector2()
        this.material.uniforms.uTerrainDTexture.value = null
        this.material.uniforms.uTerrainDOffset.value = new THREE.Vector2()
        this.material.uniforms.uNoiseTexture.value = this.noiseTexture
        this.material.uniforms.uFresnelOffset.value = 0
        this.material.uniforms.uFresnelScale.value = 0.5
        this.material.uniforms.uFresnelPower.value = 2
        this.material.uniforms.uSunPosition.value = new THREE.Vector3(-0.5, -0.5, -0.5)
        this.material.uniforms.uCameraFadeNear.value = this.cameraFadeNear
        this.material.uniforms.uCameraFadeFar.value  = this.cameraFadeFar
        this.material.uniforms.uCurveK.value = CURVE_K
        this.material.uniforms.uCurveStrength.value = CURVE_STRENGTH
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.frustumCulled = false
        // Static at world origin — no player tracking.
        this.mesh.position.set(0, 0, 0)
        this.scene.add(this.mesh)
    }

    /**
     * Game wires up our island's pre-rendered terrain texture once. Bruno's
     * shader sums four neighbour chunks via `step(0, uv) * step(uv, 1)` masks,
     * so we MUST keep three of them outside the UV range or every texel gets
     * counted 4× and blades inflate to ~5 m tall (the legacy A/B/C/D split is
     * for seamless multi-chunk worlds we don't have).
     *
     * Implementation: bind the same texture to all four slots so samplers stay
     * valid, but push B/C/D offsets far away so their step() products are 0.
     */
    bindTerrain(terrainTexture, chunkSize)
    {
        this.size = chunkSize
        // uGrassDistance stays tied to grassDistance (attenuation radius),
        // not chunkSize (terrain-texture footprint). Decoupling these lets a
        // small chunkSize sample the heightfield while a large grassDistance
        // keeps blades full-height across the plateau.
        this.material.uniforms.uTerrainSize.value = chunkSize

        this.material.uniforms.uTerrainATexture.value = terrainTexture
        this.material.uniforms.uTerrainAOffset.value.set(-chunkSize * 0.5, -chunkSize * 0.5)

        // Park B/C/D well outside the chunk — UVs fall outside [0,1] so step() = 0.
        const farAway = chunkSize * 100
        for(const k of ['uTerrainBTexture', 'uTerrainCTexture', 'uTerrainDTexture'])
            this.material.uniforms[k].value = terrainTexture
        for(const k of ['uTerrainBOffset', 'uTerrainCOffset', 'uTerrainDOffset'])
            this.material.uniforms[k].value.set(farAway, farAway)
    }

    setDebug()
    {
        if(!this.debug || !this.debug.active) return
        const folder = this.debug.ui.getFolder('view/grass')
        folder.add(this, 'windSpeed', 0, 3, 0.05).name('wind speed')
        folder.add(this, 'windAmp',   0, 3, 0.05).name('wind amp')
    }

    update()
    {
        const sunState = this.state.sun
        // windSpeed multiplies the uTime feed so the debug slider can dial
        // blade-flutter rate without affecting the rest of the day cycle.
        this.material.uniforms.uTime.value = this.time.elapsed * this.windSpeed
        this.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        // Drive the wind envelope shared with flowers / trees / particles.
        // windAmp scales the gust before the shader applies displacement so
        // the same control reaches the visible amplitude of the sway.
        if(this.state.wind) this.material.uniforms.uWindGust.value = this.state.wind.gust * this.windAmp
    }
}
