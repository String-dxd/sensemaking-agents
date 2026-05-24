import { useEffect, useRef } from 'react'

/**
 * GrowthIslandPreview — contained Three.js viewport that shares the engine's
 * `view.scene` so `view.sprouts.setTimelapseSubset(trees)` already drives
 * which bloomed trees are visible per year. Uses its own renderer + camera
 * + OrbitControls so the main game camera stays put.
 *
 * Ported verbatim from `src/engine/student-space/Game/View/HistorySheet.js`
 * (`_initPreviewView` / `_renderPreview`). Three.js is imported dynamically
 * inside a useEffect to keep the rest of the React tree free of WebGL.
 *
 * No continuous rAF — renders only on OrbitControls `change` events and on
 * year-change (which loads new bloomed trees). Between interactions the
 * canvas freezes on the last frame.
 */
interface EngineForPreview {
  state?: { sprouts?: { setTimelapseSubset?: (trees: unknown) => void } }
  view?: { scene?: object }
}

export function GrowthIslandPreview({ year, engine }: { year: number; engine: unknown }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<{ dispose: () => void; render: () => void } | null>(null)

  // Boot the preview once.
  useEffect(() => {
    const canvas = canvasRef.current
    const eng = engine as EngineForPreview | null
    const scene = eng?.view?.scene
    if (!canvas || !scene) return

    let cancelled = false
    void (async () => {
      const [THREE, orbitMod] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
      ])
      if (cancelled) return
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      })
      renderer.setClearAlpha(0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200)
      camera.position.set(0, 16, 22)
      camera.layers.set(0)

      const controls = new orbitMod.OrbitControls(camera, canvas)
      controls.enableDamping = false
      controls.enablePan = false
      controls.minDistance = 8
      controls.maxDistance = 45
      controls.minPolarAngle = 0.15
      controls.maxPolarAngle = Math.PI * 0.48
      controls.target.set(0, 1.2, 0)
      controls.update()

      const resize = () => {
        const parent = canvas.parentElement
        if (!parent) return
        const rect = parent.getBoundingClientRect()
        const w = Math.max(2, Math.floor(rect.width))
        const h = Math.max(2, Math.floor(rect.height))
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        render()
      }
      const render = () => {
        try {
          renderer.render(scene as never, camera)
        } catch (err) {
          console.warn('[GrowthIslandPreview] render failed', err)
        }
      }
      const onChange = () => render()
      controls.addEventListener('change', onChange)

      let ro: ResizeObserver | null = null
      try {
        ro = new ResizeObserver(resize)
        if (canvas.parentElement) ro.observe(canvas.parentElement)
      } catch {
        /* older browsers without ResizeObserver */
      }
      resize()

      stateRef.current = {
        render,
        dispose() {
          controls.removeEventListener('change', onChange)
          controls.dispose()
          ro?.disconnect()
          renderer.dispose()
          renderer.forceContextLoss()
          // Restore live island.
          eng?.state?.sprouts?.setTimelapseSubset?.(null)
        },
      }
    })()

    return () => {
      cancelled = true
      stateRef.current?.dispose()
      stateRef.current = null
    }
  }, [engine])

  // On year change, fetch the bloomed trees and apply the timelapse subset.
  // After applying, request a render so the preview reflects the new subset.
  useEffect(() => {
    let cancelled = false
    const eng = engine as EngineForPreview | null
    void (async () => {
      try {
        const res = await fetch(`/api/growth/island-state-at?year=${year}`)
        if (!res.ok) throw new Error('island-state-at fetch failed')
        const data = (await res.json()) as { bloomedTrees?: unknown }
        if (cancelled) return
        eng?.state?.sprouts?.setTimelapseSubset?.(data.bloomedTrees ?? null)
        // Schedule a render on the next frame so any subscriber-driven scene
        // updates (sprout layering, etc.) land before we capture.
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => stateRef.current?.render())
        } else {
          stateRef.current?.render()
        }
      } catch (err) {
        console.warn('[GrowthIslandPreview] island-state-at failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [year, engine])

  return (
    <div
      data-testid="growth-island-preview"
      className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left)"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <p className="pointer-events-none absolute bottom-2 right-3 text-xs font-semibold uppercase tracking-[0.18em] text-(--color-sheet-ink-soft)">
        Drag · scroll
      </p>
    </div>
  )
}
