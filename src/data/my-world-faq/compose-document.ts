import {
  type MyWorldFaqContent,
  type MyWorldFaqEditorialDocument,
  validateMyWorldFaqDocument,
} from './content-schema'
import { DEFAULT_MY_WORLD_FAQ_DOCUMENT } from './default-document'

function orderLikeTemplate(value: unknown, template: unknown): unknown {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return value
    return template.map((templateItem, index) => orderLikeTemplate(value[index], templateItem))
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
