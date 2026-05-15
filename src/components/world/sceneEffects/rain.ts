import * as THREE from 'three'
import type { WorldWeatherState } from '../worldStyle'

const STREAK_COUNT = 200
const WIND_ANGLE = 0.35
const ANGLE_JITTER = 0.09
const NOISE_SIZE = 256

type RainStreak = {
  x: number
  y: number
  speed: number
  length: number
  width: number
  angle: number
  active: boolean
}

const STREAK_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const STREAK_FRAGMENT = `
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    float along = vUv.y;
    float taper = smoothstep(0.0, 0.15, along) * smoothstep(1.0, 0.7, along);
    float across = abs(vUv.x - 0.5) * 2.0;
    float shape = (1.0 - smoothstep(0.0, 1.0, across)) * taper;
    gl_FragColor = vec4(0.75, 0.8, 0.88, shape * opacity);
  }
`

const DROPS_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DROPS_FRAGMENT = `
  uniform sampler2D sceneTex;
  uniform sampler2D noiseTex;
  uniform vec2 resolution;
  uniform float time;
  uniform float opacity;
  uniform vec3 skyTop;
  uniform vec3 skyMid;
  uniform vec3 skyBottom;

  varying vec2 vUv;

  vec3 skyAt(vec2 uv) {
    float y = clamp(uv.y, 0.0, 1.0);
    vec3 lower = mix(skyBottom, skyMid, smoothstep(0.0, 0.58, y));
    vec3 upper = mix(skyMid, skyTop, smoothstep(0.45, 1.0, y));
    return mix(lower, upper, smoothstep(0.42, 0.78, y));
  }

  vec3 sampleView(vec2 uv) {
    uv = clamp(uv, vec2(0.001), vec2(0.999));
    vec4 scene = texture2D(sceneTex, uv);
    vec3 sky = skyAt(uv);
    return mix(sky, scene.rgb, smoothstep(0.02, 0.65, scene.a));
  }

  void main() {
    vec2 u = vUv;
    vec2 n = texture2D(noiseTex, u * 0.1).rg;

    float bestShape = 0.0;
    float bestDist = 1.0;
    vec2 bestLocal = vec2(0.0);
    vec2 bestUvOffset = vec2(0.0);
    float bestScale = 1.0;

    for (float r = 4.0; r > 0.0; r -= 1.0) {
      vec2 x = resolution * r * 0.009;
      vec2 nShift = (n - 0.5) * 0.8 / 6.28318;
      vec2 cellCoord = floor(u * x + nShift + 0.25) / x;
      vec4 d = texture2D(noiseTex, cellCoord);
      vec2 inCell = fract(u * x + nShift + 0.25);
      vec2 p = 6.28318 * u * x + (n - 0.5) * 0.8;
      vec2 s = sin(p);
      float t = (s.x + s.y) * max(0.0, 1.0 - fract(time * (d.b + 0.1) * 0.45 + d.g) * 1.4);

      if (d.r < (5.0 - r) * 0.074 && t > 0.42) {
        vec2 dropOffset = inCell - 0.5;
        float aspect = resolution.x / max(1.0, resolution.y);
        vec2 local = dropOffset;
        local.x *= aspect / x.x * x.y;
        float distN = length(local) * 1.28;

        if (distN < 1.0) {
          float shape = smoothstep(1.0, 0.0, distN);
          if (shape > bestShape) {
            bestShape = shape;
            bestDist = distN;
            bestLocal = local;
            bestUvOffset = dropOffset / x;
            bestScale = r;
          }
        }
      }
    }

    if (bestShape <= 0.0) discard;

    vec2 normal2D = bestLocal / max(0.001, length(bestLocal));
    float dome = sqrt(max(0.0, 1.0 - bestDist * bestDist));
    float rim = smoothstep(0.62, 1.0, bestDist);
    vec2 cellCenter = u - bestUvOffset;
    float lensSize = mix(0.024, 0.065, (bestScale - 1.0) / 3.0);
    vec2 magnifiedUv = mix(u, cellCenter, 0.28 + dome * 0.18);
    vec2 refractUv = magnifiedUv - normal2D * lensSize * (0.35 + rim * 1.4);
    refractUv.y -= lensSize * 0.45 * dome;

    vec3 behind = sampleView(refractUv);
    vec3 inner = sampleView(refractUv + vec2(0.006, -0.009) * (1.0 + rim));
    vec3 col = mix(behind, inner, 0.35);

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

type StreakMaterial = THREE.ShaderMaterial & {
  uniforms: { opacity: { value: number } }
}

type DropsMaterial = THREE.ShaderMaterial & {
  uniforms: {
    sceneTex: { value: THREE.FramebufferTexture }
    noiseTex: { value: THREE.DataTexture }
    resolution: { value: THREE.Vector2 }
    time: { value: number }
    opacity: { value: number }
    skyTop: { value: THREE.Color }
    skyMid: { value: THREE.Color }
    skyBottom: { value: THREE.Color }
  }
}

export class StudentSpaceRainEffect {
  private readonly streakScene = new THREE.Scene()
  private readonly dropsScene = new THREE.Scene()
  private readonly orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly streakGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly dropsGeometry = new THREE.PlaneGeometry(2, 2)
  private readonly noiseTexture = createNoiseTexture()
  private readonly sceneTexture = new THREE.FramebufferTexture(1, 1)
  private readonly streaks: RainStreak[] = []
  private readonly streakMeshes: THREE.Mesh[] = []
  private readonly streakMaterials: StreakMaterial[] = []
  private readonly dropsMaterial: DropsMaterial
  private readonly dropsMesh: THREE.Mesh
  private readonly drawingBufferSize = new THREE.Vector2()
  private readonly copyOrigin = new THREE.Vector2()
  private bufferWidth = 0
  private bufferHeight = 0
  private currentWeight = 0
  private time = 0

  constructor() {
    this.sceneTexture.minFilter = THREE.LinearFilter
    this.sceneTexture.magFilter = THREE.LinearFilter
    this.sceneTexture.generateMipmaps = false

    for (let index = 0; index < STREAK_COUNT; index += 1) {
      const material = new THREE.ShaderMaterial({
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        uniforms: { opacity: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }) as StreakMaterial
      const mesh = new THREE.Mesh(this.streakGeometry, material)
      mesh.visible = false
      this.streakScene.add(mesh)
      this.streakMeshes.push(mesh)
      this.streakMaterials.push(material)
      this.streaks.push({ x: 0, y: 0, speed: 0, length: 0, width: 0, angle: 0, active: false })
    }

    this.dropsMaterial = new THREE.ShaderMaterial({
      vertexShader: DROPS_VERTEX,
      fragmentShader: DROPS_FRAGMENT,
      uniforms: {
        sceneTex: { value: this.sceneTexture },
        noiseTex: { value: this.noiseTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        time: { value: 0 },
        opacity: { value: 0 },
        skyTop: { value: new THREE.Color(0x1a4a82) },
        skyMid: { value: new THREE.Color(0x60d8e8) },
        skyBottom: { value: new THREE.Color(0xfff050) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
    }) as DropsMaterial

    this.dropsMesh = new THREE.Mesh(this.dropsGeometry, this.dropsMaterial)
    this.dropsMesh.visible = false
    this.dropsScene.add(this.dropsMesh)
  }

  update(deltaSeconds: number, weather: WorldWeatherState) {
    const rainWeight = weather.rain
    this.currentWeight = rainWeight
    this.updateSky(weather)

    if (rainWeight <= 0.001) {
      for (let index = 0; index < STREAK_COUNT; index += 1) {
        const streak = this.streaks[index]
        const mesh = this.streakMeshes[index]
        if (streak) streak.active = false
        if (mesh) mesh.visible = false
      }
      this.dropsMesh.visible = false
      return
    }

    this.time += deltaSeconds
    const heavy = rainWeight > 0.7
    const spawnChance = heavy ? 1 : rainWeight * 0.85
    const spawnRate = heavy ? 60 : 30
    const activeLimit = heavy ? STREAK_COUNT : Math.floor(STREAK_COUNT * 0.25)
    const opacityMultiplier = heavy ? 0.55 : 0.35

    for (let index = 0; index < STREAK_COUNT; index += 1) {
      const streak = this.streaks[index]
      const mesh = this.streakMeshes[index]
      const material = this.streakMaterials[index]
      if (!streak || !mesh || !material) continue

      if (!streak.active) {
        if (index < activeLimit && Math.random() < spawnChance * deltaSeconds * spawnRate) {
          this.spawnStreak(index, heavy)
        }
        continue
      }

      streak.x += Math.sin(streak.angle) * streak.speed * deltaSeconds
      streak.y += -Math.cos(streak.angle) * streak.speed * deltaSeconds

      if (streak.y < -1.3) {
        streak.active = false
        mesh.visible = false
        continue
      }

      mesh.position.set(streak.x, streak.y, 0)
      mesh.rotation.z = streak.angle
      mesh.scale.set(streak.width, streak.length, 1)
      mesh.visible = true
      material.uniforms.opacity.value = rainWeight * opacityMultiplier
    }

    this.dropsMaterial.uniforms.time.value = this.time
    this.dropsMaterial.uniforms.opacity.value = rainWeight
    this.dropsMesh.visible = true
  }

  render(renderer: THREE.WebGLRenderer) {
    if (this.currentWeight <= 0.001) return
    this.ensureSize(renderer)

    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    if (this.dropsMesh.visible) {
      renderer.copyFramebufferToTexture(this.sceneTexture, this.copyOrigin)
      renderer.render(this.dropsScene, this.orthoCamera)
    }
    if (this.streakMeshes.some((mesh) => mesh.visible)) {
      renderer.render(this.streakScene, this.orthoCamera)
    }
    renderer.autoClear = previousAutoClear
  }

  dispose() {
    this.streakGeometry.dispose()
    this.dropsGeometry.dispose()
    this.noiseTexture.dispose()
    this.sceneTexture.dispose()
    for (const material of this.streakMaterials) material.dispose()
    this.dropsMaterial.dispose()
  }

  private ensureSize(renderer: THREE.WebGLRenderer) {
    renderer.getDrawingBufferSize(this.drawingBufferSize)
    if (
      this.drawingBufferSize.x === this.bufferWidth &&
      this.drawingBufferSize.y === this.bufferHeight
    )
      return
    this.bufferWidth = this.drawingBufferSize.x
    this.bufferHeight = this.drawingBufferSize.y
    this.sceneTexture.image.width = this.bufferWidth
    this.sceneTexture.image.height = this.bufferHeight
    this.sceneTexture.needsUpdate = true
    this.dropsMaterial.uniforms.resolution.value.set(this.bufferWidth, this.bufferHeight)
  }

  private spawnStreak(index: number, heavy: boolean) {
    const streak = this.streaks[index]
    if (!streak) return
    streak.angle = -WIND_ANGLE + (Math.random() - 0.5) * 2 * ANGLE_JITTER
    streak.length = heavy ? 0.12 + Math.random() * 0.2 : 0.08 + Math.random() * 0.14
    streak.width = heavy ? 0.002 + Math.random() * 0.002 : 0.0015 + Math.random() * 0.0015
    streak.speed = heavy ? 2.4 + Math.random() * 1.8 : 1.8 + Math.random() * 1.4
    streak.x = (Math.random() - 0.5) * 2.6
    streak.y = 1.15 + Math.random() * 0.3
    streak.active = true
  }

  private updateSky(weather: WorldWeatherState) {
    this.dropsMaterial.uniforms.skyTop.value.setRGB(...rgb01(weather.skyTop))
    this.dropsMaterial.uniforms.skyMid.value.setRGB(...rgb01(weather.skyMid))
    this.dropsMaterial.uniforms.skyBottom.value.setRGB(...rgb01(weather.skyBottom))
  }
}

function createNoiseTexture(): THREE.DataTexture {
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.floor(Math.random() * 256)
  const texture = new THREE.DataTexture(
    data,
    NOISE_SIZE,
    NOISE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function rgb01(rgb: readonly [number, number, number]): [number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
}
