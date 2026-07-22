import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildIslandField, composeGeometry } from './islandGeometry.ts'
import {
    createIslandGroundMaterial,
    GROUND_SKY_COLOR,
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
 *   directional, modulated by the day cycle (noon matches the editor's fixed
 *   rig). Shadows stay ON at every quality tier; only the map size scales
 *   (KTD-4 — if low-tier frame times collapse, the lever is map size/filter
 *   quality, never disabling shadows).
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

// Editor Backdrop rig (island-editor/src/scene/Backdrop.tsx). The day-cycle
// palette's noon keyframe (sunInt 0.78, ambInt 0.46) maps onto these values so
// noon in the engine matches the editor's fixed daylight.
const NOON_SUN_INT = 0.78
const NOON_AMB_INT = 0.46
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

        const day = this.state.day.currentState
        if(day)
        {
            // Sea day tint (KTD-8) — sky-bottom keyframe color, like the
            // retired ocean's sky-reactive wash.
            this.seaMat.uniforms.uSkyTint.value.setRGB(
                day.skyBottom[0] / 255,
                day.skyBottom[1] / 255,
                day.skyBottom[2] / 255,
            )

            // Scene lights: day palette scaled so noon equals the editor rig.
            const sunScale = day.sunInt / NOON_SUN_INT
            this.sun.color.setRGB(day.sunColor[0] / 255, day.sunColor[1] / 255, day.sunColor[2] / 255)
            this.sun.intensity = SUN_INTENSITY * sunScale
            this.hemi.intensity = HEMI_INTENSITY * Math.min(1, 0.35 + (day.ambInt / NOON_AMB_INT) * 0.65)

            // Ground material daylight: warm key scaled with the sun, cool
            // ambient scaled with the day's ambient floor.
            const u = this.groundMat.uniforms
            u.uSunColor.value.setHex(GROUND_SUN_COLOR).multiplyScalar(Math.max(0.12, sunScale))
            u.uSkyColor.value.setHex(GROUND_SKY_COLOR).multiplyScalar(Math.max(0.25, day.ambInt / NOON_AMB_INT))
        }

        // Ground sun DIRECTION tracks the live sun so terrain shading follows
        // the day cycle (the scene light stays at the editor's shadow angle —
        // moving the shadow camera every frame would churn the shadow map).
        const s = this.state.sun
        if(s && (s.position.x || s.position.y || s.position.z))
        {
            const uDir = this.groundMat.uniforms.uSunDirection.value
            // Below the horizon the shader's max(dot,0) already kills the key.
            uDir.set(s.position.x, Math.max(s.position.y, -0.2), s.position.z)
            if(uDir.lengthSq() > 0) uDir.normalize()
        }
    }
}
