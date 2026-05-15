import * as THREE from 'three'
import type { WorldEnvironmentControls } from '../worldStyle'
import { worldWeatherAtElapsed } from '../worldStyle'

const WEATHER_HAZE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const WEATHER_HAZE_FRAGMENT = `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 fromSun = (vUv - vec2(0.5, 0.78)) * vec2(1.0, 1.28);
    float haze = 1.0 - smoothstep(0.0, 0.74, length(fromSun));
    float shaftA = pow(max(0.0, sin((vUv.x * 14.0) + 0.8 + sin(uTime * 0.03) * 0.16)), 5.0);
    float shaftB = pow(max(0.0, sin((vUv.x * 9.0) - 1.7)), 6.0);
    float ray = (shaftA * 0.75 + shaftB * 0.42) * (1.0 - smoothstep(0.0, 0.9, length(fromSun)));
    float upperMask = smoothstep(0.18, 0.72, vUv.y);
    float alpha = (haze * 0.07 + ray * 0.12) * upperMask * uOpacity;
    gl_FragColor = vec4(vec3(0.9, 1.0, 0.96), alpha);
  }
`

export function createWeatherScene(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-weather-scene'
  group.userData.worldWeatherEffect = true

  const haze = createWeatherHaze()
  group.add(haze)

  return group
}

export function tickWeatherScene(
  root: THREE.Object3D,
  elapsed: number,
  controls?: WorldEnvironmentControls,
) {
  const weather = worldWeatherAtElapsed(elapsed, controls)
  root.traverse((object) => {
    const material = object instanceof THREE.Mesh ? object.material : null
    if (!(material instanceof THREE.ShaderMaterial)) return

    if (object.userData.weatherRole === 'haze') {
      const time = material.uniforms.uTime
      const opacity = material.uniforms.uOpacity
      if (time) time.value = elapsed
      if (opacity) {
        opacity.value = weather.isNight ? 0 : THREE.MathUtils.clamp(weather.sunIntensity, 0, 1)
      }
    }
  })
}

function createWeatherHaze(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: WEATHER_HAZE_VERTEX,
    fragmentShader: WEATHER_HAZE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(74, 42), material)
  mesh.name = 'student-space-weather-haze-rays'
  mesh.position.set(0, 12, -48)
  mesh.renderOrder = -80
  mesh.frustumCulled = false
  mesh.userData.weatherRole = 'haze'
  return mesh
}
