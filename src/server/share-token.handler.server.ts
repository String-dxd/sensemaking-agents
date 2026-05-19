/**
 * Server handlers for the share-token lifecycle:
 *
 *   - createShareTokenHandler   — POST /api/share/create
 *   - revokeShareTokenHandler   — POST /api/share/revoke
 *   - setRedactionsHandler      — POST /api/share/redactions
 *
 * Each is auth-gated to real WorkOS sessions; demo and dev-bypass kinds
 * receive 403 with `share_demo_unsupported`. The redaction flag is the
 * single source of truth for whether verbatim quotes appear on the public
 * surface — it lives only in `vips_share_tokens.show_quotes`, and the
 * load-public-profile handler reads it from the DB row exclusively (no
 * client query param ever overrides).
 */

import { getAuth } from '@workos/authkit-tanstack-react-start'
import { sql } from 'drizzle-orm'

import { getDemoBypassAuthFromCookie } from '~/auth/demo-session.server'
import { requireCounselorContext } from '~/auth/identity'
import { getDevBypassAuth } from '~/auth/middleware'
import { hasWorkosEnv } from '~/auth/workos'
import { withStudent } from '~/db/client'
import { buildShareUrl, generateShareToken, sanitizeNameSnapshot } from '~/lib/share-token'
import {
  type CreateShareTokenInput,
  createShareTokenInputSchema,
  type RevokeShareTokenInput,
  revokeShareTokenInputSchema,
  type SetShareRedactionsInput,
  setShareRedactionsInputSchema,
} from './function-schemas'

export class ShareDemoUnsupportedError extends Error {
  readonly code = 'share_demo_unsupported'
  constructor() {
    super('Share links are only available for signed-in WorkOS accounts.')
    this.name = 'ShareDemoUnsupportedError'
  }
}

export class ShareUnknownStudentError extends Error {
  readonly code = 'share_unknown_student'
  constructor() {
    super('Cannot mint a share token without a resolvable student identity.')
    this.name = 'ShareUnknownStudentError'
  }
}

export interface CreateShareTokenResult {
  token: string
  url: string
}

function assertWorkosOnly(): void {
  if (getDevBypassAuth()) throw new ShareDemoUnsupportedError()
  if (getDemoBypassAuthFromCookie()) throw new ShareDemoUnsupportedError()
}

async function readWorkosDisplayName(): Promise<string> {
  if (!hasWorkosEnv()) throw new ShareDemoUnsupportedError()
  const auth = await getAuth()
  if (!auth.user) throw new ShareDemoUnsupportedError()
  const first = stringValue(auth.user.firstName)
  const last = stringValue(auth.user.lastName)
  const composed = [first, last].filter(Boolean).join(' ')
  if (composed) return composed
  const email = stringValue(auth.user.email)
  if (email) {
    const local = email.split('@')[0]
    if (local && local.length > 0) return local
  }
  return 'Student'
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Mint a share token for the WorkOS-signed-in student. The handler is the
 * ONLY writer to `vips_share_tokens.name_snapshot` — once frozen at insert,
 * the snapshot is part of the link's identity and never updated.
 */
export async function createShareTokenHandler(
  data: CreateShareTokenInput,
  opts: { requestOrigin?: string | null } = {},
): Promise<CreateShareTokenResult> {
  createShareTokenInputSchema.parse(data)
  assertWorkosOnly()

  const displayName = await readWorkosDisplayName()
  const nameSnapshot = sanitizeNameSnapshot(displayName) || 'Student'
  const { studentId } = await requireCounselorContext()
  if (!studentId) throw new ShareUnknownStudentError()

  const token = generateShareToken()

  await withStudent(studentId, async (ctx) => {
    await ctx.db.execute(sql`
      insert into vips_share_tokens (token, student_id, show_quotes, name_snapshot)
      values (${token}, ${studentId}, false, ${nameSnapshot})
    `)
  })

  return {
    token,
    url: buildShareUrl(token, opts.requestOrigin ?? null),
  }
}

/**
 * Mark a token revoked. Idempotent — a second call against an already-
 * revoked row updates nothing because the WHERE clause matches no rows.
 * RLS ensures only the owner can revoke; counselors cannot.
 */
export async function revokeShareTokenHandler(data: RevokeShareTokenInput): Promise<void> {
  revokeShareTokenInputSchema.parse(data)
  assertWorkosOnly()

  const { studentId } = await requireCounselorContext()
  if (!studentId) throw new ShareUnknownStudentError()

  await withStudent(studentId, async (ctx) => {
    await ctx.db.execute(sql`
      update vips_share_tokens
      set revoked_at = now()
      where token = ${data.token}
        and student_id = ${studentId}
        and revoked_at is null
    `)
  })
}

/**
 * Update `show_quotes` for a token owned by the calling student. Returns
 * the value that was persisted (echoes the request) so the engine bridge
 * can snap optimistic UI state back to server truth.
 */
export async function setShareRedactionsHandler(
  data: SetShareRedactionsInput,
): Promise<{ show_quotes: boolean }> {
  setShareRedactionsInputSchema.parse(data)
  assertWorkosOnly()

  const { studentId } = await requireCounselorContext()
  if (!studentId) throw new ShareUnknownStudentError()

  await withStudent(studentId, async (ctx) => {
    await ctx.db.execute(sql`
      update vips_share_tokens
      set show_quotes = ${data.show_quotes}
      where token = ${data.token}
        and student_id = ${studentId}
        and revoked_at is null
    `)
  })

  return { show_quotes: data.show_quotes }
}
