/**
 * Static island heightfield. Ported from student_space_island_v0.html's
 * islandHeightAt() (~line 4689). The disc has a rolling-hill plateau, a
 * sand ring, and a hard silhouette beyond which we mark terrain as steep
 * so Bruno's grass shader collapses blades to their base (his slope-fade).
 *
 * The deployed v0 island uses a shared angular shoreline deformation so
 * grass, cliff, sand, and placements agree on the same hand-cut silhouette.
 */
function smoothstep(edge0, edge1, value)
{
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

export default class Island
{
    constructor()
    {
        this.radius        = 5.0         // plateau radius (m)
        this.sandOuterRadius = 7.2       // visible beach reach before water
        this.plateauTopY   = 1.0         // top of the grass plateau
        this.sandTopY      = 0.18        // sand ring top elevation
        this.cliffHeight   = 0.55        // cliff face between sand and plateau
        this.chunkSize     = 16          // square area covered by the terrain texture
        this.noiseAmp      = 0.22        // patch relief amplitude
        this.noiseFreq     = 0.6         // patch frequency
        this.detailAmp     = 0.035       // fine terrain grain under the grass
    }

    silhouetteAt(theta)
    {
        return 1.0
            + Math.sin(theta * 2.0 + 0.7) * 0.13
            + Math.sin(theta * 3.0 - 1.3) * 0.07
            + Math.sin(theta * 5.0 + 2.1) * 0.04
    }

    radiusAtTheta(theta, baseRadius = this.radius)
    {
        return baseRadius * this.silhouetteAt(theta)
    }

    radiusAt(x, z, baseRadius = this.radius)
    {
        return this.radiusAtTheta(Math.atan2(z, x), baseRadius)
    }

    // Smooth hills along the plateau — a single low-frequency cosine product.
    // Deterministic, no randomness required.
    _patch(x, z)
    {
        return (
            Math.cos(x * this.noiseFreq) * Math.cos(z * this.noiseFreq * 0.85) +
            Math.cos((x + z) * this.noiseFreq * 0.6)
        ) * 0.5
    }

    _detail(x, z)
    {
        return (
            Math.sin(x * 2.15 + z * 0.75) * 0.45 +
            Math.sin(z * 2.7 - x * 0.35) * 0.3 +
            Math.sin((x + z) * 4.1) * 0.25
        ) * this.detailAmp
    }

    /**
     * Height (m) at world XZ. Below sand level outside the silhouette so the
     * grass shader's slope-fade also rejects ocean blades.
     */
    heightAt(x, z)
    {
        const r = Math.sqrt(x * x + z * z)
        const theta = Math.atan2(z, x)
        const plateauR = this.radiusAtTheta(theta)
        if(r > plateauR)
        {
            // Beach ring → sand top; ocean → low.
            if(r < this.radiusAtTheta(theta, this.sandOuterRadius))
                return this.sandTopY
            return -1.0
        }
        // Falloff from plateau crown down to cliff edge (smooth rim).
        const rim = Math.min(1.0, (plateauR - r) / 0.7)
        const detail = this._detail(x, z) * smoothstep(0.0, 0.35, rim)
        const peak = this.plateauTopY + this.noiseAmp * this._patch(x, z) + detail
        const baseAtRim = this.sandTopY + this.cliffHeight
        return baseAtRim + (peak - baseAtRim) * rim
    }

    /**
     * Strict plateau test — does the (x,z) cell belong to the grass-eligible
     * top surface (not sand ring, not water)? Allow blades to reach the cliff
     * lip; the per-blade slopeScale in Bruno's shader collapses any blade that
     * lands on the curved rim plane, so we don't need a CPU inset.
     */
    isOnPlateau(x, z)
    {
        return Math.hypot(x, z) < this.radiusAt(x, z)
    }

    /**
     * Surface normal at world XZ via central-difference gradient. Returns
     * a length-1 vec3 (xyz). On steep edge/water we return a horizontal
     * normal so the grass shader's slopeScale rejects blades.
     */
    normalAt(x, z)
    {
        const r = Math.sqrt(x * x + z * z)
        if(r > this.radiusAt(x, z) + 0.05)
            return [1, 0, 0] // mark "vertical wall" → grass shader will collapse

        const h = 0.05
        const hxn = this.heightAt(x - h, z), hxp = this.heightAt(x + h, z)
        const hzn = this.heightAt(x, z - h), hzp = this.heightAt(x, z + h)
        const dx = (hxp - hxn) / (2 * h)
        const dz = (hzp - hzn) / (2 * h)
        // Normal of surface y = h(x,z): N = (-dh/dx, 1, -dh/dz) normalised.
        const nx = -dx, ny = 1.0, nz = -dz
        const len = Math.hypot(nx, ny, nz)
        return [nx / len, ny / len, nz / len]
    }
}
