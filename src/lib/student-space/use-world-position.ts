import type { RefCallback } from 'react'
import { useCallback, useEffect, useRef } from 'react'

/**
 * Project a Three.js mesh's world position to screen pixels and write it
 * directly to a DOM element's `transform`. The hook deliberately does NOT
 * re-render React per frame — it mutates `style.transform` on a ref, mirroring
 * the imperative implementations the in-world labels (ObjectPeek, HoverProbe,
 * MailboxLabel, TelescopeLabel) used pre-migration.
 *
 * The seam: React never imports Three.js. The engine builds a
 * `WorldPositionSource` (subscribe to per-frame ticks + project a mesh to
 * screen coords) and feeds it into the hook. Consumers attach the returned
 * ref-callback to their DOM element; the hook owns the `transform`, `opacity`,
 * and `pointer-events` of that element.
 */
export interface WorldPositionResult {
  x: number
  y: number
  /**
   * True if the mesh is in front of the camera and inside the canvas viewport.
   * False means the label should hide.
   */
  visible: boolean
}

export interface WorldPositionSource {
  /** Subscribe to per-frame updates. Returns unsubscribe. */
  subscribe: (cb: () => void) => () => void
  /** Project a mesh to screen pixels. Returns `null` if the mesh is detached. */
  project: (mesh: object) => WorldPositionResult | null
}

export function useWorldPosition(
  mesh: object | null | undefined,
  source: WorldPositionSource | null | undefined,
): RefCallback<HTMLElement> {
  const elementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!source) return
    const apply = () => {
      const el = elementRef.current
      if (!el) return
      if (!mesh) {
        hide(el)
        return
      }
      const projected = source.project(mesh)
      if (!projected || !projected.visible) {
        hide(el)
        return
      }
      show(el, projected.x, projected.y)
    }
    apply()
    return source.subscribe(apply)
  }, [mesh, source])

  return useCallback((node: HTMLElement | null) => {
    elementRef.current = node
  }, [])
}

function hide(el: HTMLElement) {
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
}

function show(el: HTMLElement, x: number, y: number) {
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  el.style.opacity = '1'
  el.style.pointerEvents = 'auto'
}
