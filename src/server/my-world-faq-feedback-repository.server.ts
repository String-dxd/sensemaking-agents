import { createHash, randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { type AppTransaction, getMyWorldFaqSystemDatabase } from '~/db/client'

export type MyWorldFaqFeedbackKind = 'question' | 'concern' | 'suggestion' | 'compliment'

export interface MyWorldFaqFeedbackItem {
  id: string
  kind: MyWorldFaqFeedbackKind
  message: string
  createdAt: string
}

const HOURLY_SUBMISSION_LIMIT = 60
const INBOX_LIMIT = 100
const PUBLIC_FEEDBACK_LIMIT = 50
const RETENTION_DAYS = 90

export async function isMyWorldFaqFeedbackAvailable(): Promise<boolean> {
  try {
    const db = getMyWorldFaqSystemDatabase()
    const result = await db.execute<{ table_name: string | null }>(
      sql`select to_regclass('public.my_world_faq_feedback')::text as table_name`,
    )
    return result.rows[0]?.table_name === 'my_world_faq_feedback'
  } catch {
    return false
  }
}

export async function submitMyWorldFaqFeedbackRecord(input: {
  kind: MyWorldFaqFeedbackKind
  message: string
}): Promise<
  | { accepted: true; item: MyWorldFaqFeedbackItem; deleteToken: string }
  | { accepted: false; reason: 'rate_limited' }
> {
  const db = getMyWorldFaqSystemDatabase()
  const deleteToken = randomBytes(32).toString('base64url')
  const deleteTokenHash = hashDeleteToken(deleteToken)

  return db.transaction(async (tx) => {
    // One global prototype inbox, one global ceiling. This limits accidental
    // floods without storing an IP address, account or browser fingerprint.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('my-world-faq-feedback'))`)
    await removeExpiredFeedback(tx)

    const count = await tx.execute<{ total: number }>(
      sql`select count(*)::int as total
          from my_world_faq_feedback
          where created_at >= now() - interval '1 hour'`,
    )
    if ((count.rows[0]?.total ?? 0) >= HOURLY_SUBMISSION_LIMIT) {
      return { accepted: false, reason: 'rate_limited' }
    }

    const inserted = await tx.execute<{
      id: string
      kind: MyWorldFaqFeedbackKind
      message: string
      created_at: string | Date
    }>(
      sql`insert into my_world_faq_feedback (kind, message, delete_token_hash)
          values (${input.kind}, ${input.message}, ${deleteTokenHash})
          returning id, kind, message, created_at`,
    )
    const row = inserted.rows[0]
    if (!row) throw new Error('Feedback insert did not return a row.')

    return {
      accepted: true,
      item: toFeedbackItem(row),
      deleteToken,
    }
  })
}

export async function listMyWorldFaqFeedback(): Promise<MyWorldFaqFeedbackItem[]> {
  return listFeedback(INBOX_LIMIT)
}

export async function listPublicMyWorldFaqFeedback(): Promise<MyWorldFaqFeedbackItem[]> {
  return listFeedback(PUBLIC_FEEDBACK_LIMIT)
}

export async function deleteMyWorldFaqFeedbackRecord(input: {
  id: string
  deleteToken: string
}): Promise<boolean> {
  const db = getMyWorldFaqSystemDatabase()
  const result = await db.execute<{ id: string }>(
    sql`delete from my_world_faq_feedback
        where id = ${input.id}::uuid
          and delete_token_hash = ${hashDeleteToken(input.deleteToken)}
        returning id`,
  )
  return result.rows.length === 1
}

async function listFeedback(limit: number): Promise<MyWorldFaqFeedbackItem[]> {
  const db = getMyWorldFaqSystemDatabase()
  const result = await db.execute<{
    id: string
    kind: MyWorldFaqFeedbackKind
    message: string
    created_at: string | Date
  }>(
    sql`with expired as (
          delete from my_world_faq_feedback
          where created_at < now() - (${RETENTION_DAYS} * interval '1 day')
          returning id
        )
        select id, kind, message, created_at
        from my_world_faq_feedback
        where created_at >= now() - (${RETENTION_DAYS} * interval '1 day')
        order by created_at desc
        limit ${limit}`,
  )
  return result.rows.map(toFeedbackItem)
}

function toFeedbackItem(row: {
  id: string
  kind: MyWorldFaqFeedbackKind
  message: string
  created_at: string | Date
}): MyWorldFaqFeedbackItem {
  return {
    id: row.id,
    kind: row.kind,
    message: row.message,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

function hashDeleteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

async function removeExpiredFeedback(tx: AppTransaction): Promise<void> {
  await tx.execute(
    sql`delete from my_world_faq_feedback
        where created_at < now() - (${RETENTION_DAYS} * interval '1 day')`,
  )
}
