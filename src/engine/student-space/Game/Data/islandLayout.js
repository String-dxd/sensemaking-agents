/**
 * Island Layout — data model + default builder.
 *
 * `PlacedObject` is the typed, serializable description of one authored
 * placement on the island. `defaultIslandLayout()` produces a `{ v, objects }`
 * snapshot that reproduces today's hard-coded constants exactly (visual no-op).
 *
 * The default ids (`tree-0`…`tree-6`, `flower-0`…`flower-17`, `fruit-0`…`fruit-3`,
 * `mailbox-0`, `telescope-0`) are **frozen labels** — they do not change if objects
 * are added, removed or reordered. Editor-spawned objects in later plans get fresh
 * `crypto.randomUUID()` ids.
 *
 * Flower placements are produced by `flowerBasePlacement(i, seed=1337)` — exported
 * from here so both `Flowers._buildOne` and the default builder share one source of
 * truth (no drift).
 *
 * @typedef {Object} PlacedObject
 * @property {string} id - stable uuid-style label, e.g. "tree-0"
 * @property {'tree'|'flower'|'fruit'|'mailbox'|'telescope'} kind
 * @property {string} [species] - e.g. 'oak', 'cherry', 'daisy', etc.
 * @property {number} x
 * @property {number} z
 * @property {number} [yaw]   - default 0
 * @property {number} [scale] - default 1
 * @property {boolean} [locked] - default false; mailbox/telescope are locked
 */

import committed from './defaultIslandLayout.json'
import { mergeIslandLayout } from '../State/schema.js'

// ── Constants mirroring the view modules ──────────────────────────────────────

// Tree.js PLACEMENTS (lines 66-74)
const TREE_PLACEMENTS = [
    { species: 'oak',    x:  0.0, z:  0.0, scale: 0.78, yaw:  0.00 },
    { species: 'oak',    x: -2.1, z: -1.6, scale: 0.52, yaw:  0.85 },
    { species: 'cherry', x:  2.4, z: -1.1, scale: 0.50, yaw:  1.60 },
    { species: 'cherry', x: -1.8, z:  2.1, scale: 0.56, yaw: -0.70 },
    { species: 'oak',    x:  1.6, z:  2.4, scale: 0.54, yaw:  2.35 },
    { species: 'oak',    x: -3.2, z:  0.3, scale: 0.60, yaw: -1.30 },
    { species: 'cherry', x:  3.0, z:  0.9, scale: 0.48, yaw:  2.20 },
]

// Fruits.js BUSH_PLACEMENTS (lines 36-41)
const FRUIT_PLACEMENTS = [
    { species: 'plum',   x:  2.6, z:  0.1 },
    { species: 'fig',    x: -2.4, z:  0.9 },
    { species: 'citrus', x:  0.8, z: -2.6 },
    { species: 'berry',  x: -1.0, z: -2.4 },
]

// Mailbox: x=-0.6, z=2.5 (Mailbox.js line 49)
const MAILBOX_X = -0.6
const MAILBOX_Z = 2.5

// Telescope: cos(1.30)*4.85, sin(1.30)*4.85 (Telescope.js lines 27-28)
const RIM_THETA  = 1.30
const RIM_RADIUS = 4.85

// ── Flower placement formula ───────────────────────────────────────────────────

// Deterministic 32-bit hash → 0..1 float. Matches Flowers.js exactly.
// seed=1337, n is the per-index salt.
const hash = (seed, n) =>
{
    let h = seed | 0
    h = Math.imul(h ^ n, 2654435761)
    h ^= h >>> 16
    return ((h >>> 0) % 10_000) / 10_000
}

// Plateau radius — mirrors Island.js / the Flowers.js formula
const ISLAND_RADIUS = 5.0   // Flowers.js uses `this.island.radius`; the default is 5.0
const FLOWER_SEED   = 1337

/**
 * Return the `{ x, z, yaw }` base placement for flower index `i`.
 *
 * Flower 0 is pinned at `-1.4, 1.0` (the ceremony anchor). Every other
 * flower uses the seeded polar formula from Flowers._buildOne. The caller
 * passes the game island radius if known; defaults to 5.0.
 *
 * @param {number} i
 * @param {number} [seed=1337]
 * @param {number} [islandRadius=5.0]
 * @returns {{ x: number, z: number, yaw: number }}
 */
export function flowerBasePlacement(i, seed = FLOWER_SEED, islandRadius = ISLAND_RADIUS)
{
    if(i === 0)
    {
        return {
            x:   -1.4,
            z:    1.0,
            yaw:  hash(seed, 3000 + 0) * Math.PI * 2,
        }
    }
    const radiusMax = islandRadius - 0.6
    const theta  = hash(seed, 1000 + i) * Math.PI * 2
    const radial = Math.sqrt(hash(seed, 2000 + i)) * radiusMax
    return {
        x:   Math.cos(theta) * radial,
        z:   Math.sin(theta) * radial,
        yaw: hash(seed, 3000 + i) * Math.PI * 2,
    }
}

const FLOWER_SPECIES = ['daisy', 'tulip', 'rose', 'lily', 'pansy', 'hyacinth']

// ── Default builder ────────────────────────────────────────────────────────────

/**
 * Return the committed default island layout.
 *
 * Loads from `defaultIslandLayout.json` (the authored, version-controlled
 * default) and validates it through `mergeIslandLayout`. Falls back to
 * `defaultIslandLayoutFromConstants()` if the file is missing or invalid,
 * so the app never boots to an empty island.
 *
 * To update the default: edit the island in `/#editor`, click Export, and
 * commit the downloaded JSON as `Game/Data/defaultIslandLayout.json`.
 *
 * @returns {{ v: 1, objects: PlacedObject[] }}
 */
export function defaultIslandLayout()
{
    const merged = mergeIslandLayout(committed)
    if(merged && merged.objects.length > 0) return merged
    return defaultIslandLayoutFromConstants()
}

/**
 * Build the canonical default layout from baked constants — the authoritative
 * fallback if `defaultIslandLayout.json` is empty or invalid.
 *
 * Produces 31 objects: tree-0…tree-6, flower-0…flower-17, fruit-0…fruit-3,
 * mailbox-0, telescope-0.
 *
 * @returns {{ v: 1, objects: PlacedObject[] }}
 */
export function defaultIslandLayoutFromConstants()
{
    /** @type {PlacedObject[]} */
    const objects = []

    for(let i = 0; i < TREE_PLACEMENTS.length; i++)
    {
        const p = TREE_PLACEMENTS[i]
        objects.push({
            id:      `tree-${i}`,
            kind:    'tree',
            species: p.species,
            x:       p.x,
            z:       p.z,
            yaw:     p.yaw,
            scale:   p.scale,
            locked:  false,
        })
    }

    for(let i = 0; i < 18; i++)
    {
        const { x, z, yaw } = flowerBasePlacement(i)
        const species = FLOWER_SPECIES[i % FLOWER_SPECIES.length]
        objects.push({
            id:      `flower-${i}`,
            kind:    'flower',
            species,
            x,
            z,
            yaw,
            scale:   1,
            locked:  false,
        })
    }

    for(let i = 0; i < FRUIT_PLACEMENTS.length; i++)
    {
        const p = FRUIT_PLACEMENTS[i]
        objects.push({
            id:      `fruit-${i}`,
            kind:    'fruit',
            species: p.species,
            x:       p.x,
            z:       p.z,
            yaw:     0,
            scale:   1,
            locked:  false,
        })
    }

    objects.push({
        id:      'mailbox-0',
        kind:    'mailbox',
        species: undefined,
        x:       MAILBOX_X,
        z:       MAILBOX_Z,
        yaw:     0,
        scale:   1,
        locked:  true,
    })

    objects.push({
        id:      'telescope-0',
        kind:    'telescope',
        species: undefined,
        x:       Math.cos(RIM_THETA) * RIM_RADIUS,
        z:       Math.sin(RIM_THETA) * RIM_RADIUS,
        yaw:     0,
        scale:   1,
        locked:  true,
    })

    return { v: 1, objects }
}
