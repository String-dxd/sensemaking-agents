import { useEffect, useMemo, useRef, useState } from 'react'
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
const HATCH_MS = 1400

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
  const colorButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

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

  useEffect(() => {
    if (stage !== 'egg-color') return
    const id = window.setTimeout(() => {
      const button = colorButtonRefs.current.get(selectedColor)
      button?.focus({ preventScroll: true })
    }, 60)
    return () => window.clearTimeout(id)
  }, [selectedColor, stage])

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
          <EggCanvas color={hatchColor} reducedMotion={reducedMotion} />
          <div>
            <h2 className="m-0 text-xl font-semibold">{ONBOARDING_COPY.eggColor.title}</h2>
            <p className="mt-2 mb-0 text-sm text-(--color-onb-ink-soft)">
              {ONBOARDING_COPY.eggColor.sub}
            </p>
          </div>
          <fieldset className="m-0 grid w-full grid-cols-3 gap-3 border-0 p-0">
            <legend className="sr-only">{ONBOARDING_COPY.eggColor.title}</legend>
            {swatches.map((color) => {
              const picked = color.id === selectedColor
              return (
                <button
                  key={color.id}
                  ref={(node) => {
                    if (node) colorButtonRefs.current.set(color.id, node)
                    else colorButtonRefs.current.delete(color.id)
                  }}
                  type="button"
                  aria-pressed={picked}
                  aria-label={ONBOARDING_COPY.eggColor.swatchAria.replace(
                    '{colorName}',
                    color.name,
                  )}
                  data-testid={`egg-color-${color.id}`}
                  onClick={() => setSelectedColor(color.id)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white/70',
                    'text-xs font-semibold text-(--color-onb-ink) shadow-[0_8px_20px_rgba(15,18,36,0.10)]',
                    'transition-[transform,border-color,background] duration-150 hover:-translate-y-px hover:bg-white',
                    'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
                    picked ? 'border-(--color-onb-accent) bg-white' : 'border-transparent',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-7 rounded-full shadow-inner"
                    style={{ background: color.hex }}
                  />
                  {color.name}
                </button>
              )
            })}
          </fieldset>
          <button
            type="button"
            onClick={commitColor}
            className="min-h-12 rounded-2xl bg-(--color-onb-accent) px-8 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,138,92,0.30)] transition-transform duration-150 hover:-translate-y-px focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]"
          >
            {ONBOARDING_COPY.eggColor.cta}
          </button>
        </section>
      ) : null}

      {stage === 'egg-name' ? (
        <section className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
          <EggCanvas color={hatchColor} reducedMotion={reducedMotion} />
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
            <button
              type="button"
              onClick={() => onAdvance('egg-color')}
              className="min-h-11 rounded-2xl border border-[rgba(43,38,32,0.12)] bg-white/70 px-5 text-sm font-semibold text-(--color-onb-ink) transition-transform duration-150 hover:-translate-y-px hover:bg-white focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]"
            >
              {ONBOARDING_COPY.eggName.back}
            </button>
            <button
              type="button"
              disabled={!trimmedName}
              onClick={commitName}
              className="min-h-11 rounded-2xl bg-(--color-onb-accent) px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,138,92,0.30)] transition-[transform,opacity] duration-150 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]"
            >
              {ONBOARDING_COPY.eggName.cta}
            </button>
          </div>
        </section>
      ) : null}

      {stage === 'egg-hatch' ? (
        <section
          className="flex w-full max-w-[420px] flex-col items-center gap-6 text-center"
          aria-live="polite"
        >
          <EggCanvas color={hatchColor} reducedMotion={reducedMotion} />
          <p className="m-0 text-sm font-medium text-(--color-onb-ink-soft)">
            {ONBOARDING_COPY.eggHatch.a11yNarration}
          </p>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Standalone Three.js mini-scene for the egg. Mounts a 1:1 port of the
 * engine's `_buildScene` (stretched icosahedron, flat-shaded Lambert,
 * 3-point + hemisphere lighting). Color picks tween shell + emissive in
 * place over 320ms; the WebGL context is never torn down between swatches.
 *
 * `prefers-reduced-motion` parks the mesh at its initial pose with no
 * idle bobbing. WebGL bring-up is wrapped in try/catch so non-WebGL hosts
 * (test env, very old browsers) fall back to a static empty canvas.
 */
function EggCanvas({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const colorRef = useRef<string>(color)
  const reducedMotionRef = useRef<boolean>(reducedMotion)

  // Keep the latest props inside refs so the rAF loop reads fresh values
  // without re-booting the scene on every render.
  colorRef.current = color
  reducedMotionRef.current = reducedMotion

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

      // FOV + distance tuned so the egg's screen size lands close to the
      // old SVG silhouette inside a ~160x200 canvas.
      const camera = new THREE.PerspectiveCamera(28, 160 / 200, 0.1, 100)
      camera.position.set(0, 0, 5.0)
      camera.lookAt(0, 0, 0)

      // 3-point + hemisphere. Lower ambient deepens facet contrast; the
      // hemisphere bounce keeps shadowed faces from going dead-grey. Rim
      // light (cool, behind) gives the silhouette presence.
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

      // Stretched icosahedron — detail=1 keeps the facet count low so
      // flat-shading reads as crisp polygons rather than mush.
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

      // Apply the initial color immediately so a resume into egg-name or
      // egg-hatch doesn't flash the unpainted shell.
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

      let lastW = 0
      let lastH = 0

      const tick = () => {
        if (cancelled) return
        const now = performance.now()
        const t = now * 0.001

        // Idle motion — three asynchronous oscillators so motion never
        // collapses into one mechanical loop. Reduced-motion parks the
        // mesh at its initial pose.
        if (!reducedMotionRef.current) {
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
          const u = Math.min(1, (now - colorState.startTime) / colorState.duration)
          const e = u * u * (3 - 2 * u)
          mat.color.lerpColors(colorState.from, colorState.target, e)
          mat.emissive.lerpColors(colorState.emFrom, colorState.emTarget, e)
          if (u >= 1) colorState.duration = 0
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
          geo.dispose()
        } catch {
          /* noop */
        }
        try {
          mat.dispose()
        } catch {
          /* noop */
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
