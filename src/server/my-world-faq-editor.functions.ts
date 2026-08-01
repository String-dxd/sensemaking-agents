import { createServerFn } from '@tanstack/react-start'
import type {
  FAQ_EDITORIAL_FIELD_LIMITS,
  FaqEditorialFieldDefinition,
  MyWorldFaqEditorialDocument,
  MyWorldFaqEditorialMutationIssue,
  MyWorldFaqValidationWarning,
} from '~/data/my-world-faq'

export interface MyWorldFaqEditorBaseSnapshot {
  head: {
    revisionId: string
    version: number
    digest: string
  }
  /** Digest of the materialized editor document, including compiled defaults. */
  projectionDigest: string
  document: MyWorldFaqEditorialDocument
  savedByName: string | null
  createdAt: string
}

export interface MyWorldFaqEditorManifestContract {
  fields: readonly FaqEditorialFieldDefinition[]
  limits: typeof FAQ_EDITORIAL_FIELD_LIMITS
}

export type MyWorldFaqEditorSessionState =
  | { status: 'locked' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      identity: {
        displayName: string
        idleExpiresAt: string
        absoluteExpiresAt: string
      }
    }

export type MyWorldFaqEditorLoaderData =
  | { status: 'locked' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      identity: {
        displayName: string
        idleExpiresAt: string
        absoluteExpiresAt: string
      }
      feedbackEnabled?: boolean
      base: MyWorldFaqEditorBaseSnapshot
      manifest: MyWorldFaqEditorManifestContract
    }

export interface PublishMyWorldFaqEditorRequest {
  schemaVersion: 1
  document: MyWorldFaqEditorialDocument
  expectedProjectionDigest: string
  expectedBase: {
    revisionId: string
    version: number
    digest: string
  }
  attemptId: string
}

export const MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES = 1_024 * 1_024

export function serializeMyWorldFaqEditorPublishRequest(request: PublishMyWorldFaqEditorRequest): {
  body: string
  byteLength: number
  exceedsLimit: boolean
} {
  const body = JSON.stringify(request)
  if (typeof body !== 'string') {
    throw new TypeError('The FAQ publish request could not be serialized.')
  }
  const byteLength = new TextEncoder().encode(body).byteLength
  return {
    body,
    byteLength,
    exceedsLimit: byteLength > MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES,
  }
}

export interface MyWorldFaqRevisionMetadata {
  revisionId: string
  version: number
  digest: string
  schemaVersion: number
  structureVersion: number
  attributionKind: 'self-declared' | 'system-import'
  savedByName: string | null
  createdAt: string
  restoredFromRevisionId: string | null
}

export interface LoadMyWorldFaqRevisionHistoryRequest {
  beforeVersion?: number
  limit?: number
}

export type MyWorldFaqRevisionHistoryData =
  | { status: 'locked' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      items: MyWorldFaqRevisionMetadata[]
      nextBeforeVersion: number | null
    }

export interface LoadMyWorldFaqRevisionPreviewRequest {
  revisionId: string
}

export type MyWorldFaqRevisionPreviewData =
  | { status: 'locked' }
  | { status: 'unavailable' }
  | { status: 'unsupported' }
  | {
      status: 'ready'
      revision: MyWorldFaqEditorBaseSnapshot & {
        schemaVersion: number
        structureVersion: number
        attributionKind: 'self-declared' | 'system-import'
        restoredFromRevisionId: string | null
      }
    }

export interface RestoreMyWorldFaqEditorRequest {
  schemaVersion: 1
  targetRevisionId: string
  expectedBase: {
    revisionId: string
    version: number
    digest: string
  }
  attemptId: string
}

export type RestoreMyWorldFaqEditorResponse =
  | {
      ok: true
      outcome: 'committed' | 'committed-but-superseded'
      committed: MyWorldFaqEditorBaseSnapshot
      live: MyWorldFaqEditorBaseSnapshot
      resilience: 'healthy' | 'degraded'
    }
  | {
      ok: false
      error:
        | 'attempt_reused'
        | 'cross_origin'
        | 'invalid_body'
        | 'no_changes'
        | 'persistence_unavailable'
        | 'rate_limited'
        | 'revision_unavailable'
        | 'session_expired'
        | 'stale_head'
      message: string
      latest?: MyWorldFaqEditorBaseSnapshot
    }

export type PublishMyWorldFaqEditorResponse =
  | {
      ok: true
      outcome: 'committed' | 'committed-but-superseded'
      committed: MyWorldFaqEditorBaseSnapshot
      live: MyWorldFaqEditorBaseSnapshot
      resilience: 'healthy' | 'degraded'
      warnings: MyWorldFaqValidationWarning[]
    }
  | {
      ok: false
      error:
        | 'attempt_reused'
        | 'cross_origin'
        | 'invalid_body'
        | 'no_changes'
        | 'persistence_unavailable'
        | 'rate_limited'
        | 'session_expired'
        | 'stale_head'
        | 'validation_failed'
      message: string
      issues?: MyWorldFaqEditorialMutationIssue[]
      warnings?: MyWorldFaqValidationWarning[]
      latest?: MyWorldFaqEditorBaseSnapshot
    }

/**
 * Protected editor boundary. This browser-visible module has no static
 * database or authentication imports. The handler validates the feature flag
 * and session before it reads the published document.
 */
export const loadMyWorldFaqEditor = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyWorldFaqEditorLoaderData> => {
    const [{ getRequest }, { loadMyWorldFaqEditorHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-editor.handler.server'),
    ])
    return loadMyWorldFaqEditorHandler(getRequest())
  },
)

/**
 * Lightweight BFCache/session probe. It never returns document or history
 * data, so protected DOM can stay hidden while this request is in flight.
 */
export const checkMyWorldFaqEditorSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyWorldFaqEditorSessionState> => {
    const [{ getRequest }, { checkMyWorldFaqEditorSessionHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-editor.handler.server'),
    ])
    return checkMyWorldFaqEditorSessionHandler(getRequest())
  },
)

/**
 * Protected, metadata-only revision listing. The full document body for each
 * row remains server-side until an authenticated collaborator selects one
 * revision for preview.
 */
export const loadMyWorldFaqRevisionHistory = createServerFn({ method: 'GET' })
  .inputValidator(parseRevisionHistoryRequest)
  .handler(async ({ data }): Promise<MyWorldFaqRevisionHistoryData> => {
    const [{ getRequest }, { loadMyWorldFaqRevisionHistoryHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-history.handler.server'),
    ])
    return loadMyWorldFaqRevisionHistoryHandler(getRequest(), data)
  })

/**
 * Protected historical preview. A successful request loads exactly the one
 * selected complete revision after the editor session has been validated.
 */
export const loadMyWorldFaqRevisionPreview = createServerFn({ method: 'GET' })
  .inputValidator(parseRevisionPreviewRequest)
  .handler(async ({ data }): Promise<MyWorldFaqRevisionPreviewData> => {
    const [{ getRequest }, { loadMyWorldFaqRevisionPreviewHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-history.handler.server'),
    ])
    return loadMyWorldFaqRevisionPreviewHandler(getRequest(), data)
  })

function parseRevisionHistoryRequest(raw: unknown): LoadMyWorldFaqRevisionHistoryRequest {
  if (raw === undefined) return {}
  if (!isPlainRecord(raw)) throw new Error('Invalid revision history request.')
  const keys = Object.keys(raw)
  if (keys.some((key) => key !== 'beforeVersion' && key !== 'limit')) {
    throw new Error('Invalid revision history request.')
  }
  if (
    raw.beforeVersion !== undefined &&
    (!Number.isInteger(raw.beforeVersion) || (raw.beforeVersion as number) < 2)
  ) {
    throw new Error('Invalid revision history request.')
  }
  if (
    raw.limit !== undefined &&
    (!Number.isInteger(raw.limit) || (raw.limit as number) < 1 || (raw.limit as number) > 50)
  ) {
    throw new Error('Invalid revision history request.')
  }
  return {
    ...(raw.beforeVersion === undefined ? {} : { beforeVersion: raw.beforeVersion as number }),
    ...(raw.limit === undefined ? {} : { limit: raw.limit as number }),
  }
}

function parseRevisionPreviewRequest(raw: unknown): LoadMyWorldFaqRevisionPreviewRequest {
  if (!isPlainRecord(raw) || Object.keys(raw).length !== 1 || typeof raw.revisionId !== 'string') {
    throw new Error('Invalid revision preview request.')
  }
  return { revisionId: raw.revisionId }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
