// Exports the canonical skeleton (reference + per-archetype builds) as JSON
// for the Blender authoring scripts (scripts/blender/*). Run via:
//
//   pnpm gen:skeleton-json
//
// This is the bridge that keeps Blender armatures byte-identical with
// src/core/skeleton/canonical.ts — the Blender builder NEVER hand-writes
// bone names or positions.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { archetypeHead, ARCHETYPES_DEF, buildArchetypeSkeleton } from '../src/core/skeleton/archetypes'
import { BONE_PARENTS, buildSkeleton, CANONICAL_BONES, restWorldPositions, SPRING_CHAIN_BONES, SOCKETS } from '../src/core/skeleton/canonical'
import { ARCHETYPES } from '../src/core/spec/schema'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'blender', 'build')

interface SkeletonJson {
  bones: Array<{ name: string; parent: string | null; head: [number, number, number] }>
  head: { center: [number, number, number]; radius: number }
  height: number
  uniformScale: number
}

function serialize(built: ReturnType<typeof buildSkeleton>, head: SkeletonJson['head'], height: number, uniformScale: number): SkeletonJson {
  const world = restWorldPositions(built)
  return {
    bones: CANONICAL_BONES.map((def) => ({ name: def.name, parent: def.parent, head: world[def.name] })),
    head,
    height,
    uniformScale,
  }
}

const reference = serialize(buildSkeleton(), { center: [0, 0.18, 0], radius: 0.2 }, 1, 1)

const archetypes = Object.fromEntries(
  ARCHETYPES.map((archetype) => {
    const def = ARCHETYPES_DEF[archetype]
    const head = archetypeHead(archetype)
    return [archetype, serialize(buildArchetypeSkeleton(archetype), head, def.height, def.uniformScale)]
  }),
)

const payload = {
  generatedBy: 'scripts/export-skeleton-json.ts',
  sockets: SOCKETS,
  springChainBones: SPRING_CHAIN_BONES,
  parents: BONE_PARENTS,
  reference,
  archetypes,
}

mkdirSync(OUT_DIR, { recursive: true })
const outPath = join(OUT_DIR, 'skeleton.json')
writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log(`wrote ${outPath}`)
