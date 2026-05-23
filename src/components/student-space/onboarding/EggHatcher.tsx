import { Radio } from '@base-ui-components/react/radio'
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as THREEType from 'three'
import { Button } from '~/components/ui/button'
import { RadioGroup } from '~/components/ui/radio-group'
import {
  clamp01,
  easeInCubic,
  easeOutCubic,
  smootherstep,
  smoothstep,
} from '~/engine/student-space/Game/util/easing.js'
import { buildStandingBird, SPECIES_BY_ID } from '~/engine/student-space/Game/View/Kira.js'
import {
  EGG_COLOR_BY_ID,
  EGG_COLORS,
  ONBOARDING_COPY,
} from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { cn } from '~/lib/utils'

/**
 * Egg color, companion name, and hatch stage for the React onboarding flow.
 *
 * The original surface used a small Three.js egg canvas. The live world
 * scene still stays engine-owned; this React surface keeps the same state
 * writes and timing while expressing the ceremony UI in Tailwind.
 *
 * The egg itself is a dedicated Three.js mini-scene (stretched flat-shaded
 * icosahedron, three-point + hemisphere lighting) on its own canvas. Color
 * picks tween shell + emissive in place over 320ms so the egg "warms" to
 * the chosen swatch instead of repainting.
 */
const HATCH_MS = 2400

const COLOR_LERP_MS = 320
const INITIAL_SHELL_COLOR = 0xf6efe1

type OnboardingSlice = {
  stage?: string
  eggColorId?: string | null
  companionName?: string | null
  setEggColor?: (id: string) => unknown
  setCompanionName?: (name: string) => unknown
}

type ProfileSlice = {
  setIdentity?: (identity: { companionSpecies: string; companionName: string }) => unknown
}

type KiraLike = {
  setSpecies?: (id: string) => unknown
}

export function EggHatcher({
  stage,
  reducedMotion,
  onboarding,
  profile,
  kira,
  onAdvance,
}: {
  stage: 'egg-color' | 'egg-name' | 'egg-hatch'
  reducedMotion: boolean
  onboarding: OnboardingSlice | null | undefined
  profile: ProfileSlice | null | undefined
  kira: KiraLike | null | undefined
  onAdvance: (next: string) => void
}) {
  const initialColor = onboarding?.eggColorId ?? EGG_COLORS[0]?.id ?? 'flame'
  const [selectedColor, setSelectedColor] = useState<string>(initialColor)
  const [name, setName] = useState(onboarding?.companionName ?? '')
  const [visible, setVisible] = useState(reducedMotion)

  const selected = EGG_COLOR_BY_ID[selectedColor] ?? EGG_COLORS[0]
  const trimmedName = name.trim()
  const hatchColor = selected?.hex ?? '#E63946'

  useEffect(() => {
    if (reducedMotion) return
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion])

  useEffect(() => {
    if (stage !== 'egg-hatch') return
    const id = window.setTimeout(() => onAdvance('first-chat'), reducedMotion ? 160 : HATCH_MS)
    return () => window.clearTimeout(id)
  }, [onAdvance, reducedMotion, stage])

  const swatches = useMemo(() => EGG_COLORS, [])

  const commitColor = () => {
    onboarding?.setEggColor?.(selectedColor)
    onAdvance('egg-name')
  }

  const commitName = () => {
    if (!trimmedName) return
    onboarding?.setCompanionName?.(trimmedName)
    const species = onboarding?.eggColorId || selectedColor
    profile?.setIdentity?.({ companionSpecies: species, companionName: trimmedName })
    kira?.setSpecies?.(species)
    onAdvance('egg-hatch')
  }

  return (
    <div
      data-testid="onboarding-egg"
      data-stage={stage}
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-7',
        'bg-(--color-onb-bg-cream) px-6 py-[max(2rem,env(safe-area-inset-bottom))] text-(--color-onb-ink)',
        'transition-opacity duration-[320ms] ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {stage === 'egg-color' ? (
        <section className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
          <EggCanvas
            color={hatchColor}
            reducedMotion={reducedMotion}
            speciesId={selectedColor}
            hatching={false}
          />
          <div>
            <h2 className="m-0 text-xl font-semibold">{ONBOARDING_COPY.eggColor.title}</h2>
            <p className="mt-2 mb-0 text-sm text-(--color-onb-ink-soft)">
              {ONBOARDING_COPY.eggColor.sub}
            </p>
          </div>
          <RadioGroup
            aria-label={ONBOARDING_COPY.eggColor.title}
            value={selectedColor}
            onValueChange={(value) => {
              if (typeof value === 'string') setSelectedColor(value)
            }}
            className="m-0 grid w-full grid-cols-3 gap-3 border-0 p-0"
          >
            {swatches.map((color) => (
              <Radio.Root
                key={color.id}
                value={color.id}
                aria-label={ONBOARDING_COPY.eggColor.swatchAria.replace('{colorName}', color.name)}
                data-testid={`egg-color-${color.id}`}
                className={cn(
                  'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-white/70',
                  'text-xs font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.10)]',
                  'transition-[transform,border-color,background] duration-150 hover:-translate-y-px hover:bg-white',
                  'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
                  'data-[checked]:border-(--color-onb-accent) data-[checked]:bg-white',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-7 rounded-full shadow-inner"
                  style={{ background: color.hex }}
                />
                {color.name}
              </Radio.Root>
            ))}
          </RadioGroup>
          <Button
            type="button"
            variant="accent"
            size="lg"
            onClick={commitColor}
            className="min-h-12 rounded-2xl bg-(--color-onb-accent) px-8 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,138,92,0.30)] hover:-translate-y-px hover:bg-(--color-onb-accent)"
          >
            {ONBOARDING_COPY.eggColor.cta}
          </Button>
        </section>
      ) : null}

      {stage === 'egg-name' ? (
        <section className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
          <EggCanvas
            color={hatchColor}
            reducedMotion={reducedMotion}
            speciesId={selectedColor}
            hatching={false}
          />
          <div>
            <h2 className="m-0 text-xl font-semibold">{ONBOARDING_COPY.eggName.title}</h2>
            <p className="mt-2 mb-0 text-sm text-(--color-onb-ink-soft)">
              {ONBOARDING_COPY.eggName.sub}
            </p>
          </div>
          <input
            value={name}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder={ONBOARDING_COPY.eggName.placeholder}
            aria-label={ONBOARDING_COPY.eggName.title}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitName()
              }
            }}
            className="min-h-12 w-full rounded-2xl border border-[rgba(43,38,32,0.12)] bg-white/80 px-4 text-center text-base font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.10)] outline-none focus:border-(--color-onb-accent)"
          />
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onAdvance('egg-color')}
              className="min-h-11 rounded-2xl border border-[rgba(43,38,32,0.12)] bg-white/70 px-5 text-sm font-semibold text-(--color-onb-ink) hover:-translate-y-px hover:bg-white"
            >
              {ONBOARDING_COPY.eggName.back}
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={!trimmedName}
              onClick={commitName}
              className="min-h-11 rounded-2xl bg-(--color-onb-accent) px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,138,92,0.30)] hover:-translate-y-px hover:bg-(--color-onb-accent) disabled:opacity-40"
            >
              {ONBOARDING_COPY.eggName.cta}
            </Button>
          </div>
        </section>
      ) : null}

      {stage === 'egg-hatch' ? (
        <section
          className="flex w-full max-w-[420px] flex-col items-center gap-6 text-center"
          aria-live="polite"
        >
          <EggCanvas
            color={hatchColor}
            reducedMotion={reducedMotion}
            speciesId={selectedColor}
            hatching={true}
          />
          <p className="m-0 text-sm font-medium text-(--color-onb-ink-soft)">
            {ONBOARDING_COPY.eggHatch.a11yNarration}
          </p>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Standalone Three.js mini-scene for the egg. Stretched flat-shaded
 * icosahedron, 3-point + hemisphere lighting. Color picks tween shell +
 * emissive in place over 320ms.
 *
 * On `hatching=true`, runs a 2.4 s timeline: tremble → cracks bloom →
 * shell halves snap apart → a low-poly chick rises and waves. The chick
 * palette comes from `SPECIES_BY_ID[speciesId].palette`, so its dominant
 * head color matches the standing Kira that appears one screen later.
 *
 * `prefers-reduced-motion` skips the animation and parks the scene in the
 * post-hatch state. WebGL bring-up is wrapped in try/catch so non-WebGL
 * hosts (test env, very old browsers) fall back to a static empty canvas.
 */
// Bird sits low so the body stays inside the bottom-shell remnant; only the
// head + crest read above the broken rim. `BIRD_START_Y` is where the bird
// boots (pre-reveal, scale 0). `BIRD_REVEAL_Y` is where it lands after the
// reveal ramp; the wave bob adds ±0.025 on top.
const BIRD_REVEAL_SCALE = 1.0
const BIRD_START_Y = -0.8
const BIRD_REVEAL_Y = -0.65

const HATCH_TIMELINE = {
  WIGGLE_END: 450,
  CRACK_START: 350,
  CRACK_END: 750,
  SNAP_PULSE_START: 700,
  SNAP_AT: 750,
  SNAP_PULSE_END: 850,
  OPEN_START: 850,
  OPEN_END: 1700,
  CHICK_FADE_START: 950,
  CHICK_FADE_END: 1550,
  WAVE_START: 1700,
  WAVE_END: 2400,
} as const

function EggCanvas({
  color,
  reducedMotion,
  speciesId,
  hatching,
}: {
  color: string
  reducedMotion: boolean
  speciesId: string
  hatching: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const colorRef = useRef<string>(color)
  const reducedMotionRef = useRef<boolean>(reducedMotion)
  const speciesRef = useRef<string>(speciesId)
  const hatchingRef = useRef<boolean>(hatching)

  // Keep the latest props inside refs so the rAF loop reads fresh values
  // without re-booting the scene on every render.
  colorRef.current = color
  reducedMotionRef.current = reducedMotion
  speciesRef.current = speciesId
  hatchingRef.current = hatching

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let rafId: number | null = null
    let cleanup: (() => void) | null = null

    void (async () => {
      const THREE = await import('three')
      if (cancelled) return

      let renderer: import('three').WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',
        })
      } catch (err) {
        console.warn('[EggCanvas] WebGL renderer unavailable', err)
        return
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

      const scene = new THREE.Scene()

      const camera = new THREE.PerspectiveCamera(28, 160 / 200, 0.1, 100)
      camera.position.set(0, 0, 5.0)
      camera.lookAt(0, 0, 0)

      scene.add(new THREE.AmbientLight(0xffffff, 0.34))
      scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a2f3a, 0.32))
      const key = new THREE.DirectionalLight(0xfff2dc, 1.05)
      key.position.set(2.2, 3.0, 2.4)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xc8d4ff, 0.42)
      fill.position.set(-2.4, 0.6, 1.4)
      scene.add(fill)
      const rim = new THREE.DirectionalLight(0xb8c4ff, 0.55)
      rim.position.set(-0.6, 1.2, -2.6)
      scene.add(rim)

      // --- Shell: intact mesh + split halves -----------------------------
      const geo = new THREE.IcosahedronGeometry(0.55, 1)
      geo.scale(1, 1.35, 1)
      const mat = new THREE.MeshLambertMaterial({
        color: INITIAL_SHELL_COLOR,
        emissive: 0x000000,
        emissiveIntensity: 1,
        flatShading: true,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.set(0.18, 0.45, 0)
      scene.add(mesh)

      // Split halves built from the same low-poly icosahedron, filtered
      // by triangle-centroid Y. They start hidden and share `mat` so they
      // wear the same swatch color the user picked.
      const topGeo = buildHalfShellGeometry(THREE, 1)
      const bottomGeo = buildHalfShellGeometry(THREE, -1)
      const topShell = new THREE.Mesh(topGeo, mat)
      const bottomShell = new THREE.Mesh(bottomGeo, mat)
      topShell.rotation.copy(mesh.rotation)
      bottomShell.rotation.copy(mesh.rotation)
      topShell.visible = false
      bottomShell.visible = false
      scene.add(topShell)
      scene.add(bottomShell)

      // Cracks — 4 short jagged strokes painted on the shell front.
      // Parented to `mesh` so they wiggle with the shell and vanish when
      // the intact mesh is hidden post-snap.
      // biome-ignore format: keep crack geometry readable
      const crackPositions = new Float32Array([
        -0.10, 0.45, 0.42, -0.04, 0.34, 0.46,
        -0.04, 0.34, 0.46, -0.12, 0.18, 0.47,
        -0.12, 0.18, 0.47, -0.02, 0.04, 0.48,
         0.14, 0.30, 0.43,  0.22, 0.16, 0.44,
         0.22, 0.16, 0.44,  0.16, 0.02, 0.45,
         0.02, 0.55, 0.40, -0.02, 0.46, 0.43,
      ])
      const crackGeo = new THREE.BufferGeometry()
      crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(crackPositions, 3))
      const crackMat = new THREE.LineBasicMaterial({
        color: 0x2a1f10,
        transparent: true,
        opacity: 0,
      })
      const cracks = new THREE.LineSegments(crackGeo, crackMat)
      mesh.add(cracks)

      // --- Bird: real world-route Kira mesh, scaled to peek out of the
      // bottom shell. We instantiate `buildStandingBird` directly so the
      // hatchling reads as the same character that flies in one screen
      // later — same body, beak, plumage, face texture. `birdGroup` parents
      // the parts and gives us a single scale/position handle.
      const birdGroup = new THREE.Group()
      // Sink + face camera. The bird's beak runs along local +X, so a
      // -90° yaw rotates it toward +Z (the camera). The y-offset drops
      // the body into the shell so only the head + crest read.
      birdGroup.position.set(0, BIRD_START_Y, 0)
      birdGroup.rotation.y = -Math.PI / 2
      birdGroup.scale.setScalar(0)
      scene.add(birdGroup)

      let birdParts: ReturnType<typeof buildStandingBird> | null = null
      const disposeBird = () => {
        if (!birdParts) return
        birdGroup.remove(birdParts.root)
        birdParts.root.traverse((obj) => {
          const node = obj as THREEType.Mesh
          node.geometry?.dispose?.()
          const m = node.material as THREEType.Material | THREEType.Material[] | undefined
          if (Array.isArray(m)) {
            for (const mm of m) mm.dispose?.()
          } else {
            const tex = (m as THREEType.MeshLambertMaterial | undefined)?.map
            tex?.dispose?.()
            m?.dispose?.()
          }
        })
        birdParts = null
      }
      const buildBird = (id: string) => {
        const spec = SPECIES_BY_ID[id] ?? SPECIES_BY_ID.flame
        birdParts = buildStandingBird(spec)
        birdGroup.add(birdParts.root)
      }
      buildBird(speciesRef.current)

      // Apply the initial shell color immediately so a resume into
      // egg-name or egg-hatch doesn't flash the unpainted shell.
      const initialHex = colorRef.current
      const colorState = {
        from: new THREE.Color(INITIAL_SHELL_COLOR),
        target: new THREE.Color(INITIAL_SHELL_COLOR),
        emFrom: new THREE.Color(0x000000),
        emTarget: new THREE.Color(0x000000),
        startTime: 0,
        duration: 0,
      }
      let lastAppliedHex = '#000000'
      try {
        mat.color.setStyle(initialHex)
        colorState.from.copy(mat.color)
        colorState.target.copy(mat.color)
        const em = new THREE.Color(initialHex).multiplyScalar(0.06)
        mat.emissive.copy(em)
        colorState.emFrom.copy(em)
        colorState.emTarget.copy(em)
        lastAppliedHex = initialHex
      } catch (err) {
        console.warn('[EggCanvas] invalid initial color', err)
      }

      let lastAppliedSpecies = speciesRef.current
      let hatchStart = 0
      let snapped = false
      let lastW = 0
      let lastH = 0

      const tick = () => {
        if (cancelled) return
        const now = performance.now()
        const t = now * 0.001
        const isHatching = hatchingRef.current
        const reduced = reducedMotionRef.current

        // Idle motion — only when NOT hatching, so the timeline owns the
        // shell pose during the hatch sequence.
        if (!isHatching) {
          if (!reduced) {
            mesh.position.y = Math.sin(t * 1.4) * 0.05
            mesh.rotation.y = 0.45 + Math.sin(t * 0.55) * 0.12
            mesh.rotation.x = 0.18 + Math.sin(t * 0.42 + 1.1) * 0.05
            const breath = 1 + Math.sin(t * 1.6 + Math.PI / 3) * 0.012
            mesh.scale.set(1, breath, 1)
          } else {
            mesh.position.y = 0
            mesh.rotation.y = 0.45
            mesh.rotation.x = 0.18
            mesh.scale.set(1, 1, 1)
          }
          mesh.rotation.z = 0
        }

        // Pick up swatch changes from the parent without re-booting.
        const desiredHex = colorRef.current
        if (desiredHex !== lastAppliedHex) {
          try {
            colorState.from.copy(mat.color)
            colorState.target.setStyle(desiredHex)
            colorState.emFrom.copy(mat.emissive)
            colorState.emTarget.setStyle(desiredHex).multiplyScalar(0.06)
            colorState.startTime = now
            colorState.duration = COLOR_LERP_MS
            lastAppliedHex = desiredHex
          } catch (err) {
            console.warn('[EggCanvas] invalid color', err)
            lastAppliedHex = desiredHex
          }
        }

        if (colorState.duration > 0) {
          const u = clamp01((now - colorState.startTime) / colorState.duration)
          const e = smoothstep(u)
          mat.color.lerpColors(colorState.from, colorState.target, e)
          mat.emissive.lerpColors(colorState.emFrom, colorState.emTarget, e)
          if (u >= 1) colorState.duration = 0
        }

        // Pick up species changes — rebuild the bird in place so the
        // hatchling matches the swatch (and the standing Kira one screen later).
        const desiredSpecies = speciesRef.current
        if (desiredSpecies !== lastAppliedSpecies) {
          try {
            disposeBird()
            buildBird(desiredSpecies)
          } catch (err) {
            console.warn('[EggCanvas] failed to rebuild bird', err)
          }
          lastAppliedSpecies = desiredSpecies
        }

        // --- Hatch timeline ------------------------------------------------
        if (isHatching) {
          if (hatchStart === 0) hatchStart = now
          const h = now - hatchStart

          if (reduced) {
            // Skip straight to post-hatch state.
            mesh.visible = false
            topShell.visible = false
            bottomShell.visible = true
            bottomShell.position.y = 0
            birdGroup.scale.setScalar(BIRD_REVEAL_SCALE)
            birdGroup.position.y = BIRD_REVEAL_Y
          } else {
            // Phase 1 — tremble. Amplitude ramps in with easeInCubic so the
            // shell starts barely moving and grows into a real shake.
            if (h < HATCH_TIMELINE.WIGGLE_END && !snapped) {
              const u = h / HATCH_TIMELINE.WIGGLE_END
              const amp = easeInCubic(u) * 0.14
              // ~10 Hz oscillation reads as a tremble, not a slow rock.
              mesh.rotation.z = Math.sin(h * 0.063) * amp
            }

            // Phase 2 — cracks bloom. Hidden by parent visibility after snap.
            if (h >= HATCH_TIMELINE.CRACK_START && h < HATCH_TIMELINE.CRACK_END) {
              const u = clamp01(
                (h - HATCH_TIMELINE.CRACK_START) /
                  (HATCH_TIMELINE.CRACK_END - HATCH_TIMELINE.CRACK_START),
              )
              crackMat.opacity = smoothstep(u)
            } else if (h >= HATCH_TIMELINE.CRACK_END) {
              crackMat.opacity = 1
            }

            // Phase 3 — snap. Hide intact mesh, reveal halves at the same
            // pose. A brief scale pulse stands in for a camera shake.
            if (h >= HATCH_TIMELINE.SNAP_AT && !snapped) {
              mesh.visible = false
              topShell.visible = true
              bottomShell.visible = true
              topShell.rotation.copy(mesh.rotation)
              bottomShell.rotation.copy(mesh.rotation)
              topShell.position.copy(mesh.position)
              bottomShell.position.copy(mesh.position)
              snapped = true
            }
            if (h >= HATCH_TIMELINE.SNAP_PULSE_START && h < HATCH_TIMELINE.SNAP_PULSE_END) {
              const u =
                (h - HATCH_TIMELINE.SNAP_PULSE_START) /
                (HATCH_TIMELINE.SNAP_PULSE_END - HATCH_TIMELINE.SNAP_PULSE_START)
              const pulse = 1 + Math.sin(u * Math.PI) * 0.04
              topShell.scale.setScalar(pulse)
              bottomShell.scale.setScalar(pulse)
            }

            // Phase 4 — open. Top half arcs back and up while shrinking;
            // bottom half settles. Chick rises from inside.
            if (h >= HATCH_TIMELINE.OPEN_START) {
              const openU = clamp01(
                (h - HATCH_TIMELINE.OPEN_START) /
                  (HATCH_TIMELINE.OPEN_END - HATCH_TIMELINE.OPEN_START),
              )
              const openE = easeOutCubic(openU)
              topShell.position.y = openE * 0.65
              topShell.position.z = -openE * 0.08
              topShell.rotation.x = mesh.rotation.x - openE * 1.1
              topShell.scale.setScalar(1 - openE * 0.35)

              bottomShell.position.y = -openE * 0.04
              bottomShell.scale.setScalar(1)

              const chickU = clamp01(
                (h - HATCH_TIMELINE.CHICK_FADE_START) /
                  (HATCH_TIMELINE.CHICK_FADE_END - HATCH_TIMELINE.CHICK_FADE_START),
              )
              const chickE = smootherstep(chickU)
              birdGroup.scale.setScalar(chickE * BIRD_REVEAL_SCALE)
              birdGroup.position.y = BIRD_START_Y + chickE * (BIRD_REVEAL_Y - BIRD_START_Y)
            }

            // Phase 5 — wave. A single head tilt + body bob beat, then settle.
            if (h >= HATCH_TIMELINE.WAVE_START && birdParts) {
              const waveU = clamp01(
                (h - HATCH_TIMELINE.WAVE_START) /
                  (HATCH_TIMELINE.WAVE_END - HATCH_TIMELINE.WAVE_START),
              )
              birdParts.head.rotation.z = Math.sin(waveU * Math.PI) * 0.2
              birdGroup.position.y = BIRD_REVEAL_Y + Math.sin(waveU * Math.PI) * 0.025
            }
          }
        }

        // Only resize + draw when the canvas is actually composited.
        if (canvas.offsetParent !== null) {
          const rect = canvas.getBoundingClientRect()
          const w = Math.max(64, Math.floor(rect.width))
          const h = Math.max(64, Math.floor(rect.height))
          if (w !== lastW || h !== lastH) {
            renderer.setSize(w, h, false)
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            lastW = w
            lastH = h
          }
          try {
            renderer.render(scene, camera)
          } catch (err) {
            console.warn('[EggCanvas] render failed', err)
          }
        }

        rafId = requestAnimationFrame(tick)
      }

      rafId = requestAnimationFrame(tick)

      cleanup = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        try {
          disposeBird()
        } catch {
          /* noop */
        }
        for (const disposable of [geo, topGeo, bottomGeo, crackGeo, mat, crackMat]) {
          try {
            disposable.dispose()
          } catch {
            /* noop */
          }
        }
        try {
          renderer.dispose()
        } catch {
          /* noop */
        }
        try {
          renderer.forceContextLoss?.()
        } catch {
          /* noop */
        }
      }
    })()

    return () => {
      cancelled = true
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      cleanup?.()
    }
  }, [])

  return (
    <div className="relative grid h-48 w-40 place-items-center" aria-hidden="true">
      <div className="absolute bottom-3 h-4 w-24 rounded-full bg-[rgba(43,38,32,0.10)] blur-sm" />
      <canvas ref={canvasRef} className="relative h-full w-full" />
    </div>
  )
}

/**
 * Build a hemisphere of the egg shell from the same stretched icosahedron
 * used by the intact mesh. We walk the position buffer (non-indexed, three
 * vertices per triangle) and keep triangles whose centroid sits on the
 * requested side of the equator. The jagged seam is intentional — it
 * reads as a faceted break, in keeping with the low-poly silhouette.
 */
function buildHalfShellGeometry(
  THREE: typeof import('three'),
  sign: 1 | -1,
): import('three').BufferGeometry {
  const base = new THREE.IcosahedronGeometry(0.55, 1)
  base.scale(1, 1.35, 1)
  const pos = base.getAttribute('position')
  const kept: number[] = []
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const keep = sign > 0 ? cy > 0 : cy <= 0
    if (!keep) continue
    for (let j = 0; j < 3; j++) {
      kept.push(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j))
    }
  }
  base.dispose()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3))
  geo.computeVertexNormals()
  return geo
}
