import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import View from './View.js'
import State from '../State/State.js'
import Debug from '../Debug/Debug.js'

/**
 * Tree manager — direct port of Bruno Simon's folio-2025 tree system to
 * plain WebGL (three 0.149, no TSL).
 *
 * Each tree comes from his Blender GLB (treeBody trunk + 6 treeLeaves
 * icosphere references) shipped in public/trees/. The icospheres themselves
 * are NOT rendered — they're placement envelopes. Inside each one we drop
 * 80 alpha-tested billboards textured with Bruno's foliageSDF atlas (a
 * little soft-leaf mask), all merged into one geometry and drawn as an
 * InstancedMesh across every leaf-ref of every tree.
 *
 * The leaves get the painterly wind look by rotating each billboard's UV
 * around its centre by a world-position-driven sin/cos field — same trick
 * Bruno uses, just spelled in glsl instead of TSL. Two-tone color mixes
 * colorA → colorB via dot(worldNormal, sunDir); the sun direction syncs
 * to the live day-cycle so the lit/shadow split tracks sunrise → noon →
 * sunset.
 *
 * Trunks stay static — the wind illusion lives entirely in the leaf mask.
 */
// PATCH (sensemaking-agents 2026-05-18, see src/engine/student-space/PATCHES.md #1):
// Self-host the DRACO decoder under public/draco/ instead of fetching from
// https://www.gstatic.com/draco/v1/decoders/. The gstatic CDN is whitelist-
// blocked on Singapore MOE school networks and trees silently fail to load.
// Re-apply on every upstream sync.
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

const OAK_COLOR_A    = 0x3A7D2A
const OAK_COLOR_B    = 0x8AAA35
const CHERRY_COLOR_A = 0xFF66A3
const CHERRY_COLOR_B = 0xFFCC66

// Billboard cloud knobs. 80 planes per icosphere matches Bruno; plane size
// is local to the unit-radius icosphere — so the final visible leaf size is
// PLANE_SIZE × icoRefScale × treeScale, ~0.18m at our defaults.
const LEAVES_PER_BLOB = 80
const PLANE_SIZE      = 0.50
const ALPHA_THRESHOLD = 0.32

// The first entry is the centre-tree anchor — IslandReveal grows it
// during beat K and the rest of the island grouping reads as
// satellites. Scale is bumped above the other entries so it carries
// the wide-shot silhouette.
const PLACEMENTS = [
    { species: 'oak',    x:  0.0, z:  0.0, scale: 0.78, yaw:  0.00 },
    { species: 'oak',    x: -2.1, z: -1.6, scale: 0.52, yaw:  0.85 },
    { species: 'cherry', x:  2.4, z: -1.1, scale: 0.50, yaw:  1.60 },
    { species: 'cherry', x: -1.8, z:  2.1, scale: 0.56, yaw: -0.70 },
    { species: 'oak',    x:  1.6, z:  2.4, scale: 0.54, yaw:  2.35 },
    { species: 'oak',    x: -3.2, z:  0.3, scale: 0.60, yaw: -1.30 },
    { species: 'cherry', x:  3.0, z:  0.9, scale: 0.48, yaw:  2.20 },
]

// Tiny seeded RNG — keeps the leaf cloud deterministic so HMR doesn't shuffle.
function mulberry32(seed)
{
    let a = seed >>> 0
    return () =>
    {
        a |= 0
        a = (a + 0x6D2B79F5) | 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Build a unit-sphere cloud of leaf billboards. Each plane lives at its
// own position inside the unit sphere (radius-biased toward the shell);
// we DO NOT pre-translate or pre-orient the plane — instead the plane's
// centre is recorded in a custom `aPlaneCenter` attribute, and the vertex
// shader billboards each plane around that centre so it always faces the
// camera. That's the trick that makes Bruno's foliage cloud look dense
// from any angle (every plane shows face-on, leaves stack visually) rather
// than balloon-thin (planes facing away or edge-on go invisible).
//
// We also store an `aRadial` attribute (the cloud-local outward direction)
// per vertex so the fragment shader can shade each leaf as if its normal
// pointed radially out of its blob — sun-side leaves bright, shadow-side
// dim — without depending on the billboard's camera-facing normal.
function buildLeafCloudGeometry()
{
    const rng = mulberry32(42)
    const planes = []

    const centers = []
    const radials = []

    for(let i = 0; i < LEAVES_PER_BLOB; i++)
    {
        // Plane centred at origin; just give it a random in-plane spin so
        // each leaf's uv samples a different region of the SDF atlas after
        // wind rotation.
        const plane = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE)
        plane.rotateZ(rng() * Math.PI * 2)

        // Position inside the unit sphere — Bruno's recipe: uniform direction
        // × shell-biased radius (1 - rng^3 puts most planes near r=1).
        const theta = Math.PI * 2 * rng()
        const phi   = Math.acos(2 * rng() - 1)
        const r     = 1 - Math.pow(rng(), 3)
        const px    = r * Math.sin(phi) * Math.cos(theta)
        const py    = r * Math.cos(phi)
        const pz    = r * Math.sin(phi) * Math.sin(theta)

        let rx = px, ry = py, rz = pz
        const rl = Math.hypot(rx, ry, rz) || 1
        rx /= rl; ry /= rl; rz /= rl

        // PlaneGeometry has 4 verts — write the per-plane centre + radial
        // direction once per vertex so the shader can read them.
        for(let v = 0; v < 4; v++)
        {
            centers.push(px, py, pz)
            radials.push(rx, ry, rz)
        }

        planes.push(plane)
    }

    const geo = mergeBufferGeometries(planes)
    geo.setAttribute('aPlaneCenter', new THREE.Float32BufferAttribute(centers, 3))
    geo.setAttribute('aRadial',      new THREE.Float32BufferAttribute(radials, 3))
    return geo
}

function loadGLB(path)
{
    return new Promise((resolve, reject) =>
    {
        gltfLoader.load(path, resolve, undefined, reject)
    })
}

const LEAVES_VERTEX = `
attribute vec3 aPlaneCenter;
attribute vec3 aRadial;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vShadingN;

void main()
{
    vUv = uv;

    mat4 instModel = modelMatrix * instanceMatrix;

    // Plane centre in world space (the blob's instance transform scales,
    // rotates and translates the cloud-local centre into the world).
    vec3 centerWorld = (instModel * vec4(aPlaneCenter, 1.0)).xyz;

    // Camera-facing billboard frame at that centre. We rebuild it per-plane
    // so each leaf in the cloud independently faces the camera, regardless
    // of how the user has orbited.
    vec3 toCam   = normalize(cameraPosition - centerWorld);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right   = normalize(cross(worldUp, toCam));
    vec3 up      = cross(toCam, right);

    // The plane's local geometry is at the origin (size PLANE_SIZE around 0);
    // we pick up the instance's uniform scale so the leaf size also scales
    // with the icosphere reference's own scale (smaller refs → smaller leaves).
    float instScale = length(vec3(instModel[0].xyz));

    vec3 worldPos = centerWorld + (position.x * right + position.y * up) * instScale;

    // Shading normal: radial direction in world space. This is independent
    // of the camera-facing billboard frame — it gives each leaf a stable
    // sun/shadow tone based on where it sits in the canopy, not where the
    // camera is looking from.
    vShadingN = normalize(mat3(instModel) * aRadial);
    vWorldPos = worldPos;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`

const LEAVES_FRAGMENT = `
uniform sampler2D uFoliage;
uniform vec3      uColorA;
uniform vec3      uColorB;
uniform vec3      uSunDir;
uniform float     uTime;
uniform float     uThreshold;
uniform float     uWindGust;
uniform float     uWindRotation;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vShadingN;

void main()
{
    // Wind: a bounded sin/cos field over world xz + time. Rotates each
    // leaf's uv around its centre, so the leaf silhouette flutters in place
    // without the billboard ever moving — Bruno's exact recipe.
    float a = sin(uTime * 0.70 + vWorldPos.x * 0.35 + vWorldPos.z * 0.22);
    float b = cos(uTime * 0.55 + vWorldPos.x * 0.30 + vWorldPos.z * 0.48);
    // Same uWindGust the grass / flowers / particles read — leaf flutter
    // rides the global wind envelope so the canopy lulls and gusts in step
    // with the rest of the island. uWindRotation scales the flutter amount
    // so the debug knob can dial it from still (0) to exaggerated (>1).
    float rot = (a + b) * 0.40 * uWindGust * uWindRotation;
    float c = cos(rot);
    float s = sin(rot);
    vec2 uv = vUv - 0.5;
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;

    float alpha = texture2D(uFoliage, uv).r;
    if(alpha < uThreshold) discard;

    // Two-tone leaf colour — shadow side picks up colorA, lit side colorB.
    // Uses the radial shading normal so the sun/shadow split sits across
    // the canopy itself, not across the camera-facing billboard.
    float lit = smoothstep(0.0, 1.0, dot(vShadingN, uSunDir));
    vec3 col = mix(uColorA, uColorB, lit);

    gl_FragColor = vec4(col, 1.0);
}
`

function makeLeavesMaterial(foliageTex, colorA, colorB)
{
    return new THREE.ShaderMaterial({
        uniforms:
        {
            uFoliage:   { value: foliageTex },
            uColorA:    { value: new THREE.Color(colorA) },
            uColorB:    { value: new THREE.Color(colorB) },
            uSunDir:    { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
            uTime:         { value: 0 },
            uThreshold:    { value: ALPHA_THRESHOLD },
            uWindGust:     { value: 0.7 },
            uWindRotation: { value: 1.0 },
        },
        vertexShader:   LEAVES_VERTEX,
        fragmentShader: LEAVES_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: false,
    })
}

export default class Tree
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        this.windSpeed = 1.0
        this.windRotation = 1.0

        this.materials = []        // leaf shader mats (for per-frame uniform updates)
        // Per-tree records — { group } per placement. Public shape kept so
        // FacetView's raycast pickers and tree counter keep working.
        this.entries = []
        this.ready = false

        this._sunV = new THREE.Vector3(0.4, 0.85, 0.3).normalize()
        this._tmpM = new THREE.Matrix4()

        // Foliage SDF texture — Bruno's exact atlas.
        this.foliageTex = new THREE.TextureLoader().load('trees/foliageSDF.png', (tex) =>
        {
            tex.magFilter = THREE.LinearFilter
            tex.minFilter = THREE.LinearFilter
            tex.generateMipmaps = false
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
        })

        this._loadAndBuild()
        this.setDebug()
    }

    async _loadAndBuild()
    {
        try
        {
            const [oakGltf, cherryGltf] = await Promise.all([
                loadGLB('trees/oakTreesVisual.glb'),
                loadGLB('trees/cherryTreesVisual.glb'),
            ])

            this.templates = {
                oak:    this._extractTemplate(oakGltf,    OAK_COLOR_A,    OAK_COLOR_B),
                cherry: this._extractTemplate(cherryGltf, CHERRY_COLOR_A, CHERRY_COLOR_B),
            }

            // Shared billboard-cloud geometry (unit sphere local) — one mesh,
            // every instance reuses it.
            this.leafCloudGeo = buildLeafCloudGeometry()

            // For each species, collect the world matrix of every leaf-icosphere
            // across every placement of that species, then drop a single
            // InstancedMesh into the scene.
            this._placeAll()

            this.ready = true

            // The onboarding orchestrator may have called hideAll() before
            // assets finished loading; apply it now.
            if(this._hideAllPending)
            {
                this._hideAllPending = false
                this.hideAll()
            }
        }
        catch(err)
        {
            console.error('[Tree] failed to load Bruno tree assets:', err)
        }
    }

    _extractTemplate(gltf, leafA, leafB)
    {
        let bodyGeo = null
        let bodyTex = null
        const leafRefs = []

        gltf.scene.updateMatrixWorld(true)
        gltf.scene.traverse((child) =>
        {
            if(!child.isMesh) return
            if(child.name.startsWith('treeBody'))
            {
                bodyGeo = child.geometry
                if(child.material && child.material.map) bodyTex = child.material.map
            }
            else if(child.name.startsWith('treeLeaves'))
            {
                leafRefs.push({
                    position:   child.position.clone(),
                    quaternion: child.quaternion.clone(),
                    scale:      child.scale.clone(),
                })
            }
        })

        if(bodyTex)
        {
            bodyTex.colorSpace = THREE.SRGBColorSpace
            bodyTex.magFilter  = THREE.NearestFilter
            bodyTex.minFilter  = THREE.NearestFilter
            bodyTex.generateMipmaps = false
            bodyTex.needsUpdate = true
        }

        const bodyMat = new THREE.MeshLambertMaterial({
            map: bodyTex,
            flatShading: true,
            side: THREE.DoubleSide,
        })
        const leavesMat = makeLeavesMaterial(this.foliageTex, leafA, leafB)
        this.materials.push(leavesMat)

        // Each leaf-ico ref's local size = (1.4 / 1.0) × node.scale because the
        // GLB icospheres are r≈1.4 in their own object frame. We bake that 1.4
        // here so the unit-radius leaf cloud expands to fill the same volume
        // Bruno's blobs occupied.
        const ICO_RADIUS = 1.40
        for(const ref of leafRefs) ref.scale.multiplyScalar(ICO_RADIUS)

        return { bodyGeo, bodyMat, leafRefs, leavesMat }
    }

    _placeAll()
    {
        // Bucket placements by species so we get one InstancedMesh per species.
        const buckets = { oak: [], cherry: [] }
        // Per-species cursor into the InstancedMesh that's about to be built.
        // Each placement contributes `leafRefs.length` matrices in placement
        // order, so we can record the index range per tree for hideAll/growIn.
        const cursors = { oak: 0, cherry: 0 }
        // Per-species InstancedMesh, retained so the onboarding ceremony can
        // hide leaves at boot and re-project them during growIn.
        this._leafMeshBySpecies = {}
        this._leafMeshes = []

        for(const placement of PLACEMENTS)
        {
            const { species, x, z, scale, yaw } = placement
            const tpl = this.templates[species]
            const groundY = this.island.heightAt(x, z)

            // Per-tree group anchors the trunk; the leaves render through the
            // species-wide InstancedMesh (added below).
            const group = new THREE.Group()
            group.position.set(x, groundY, z)
            group.scale.setScalar(scale)
            group.rotation.y = yaw

            const trunk = new THREE.Mesh(tpl.bodyGeo, tpl.bodyMat)
            trunk.castShadow    = true
            trunk.receiveShadow = true
            group.add(trunk)
            this.scene.add(group)

            // World matrix of the tree group itself.
            group.updateMatrixWorld(true)
            const treeWorld = group.matrixWorld.clone()

            // For each leaf-icosphere ref of this species, compute its world
            // matrix and queue it for the InstancedMesh — and record the
            // blob's world centre + shell radius so Fruits.js can hang fruit
            // across the actual canopy envelope instead of around the trunk.
            // We also keep the per-tree local matrices so growIn() can re-
            // project the leaves from the trunk's current world transform
            // (sync leaves to the trunk's tweening scale).
            const canopy = []
            const leafLocals = []
            for(const ref of tpl.leafRefs)
            {
                const local = new THREE.Matrix4().compose(ref.position, ref.quaternion, ref.scale)
                const world = new THREE.Matrix4().multiplyMatrices(treeWorld, local)
                buckets[species].push(world)
                leafLocals.push(local)

                const center = new THREE.Vector3().setFromMatrixPosition(world)
                const radius = scale * Math.abs(ref.scale.x)
                canopy.push({ center, radius })
            }

            const leafStart = cursors[species]
            const leafEnd   = leafStart + leafLocals.length
            cursors[species] = leafEnd

            this.entries.push({
                group,
                species,
                x, z,
                canopy,
                index:      this.entries.length,
                authoredScale: scale,
                leafLocals,
                leafStart,
                leafEnd,
            })
        }

        for(const species of Object.keys(buckets))
        {
            const matrices = buckets[species]
            if(matrices.length === 0) continue
            const tpl = this.templates[species]
            const inst = new THREE.InstancedMesh(this.leafCloudGeo, tpl.leavesMat, matrices.length)
            inst.frustumCulled = false
            for(let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i])
            inst.instanceMatrix.needsUpdate = true
            this.scene.add(inst)
            this._leafMeshBySpecies[species] = inst
            this._leafMeshes.push(inst)
        }
    }

    /**
     * First-run ceremony helper. Zero every leaf instance matrix and hide
     * every trunk so the world reads as a bare island until growIn() reveals
     * the directed tree. Idempotent.
     */
    hideAll()
    {
        if(!this.ready) { this._hideAllPending = true; return }
        const zero = new THREE.Matrix4().compose(
            new THREE.Vector3(0, -1e3, 0),
            new THREE.Quaternion(),
            new THREE.Vector3(1e-6, 1e-6, 1e-6),
        )
        for(const entry of this.entries)
        {
            entry.group.visible = false
            entry.group.scale.setScalar(0)
        }
        for(const inst of this._leafMeshes)
        {
            for(let i = 0; i < inst.count; i++) inst.setMatrixAt(i, zero)
            inst.instanceMatrix.needsUpdate = true
        }
        this._hidden = true
    }

    /**
     * Reveal one tree by index and tween its trunk scale from 0 to the
     * authored placement scale, re-projecting its leaf instance matrices
     * from the trunk's current world transform each frame so the canopy
     * grows with the trunk. Returns a Promise that resolves when the tween
     * completes (or after the reduced-motion 80ms cap).
     */
    growIn(index, opts = {})
    {
        if(!this.ready) return Promise.resolve()
        const entry = this.entries[index]
        if(!entry) return Promise.resolve()
        const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const duration = reducedMotion ? 80 : (opts.duration ?? 1400)
        const delay    = opts.delay ?? 0
        entry.group.visible = true
        entry.group.scale.setScalar(0)
        if(!this._growIns) this._growIns = []
        return new Promise((resolve) =>
        {
            this._growIns.push({
                entry,
                target:     entry.authoredScale,
                duration,
                startTime:  performance.now() + delay,
                resolve,
            })
        })
    }

    setDebug()
    {
        if(!this.debug.active) return
        const folder = this.debug.ui.getFolder('view/trees')
        folder.add(this, 'windSpeed',    0, 3, 0.05).name('wind speed')
        folder.add(this, 'windRotation', 0, 3, 0.05).name('leaf flutter')
    }

    update()
    {
        if(!this.ready) return

        // Sync the leaves' shader sun direction to the live day-cycle sun.
        const s = this.state.sun.position
        this._sunV.set(s.x, s.y, s.z)
        const t = this.state.time.elapsed * this.windSpeed
        const gust = this.state.wind ? this.state.wind.gust : 0.7
        for(const mat of this.materials)
        {
            mat.uniforms.uSunDir.value.copy(this._sunV)
            mat.uniforms.uTime.value = t
            mat.uniforms.uWindGust.value = gust
            mat.uniforms.uWindRotation.value = this.windRotation
        }

        // Process onboarding growIns: tween trunk scale, re-project leaf
        // instances each frame so the canopy follows the trunk.
        if(this._growIns && this._growIns.length > 0)
        {
            const now = performance.now()
            const remaining = []
            for(const g of this._growIns)
            {
                if(now < g.startTime) { remaining.push(g); continue }
                const elapsed = now - g.startTime
                const t = Math.min(1, elapsed / g.duration)
                const eased = t * t * t * (t * (t * 6 - 15) + 10)
                const scale = g.target * eased
                g.entry.group.scale.setScalar(Math.max(scale, 1e-6))
                g.entry.group.updateMatrixWorld(true)

                const mesh = this._leafMeshBySpecies[g.entry.species]
                if(mesh)
                {
                    for(let i = 0; i < g.entry.leafLocals.length; i++)
                    {
                        this._tmpM.multiplyMatrices(g.entry.group.matrixWorld, g.entry.leafLocals[i])
                        mesh.setMatrixAt(g.entry.leafStart + i, this._tmpM)
                    }
                    mesh.instanceMatrix.needsUpdate = true
                }

                if(t < 1) remaining.push(g)
                else g.resolve?.()
            }
            this._growIns = remaining
        }
    }
}
