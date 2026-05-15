import * as THREE from 'three'

const EASE = 0.06

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = `
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 rainbowAt(float t) {
    if (t < 1.0 / 7.0) return mix(vec3(0.85, 0.18, 0.20), vec3(0.95, 0.45, 0.10), t * 7.0);
    if (t < 2.0 / 7.0) return mix(vec3(0.95, 0.45, 0.10), vec3(0.99, 0.85, 0.15), (t - 1.0 / 7.0) * 7.0);
    if (t < 3.0 / 7.0) return mix(vec3(0.99, 0.85, 0.15), vec3(0.32, 0.75, 0.32), (t - 2.0 / 7.0) * 7.0);
    if (t < 4.0 / 7.0) return mix(vec3(0.32, 0.75, 0.32), vec3(0.22, 0.55, 0.86), (t - 3.0 / 7.0) * 7.0);
    if (t < 5.0 / 7.0) return mix(vec3(0.22, 0.55, 0.86), vec3(0.30, 0.32, 0.82), (t - 4.0 / 7.0) * 7.0);
    if (t < 6.0 / 7.0) return mix(vec3(0.30, 0.32, 0.82), vec3(0.55, 0.22, 0.75), (t - 5.0 / 7.0) * 7.0);
    return vec3(0.55, 0.22, 0.75);
  }

  void main() {
    vec2 p = vec2(vUv.x - 0.5, vUv.y) * 2.0;
    if (p.y < 0.0) discard;

    float r = length(p);
    float innerR = 0.78;
    float outerR = 1.0;
    float band = (r - innerR) / (outerR - innerR);
    if (band < 0.0 || band > 1.0) discard;

    vec3 col = rainbowAt(band);
    float edge = smoothstep(0.0, 0.10, band) * (1.0 - smoothstep(0.86, 1.0, band));
    float horizonFade = smoothstep(0.0, 0.10, p.y);
    float alpha = edge * horizonFade * uOpacity * 0.62;
    gl_FragColor = vec4(col, alpha);
  }
`

type RainbowMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uOpacity: { value: number }
  }
}

export function createRainbowEffect(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  }) as RainbowMaterial

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(70, 35), material)
  mesh.name = 'student-space-rainbow'
  mesh.position.set(0, 6, -60)
  mesh.frustumCulled = false
  mesh.renderOrder = 997
  mesh.userData.rainbowMaterial = material
  return mesh
}

export function tickRainbowEffect(root: THREE.Object3D, targetOpacity: number) {
  const material = root.userData.rainbowMaterial as RainbowMaterial | undefined
  if (!material) return
  material.uniforms.uOpacity.value += (targetOpacity - material.uniforms.uOpacity.value) * EASE
}
