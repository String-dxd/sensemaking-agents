import { type BirdConfig, configError } from '../bird/birdConfig'

// JSON serialize / deserialize / download / import for a bird config. Mirrors
// island-editor/src/editor/exportSpec.ts. deserialize throws a descriptive
// message (sourced from the shared `configError`) so a bad import tells the
// user what's wrong.

export function serializeConfig(config: BirdConfig): string {
  return JSON.stringify(config, null, 2)
}

export function deserializeConfig(json: string): BirdConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid bird config: malformed JSON')
  }
  const err = configError(parsed)
  if (err) throw new Error(`Invalid bird config: ${err}`)
  return parsed as BirdConfig
}

// ── Browser-only ──────────────────────────────────────────────────────────────

export function downloadConfig(config: BirdConfig, filename?: string): void {
  const json = serializeConfig(config)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename ?? 'bird-config.json'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function importConfigFromFile(file: File): Promise<BirdConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        reject(new Error('Failed to read file: result is not a string'))
        return
      }
      try {
        resolve(deserializeConfig(text))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
