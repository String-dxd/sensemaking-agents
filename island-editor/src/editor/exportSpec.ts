import type { IslandSpec, Vec2, HeightProfile, ReliefGrid } from '../terrain/islandSpec'

// ── Serialize ────────────────────────────────────────────────────────────────

export function serializeSpec(spec: IslandSpec): string {
  return JSON.stringify(spec, null, 2)
}

// ── Validate + Deserialize ───────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function validateVec2(v: unknown): v is Vec2 {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.x === 'number' && isFinite(o.x) && typeof o.z === 'number' && isFinite(o.z)
}

function validateHeightProfile(v: unknown): v is HeightProfile {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isFiniteNumber(o.seaLevel) &&
    isFiniteNumber(o.plateauHeight) &&
    isFiniteNumber(o.coastFalloff) &&
    isFiniteNumber(o.cliffSteepness) &&
    isFiniteNumber(o.seafloorDepth)
  )
}

function validateRelief(v: unknown): v is ReliefGrid {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (!isFiniteNumber(o.resolution)) return false
  if (!Array.isArray(o.data)) return false
  const expected = (o.resolution as number) * (o.resolution as number)
  if (o.data.length !== expected) return false
  return (o.data as unknown[]).every((d) => typeof d === 'number')
}

/** Validate an already-parsed value as an IslandSpec; throws with a field-level message on failure. */
export function validateSpecObject(parsed: unknown): IslandSpec {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid island spec: root must be an object')
  }

  const o = parsed as Record<string, unknown>

  if (o.version !== 1) {
    throw new Error(`Invalid island spec: version must be 1, got ${String(o.version)}`)
  }

  if (!isFiniteNumber(o.worldSize)) {
    throw new Error('Invalid island spec: worldSize must be a finite number')
  }

  if (!Array.isArray(o.coastline) || o.coastline.length < 3) {
    throw new Error(
      `Invalid island spec: coastline must be an array of at least 3 points, got ${Array.isArray(o.coastline) ? o.coastline.length : typeof o.coastline}`,
    )
  }

  for (let i = 0; i < (o.coastline as unknown[]).length; i++) {
    if (!validateVec2((o.coastline as unknown[])[i])) {
      throw new Error(`Invalid island spec: coastline[${i}] must be {x: number, z: number}`)
    }
  }

  if (!validateHeightProfile(o.heightProfile)) {
    throw new Error(
      'Invalid island spec: heightProfile must have finite numeric fields seaLevel, plateauHeight, coastFalloff, cliffSteepness, seafloorDepth',
    )
  }

  if (!validateRelief(o.relief)) {
    throw new Error(
      'Invalid island spec: relief must have numeric resolution and data array of length resolution*resolution',
    )
  }

  return parsed as IslandSpec
}

export function deserializeSpec(json: string): IslandSpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid island spec: malformed JSON')
  }
  return validateSpecObject(parsed)
}

// ── Download (browser-only) ──────────────────────────────────────────────────

export function downloadSpec(spec: IslandSpec, filename?: string): void {
  const json = serializeSpec(spec)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const timestamp = Date.now()
  const name = filename ?? `island-${timestamp}.json`
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// ── Import (browser-only) ────────────────────────────────────────────────────

export function importSpecFromFile(file: File): Promise<IslandSpec> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        reject(new Error('Failed to read file: result is not a string'))
        return
      }
      try {
        resolve(deserializeSpec(text))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    reader.readAsText(file)
  })
}
