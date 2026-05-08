import { z } from 'zod'
import {
  type SearchPastMirrorsInput,
  SearchPastMirrorsInputSchema,
  type SearchPastMirrorsOutput,
} from './schemas'

/**
 * Single source of truth for the `search_past_mirrors` tool. Both surfaces
 * — Mirror's realtime tool config and the Agents SDK `Tool` registration
 * for Connector/Pathfinder (U6) — read this module so R11 (identical
 * surface) stays a structural property, not a documentation promise.
 *
 * The Mirror surface only ever exposes this one tool (R6); the cron
 * surface adds `lookup_ecg_taxonomy` and `self_critique` in U6.
 */

export const SEARCH_PAST_MIRRORS_NAME = 'search_past_mirrors'

export const SEARCH_PAST_MIRRORS_DESCRIPTION =
  "Search the student's prior reflection summaries (FTS5 + tags). Always scoped to the current student. Use when surfacing prior context that would let the current reflection echo or contrast against an earlier one."

export interface RealtimeToolConfig {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Realtime tool config payload — Mirror sends this in `session.update`. */
export function realtimeToolConfig(): RealtimeToolConfig {
  return {
    type: 'function',
    name: SEARCH_PAST_MIRRORS_NAME,
    description: SEARCH_PAST_MIRRORS_DESCRIPTION,
    parameters: z.toJSONSchema(SearchPastMirrorsInputSchema) as Record<string, unknown>,
  }
}

export type { SearchPastMirrorsInput, SearchPastMirrorsOutput }
