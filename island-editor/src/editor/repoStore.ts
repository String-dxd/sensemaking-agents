// Repo save/load client (plan 023). Talks to the dev-server middleware
// (`server/islandSavePlugin.ts`) that persists the spec to the git-tracked
// `saves/island.json`. Serialization/validation is delegated to specIO —
// this module owns only the transport. NO three/r3f imports.
//
// `fetchImpl` is injectable so node unit tests can stub the network.

import type { IslandSpec } from '../terrain/terrainGrid'
import { serializeSpec, validateSpecObject } from './specIO'

export async function saveSpecToRepo(spec: IslandSpec, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl('/api/island/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializeSpec(spec),
  })
  if (!res.ok) {
    throw new Error(`Save failed (${res.status}): ${await res.text()}`)
  }
}

export async function loadSpecFromRepo(fetchImpl: typeof fetch = fetch): Promise<IslandSpec> {
  const res = await fetchImpl('/api/island/load')
  if (res.status === 404) {
    throw new Error('No island saved in the repo yet — press Save first.')
  }
  if (!res.ok) {
    throw new Error(`Load failed (${res.status}): ${await res.text()}`)
  }
  return validateSpecObject(JSON.parse(await res.text()))
}
