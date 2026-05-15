import { createServerFn } from '@tanstack/react-start'
import { counsellorBriefInputSchema } from './function-schemas'

/**
 * U12 — Render a markdown counsellor brief for the student. The client
 * receives `{ markdown }` and triggers a `Blob`-based download — the server
 * never persists or transmits the file per R22.
 */
export const counsellorBrief = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => counsellorBriefInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { counsellorBriefHandler } = await import('./counsellor-brief.handler.server')
    return counsellorBriefHandler(data)
  })

/**
 * Lightweight status for Student Space-style world mailbox state. The brief
 * itself remains on-demand; this only reports whether a Cartographer-backed
 * brief source exists yet.
 */
export const loadCounsellorBriefStatus = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => counsellorBriefInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadCounsellorBriefStatusHandler } = await import('./counsellor-brief.handler.server')
    return loadCounsellorBriefStatusHandler(data)
  })
