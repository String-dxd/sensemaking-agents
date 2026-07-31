import type { MyWorldFaqContent } from './content-schema'

/**
 * Published revisions retain the prototype's historical internal character
 * name so old revisions remain valid and restorable. The public FAQ uses the
 * audience-facing product term without rewriting revision history.
 */
export function prepareMyWorldFaqPublicCopy(content: MyWorldFaqContent): MyWorldFaqContent {
  return replacePublicTerms(content)
}

function replacePublicTerms<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replaceAll('Kira', 'Companion') as T
  }
  if (Array.isArray(value)) {
    return value.map(replacePublicTerms) as T
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replacePublicTerms(entry)]),
    ) as T
  }
  return value
}
