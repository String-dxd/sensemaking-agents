// Species-aware body scene builder (plan 017 step 5) — the seam CharacterRoot
// and companionExport share. Lives here (not in partRegistry) because
// species/registry already imports partRegistry; adding the reverse edge there
// would close an import cycle. BODY_REGISTRY[*].source.build stays the
// no-species path and is byte-equivalent to buildBodyScene(archetype).

import type * as THREE from 'three'
import { getSpecies } from '../species/registry'
import type { Archetype } from '../spec/schema'
import { buildProceduralBody } from './body'

export function buildBodyScene(archetype: Archetype, speciesId?: string): THREE.Object3D {
  const shape = speciesId ? (getSpecies(speciesId)?.birdShape ?? undefined) : undefined
  return buildProceduralBody(archetype, shape).scene
}
