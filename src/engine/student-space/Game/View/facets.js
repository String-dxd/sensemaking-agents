/**
 * Shared facet theme catalog — reads cross-surface tokens from the engine
 * mirror of src/lib/profile-tokens.ts and composes them with engine-only
 * pieces (the short "V — Values" legacy eyebrow tag, the applyFacetVars
 * helper).
 *
 * Consumed by FacetView (legacy on-island pick card), ProfileSheet (the
 * four-tab sheet), CalendarSheet (personality.accent for today's outline),
 * LettersSheet (personality.accent for unread dot).
 *
 * If you need to change the color or student-voice header for a facet, edit
 * src/lib/profile-tokens.ts AND mirror it in profile-tokens.constants.js —
 * the CI drift test will catch a one-sided edit.
 */

import { PROFILE_COLORS, PROFILE_HEADERS } from './profile-tokens.constants.js'

/**
 * Engine-only short legacy tag (rendered in the on-island pick card). Not
 * shared with the React surfaces — they use PROFILE_HEADERS[dim].tag instead.
 */
const FACET_LEGACY_TAGS = {
    values:      'V — Values',
    interests:   'I — Interests',
    personality: 'P — Personality',
    skills:      'S — Skills',
}

/**
 * Public facet theme table — colors merged with the engine-only legacy tag.
 * Backward-compatible shape: existing consumers reading {accent, soft, ink,
 * eyebrow} continue to work.
 */
export const FACET_THEMES = {
    values:      { ...PROFILE_COLORS.values,      eyebrow: FACET_LEGACY_TAGS.values },
    interests:   { ...PROFILE_COLORS.interests,   eyebrow: FACET_LEGACY_TAGS.interests },
    personality: { ...PROFILE_COLORS.personality, eyebrow: FACET_LEGACY_TAGS.personality },
    skills:      { ...PROFILE_COLORS.skills,      eyebrow: FACET_LEGACY_TAGS.skills },
}

/**
 * Student-voice headers per facet — re-export of the shared PROFILE_HEADERS
 * so engine callers keep their existing `import { FACET_HEADERS }` shape.
 */
export const FACET_HEADERS = PROFILE_HEADERS

/** Convenience writer — sets the three CSS vars on an element from a facet id. */
export function applyFacetVars(el, facetId)
{
    const theme = FACET_THEMES[facetId]
    if(!theme) return
    el.style.setProperty('--facet-accent', theme.accent)
    el.style.setProperty('--facet-soft',   theme.soft)
    el.style.setProperty('--facet-ink',    theme.ink)
}
