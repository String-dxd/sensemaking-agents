import { type MyWorldFaqEditorialDocument, updateMyWorldFaqDraftPath } from '~/data/my-world-faq'

export function readMyWorldFaqEditableValue(
  document: MyWorldFaqEditorialDocument,
  path: string,
): string {
  const value = resolvePath(document, path)
  if (typeof value !== 'string') {
    throw new Error(`Editable FAQ path does not resolve to text: ${path}`)
  }
  return value
}

export function updateMyWorldFaqEditableValue(
  base: MyWorldFaqEditorialDocument,
  document: MyWorldFaqEditorialDocument,
  path: string,
  value: string,
): MyWorldFaqEditorialDocument {
  return updateMyWorldFaqDraftPath(base, document, path, value)
}

export function deriveMyWorldFaqDirtyPaths(
  base: MyWorldFaqEditorialDocument,
  working: MyWorldFaqEditorialDocument,
  editablePaths: readonly string[],
): readonly string[] {
  return editablePaths.filter((path) => {
    const workingValue = resolvePath(working, path)
    if (typeof workingValue !== 'string') {
      throw new Error(`Editable FAQ path does not resolve to text: ${path}`)
    }
    const baseValue = resolvePath(base, path)
    return typeof baseValue !== 'string' || baseValue !== workingValue
  })
}

function resolvePath(document: MyWorldFaqEditorialDocument, path: string): unknown {
  let current: unknown = document
  if (path.length === 0) return current

  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const numericIndex = /^\d+$/.test(segment) ? Number(segment) : -1
      current =
        numericIndex >= 0
          ? current[numericIndex]
          : current.find((item) => {
              if (!item || typeof item !== 'object') return false
              const record = item as { id?: unknown; state?: unknown }
              return record.id === segment || record.state === segment
            })
      continue
    }
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
