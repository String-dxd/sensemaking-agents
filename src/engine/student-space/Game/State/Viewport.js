/**
 * Tracks viewport size + pixel ratio. Pointer-lock + fullscreen toggles are
 * dropped for Phase 1 since we use OrbitControls (no need for them).
 */
export default class Viewport
{
    constructor()
    {
        this.pixelRatioCap = 2
        this.width = null
        this.height = null
        this.smallestSide = null
        this.biggestSide = null
        this.pixelRatio = null
        this.clampedPixelRatio = null
        this.resize()
    }

    normalise(pixelCoordinates)
    {
        const minSize = Math.min(this.width, this.height)
        return {
            x: pixelCoordinates.x / minSize,
            y: pixelCoordinates.y / minSize,
        }
    }

    setPixelRatioCap(cap)
    {
        const next = Number.isFinite(Number(cap)) ? Number(cap) : 2
        this.pixelRatioCap = Math.max(1, next)
        this.clampedPixelRatio = Math.min(this.pixelRatio || 1, this.pixelRatioCap)
    }

    resize()
    {
        this.width = window.innerWidth
        this.height = window.innerHeight
        this.smallestSide = this.width < this.height ? this.width : this.height
        this.biggestSide = this.width > this.height ? this.width : this.height
        this.pixelRatio = window.devicePixelRatio || 1
        this.setPixelRatioCap(this.pixelRatioCap)
    }
}
