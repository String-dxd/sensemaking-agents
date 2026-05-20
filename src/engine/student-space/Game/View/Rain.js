import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Rain overlay — two stacked passes drawn after the main scene render
 * with an orthographic camera in NDC space:
 *
 *   1. Drops pass — a fullscreen quad with a procedural cellular-noise
 *      droplet field. Before drawing it, we copy the just-rendered
 *      framebuffer into a texture, then each bead refracts and magnifies
 *      that texture with a CSS-sky fallback for transparent pixels.
 *   2. Streak pass — Tiny Skies' 200 individually-positioned thin plane
 *      meshes, additively blended, animated falling top→bottom at a
 *      wind angle.
 *
 * Architecture note — Tiny Skies samples an opaque framebuffer. Our
 * canvas is transparent because the CSS gradient is the real sky, so
 * plain framebuffer refraction returns black in sky-only areas. This
 * version still samples the current viewpoint for island/tree/water
 * pixels, then blends in the current day-cycle sky gradient wherever the
 * framebuffer alpha is transparent.
 *
 * The streaks pass is a verbatim port of Tiny Skies' streak pool
 * (200 instances, 0.35 rad wind, 0.09 jitter, additive blending).
 */

const STREAK_COUNT  = 200
const WIND_ANGLE    = 0.35
const ANGLE_JITTER  = 0.09
const NOISE_SIZE    = 256

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/* ── Streak shader ──────────────────────────────────────────────── */

const streakVert = /* glsl */`
    varying vec2 vUv;
    void main()
    {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const streakFrag = /* glsl */`
    uniform float opacity;
    varying vec2 vUv;
    void main()
    {
        float along  = vUv.y;
        float taper  = smoothstep(0.0, 0.15, along) * smoothstep(1.0, 0.7, along);
        float across = abs(vUv.x - 0.5) * 2.0;
        float shape  = (1.0 - smoothstep(0.0, 1.0, across)) * taper;
        gl_FragColor = vec4(0.75, 0.8, 0.88, shape * opacity);
    }
`

/* ── Drops shader — procedural refractive lens beads ───────────── */

const dropsVert = /* glsl */`
    varying vec2 vUv;
    void main()
    {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

// Cellular noise from Tiny Skies' RainOverlay translated to a "where is a
// drop" decision + signed-distance-style shape. Each live cell acts like a
// little lens: it samples a displaced/magnified copy of the current view, adds
// a bright caustic rim, and only lightly tints the result.
const dropsFrag = /* glsl */`
    uniform sampler2D sceneTex;
    uniform sampler2D noiseTex;
    uniform vec2  resolution;
    uniform float time;
    uniform float opacity;
    uniform vec3  skyTop;
    uniform vec3  skyMid;
    uniform vec3  skyBottom;

    varying vec2 vUv;

    vec3 skyAt(vec2 uv)
    {
        float y = clamp(uv.y, 0.0, 1.0);
        vec3 lower = mix(skyBottom, skyMid, smoothstep(0.0, 0.58, y));
        vec3 upper = mix(skyMid, skyTop, smoothstep(0.45, 1.0, y));
        return mix(lower, upper, smoothstep(0.42, 0.78, y));
    }

    vec3 sampleView(vec2 uv)
    {
        uv = clamp(uv, vec2(0.001), vec2(0.999));
        vec4 scene = texture2D(sceneTex, uv);
        vec3 sky = skyAt(uv);
        return mix(sky, scene.rgb, smoothstep(0.02, 0.65, scene.a));
    }

    void main()
    {
        vec2 u = vUv;
        vec2 n = texture2D(noiseTex, u * 0.1).rg;

        float bestShape = 0.0;
        float bestDist  = 1.0;
        vec2  bestLocal = vec2(0.0);
        vec2  bestUvOffset = vec2(0.0);
        float bestScale = 1.0;

        // 4 cell scales (Tiny Skies' r-loop): bigger r → coarser cells →
        // bigger, rarer drops; smaller r → finer cells → smaller, denser.
        for(float r = 4.0; r > 0.0; r -= 1.0)
        {
            vec2 x      = resolution * r * 0.009;
            vec2 nShift = (n - 0.5) * 0.8 / 6.28318;

            // Which cell of this grid are we in?
            vec2 cellCoord = floor(u * x + nShift + 0.25) / x;
            vec4 d         = texture2D(noiseTex, cellCoord);

            // Position WITHIN the cell, in [0,1] per axis.
            vec2 inCell = fract(u * x + nShift + 0.25);

            // Per-drop lifecycle: a sin-wave phase based on noise channels
            // gives each drop its own birth/peak/decay over time.
            vec2 p = 6.28318 * u * x + (n - 0.5) * 0.8;
            vec2 s = sin(p);
            float t = (s.x + s.y) * max(0.0, 1.0 - fract(time * (d.b + 0.1) * 0.45 + d.g) * 1.4);

            // Is this cell "live"? Same gating as Tiny Skies.
            if(d.r < (5.0 - r) * 0.074 && t > 0.42)
            {
                // Distance from the cell centre, normalised. Cell centre is
                // (0.5, 0.5); aspect-correct so drops are circular.
                vec2 dropOffset = (inCell - 0.5);
                float aspect = resolution.x / max(1.0, resolution.y);
                vec2 local = dropOffset;
                local.x *= aspect / x.x * x.y;
                float distN = length(local) * 1.28;

                if(distN < 1.0)
                {
                    // Drop body shape — soft falloff toward rim.
                    float shape = smoothstep(1.0, 0.0, distN);
                    if(shape > bestShape)
                    {
                        bestShape = shape;
                        bestDist  = distN;
                        bestLocal = local;
                        bestUvOffset = dropOffset / x;
                        bestScale = r;
                    }
                }
            }
        }

        if(bestShape <= 0.0) discard;

        vec2 normal2D = bestLocal / max(0.001, length(bestLocal));
        float dome = sqrt(max(0.0, 1.0 - bestDist * bestDist));
        float rim = smoothstep(0.62, 1.0, bestDist);

        // Tiny lens: pull the sample toward the cell centre to magnify the
        // scene, then add a normal-based offset so the world bends at the rim.
        vec2 cellCenter = u - bestUvOffset;
        float lensSize = mix(0.024, 0.065, (bestScale - 1.0) / 3.0);
        vec2 magnifiedUv = mix(u, cellCenter, 0.28 + dome * 0.18);
        vec2 refractUv = magnifiedUv - normal2D * lensSize * (0.35 + rim * 1.4);
        refractUv.y -= lensSize * 0.45 * dome;

        vec3 behind = sampleView(refractUv);
        vec3 inner  = sampleView(refractUv + vec2(0.006, -0.009) * (1.0 + rim));
        vec3 col = mix(behind, inner, 0.35);

        // Glass lighting: white glint, darker lower rim, cyan top edge.
        vec2 highlightPos = bestLocal - vec2(-0.18, 0.22);
        float glint = exp(-dot(highlightPos, highlightPos) * 95.0);
        float topEdge = smoothstep(0.0, 0.78, normal2D.y) * rim;
        float lowerEdge = smoothstep(0.25, 0.95, -normal2D.y) * rim;
        float meniscus = smoothstep(0.72, 0.98, bestDist) * (1.0 - smoothstep(0.98, 1.0, bestDist));

        col = mix(col, col * vec3(0.64, 0.82, 0.96), lowerEdge * 0.42);
        col = mix(col, vec3(0.72, 1.0, 1.0), topEdge * 0.28);
        col += vec3(glint * 1.45);
        col += vec3(meniscus * 0.22);

        float a = (0.48 + rim * 0.34 + glint * 0.42) * opacity;
        a *= smoothstep(1.0, 0.86, bestDist);

        gl_FragColor = vec4(col * a, a);
    }
`

/* ── Helpers ────────────────────────────────────────────────────── */

function createNoiseTexture()
{
    const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
    for(let i = 0; i < data.length; i++)
        data[i] = Math.floor(Math.random() * 256)
    const tex = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
}

/* ── Rain class ─────────────────────────────────────────────────── */

export default class Rain
{
    constructor()
    {
        this.view    = View.getInstance()
        this.state   = State.getInstance()
        this.weather = this.state.weather

        this.streakScene = new THREE.Scene()
        this.dropsScene  = new THREE.Scene()
        this.orthoCam    = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        this.geo         = new THREE.PlaneGeometry(1, 1)

        // Streak pool
        this.streaks      = []
        this.streakMeshes = []
        this.streakMats   = []
        for(let i = 0; i < STREAK_COUNT; i++)
        {
            const mat = new THREE.ShaderMaterial({
                vertexShader:   streakVert,
                fragmentShader: streakFrag,
                uniforms:       { opacity: { value: 0 } },
                transparent:    true,
                depthTest:      false,
                depthWrite:     false,
                side:           THREE.DoubleSide,
                blending:       THREE.AdditiveBlending,
            })
            const mesh = new THREE.Mesh(this.geo, mat)
            mesh.visible = false
            this.streakScene.add(mesh)
            this.streakMeshes.push(mesh)
            this.streakMats.push(mat)
            this.streaks.push({
                x: 0, y: 0, speed: 0, length: 0, width: 0,
                angle: 0, active: false,
            })
        }

        // Drops pass — procedural cells refracting the just-rendered view.
        this.noiseTex = createNoiseTexture()
        this.sceneTex = new THREE.FramebufferTexture(1, 1, THREE.RGBAFormat)
        this.sceneTex.minFilter = THREE.LinearFilter
        this.sceneTex.magFilter = THREE.LinearFilter
        this.sceneTex.generateMipmaps = false
        this.dropsGeo = new THREE.PlaneGeometry(2, 2)
        this.dropsMat = new THREE.ShaderMaterial({
            vertexShader:       dropsVert,
            fragmentShader:     dropsFrag,
            uniforms: {
                sceneTex:   { value: this.sceneTex },
                noiseTex:   { value: this.noiseTex },
                resolution: { value: new THREE.Vector2(1, 1) },
                time:       { value: 0 },
                opacity:    { value: 0 },
                skyTop:     { value: new THREE.Color(0x1a4a82) },
                skyMid:     { value: new THREE.Color(0x60d8e8) },
                skyBottom:  { value: new THREE.Color(0xfff050) },
            },
            transparent:        true,
            depthTest:          false,
            depthWrite:         false,
            premultipliedAlpha: true,
        })
        this.dropsMesh = new THREE.Mesh(this.dropsGeo, this.dropsMat)
        this.dropsMesh.visible = false
        this.dropsScene.add(this.dropsMesh)

        this._bufW = 0
        this._bufH = 0
        this._copyOrigin = new THREE.Vector2()
        this._size = new THREE.Vector2()
        this._currentWeight = 0
        this._time = 0
        this._glassFrame = 0
        this._renderErrLogged = false
    }

    _quality()
    {
        return this.state.performance?.settings || {
            rainGlassCadence: 1,
            rainStreakScale: 1,
        }
    }

    _ensureSize(renderer)
    {
        renderer.getDrawingBufferSize(this._size)
        if(this._size.x === this._bufW && this._size.y === this._bufH) return
        this._bufW = this._size.x
        this._bufH = this._size.y
        this.sceneTex.image.width = this._bufW
        this.sceneTex.image.height = this._bufH
        this.sceneTex.needsUpdate = true
        this.dropsMat.uniforms.resolution.value.set(this._bufW, this._bufH)
    }

    _spawnStreak(idx, heavy)
    {
        const s = this.streaks[idx]
        s.angle  = -WIND_ANGLE + (Math.random() - 0.5) * 2 * ANGLE_JITTER
        s.length = heavy ? 0.12 + Math.random() * 0.20 : 0.08 + Math.random() * 0.14
        s.width  = heavy ? 0.002 + Math.random() * 0.002 : 0.0015 + Math.random() * 0.0015
        s.speed  = heavy ? 2.4 + Math.random() * 1.8 : 1.8 + Math.random() * 1.4
        s.x      = (Math.random() - 0.5) * 2.6
        s.y      = 1.15 + Math.random() * 0.3
        s.active = true
    }

    update()
    {
        const dt = this.state.time.delta
        const rainWeight = this.weather.rain
        const quality = this._quality()
        this._currentWeight = rainWeight

        if(rainWeight <= 0.001)
        {
            for(let i = 0; i < STREAK_COUNT; i++)
            {
                this.streaks[i].active = false
                this.streakMeshes[i].visible = false
            }
            this.dropsMesh.visible = false
            return
        }

        this._time += dt
        const intensity = rainWeight
        const heavy     = intensity > 0.7

        const spawnChance = heavy ? 1.0 : intensity * 0.85
        const spawnRate   = heavy ? 60  : 30
        const qualityScale = THREE.MathUtils.clamp(quality.rainStreakScale ?? 1, 0.1, 1)
        const activeLimit = Math.max(1, Math.floor((heavy ? STREAK_COUNT : STREAK_COUNT * 0.25) * qualityScale))
        const opacityMul  = heavy ? 0.55 : 0.35

        for(let i = 0; i < STREAK_COUNT; i++)
        {
            const s = this.streaks[i]

            if(i >= activeLimit)
            {
                s.active = false
                this.streakMeshes[i].visible = false
                continue
            }

            if(!s.active)
            {
                if(i < activeLimit && Math.random() < spawnChance * dt * spawnRate)
                    this._spawnStreak(i, heavy)
                continue
            }

            s.x +=  Math.sin(s.angle) * s.speed * dt
            s.y += -Math.cos(s.angle) * s.speed * dt

            if(s.y < -1.3)
            {
                s.active = false
                this.streakMeshes[i].visible = false
                continue
            }

            const mesh = this.streakMeshes[i]
            mesh.position.set(s.x, s.y, 0)
            mesh.rotation.z = s.angle
            mesh.scale.set(s.width, s.length, 1)
            mesh.visible = true
            this.streakMats[i].uniforms.opacity.value = intensity * opacityMul
        }

        this.dropsMat.uniforms.time.value    = this._time
        this.dropsMat.uniforms.opacity.value = intensity
        const day = this.state.day.currentState
        if(day)
        {
            const skyBottom = day.skyBottom
            const avg = [
                (day.skyTop[0] + skyBottom[0]) * 0.5,
                (day.skyTop[1] + skyBottom[1]) * 0.5,
                (day.skyTop[2] + skyBottom[2]) * 0.5,
            ]
            const dayBand = (day.hour >= 6 && day.hour <= 16.5) ? clamp01(day.sunInt) * 0.85 : 0
            const cyan = [96, 216, 232]
            const skyMid = [
                avg[0] * (1 - dayBand) + cyan[0] * dayBand,
                avg[1] * (1 - dayBand) + cyan[1] * dayBand,
                avg[2] * (1 - dayBand) + cyan[2] * dayBand,
            ]

            this.dropsMat.uniforms.skyTop.value.setRGB(day.skyTop[0] / 255, day.skyTop[1] / 255, day.skyTop[2] / 255)
            this.dropsMat.uniforms.skyMid.value.setRGB(skyMid[0] / 255, skyMid[1] / 255, skyMid[2] / 255)
            this.dropsMat.uniforms.skyBottom.value.setRGB(skyBottom[0] / 255, skyBottom[1] / 255, skyBottom[2] / 255)
        }
        this.dropsMesh.visible = (quality.rainGlassCadence ?? 1) > 0
    }

    render(renderer)
    {
        if(this._currentWeight <= 0.001) return
        const glassCadence = this._quality().rainGlassCadence ?? 1
        const glassFrame = this._glassFrame++
        const shouldRenderGlass = this.dropsMesh.visible
            && glassCadence > 0
            && (glassCadence === 1 || glassFrame % glassCadence === 0)
        try
        {
            this._ensureSize(renderer)

            renderer.autoClear = false

            if(shouldRenderGlass)
            {
                renderer.copyFramebufferToTexture(this._copyOrigin, this.sceneTex)
                renderer.render(this.dropsScene, this.orthoCam)
            }

            let anyStreakVisible = false
            for(const m of this.streakMeshes)
                if(m.visible) { anyStreakVisible = true; break }
            if(anyStreakVisible)
                renderer.render(this.streakScene, this.orthoCam)

            renderer.autoClear = true
        }
        catch(e)
        {
            renderer.autoClear = true
            if(!this._renderErrLogged)
            {
                this._renderErrLogged = true
                throw new Error('[rain] render failed: ' + (e.message || e))
            }
        }
    }
}
