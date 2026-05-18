import * as THREE from 'three'

import View from './View.js'

/**
 * Rainbow — a stylised half-arc banded gradient that hangs in the sky on
 * demand. There's no auto rule yet (rainbows only feature when the student
 * flips the HourHud switch). When the switch flips on, opacity eases up;
 * when it flips off, opacity eases back down — no hard pop in or out.
 *
 * The arc is drawn into a quad far in front of the camera with a polar
 * shader: only the upper semicircle of the quad lights up, and only the
 * thin ring band between r = 0.78 and r = 1.0 paints ROYGBIV. Additive
 * blending lifts the arc onto the sky without flattening the gradient
 * already baked into the day cycle.
 */

const VERT = `
    varying vec2 vUv;
    void main()
    {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const FRAG = `
    uniform float uOpacity;
    varying vec2 vUv;

    vec3 rainbowAt(float t)
    {
        // 7-stop ROYGBIV palette, interpolated linearly across the band.
        if(t < 1.0/7.0) return mix(vec3(0.85,0.18,0.20), vec3(0.95,0.45,0.10), t * 7.0);
        if(t < 2.0/7.0) return mix(vec3(0.95,0.45,0.10), vec3(0.99,0.85,0.15), (t - 1.0/7.0) * 7.0);
        if(t < 3.0/7.0) return mix(vec3(0.99,0.85,0.15), vec3(0.32,0.75,0.32), (t - 2.0/7.0) * 7.0);
        if(t < 4.0/7.0) return mix(vec3(0.32,0.75,0.32), vec3(0.22,0.55,0.86), (t - 3.0/7.0) * 7.0);
        if(t < 5.0/7.0) return mix(vec3(0.22,0.55,0.86), vec3(0.30,0.32,0.82), (t - 4.0/7.0) * 7.0);
        if(t < 6.0/7.0) return mix(vec3(0.30,0.32,0.82), vec3(0.55,0.22,0.75), (t - 5.0/7.0) * 7.0);
        return vec3(0.55,0.22,0.75);
    }

    void main()
    {
        // Centre bottom = arc origin; remap so y = 0 is the horizon line.
        vec2 p = vec2(vUv.x - 0.5, vUv.y) * 2.0;
        if(p.y < 0.0) discard;

        float r = length(p);
        float innerR = 0.78;
        float outerR = 1.0;
        float band = (r - innerR) / (outerR - innerR);
        if(band < 0.0 || band > 1.0) discard;

        vec3 col = rainbowAt(band);
        // Soft inner + outer falloff so the band reads as a painted arc,
        // not a hard ring slice.
        float edge = smoothstep(0.0, 0.10, band) * (1.0 - smoothstep(0.86, 1.0, band));
        float horizonFade = smoothstep(0.0, 0.10, p.y);
        float alpha = edge * horizonFade * uOpacity * 0.62;
        gl_FragColor = vec4(col, alpha);
    }
`

const EASE = 0.06       // per-frame approach toward target opacity

export default class Rainbow
{
    constructor()
    {
        this.view = View.getInstance()
        this.scene = this.view.scene

        this.force = false
        this._opacity = 0

        const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite:  false,
            side:        THREE.DoubleSide,
            blending:    THREE.AdditiveBlending,
            uniforms:    { uOpacity: { value: 0 } },
            vertexShader:   VERT,
            fragmentShader: FRAG,
        })
        this.mat = mat

        // Big quad far out so the arc sits behind everything but the sky.
        // Position is anchored in world space, away from the sun side so
        // when it lights up it doesn't sit on top of the sun disc.
        const geo  = new THREE.PlaneGeometry(70, 35)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(0, 6, -60)
        mesh.frustumCulled = false
        mesh.renderOrder = 997   // before aurora's 998 so aurora layers above
        this.mesh = mesh
        this.scene.add(mesh)
    }

    /** Manual control wired into HourHud. */
    setForce(on)
    {
        this.force = !!on
    }

    update()
    {
        const target = this.force ? 1 : 0
        this._opacity += (target - this._opacity) * EASE
        this.mat.uniforms.uOpacity.value = this._opacity
    }
}
