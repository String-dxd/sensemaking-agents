/**
 * Island terrain state — the engine's terrain query facade, answered from the
 * committed island editor spec (Game/Data/defaultIslandSpec.json, regenerated
 * via `pnpm sync:island`).
 *
 * `heightAt(x, z)` keeps its exact signature (the ~38 call sites mostly don't
 * change); internally it delegates to the ported `evaluateHeight` over the
 * spec's tile grid. `blurTiers` and the shore distance field are computed ONCE
 * per construction and cached on the instance (KTD-10 — the engine analog of
 * the editor's specCache); the spec load is synchronous because hydrate snaps
 * and every view constructor depend on it.
 *
 * Plain state-slice class constructed in State.js — no singleton field, no
 * subscribers, no dispose obligations; the facade is the only contract.
 */

import { loadIslandSpec } from '../Data/islandSpec.ts'
import { blurTiers, cellCenter, evaluateHeight, isLandTier, worldToCell }
    from './islandSpecCore/terrainGrid.ts'
import { shoreDistanceField } from './islandSpecCore/shoreField.ts'

/** Plateau interiors are flat; a sample deviating from its cell center's
 *  height by more than the terrace lip's rounding sits on a wall. Matches the
 *  grass-field CLIFF_DROP rule (islandSpecCore/grassField.ts). */
const WALL_DROP = 0.05

export default class Island
{
    constructor()
    {
        /** The validated island spec (frozen fallback if the committed copy is bad). */
        this.spec = loadIslandSpec()

        // Per-spec caches (computed once — KTD-10).
        this._blurred = blurTiers(this.spec.grid)
        this._shore   = shoreDistanceField(this.spec.grid, this.spec.worldSize)
        this._landCells = null // lazy, built on first landCells() call

        /** World Y of the water surface. */
        this.seaLevel  = this.spec.seaLevel
        /** Square world bounds: X and Z each span [-worldSize/2, worldSize/2]. */
        this.worldSize = this.spec.worldSize

        // ── TEMPORARY SHIMS (removed in U12) ──────────────────────────────
        // Plateau-era constants still read by the legacy views that U4 (View/
        // Island.js), U5 (Grass.js) and U10 (Fireflies/Flowers) replace or
        // migrate. Nothing new may consume these.
        this.radius          = 5.0
        this.sandOuterRadius = 8.2
        this.plateauTopY     = 1.0
        this.sandTopY        = 0.18
        this.cliffHeight     = 0.55
        this.chunkSize       = 16
        this.noiseAmp        = 0.22
        this.noiseFreq       = 0.6
        this.detailAmp       = 0.035
    }

    /**
     * Height (m) at world XZ — the spec's terraced tile-grid terrain. O(1)
     * against the cached blur. Out-of-bounds clamps to the grid edge (ocean
     * ring on the committed island): no NaN, seafloor beyond the map.
     */
    heightAt(x, z)
    {
        return evaluateHeight(this.spec, x, z, this._blurred)
    }

    /**
     * Surface normal at world XZ via central-difference gradient over
     * `heightAt`. Returns a length-1 [x, y, z] array.
     */
    normalAt(x, z)
    {
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

    /**
     * Signed distance (world units) to the land↔water boundary at world XZ —
     * positive on water, negative on land. Bilinear sample of the cached
     * shore field lattice; clamped at the world edge.
     */
    shoreDistanceAt(x, z)
    {
        const { res, data } = this._shore
        const step = this.worldSize / res
        const half = this.worldSize / 2
        const clampf = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v
        const u = clampf((x + half) / step - 0.5, 0, res - 1)
        const v = clampf((z + half) / step - 0.5, 0, res - 1)
        const i0 = Math.floor(u), j0 = Math.floor(v)
        const i1 = Math.min(i0 + 1, res - 1), j1 = Math.min(j0 + 1, res - 1)
        const fu = u - i0, fv = v - j0
        const d00 = data[j0 * res + i0], d10 = data[j0 * res + i1]
        const d01 = data[j1 * res + i0], d11 = data[j1 * res + i1]
        const a = d00 + (d10 - d00) * fu
        const b = d01 + (d11 - d01) * fu
        return a + (b - a) * fv
    }

    /**
     * Walkable ground: an in-bounds LAND cell (tier top above the sea), and
     * not on a terrace wall (sample height within WALL_DROP of the containing
     * cell center's height — the grass-field wall test). The beach (tier 1)
     * is walkable; walls and water are not.
     */
    isWalkable(x, z)
    {
        const { grid } = this.spec
        const { c, r } = worldToCell(this.worldSize, grid, x, z)
        if(c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) return false
        const tier = grid.tiers[r * grid.cols + c]
        if(!isLandTier(tier, this.spec.tierHeights, this.seaLevel)) return false
        const center = cellCenter(this.worldSize, grid, c, r)
        const yCell = evaluateHeight(this.spec, center.x, center.z, this._blurred)
        const y = this.heightAt(x, z)
        return Math.abs(y - yCell) <= WALL_DROP
    }

    /**
     * Pick-and-plant drop test — walkable with an `inset` (m) of clearance in
     * the four cardinal directions, so dropped objects keep breathing room
     * from terrace walls and the shore. Signature-compatible with the old
     * plateau test (Sprouts drag validity calls it unchanged).
     */
    isPlaceable(x, z, inset = 0.3)
    {
        if(!this.isWalkable(x, z)) return false
        if(inset <= 0) return true
        const y = this.heightAt(x, z)
        for(const [dx, dz] of [[inset, 0], [-inset, 0], [0, inset], [0, -inset]])
        {
            if(Math.abs(this.heightAt(x + dx, z + dz) - y) > WALL_DROP) return false
        }
        return true
    }

    /**
     * All land cells (tier top above the sea), for scatter consumers
     * (fireflies, particles, sprout seeding). Cached array of
     * `{ c, r, x, z, tier }` with x/z at the cell center.
     */
    landCells()
    {
        if(this._landCells) return this._landCells
        const { grid, tierHeights } = this.spec
        const cells = []
        for(let r = 0; r < grid.rows; r++)
        {
            for(let c = 0; c < grid.cols; c++)
            {
                const tier = grid.tiers[r * grid.cols + c]
                if(!isLandTier(tier, tierHeights, this.seaLevel)) continue
                const { x, z } = cellCenter(this.worldSize, grid, c, r)
                cells.push({ c, r, x, z, tier })
            }
        }
        this._landCells = cells
        return cells
    }

    // ── TEMPORARY SHIMS (removed in U12) ──────────────────────────────────
    // Polar-era predicates still called by the legacy views replaced in U4
    // (View/Island.js), U5 (Grass.js) and migrated in U10 (Fireflies).
    // Nothing new may call these; grep must come back clean by phase 4 end.

    silhouetteAt(theta)
    {
        return 1.0
            + Math.sin(theta * 2.0 + 0.7) * 0.13
            + Math.sin(theta * 3.0 - 1.3) * 0.07
            + Math.sin(theta * 5.0 + 2.1) * 0.04
            + Math.sin(theta * 7.0 - 0.4) * 0.018
            + Math.sin(theta * 9.0 + 1.8) * 0.012
    }

    radiusAtTheta(theta, baseRadius = this.radius)
    {
        return baseRadius * this.silhouetteAt(theta)
    }

    radiusAt(x, z, baseRadius = this.radius)
    {
        return this.radiusAtTheta(Math.atan2(z, x), baseRadius)
    }

    isOnPlateau(x, z)
    {
        return this.isWalkable(x, z)
    }
}
