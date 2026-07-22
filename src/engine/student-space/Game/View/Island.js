import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildIslandField, composeGeometry } from './islandGeometry.ts'
import {
    createIslandGroundMaterial,
    GROUND_SUN_COLOR,
} from './Materials/IslandGroundMaterial.ts'
import { createSeaMaterial, createShoreDataTexture } from './Materials/SeaMaterial.ts'

/**
 * Island view — the editor's authored tile-grid world rendered in the engine
 * (world-port U4). Replaces the retired polar disc/sand-ring/cliff builders,
 * the curved-earth ocean, and the 256² terrain DataTexture.
 *
 * - Terrain: ported buildIslandGeometry over the committed spec (built once,
 *   KTD-10) + IslandGroundMaterial (BOTW-style painterly ground).
 * - Sea: ported SeaMaterial plane fed by the cached shore distance field,
 *   extended far past the 24-unit world with a haze/alpha horizon fade so the
 *   aurora ring (r 22), rain sampling, and the landing orbit still frame
 *   against water (KTD-8). Gains a day-cycle tint the editor doesn't have.
 * - Light rig: the editor Backdrop's hemisphere + warm shadow-casting
 *   directional, FIXED at the editor's daylight (the day-cycle modulation was
 *   removed by request — DayCycle still drives sky/ambient systems, but the
 *   island lighting no longer follows it). Shadows stay ON at every quality
 *   tier; only the map size scales (KTD-4 — if low-tier frame times collapse,
 *   the lever is map size/filter quality, never disabling shadows).
 */

// Asset paths mirror Tree/Kira: derive from Vite's BASE_URL for subpath
// deploys, with "/" as the unit-test/SSR fallback.
const BASE_URL = (typeof import.meta !== 'undefined'
    && import.meta.env
    && typeof import.meta.env.BASE_URL === 'string')
    ? import.meta.env.BASE_URL
    : '/'
const ASSET_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`
const TEXTURE_BASE = `${ASSET_BASE}student-space/textures`

// Editor Backdrop rig (island-editor/src/scene/Backdrop.tsx), applied as-is:
// the island renders in the editor's fixed daylight at every hour.
const SUN_INTENSITY = 1.55
const HEMI_INTENSITY = 0.65
const HEMI_SKY = 0xCFE5FF
const HEMI_GROUND = 0xC8BB94
const SUN_POSITION = new THREE.Vector3(18, 20, 10)

const SHADOW_MAP_SIZE_BY_TIER = { high: 2048, medium: 1024, low: 512 }

export default class Island
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island
        this.spec = this.island.spec

        this.group = new THREE.Group()
        this.group.name = 'island'
        this.scene.add(this.group)

        this._loadTextures()
        this._buildTerrain()
        this._buildSea()
        this._buildLights()

        // Ocean clock: advances at 0.45× real time when calm (the pace the
        // ported shore layers were tuned at), sped up by rain.
        this._oceanTime = 0
        this._appliedShadowTier = null
        this._applyShadowQuality()
    }

    _loadTextures()
    {
        const loader = new THREE.TextureLoader()
        const loadColor = (name) =>
        {
            const tex = loader.load(`${TEXTURE_BASE}/${name}.png`)
            tex.encoding = THREE.sRGBEncoding
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
            tex.magFilter = THREE.LinearFilter
            tex.minFilter = THREE.LinearMipmapLinearFilter
            tex.generateMipmaps = true
            return tex
        }
        // Foam masks are data, not color — loaded linear.
        const loadMask = (name) =>
        {
            const tex = loader.load(`${TEXTURE_BASE}/${name}.png`)
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
            tex.magFilter = THREE.LinearFilter
            tex.minFilter = THREE.LinearMipmapLinearFilter
            tex.generateMipmaps = true
            return tex
        }
        this.sandTexture = loadColor('sand-soft-ripples')
        this.cliffTexture = loadColor('cliff-soft-strata')
        this.waterFoamCellsTexture = loadMask('water-foam-cells')
        this.waterShortBubblesTexture = loadMask('water-short-bubbles')
    }

    _buildTerrain()
    {
        const spec = this.spec
        // Geometry is built once per boot in the constructor slot (KTD-10),
        // reusing the state facade's cached blur.
        const field = buildIslandField(spec.worldSize)
        const geometry = composeGeometry(field, spec, this.island._blurred)

        this.groundMat = createIslandGroundMaterial(
            { sand: this.sandTexture, cliff: this.cliffTexture },
            {
                sunDirection: SUN_POSITION,
                seaLevel: spec.seaLevel,
                beachTop: spec.tierHeights[1],
            },
        )

        this.terrain = new THREE.Mesh(geometry, this.groundMat)
        this.terrain.name = 'island-terrain'
        this.terrain.castShadow = true
        this.terrain.receiveShadow = true
        this.group.add(this.terrain)
    }

    _buildSea()
    {
        const spec = this.spec
        this.shoreTexture = createShoreDataTexture(this.island._shore)
        this.seaMat = createSeaMaterial(
            {
                foamCells: this.waterFoamCellsTexture,
                shortBubbles: this.waterShortBubblesTexture,
            },
            this.shoreTexture,
            { worldSize: spec.worldSize },
        )
        // Large enough that the shader's horizon fade (out to worldSize*7)
        // fully completes before the plane's edge — the rim dissolves into the
        // sky instead of showing a hard square. Covers the old ~40-unit
        // horizon reach (aurora ring, rain sampling, landing orbit).
        const geo = new THREE.PlaneGeometry(spec.worldSize * 16, spec.worldSize * 16)
        this.sea = new THREE.Mesh(geo, this.seaMat)
        this.sea.name = 'island-sea'
        this.sea.rotation.x = -Math.PI / 2
        this.sea.position.y = spec.seaLevel
        this.sea.frustumCulled = false
        this.group.add(this.sea)
    }

    _buildLights()
    {
        // Editor Backdrop rig: cool hemisphere fill + warm low-angle sun.
        this.hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY)

        this.sun = new THREE.DirectionalLight(GROUND_SUN_COLOR, SUN_INTENSITY)
        this.sun.position.copy(SUN_POSITION)
        this.sun.castShadow = true
        const cam = this.sun.shadow.camera
        cam.left = -22
        cam.right = 22
        cam.top = 22
        cam.bottom = -22
        cam.near = 1
        cam.far = 80
        this.sun.shadow.bias = -0.0002
        this.sun.shadow.normalBias = 0.05

        this.scene.add(this.hemi, this.sun, this.sun.target)
    }

    /** Shadow map size follows the quality tier (KTD-4): shadows never turn
     *  off; only resolution scales. */
    _applyShadowQuality()
    {
        const tier = this.state.performance?.tier || 'high'
        if(tier === this._appliedShadowTier) return
        this._appliedShadowTier = tier
        const size = SHADOW_MAP_SIZE_BY_TIER[tier] || SHADOW_MAP_SIZE_BY_TIER.high
        this.sun.shadow.mapSize.set(size, size)
        if(this.sun.shadow.map)
        {
            this.sun.shadow.map.dispose()
            this.sun.shadow.map = null
        }
    }

    update()
    {
        this._applyShadowQuality()

        // Ocean clock — rain-aware rate (0.45× clear → 1.0× downpour).
        const rain = this.state.weather ? this.state.weather.rain : 0
        const dt = this.state.time.delta || 0
        this._oceanTime += dt * (0.45 + rain * 0.55)
        this.seaMat.uniforms.uTime.value = this._oceanTime

        // Lighting is FIXED at the editor rig: no day-cycle modulation of the
        // sun, hemisphere, ground uniforms, sea tint, or sun direction. The
        // constructor values (and the materials' white-tint defaults) are the
        // editor's daylight and never move.
        //
        // TODO(weather): dynamic lighting — during rain the scene keeps the
        // static editor daylight rig, so a downpour looks fully sunlit.
        // Planned follow-up: modulate sun/hemisphere intensity + sea tint
        // with the rain amount (and eventually the day cycle), and revisit
        // the Rain.js overlay to match.
    }
}
