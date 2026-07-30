import {
  type MyWorldFaqContent,
  type MyWorldFaqEditorialDocument,
  validateMyWorldFaqDocument,
} from './content-schema'
import { DEFAULT_MY_WORLD_FAQ_DOCUMENT } from './default-document'

function orderLikeTemplate(value: unknown, template: unknown): unknown {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return value
    return value.map((valueItem, index) => {
      const key = stableRecordKey(valueItem)
      const matchingTemplate =
        key === undefined
          ? undefined
          : template.find((templateItem) => stableRecordKey(templateItem) === key)
      return orderLikeTemplate(
        valueItem,
        matchingTemplate ?? template[index] ?? template[0] ?? valueItem,
      )
    })
  }
  if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const source = value as Record<string, unknown>
    const ordered: Record<string, unknown> = {}
    for (const key of Object.keys(template)) {
      ordered[key] = orderLikeTemplate(source[key], (template as Record<string, unknown>)[key])
    }
    return ordered
  }
  return value
}

function stableRecordKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as { id?: unknown; state?: unknown }
  if (typeof record.id === 'string') return record.id
  if (typeof record.state === 'string') return record.state
  return undefined
}

export function normalizeMyWorldFaqDocument(input: unknown): MyWorldFaqEditorialDocument {
  const result = validateMyWorldFaqDocument(input)
  if (!result.success) {
    const detail = result.errors
      .map((issue) => `${issue.path || '<root>'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid My World FAQ document: ${detail}`)
  }
  return orderLikeTemplate(
    result.document,
    DEFAULT_MY_WORLD_FAQ_DOCUMENT,
  ) as MyWorldFaqEditorialDocument
}

export function canonicalizeMyWorldFaqDocument(input: unknown): string {
  return JSON.stringify(normalizeMyWorldFaqDocument(input))
}

export async function digestMyWorldFaqDocument(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeMyWorldFaqDocument(input))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function composeMyWorldFaqDocument(input: unknown): MyWorldFaqContent {
  return normalizeMyWorldFaqDocument(input)
}

export const DEFAULT_MY_WORLD_FAQ_CONTENT = composeMyWorldFaqDocument(DEFAULT_MY_WORLD_FAQ_DOCUMENT)
