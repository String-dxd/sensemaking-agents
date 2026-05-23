/**
 * Shared facet theme catalog — reads cross-surface tokens from the engine
 * mirror of src/lib/profile-tokens.ts and composes them with engine-only
 * pieces (the short "V — Values" legacy eyebrow tag).
 *
 * Consumed by ProfileSheet (the four-tab sheet) via WorldInteractions for the
 * legacy eyebrow surface, CalendarSheet (personality.accent for today's
 * outline), LettersSheet (personality.accent for unread dot).
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
    // Non-VIPS Profile tabs share the same engine theme channel so the
    // sheet's CSS color variables stay coherent when the React panel is
    // mounted. Hues mirror `PROFILE_TAB_THEMES` in src/data/profile-tabs.ts.
    relationships: { accent: '#D08A4A', soft: '#F6E4CC', ink: '#7A4413', eyebrow: 'R — Relationships' },
    choices:       { accent: '#5C8FB0', soft: '#DDEAF3', ink: '#2F5773', eyebrow: 'C — Choices' },
}

/**
 * Student-voice headers per facet — re-export of the shared PROFILE_HEADERS
 * so engine callers keep their existing `import { FACET_HEADERS }` shape.
 */
export const FACET_HEADERS = PROFILE_HEADERS
