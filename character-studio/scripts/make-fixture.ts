// Fixture maker (plan 011 step 2): write a default `.character.json` for a
// given archetype/personality so the export CLI + conformance suite have a
// deterministic input. Usage:
//   pnpm tsx scripts/make-fixture.ts [archetype] [personality] > out.character.json
//
// `createDefaultCharacter` mints a fresh uuid + timestamps each call; the
// conformance suite calls it directly, so this script is for a stable on-disk
// fixture only (e.g. `fixtures/default-dog.character.json`).

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDefaultCharacter } from '../src/core/spec/defaults'
import { serializeSpec } from '../src/core/spec/io'
import type { Archetype, Personality } from '../src/core/spec/schema'

const archetype = (process.argv[2] as Archetype) ?? 'biped-round'
const personality = (process.argv[3] as Personality) ?? 'gentle'

const spec = createDefaultCharacter(archetype, personality)
// Deterministic id/name so the fixture is stable across regenerations.
spec.meta.id = '00000000-0000-4000-8000-0000000000d0'
spec.meta.name = 'Fixture Dog'
spec.meta.createdAt = '2026-07-04T00:00:00.000Z'
spec.meta.updatedAt = '2026-07-04T00:00:00.000Z'

const dir = fileURLToPath(new URL('../fixtures/', import.meta.url))
mkdirSync(dir, { recursive: true })
const out = `${dir}default-dog.character.json`
writeFileSync(out, serializeSpec(spec))
console.log('wrote', out)
