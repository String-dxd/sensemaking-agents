import { createServerFn } from '@tanstack/react-start'
import {
  counsellorBriefHandler,
  counsellorBriefInputSchema,
} from './counsellor-brief.handler.server'

/**
 * U12 — Render a markdown counsellor brief for the student. The client
 * receives `{ markdown }` and triggers a `Blob`-based download — the server
 * never persists or transmits the file per R22.
 */
export const counsellorBrief = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => counsellorBriefInputSchema.parse(raw))
  .handler(({ data }) => counsellorBriefHandler(data))
