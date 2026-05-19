/**
 * Public profile loader — resolves a share token to a redacted view of the
 * underlying VIPS data. No auth required; the SECURITY DEFINER function
 * `share_token_resolve_with_status` is the single permitted unauth read
 * path into `vips_share_tokens`.
 *
 * Response shape discipline:
 *   - NO `student_id`, NO `token`, NO `created_at`, NO `revoked_at` in the
 *     serialised payload. Server strips before returning. The route must
 *     not echo any of these even if the caller asks.
 *   - `show_quotes` is the ONLY redaction switch and is read EXCLUSIVELY
 *     from the DB row. Client-supplied `showQuotes` is ignored — Zod
 *     strict mode on the input rejects the field at the schema layer, and
 *     the handler never references the request object beyond the token.
 *   - `isOwner` is computed server-side by comparing the resolved
 *     `student_id` against the authenticated session's studentId. The
 *     owner's identifier is never sent to the client; only the boolean.
 */

import { sql } from 'drizzle-orm'

import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { getDbForMemoryModule, withStudent } from '~/db/client'
import {
  listVipsPages,
  listVipsTimelineEntries,
  type VipsPageRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import { type LoadPublicProfileInput, loadPublicProfileInputSchema } from './function-schemas'
import { tryResolveOwnerStudentId } from './public-profile-owner.server'

export type LoadPublicProfileResult =
  | {
      status: 'ok'
      profile: PublicProfileBody
      isOwner: boolean
    }
  | { status: 'revoked' }
  | { status: 'not_found' }

export interface PublicProfileBody {
  nameSnapshot: string
  showQuotes: boolean
  /** Most-recent `updated_at` across the four pages — "last synced" hint. */
  lastSyncedAt: string | null
  /** Dimensions in canonical order with compiled-truth + claim summaries. */
  dimensions: PublicProfileDimension[]
}

export interface PublicProfileDimension {
  dimension: VipsDimension
  compiledTruth: string
  openQuestion: string
  updatedAt: string | null
  claimCount: number
  /**
   * Recent timeline entries scoped to this dimension. When `show_quotes`
   * is false, every entry's `quote` field is null — the canonical label
   * remains so viewers can still see what kinds of claims are forming.
   */
  recentEntries: PublicProfileEntry[]
}

export interface PublicProfileEntry {
  id: number
  canonicalLabel: string
  /** Verbatim reflection text. null when `show_quotes` is false. */
  quote: string | null
  strength: 'low' | 'medium' | 'high'
  committedAt: string
}

interface ResolverRow extends Record<string, unknown> {
  student_id: string
  show_quotes: boolean
  name_snapshot: string
  revoked_at: string | null
}

/**
 * Look up a token via the SECURITY DEFINER resolver. Runs OUTSIDE
 * `withStudent` because the unauth caller has no `app.student_id` GUC to
 * set — that's the whole point of the resolver function. `getDbForMemoryModule`
 * gives a non-transactional DB handle; the name is historical (the memory
 * module needed similar non-tenanted access) but the function is the
 * correct seam for any unauth read path.
 *
 * Returns null when no row matches the token at all (typo / never existed).
 */
async function resolveToken(token: string): Promise<ResolverRow | null> {
  const db = getDbForMemoryModule()
  const result = await db.execute<ResolverRow>(
    sql`select student_id, show_quotes, name_snapshot, revoked_at
        from share_token_resolve_with_status(${token})`,
  )
  return result.rows[0] ?? null
}

export async function loadPublicProfileHandler(
  data: LoadPublicProfileInput,
): Promise<LoadPublicProfileResult> {
  // Strict-mode schema rejects any extra fields (e.g. `?showQuotes=true`)
  // before they reach the handler, so redaction state is always read from
  // the DB row below.
  loadPublicProfileInputSchema.parse(data)
  const { token } = data

  const row = await resolveToken(token)
  if (!row) return { status: 'not_found' }
  if (row.revoked_at) return { status: 'revoked' }

  const studentId = row.student_id
  const showQuotes = row.show_quotes
  const nameSnapshot = row.name_snapshot

  const ownerStudentId = await tryResolveOwnerStudentId()
  const isOwner = ownerStudentId !== null && ownerStudentId === studentId

  const body = await withStudent(studentId, async (ctx) => {
    const pages = await listVipsPages(studentId, { ctx })
    const pagesByDimension = new Map<string, VipsPageRow>(pages.map((p) => [p.dimension, p]))

    const dimensions: PublicProfileDimension[] = []
    let lastSyncedAt: string | null = null

    for (const dimension of VIPS_DIMENSIONS) {
      const page = pagesByDimension.get(dimension) ?? null
      const entries = await listVipsTimelineEntries(studentId, dimension, { ctx })
      const recent = entries.slice(0, 6).map(
        (entry): PublicProfileEntry => ({
          id: entry.id,
          canonicalLabel: canonicalLabelFor(entry),
          quote: showQuotes ? entry.verbatim_quote : null,
          strength: entry.strength,
          committedAt: entry.committed_at,
        }),
      )
      const updatedAt = page?.updated_at ?? null
      if (updatedAt && (!lastSyncedAt || updatedAt > lastSyncedAt)) {
        lastSyncedAt = updatedAt
      }
      dimensions.push({
        dimension,
        compiledTruth: page?.compiled_truth ?? '',
        openQuestion: page?.open_question ?? '',
        updatedAt,
        claimCount: entries.length,
        recentEntries: recent,
      })
    }

    return {
      nameSnapshot,
      showQuotes,
      lastSyncedAt,
      dimensions,
    } satisfies PublicProfileBody
  })

  return { status: 'ok', profile: body, isOwner }
}

function canonicalLabelFor(entry: VipsTimelineEntryRow): string {
  // The canonical claim id has the shape `{dimension}.{label}` (see
  // src/data/vips-taxonomy.ts). Strip the dimension prefix and titlecase.
  const id = entry.canonical_claim_id
  const dotIndex = id.indexOf('.')
  const tail = dotIndex >= 0 ? id.slice(dotIndex + 1) : id
  return tail.charAt(0).toUpperCase() + tail.slice(1)
}
