import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
import { CHARACTER_CLIPS, CHARACTER_SOURCE_HEIGHT } from '../src/models/characterAsset'

// CHARACTER_CLIPS (src/models/characterAsset.ts) is UI truth for the clip
// cycler — it must never drift from the clips actually baked into the GLB.
// Reads via gltf-transform's NodeIO exactly like test/objectGlbs.test.ts (DOM-
// free; three's GLTFLoader needs `new Image()` for the WebP map, which node
// doesn't have).

const CHARACTER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'models',
  'character.glb',
)

let doc: Document

beforeAll(async () => {
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
  doc = await io.read(CHARACTER_PATH)
})

describe('CHARACTER_CLIPS', () => {
  it('matches the animation-name set baked into public/models/character.glb', () => {
    const glbNames = doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName())
      .sort()
    expect([...CHARACTER_CLIPS].sort()).toEqual(glbNames)
  })

  it('has no duplicate clip names', () => {
    expect(new Set(CHARACTER_CLIPS).size).toBe(CHARACTER_CLIPS.length)
  })
})

describe('CHARACTER_SOURCE_HEIGHT', () => {
  it('stays within the 1.5–1.8 bind-pose band test/objectGlbs.test.ts guards, so the two constants cannot drift apart silently', () => {
    expect(CHARACTER_SOURCE_HEIGHT).toBeGreaterThan(1.5)
    expect(CHARACTER_SOURCE_HEIGHT).toBeLessThan(1.8)
  })
})
