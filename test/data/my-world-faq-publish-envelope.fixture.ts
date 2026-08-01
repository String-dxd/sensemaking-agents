import {
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  FAQ_EDITABLE_FIELDS,
  readMyWorldFaqManifestPath,
  setMyWorldFaqManifestPath,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'
import type { PublishMyWorldFaqEditorRequest } from '~/server/my-world-faq-editor.functions'

export const FAQ_PUBLISH_ENVELOPE_TEST_HEAD = {
  revisionId: '11111111-1111-4111-8111-111111111111',
  version: 4,
  digest: 'a'.repeat(64),
} as const

export const FAQ_PUBLISH_ENVELOPE_TEST_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222'
export const FAQ_PUBLISH_ENVELOPE_TEST_PROJECTION_DIGEST = 'e'.repeat(64)

const expandableBodyFields = FAQ_EDITABLE_FIELDS.filter(
  (field) => field.category === 'body' && !field.path.startsWith('questions.'),
)

export function buildValidPublishRequestAtByteLength(
  targetBytes: number,
  expectedProjectionDigest = FAQ_PUBLISH_ENVELOPE_TEST_PROJECTION_DIGEST,
): PublishMyWorldFaqEditorRequest {
  let document = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
  document.route.title = 'Boundary draft B'
  document.route.description = 'UTF-8 publication envelope boundary: 界'

  let request: PublishMyWorldFaqEditorRequest = {
    schemaVersion: 1,
    document,
    expectedBase: FAQ_PUBLISH_ENVELOPE_TEST_HEAD,
    expectedProjectionDigest,
    attemptId: FAQ_PUBLISH_ENVELOPE_TEST_ATTEMPT_ID,
  }

  for (const field of expandableBodyFields) {
    const expandedDocument = setMyWorldFaqManifestPath(document, field.path, 'x'.repeat(8_000))
    const expandedRequest = { ...request, document: expandedDocument }
    const expandedBytes = publishRequestByteLength(expandedRequest)

    if (expandedBytes <= targetBytes) {
      document = expandedDocument
      request = expandedRequest
      if (expandedBytes === targetBytes) return assertValidRequest(request, targetBytes)
      continue
    }

    const currentValue = readMyWorldFaqManifestPath(document, field.path)
    const currentBytes = publishRequestByteLength(request)
    const fixedBytes = currentBytes - Buffer.byteLength(JSON.stringify(currentValue), 'utf8')
    const fillerLength = targetBytes - fixedBytes - 2
    if (fillerLength < 1 || fillerLength > 8_000) {
      throw new RangeError(`Cannot create a valid ${targetBytes}-byte publish request.`)
    }

    document = setMyWorldFaqManifestPath(document, field.path, 'x'.repeat(fillerLength))
    request = { ...request, document }
    return assertValidRequest(request, targetBytes)
  }

  throw new RangeError(`Cannot create a valid ${targetBytes}-byte publish request.`)
}

function publishRequestByteLength(request: PublishMyWorldFaqEditorRequest): number {
  return Buffer.byteLength(JSON.stringify(request), 'utf8')
}

function assertValidRequest(
  request: PublishMyWorldFaqEditorRequest,
  targetBytes: number,
): PublishMyWorldFaqEditorRequest {
  const byteLength = publishRequestByteLength(request)
  if (byteLength !== targetBytes) {
    throw new Error(`Expected ${targetBytes} bytes, received ${byteLength}.`)
  }

  const validation = validateMyWorldFaqDocument(request.document)
  if (!validation.success) {
    throw new Error(`Boundary fixture is invalid: ${JSON.stringify(validation.errors.slice(0, 3))}`)
  }
  return request
}
