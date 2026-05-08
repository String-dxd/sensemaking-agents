import {
  type SearchPastMirrorsInput,
  SearchPastMirrorsInputSchema,
  type SearchPastMirrorsOutput,
} from './schemas'

/**
 * Single source of truth for the `search_past_mirrors` tool. Mirror,
 * Connector, and Pathfinder all reference these constants so the tool's
 * surface is structural, not documentation. Mirror exposes only this
 * tool; Connector and Pathfinder add `lookup_ecg_taxonomy` and
 * `self_critique`.
 */

export const SEARCH_PAST_MIRRORS_NAME = 'search_past_mirrors'

export const SEARCH_PAST_MIRRORS_DESCRIPTION =
  "Search the student's prior reflection story_reframe text (FTS5). Always scoped to the current student. Use when surfacing prior context that would let the current reflection echo or contrast against an earlier one."

export type { SearchPastMirrorsInput, SearchPastMirrorsOutput }
export { SearchPastMirrorsInputSchema }
