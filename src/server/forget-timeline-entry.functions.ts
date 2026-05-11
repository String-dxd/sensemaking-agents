import { createServerFn } from '@tanstack/react-start'
import {
  forgetTimelineEntryHandler,
  forgetTimelineEntryInputSchema,
} from './forget-timeline-entry.handler.server'

/**
 * U9 — wiki-side per-entry forget mutation. POST because it mutates server
 * state (sets `forgotten_at`, deletes from the FTS5 mirror, bumps
 * `vips_forget_count`). The companion review-surface forget is
 * `forget-diff` (U8) — that one acts on a staged diff row, never on a
 * committed timeline entry.
 */
export const forgetTimelineEntry = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => forgetTimelineEntryInputSchema.parse(raw))
  .handler(({ data }) => forgetTimelineEntryHandler(data))
