import { type BirdGenome, genomeError } from '../bird/genome'
import { migrate } from '../bird/migrate'

// JSON serialize / deserialize / download / import for a bird genome. Mirrors
// island-editor/src/editor/exportSpec.ts. deserialize runs migrate() (so an
// exported v1 file still imports) then throws a descriptive `genomeError` so a
// bad import tells the user what's wrong.

export function serializeConfig(config: BirdGenome): string {
  return JSON.stringify(config, null, 2)
}

export function deserializeConfig(json: string): BirdGenome {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid bird config: malformed JSON')
  }
  const migrated = migrate(parsed)
  const err = genomeError(migrated)
  if (err) throw new Error(`Invalid bird config: ${err}`)
  return migrated as BirdGenome
}

// ── Browser-only ──────────────────────────────────────────────────────────────

export function downloadConfig(config: BirdGenome, filename?: string): void {
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

export function importConfigFromFile(file: File): Promise<BirdGenome> {
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
