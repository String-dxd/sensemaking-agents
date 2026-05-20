import { selectPixelRatio } from '../State/Performance.js'

export function applyRendererSize(renderer, viewport, performanceState)
{
    const pixelRatio = selectPixelRatio(
        viewport.pixelRatio ?? viewport.clampedPixelRatio,
        performanceState?.settings || performanceState?.tier || 'high'
    )
    renderer.setSize(viewport.width, viewport.height)
    renderer.setPixelRatio(pixelRatio)
    return pixelRatio
}
