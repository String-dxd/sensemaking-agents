import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Aurora curtains — six vertical ribbons in a ring around the island,
 * additively blended, faded in by twilight + night.
 *
 * Direct port of buildAurora() and the render-loop opacity logic from
 * legacy student_space_island_v0.html. DESIGN.md treats the aurora as
 * the signature cue at h≈18.5 ("this place is not quite earthly"), so
 * the ribbon is forced on during the twilight window even before night
 * opacity has any value.
 */
const COLOR_SETS = [
    // green → blue → violet
    [new THREE.Color(0x6cb148), new THREE.Color(0x7fb3d9), new THREE.Color(0xb49ad6)],
    // lime → cyan → pink
    [new THREE.Color(0x84d65e), new THREE.Color(0x66c8d8), new THREE.Color(0xd09ee8)],
    // green → warm → violet
    [new THREE.Color(0x6cb148), new THREE.Color(0xff8a5c), new THREE.Color(0xb49ad6)],
]

export default class Aurora
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene

        // Tall ribbons — each curtain reaches further into the sky so the
        // aurora reads as light pouring down from above rather than short
        // pillars sitting on the horizon. Width back to the legacy 9 since
        // the student wants each ribbon vertically taller, not wider.
        this.params = {
            count:      6,
            ringRadius: 22,
            width:      9,
            height:     16,
        }

        this.group = new THREE.Group()
        this.mats = []
        // HourHud "force aurora" override. When true, the night-curve auto
        // opacity is replaced with a max-strength constant so the student
        // can summon the ribbon during the day.
        this.force = false
        this._opacity = 0
        this._build()
        this.scene.add(this.group)
    }

    /** Manual override hook used by HourHud. */
    setForce(on)
    {
        this.force = !!on
    }

    _build()
    {
        const p = this.params
        for(let i = 0; i < p.count; i++)
        {
            const angle = (i / p.count) * Math.PI * 2
            const set = COLOR_SETS[i % COLOR_SETS.length]
            const geo = new THREE.PlaneGeometry(p.width, p.height, 48, 18)
            const mat = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite:  false,
                side:        THREE.DoubleSide,
                blending:    THREE.AdditiveBlending,
                uniforms: {
                    uTime:    { value: i * 4.1 },
                    uOpacity: { value: 0 },
                    uColor1:  { value: set[0] },
                    uColor2:  { value: set[1] },
                    uColor3:  { value: set[2] },
                },
                vertexShader: `
                    uniform float uTime;
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        vec3 p = position;
                        float w1 = sin(p.x * 0.6  + uTime * 0.4 ) * 0.5;
                        float w2 = sin(p.x * 1.5  + uTime * 0.25 + 1.2) * 0.3;
                        float w3 = sin(p.x * 0.32 + uTime * 0.18 + 2.7) * 0.7;
                        p.z += (w1 + w2 + w3) * (0.25 + uv.y * 0.75);
                        p.y += sin(p.x * 0.2 + uTime * 0.1) * 0.3 * uv.y;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform float uOpacity;
                    uniform vec3  uColor1;
                    uniform vec3  uColor2;
                    uniform vec3  uColor3;
                    varying vec2 vUv;
                    void main() {
                        float c1 = pow(sin(vUv.x * 13.0 + uTime * 0.5) * 0.5 + 0.5, 2.0);
                        float c2 = pow(sin(vUv.x *  8.0 - uTime * 0.3 + 1.8) * 0.5 + 0.5, 3.0);
                        float curtain = max(c1 * 0.8, c2 * 0.5);
                        float shimmer = 0.8 + 0.2 * sin(vUv.x * 28.0 + vUv.y * 7.0 + uTime * 1.8);
                        float vfade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
                        float hfade = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
                        float t = vUv.y;
                        vec3 col = (t < 0.4)
                            ? mix(uColor1, uColor2, t / 0.4)
                            : mix(uColor2, uColor3, (t - 0.4) / 0.6);
                        float a = curtain * vfade * hfade * shimmer * uOpacity * 0.55;
                        gl_FragColor = vec4(col, a);
                    }
                `,
            })
            this.mats.push(mat)

            const mesh = new THREE.Mesh(geo, mat)
            // Anchor each ribbon so its visible band (vfade range 0.18–0.55)
            // sits just above the horizon and stretches upward — using 0.35
            // instead of the legacy 0.65 keeps the taller plane rooted near
            // ground rather than floating high in the sky.
            mesh.position.set(
                Math.cos(angle) * p.ringRadius,
                p.height * 0.35 + (i % 2) * 0.6,
                Math.sin(angle) * p.ringRadius,
            )
            mesh.lookAt(0, mesh.position.y, 0)
            mesh.frustumCulled = false
            // Render after the rest of the scene so additive blending stacks
            // cleanly on the island silhouette.
            mesh.renderOrder = 998
            this.group.add(mesh)
        }
    }

    update()
    {
        const day = this.state.day.currentState
        if(!day) return

        const h = day.hour
        // Legacy render-loop math: night opacity grows symmetrically around
        // 0/24, and a sinusoidal twilight floor sits inside [18, 19.5] so the
        // hero cold-start screenshot at h=18.5 already shows the ribbon.
        const nightFactor = THREE.MathUtils.clamp(
            h < 6 ? 1 - h / 6 : (h > 19.5 ? (h - 19.5) / 4.5 : 0),
            0, 1,
        )
        const twilightFactor = (h >= 18.0 && h <= 19.5)
            ? Math.sin((h - 18.0) / 1.5 * Math.PI) * 0.45
            : 0
        const auto = Math.max(nightFactor, twilightFactor)
        // Ease toward the force target (1) when on, otherwise sit on auto.
        // Smoothing keeps daylight-toggle from popping the ribbon in.
        const target = this.force ? 1 : auto
        this._opacity += (target - this._opacity) * 0.08

        const dt = this.state.time.delta
        for(const m of this.mats)
        {
            m.uniforms.uTime.value += dt
            m.uniforms.uOpacity.value = this._opacity
        }
    }
}
