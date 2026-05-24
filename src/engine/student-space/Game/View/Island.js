import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Island geometry + the fake-chunk terrain texture that lets Bruno's Grass
 * shader work unchanged. The texture stores (normal.x, normal.y, normal.z,
 * height) per texel over a square area `chunkSize × chunkSize` centred at
 * world origin.
 *
 * Phase 2c adds the Tiny Skies miniature-planet feel: the four ground
 * materials (plateau, sand, cliff, water) share a parabolic radial drop-off
 * `y -= (r * CURVE_K)² * uCurveStrength` so the horizon falls away
 * uniformly. The placeholder water disc is replaced by a port of the
 * legacy buildWater shader — three layered sines, a foam strip at the
 * island edge, sky-bottom tint at every hour.
 */

// Shared planet-curve constants (legacy P.post.curvedEarth + CURVE_K).
// k=0.13 + strength=0.65 → effective planet radius ~30u; sea drop at r=40 is
// ~17.6u (well below frame), plateau drop at r=5 is ~0.27u (a soft bow).
const CURVE_K        = 0.13
const CURVE_STRENGTH = 0.65

// Sea palette pulled toward tinyskies' stronger shallow/deep ocean contrast.
const SEA      = new THREE.Color(0x2A8CA0)
const SEA_DEEP = new THREE.Color(0x1560A0)
const FOAM     = new THREE.Color(0xB3FFFF)

function smoothstep(edge0, edge1, value)
{
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

function sandRippleAt(theta, t)
{
    const innerFade = smoothstep(0.06, 0.24, t)
    const outerFade = 1 - smoothstep(0.78, 1.0, t)
    const bands = Math.sin(t * 68 + theta * 4.5) * 0.04
    const cross = Math.sin(theta * 13.0 + t * 17.0) * 0.022
    const scallop = Math.sin(theta * 19.0) * 0.018 * (1 - t)
    return (bands + cross + scallop) * innerFade * outerFade
}

// Flat radial disc in the XZ plane, centred at origin. Use this for the
// sea so the curved-earth shader produces a circular planet limb: a square
// PlaneGeometry puts corners at √2 × radius, and the r² drop-off pulls
// those corners much further down than the edge midpoints, scalloping the
// horizon as the camera pans. With a true disc every rim vertex shares the
// same r and the silhouette is a clean circle in every direction.
function buildWaterDiscGeometry(radius, radialSegments, angularSegments)
{
    const vertices = [0, 0, 0]
    const indices = []

    for(let ring = 1; ring <= radialSegments; ring++)
    {
        const r = radius * (ring / radialSegments)
        for(let seg = 0; seg < angularSegments; seg++)
        {
            const theta = (seg / angularSegments) * Math.PI * 2
            vertices.push(Math.cos(theta) * r, 0, Math.sin(theta) * r)
        }
    }

    for(let seg = 0; seg < angularSegments; seg++)
    {
        const a = 1 + seg
        const b = 1 + ((seg + 1) % angularSegments)
        indices.push(0, b, a)
    }

    for(let ring = 2; ring <= radialSegments; ring++)
    {
        const prev = 1 + (ring - 2) * angularSegments
        const curr = 1 + (ring - 1) * angularSegments
        for(let seg = 0; seg < angularSegments; seg++)
        {
            const next = (seg + 1) % angularSegments
            indices.push(
                prev + seg, curr + next, curr + seg,
                prev + seg, prev + next, curr + next,
            )
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    return geo
}

function buildDiscGeometry(island, radius, radialSegments, angularSegments)
{
    const vertices = [0, island.heightAt(0, 0), 0]
    const indices = []

    for(let ring = 1; ring <= radialSegments; ring++)
    {
        const t = ring / radialSegments
        for(let seg = 0; seg < angularSegments; seg++)
        {
            const theta = (seg / angularSegments) * Math.PI * 2
            const r = island.radiusAtTheta(theta, radius) * t
            const x = Math.cos(theta) * r
            const z = Math.sin(theta) * r
            vertices.push(x, island.heightAt(x, z), z)
        }
    }

    for(let seg = 0; seg < angularSegments; seg++)
    {
        const a = 1 + seg
        const b = 1 + ((seg + 1) % angularSegments)
        indices.push(0, b, a)
    }

    for(let ring = 2; ring <= radialSegments; ring++)
    {
        const prev = 1 + (ring - 2) * angularSegments
        const curr = 1 + (ring - 1) * angularSegments
        for(let seg = 0; seg < angularSegments; seg++)
        {
            const next = (seg + 1) % angularSegments
            indices.push(
                prev + seg, curr + next, curr + seg,
                prev + seg, prev + next, curr + next,
            )
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
}

function buildSandRingGeometry(island, radialSegments, angularSegments)
{
    const vertices = []
    const indices = []
    const slope = -0.85

    for(let ring = 0; ring <= radialSegments; ring++)
    {
        const t = ring / radialSegments
        for(let seg = 0; seg < angularSegments; seg++)
        {
            const theta = (seg / angularSegments) * Math.PI * 2
            const inner = island.radiusAtTheta(theta)
            const outer = island.radiusAtTheta(theta, island.sandOuterRadius)
            const r = inner + (outer - inner) * t
            const ripple = sandRippleAt(theta, t)
            vertices.push(
                Math.cos(theta) * r,
                island.sandTopY + slope * t + ripple,
                Math.sin(theta) * r,
            )
        }
    }

    for(let ring = 0; ring < radialSegments; ring++)
    {
        const curr = ring * angularSegments
        const nextRing = (ring + 1) * angularSegments
        for(let seg = 0; seg < angularSegments; seg++)
        {
            const next = (seg + 1) % angularSegments
            indices.push(
                curr + seg, nextRing + next, nextRing + seg,
                curr + seg, curr + next, nextRing + next,
            )
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
}

function buildCliffGeometry(island, angularSegments)
{
    const vertices = []
    const indices = []
    const yBottom = island.sandTopY
    const yTop = island.sandTopY + island.cliffHeight

    for(let seg = 0; seg < angularSegments; seg++)
    {
        const theta = (seg / angularSegments) * Math.PI * 2
        const topR = island.radiusAtTheta(theta) * 0.99
        const bottomR = island.radiusAtTheta(theta) * 1.04
        vertices.push(
            Math.cos(theta) * bottomR, yBottom, Math.sin(theta) * bottomR,
            Math.cos(theta) * topR,    yTop,    Math.sin(theta) * topR,
        )
    }

    for(let seg = 0; seg < angularSegments; seg++)
    {
        const next = (seg + 1) % angularSegments
        const b0 = seg * 2
        const t0 = b0 + 1
        const b1 = next * 2
        const t1 = b1 + 1
        indices.push(b0, t1, b1, b0, t0, t1)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
}

export default class Island
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.chunkSize = this.island.chunkSize
        this.textureSize = 256

        // Shared curve uniforms — every ground material reads the same
        // reference so a future studio slider can update them in one place.
        this._curveUniforms = {
            uCurveK:        { value: CURVE_K },
            uCurveStrength: { value: CURVE_STRENGTH },
        }

        // Onbeforecompile shaders captured here for legacy MeshLambert paths
        // (sand + cliff) — kept so a future studio control can update them.
        this._curvedShaders = []

        this._buildTerrainTexture()
        this._buildPlateau()
        this._buildSand()
        this._buildCliff()
        this._buildWater()
    }

    _buildTerrainTexture()
    {
        const size = this.textureSize
        const data = new Float32Array(size * size * 4)

        for(let iz = 0; iz < size; iz++)
        {
            const z = (iz / (size - 1) - 0.5) * this.chunkSize
            for(let ix = 0; ix < size; ix++)
            {
                const x = (ix / (size - 1) - 0.5) * this.chunkSize
                const [nx, ny, nz] = this.island.normalAt(x, z)
                const h = this.island.heightAt(x, z)
                const o = (iz * size + ix) * 4
                data[o]     = nx
                data[o + 1] = ny
                data[o + 2] = nz
                data[o + 3] = h
            }
        }

        this.terrainTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType)
        this.terrainTexture.minFilter = THREE.LinearFilter
        this.terrainTexture.magFilter = THREE.LinearFilter
        this.terrainTexture.wrapS = THREE.ClampToEdgeWrapping
        this.terrainTexture.wrapT = THREE.ClampToEdgeWrapping
        this.terrainTexture.needsUpdate = true
    }

    /**
     * Inject the shared `y -= (r * uCurveK)² * uCurveStrength` displacement
     * into a built-in material's vertex shader. Three's onBeforeCompile lets
     * us splice into the standard pipeline without writing a full shader.
     */
    _applyCurvedEarth(material, detailKind = null)
    {
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uCurveK        = this._curveUniforms.uCurveK
            shader.uniforms.uCurveStrength = this._curveUniforms.uCurveStrength
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    '#include <common>\nuniform float uCurveK;\nuniform float uCurveStrength;\nvarying vec3 vIslandWorld;',
                )
                .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                     vec4 _wp = modelMatrix * vec4(transformed, 1.0);
                     vIslandWorld = _wp.xyz;
                     float _r = length(_wp.xz);
                     transformed.y -= (_r * _r) * (uCurveK * uCurveK) * uCurveStrength;`,
                )

            if(detailKind)
            {
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        '#include <common>',
                        `#include <common>
                         varying vec3 vIslandWorld;
                         float islandHash(vec2 p) {
                             return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                         }
                         float islandNoise(vec2 p) {
                             vec2 i = floor(p);
                             vec2 f = fract(p);
                             f = f * f * (3.0 - 2.0 * f);
                             float a = islandHash(i);
                             float b = islandHash(i + vec2(1.0, 0.0));
                             float c = islandHash(i + vec2(0.0, 1.0));
                             float d = islandHash(i + vec2(1.0, 1.0));
                             return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                         }`,
                    )
                    .replace(
                        'vec4 diffuseColor = vec4( diffuse, opacity );',
                        detailKind === 'sand'
                            ? `vec3 detailDiffuse = diffuse;
                               float sandR = length(vIslandWorld.xz);
                               float grain = islandNoise(vIslandWorld.xz * 14.0);
                               float broad = islandNoise(vIslandWorld.xz * 2.2);
                               float shell = smoothstep(5.0, 7.25, sandR);
                               float wet = 1.0 - smoothstep(-0.28, 0.10, vIslandWorld.y);
                               float rings = sin(sandR * 11.0 + islandNoise(vIslandWorld.xz * 3.0) * 3.0) * 0.5 + 0.5;
                               detailDiffuse = mix(detailDiffuse * 0.92, detailDiffuse * 1.08, broad);
                               detailDiffuse = mix(detailDiffuse, vec3(0.86, 0.74, 0.42), rings * 0.2 * (1.0 - wet));
                               detailDiffuse = mix(detailDiffuse, vec3(0.62, 0.54, 0.36), wet * 0.42);
                               detailDiffuse += vec3((grain - 0.5) * 0.13);
                               detailDiffuse *= 1.0 - shell * 0.08;
                               vec4 diffuseColor = vec4( detailDiffuse, opacity );`
                            : `vec3 detailDiffuse = diffuse;
                               float layer = sin(vIslandWorld.y * 34.0 + islandNoise(vIslandWorld.xz * 2.6) * 4.0) * 0.5 + 0.5;
                               float chips = islandNoise(vIslandWorld.xz * 10.0 + vIslandWorld.y);
                               detailDiffuse = mix(detailDiffuse * 0.78, detailDiffuse * 1.12, layer * 0.32 + chips * 0.18);
                               vec4 diffuseColor = vec4( detailDiffuse, opacity );`,
                    )
            }

            this._curvedShaders.push(shader)
        }
        material.needsUpdate = true
    }

    _buildPlateau()
    {
        const geo = buildDiscGeometry(this.island, this.island.radius, 56, 192)

        // Custom shader so the plateau picks up Bruno's exact grass-base tone
        // + his sun-shading recipe. The "ground colour between blades" then
        // matches the blade root colour exactly — no green-on-olive gap.
        this.plateauMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor:         { value: new THREE.Color(0x4A8F3F) },
                uSunPosition:   { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
                uCurveK:        this._curveUniforms.uCurveK,
                uCurveStrength: this._curveUniforms.uCurveStrength,
            },
            vertexShader: `
                uniform float uCurveK;
                uniform float uCurveStrength;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;
                void main() {
                    vec3 p = position;
                    vec4 wp = modelMatrix * vec4(p, 1.0);
                    float r = length(wp.xz);
                    p.y -= (r * r) * (uCurveK * uCurveK) * uCurveStrength;
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPosition = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform vec3 uSunPosition;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;
                float islandHash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                float islandNoise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = islandHash(i);
                    float b = islandHash(i + vec2(1.0, 0.0));
                    float c = islandHash(i + vec2(0.0, 1.0));
                    float d = islandHash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                void main() {
                    // Bruno's getSunShade + getSunShadeColor.
                    float sunShade = dot(vNormal, -uSunPosition) * 0.5 + 0.5;
                    vec3 shadeColor = uColor * vec3(0.0, 0.5, 0.7);
                    float broad = islandNoise(vWorldPosition.xz * 2.0);
                    float grain = islandNoise(vWorldPosition.xz * 8.0);
                    float rim = smoothstep(3.8, 5.25, length(vWorldPosition.xz));
                    vec3 base = mix(uColor * 0.88, uColor * 1.08, broad);
                    base += vec3((grain - 0.5) * 0.045);
                    base = mix(base, base * vec3(0.78, 0.9, 0.72), rim * 0.28);
                    vec3 col = mix(base, shadeColor, sunShade);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        })
        this.plateau = new THREE.Mesh(geo, this.plateauMat)
        this.plateau.position.y = 0
        this.scene.add(this.plateau)

        // Scene lighting for the Lambert-shaded materials (trunk, sand, cliff,
        // tree canopy). Ambient + directional are kept as instance refs so
        // Island.update() can sync them to the day-cycle palette every frame —
        // without this the static lights make the sand glow white at h=22
        // against an otherwise night-dark scene.
        //
        // `hemiFloor` is a constant HemisphereLight that does NOT modulate
        // with the day cycle. The day-cycle ambient drops to ~0.20 at night,
        // which collapses warm/dark actors (Kira's plumage, mailbox, tree
        // trunk) to near-black against the still-readable grass. A steady
        // hemi fill keeps subjects perceptible at night without flattening
        // the atmospheric darkness of the world itself — a cool top tone
        // (sky-bounce) + warm bottom (ground-bounce) reads as moonlight
        // rather than washed-out fill.
        this.ambient = new THREE.AmbientLight(0xffffff, 0.55)
        this.directional = new THREE.DirectionalLight(0xffffff, 0.85)
        this.directional.position.set(8, 12, 6)
        this.hemiFloor = new THREE.HemisphereLight(0xC8DDFF, 0xA0907A, 0.32)
        this.scene.add(this.ambient, this.directional, this.hemiFloor)
    }

    _buildSand()
    {
        // Beach ring, sloped from cliff-foot down past the water
        // surface so the outer edge submerges instead of leaving a 0.33m step
        // between sand and water.
        const ring = buildSandRingGeometry(this.island, 18, 192)

        // Slope: outer edge drops below the inner edge. With sandTopY=0.18
        // and water at y=-0.15, the sand surface crosses the water line at
        // t = 0.33 / 0.85 roughly 0.39, so part of the ring is visible dry beach
        // and the rest disappears underwater, occluded by the water mesh.
        const mat = new THREE.MeshLambertMaterial({ color: 0xd0b478 })
        this._applyCurvedEarth(mat, 'sand')
        this.sand = new THREE.Mesh(ring, mat)
        this.scene.add(this.sand)
    }

    _buildCliff()
    {
        const geo = buildCliffGeometry(this.island, 192)
        const mat = new THREE.MeshLambertMaterial({ color: 0x8a6a30 })
        this._applyCurvedEarth(mat, 'cliff')
        this.cliff = new THREE.Mesh(geo, mat)
        this.scene.add(this.cliff)
    }

    _buildWater()
    {
        // Port of legacy buildWater. Radial disc (radius 60) so the curved-
        // earth drop-off bends every rim point by the same amount — the
        // horizon reads as a clean planet limb. 96 radial × 320 angular keeps
        // the silhouette smooth and the wave displacement well-sampled.
        const waterRadius = 60
        const islandR     = this.island.sandOuterRadius
        const geo = buildWaterDiscGeometry(waterRadius, 96, 320)

        // uOceanTime is a CPU-integrated clock that advances at a base
        // slow rate, scaled up by current rain intensity (see update()).
        // Using it instead of state.time.elapsed lets the wave rhythm
        // speed/slow continuously without phase jumps when weather flips.
        this._oceanTime = 0
        this.waterMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime:          { value: 0 },
                uSea:           { value: SEA.clone() },
                uDeep:          { value: SEA_DEEP.clone() },
                uFoam:          { value: FOAM.clone() },
                uSkyTint:       { value: new THREE.Color(0xffffff) },
                uIslandR:       { value: islandR },
                uWaveAmp:       { value: 0.32 },
                // 0 = calm, 1 = downpour. Modulates wave amplitude in
                // the vertex shader so the surface chops up with rain.
                uRain:          { value: 0 },
                // Spherical planet radius for the water drop-off. Picked so
                // the near-origin curvature matches the legacy parabolic
                // (1/(2R) ≈ K²·S → R ≈ 45.5), so the island sits unchanged
                // and only the far-field silhouette switches to a true
                // circle. Other materials still use the shared parabolic
                // curve — the island fits well inside the regime where
                // parabolic ≈ sphere, so the discontinuity is invisible.
                uSphereR:       { value: 45.5 },
            },
            vertexShader: `
                varying vec2 vXZ;
                varying float vWave;
                uniform float uTime;
                uniform float uWaveAmp;
                uniform float uRain;
                uniform float uSphereR;
                void main() {
                    vec3 p = position;
                    vXZ = p.xz;
                    // Layered sines + small ripple. Wave amplitude dampens
                    // toward the island so swell doesn't slap the sand ring,
                    // and also fades off before the silhouette so the limb
                    // arc reads as a clean circle — wave crests at the rim
                    // would otherwise nick the silhouette and look warpy.
                    float r = length(p.xz);
                    float damp = smoothstep(${islandR.toFixed(2)} - 0.5, ${islandR.toFixed(2)} + 6.0, r);
                    float rimFade = 1.0 - smoothstep(20.0, 28.0, r);
                    float w1 = sin(p.x * 0.45 + uTime * 0.9) * 0.6;
                    float w2 = sin(p.z * 0.38 - uTime * 0.7) * 0.5;
                    float w3 = sin((p.x + p.z) * 0.85 + uTime * 1.6) * 0.18;
                    // Amplitude grows ~70% from calm to downpour so the
                    // chop scales with the weather — calm surface stays
                    // glassy, stormy surface visibly heaves.
                    float ampScale = 0.85 + uRain * 0.75;
                    float wave = (w1 + w2 + w3) * uWaveAmp * ampScale * damp * rimFade;
                    p.y += wave;
                    // True spherical drop-off — surface is a cap of a sphere
                    // of radius uSphereR centred at (0, -uSphereR, 0). The
                    // 3D silhouette is the great circle where viewing rays
                    // graze the sphere; under perspective it projects to a
                    // near-perfect circular limb from any camera pose. The
                    // legacy r² parabolic is only second-order accurate so
                    // tilted cameras saw a warped, peaked horizon instead.
                    float chord2 = max(uSphereR * uSphereR - r * r, 0.0);
                    p.y -= uSphereR - sqrt(chord2);
                    vWave = wave;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vXZ;
                varying float vWave;
                uniform vec3  uSea;
                uniform vec3  uDeep;
                uniform vec3  uFoam;
                uniform vec3  uSkyTint;
                uniform float uIslandR;
                uniform float uTime;

                void main() {
                    float r = length(vXZ);
                    // Depth gradient — shallow at island, deep at outer edge.
                    float depthT = smoothstep(uIslandR, uIslandR + 14.0, r);
                    vec3 col = mix(uSea, uDeep, depthT);
                    // Sky-reactive tint (sunset/twilight/night washes the surface).
                    col = mix(col, col * uSkyTint, 0.35);

                    // Reusable y-coord for the 3D-style wave formulas
                    // ported from TinySkies. Original used wp.y on a globe;
                    // our ocean is flat so we use vWave (current crest
                    // height) for a tiny vertical signal that breaks the
                    // pattern up.
                    float y = vWave * 4.0;
                    // Pull the ocean clock onto a smaller spatial scale so
                    // the pattern emerges at the right size for our world.
                    // (TinySkies authored on a r≈50 globe with high
                    // frequencies; we scale freqs down by ~10×.)
                    float ox = vXZ.x;
                    float oy = vXZ.y;
                    float t  = uTime;

                    /* ----- ORGANIC FOAM PATTERN —————————————————————————————
                     * Seven sine waves at different angles + speeds. The
                     * trick is they're MULTIPLIED, not added. A narrow
                     * smoothstep picks the zones where they all align near
                     * zero — that's what gives the lacy caustic pattern you
                     * see on a pool floor. Direct port of TinySkies' ocean.
                     * ----- */
                    // Frequencies halved vs the TinySkies original so the
                    // blobs read at ~2× their previous scale — larger,
                    // gentler shapes that don't feel busy.
                    float w1 = sin(ox * 2.15 + oy * 1.35 + y * 0.55 + t * 3.6) * 0.5 + 0.5;
                    float w2 = sin(oy * 1.85 + y  * 2.65 + ox * 0.35 - t * 2.7) * 0.5 + 0.5;
                    float w3 = sin(y  * 1.55 + ox * 0.95 + oy * 2.35 + t * 2.1) * 0.5 + 0.5;
                    float w4 = sin(ox * 0.85 + y  * 1.45 - oy * 0.65 + t * 1.5) * 0.5 + 0.5;
                    float w5 = sin(oy * 0.55 + ox * 2.95 + y  * 1.15 - t * 1.2) * 0.5 + 0.5;
                    float w6 = sin(y  * 2.05 - oy * 0.35 + ox * 1.65 + t * 1.8) * 0.5 + 0.5;
                    float w7 = sin(ox * 3.35 - y  * 2.15 + oy * 0.15 - t * 0.9) * 0.5 + 0.5;
                    float blobs = w1 * w2 * w4 * w6 + w3 * w5 * w7 * 0.3;
                    blobs = 1.0 - smoothstep(0.002, 0.015, blobs);
                    float shallowness = 1.0 - depthT;
                    // Hold back the blobs immediately at the shore so the
                    // shoreline foam reads cleanly.
                    blobs *= smoothstep(uIslandR + 0.6, uIslandR + 2.5, r);
                    // Intensity dialed to ~30% of the prior pass — pattern
                    // reads as gentle, not busy.
                    col += vec3(0.7, 1.0, 1.0) * blobs * mix(0.03, 0.17, shallowness);

                    /* ----- SPARKLES —————————————————————————————————————————
                     * Pinpoint highlights, gated by a slow macro mask so
                     * they appear in patches instead of evenly speckled. Five
                     * fast sines for the points, three slow sines for the
                     * mask. Same TinySkies recipe. ----- */
                    // Sparkle frequencies + mask freqs also halved for the
                    // matched 2× scale.
                    float sp1 = sin(ox * 2.00 + oy * 1.15 + y * 0.45 + t * 3.5);
                    float sp2 = sin(oy * 1.75 + y  * 1.45 + ox * 0.65 - t * 2.8);
                    float sp3 = sin(y  * 1.35 + ox * 1.85 - oy * 0.85 + t * 4.1);
                    float sp4 = sin(ox * 3.55 - y  * 2.35 + oy * 0.25 + t * 1.9);
                    float sp5 = sin(oy * 2.95 + ox * 0.55 - y  * 1.55 - t * 2.3);
                    float spMask = sin(ox * 0.155 + y * 0.235 + t * 0.25)
                                 * sin(oy * 0.265 - ox * 0.145 - t * 0.18);
                    spMask *= sin(y * 0.115 + oy * 0.195 + t * 0.35);
                    spMask = smoothstep(0.15, 0.5, spMask);
                    float sparkle = sp1 * sp2 * sp3 * sp4 + sp2 * sp3 * sp5 * 0.5;
                    float sparkleThresh = mix(0.70, 0.30, shallowness);
                    sparkle = smoothstep(sparkleThresh, 0.97, sparkle) * spMask;
                    sparkle *= smoothstep(uIslandR + 0.6, uIslandR + 4.0, r);
                    // ~30% intensity — quieter twinkle that doesn't compete
                    // with the rest of the scene.
                    col += vec3(1.0) * sparkle * mix(0.18, 0.30, shallowness);

                    /* ----- SHORE FOAM ——————————————————————————————————————
                     * Crisp band at the waterline + two staggered outward
                     * pulses for the lapping rhythm. Independent of the
                     * caustic pattern above so the shoreline always reads. */
                    float edgeFoam = smoothstep(uIslandR + 0.65, uIslandR + 0.10, r)
                                   * smoothstep(uIslandR - 0.40, uIslandR + 0.20, r);
                    float pulseA = fract(uTime * 0.18);
                    float pulseB = fract(uTime * 0.18 + 0.5);
                    float ringA = smoothstep(0.35, 0.0, abs(r - (uIslandR + 0.4 + pulseA * 2.6)))
                                  * (1.0 - pulseA);
                    float ringB = smoothstep(0.35, 0.0, abs(r - (uIslandR + 0.4 + pulseB * 2.6)))
                                  * (1.0 - pulseB);
                    float foam = max(edgeFoam, max(ringA, ringB) * 0.55);
                    col = mix(col, uFoam, foam * 0.78);

                    // Wave-crest highlight — bright on crests, dark in troughs.
                    col += vec3(0.15) * max(0.0, vWave) * 4.5;
                    col -= vec3(0.08) * max(0.0, -vWave) * 3.0;
                    // Far edge fades to sky tint (atmospheric blend).
                    float farFade = smoothstep(uIslandR + 12.0, uIslandR + 22.0, r);
                    col = mix(col, uSkyTint, farFade * 0.45);
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        })
        this.water = new THREE.Mesh(geo, this.waterMat)
        this.water.position.y = -0.15
        this.water.frustumCulled = false
        this.scene.add(this.water)
    }

    update()
    {
        // Push the live sun position into the plateau material so its
        // shading tracks the day cycle in lockstep with Bruno's Grass shader.
        const s = this.state.sun
        this.plateauMat.uniforms.uSunPosition.value.set(s.position.x, s.position.y, s.position.z)

        // Water: integrate the ocean clock at a rain-aware rate so the
        // ripples drift slowly by default and speed up gently when it
        // rains. uRain itself scales wave amplitude in the vertex shader.
        // Speed factor: 0.45× clear → 1.0× downpour.
        const rain = this.state.weather ? this.state.weather.rain : 0
        const dt = this.state.time.delta || 0
        this._oceanTime += dt * (0.45 + rain * 0.55)
        this.waterMat.uniforms.uTime.value = this._oceanTime
        this.waterMat.uniforms.uRain.value = rain
        const day = this.state.day.currentState
        if(day)
        {
            this.waterMat.uniforms.uSkyTint.value.setRGB(
                day.skyBottom[0] / 255,
                day.skyBottom[1] / 255,
                day.skyBottom[2] / 255,
            )

            // Day-cycle lights — drive the scene-wide ambient + sun-direction
            // lights from the keyframe palette so the Lambert-shaded materials
            // (sand, cliff, tree trunk + canopy) darken at night and warm at
            // dusk. Intensities tuned so a bright noon stays ≈ the prior fixed
            // values and night collapses to a quiet 0.10/0.05 floor.
            this.ambient.color.setRGB(day.ambColor[0] / 255, day.ambColor[1] / 255, day.ambColor[2] / 255)
            this.ambient.intensity = day.ambInt
            this.directional.color.setRGB(day.sunColor[0] / 255, day.sunColor[1] / 255, day.sunColor[2] / 255)
            this.directional.intensity = 0.95 * day.sunInt
        }
    }
}
