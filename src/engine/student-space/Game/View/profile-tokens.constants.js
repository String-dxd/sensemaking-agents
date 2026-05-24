/**
 * Engine mirror of src/lib/profile-tokens.ts.
 *
 * The TypeScript module at src/lib/profile-tokens.ts is the semantic source of
 * truth for VIPS dimension colors, student-voice headers, and the dimension
 * label table. This file hand-mirrors the values that the engine substrate
 * needs (colors, headers, labels) into a plain ES module so the engine can
 * stay vanilla JS per the engine-substrate doctrine
 * (docs/solutions/2026-05-18-island-progression-engine-substrate.md).
 *
 * Kept in sync by test/lib/profile-tokens.test.ts, which deep-equals the TS
 * exports against this file. If you edit the TS source, mirror the change
 * here (or vice versa) — CI will fail on drift.
 *
 * Do NOT import this from React code — React imports from ~/lib/profile-tokens
 * directly. Do NOT import the TS file from engine code — keep the engine free
 * of TypeScript build coupling.
 */

export const PROFILE_DIMENSIONS = ['values', 'interests', 'personality', 'skills']

export const DIMENSION_LABEL = {
    values: 'Values',
    interests: 'Interests',
    personality: 'Personality',
    skills: 'Skills',
}

export const PROFILE_COLORS = {
    values:      { accent: '#A07659', soft: '#EAD7BE', ink: '#6A4A26' },
    interests:   { accent: '#FF8E8E', soft: '#FDE0E0', ink: '#A84D4D' },
    personality: { accent: '#8E6FB8', soft: '#E8DDF2', ink: '#4C3470' },
    skills:      { accent: '#82B16A', soft: '#DDEDC6', ink: '#3F6F2A' },
}

export const PROFILE_HEADERS = {
    values: {
        eyebrow:  'What matters to me',
        tag:      'Values',
        title:    'What you keep coming back to',
        subtitle: 'A pattern across your touchstones',
    },
    interests: {
        eyebrow:  'What pulls your attention',
        tag:      'Interests',
        title:    'What lights you up',
        subtitle: 'Small sparks across your week',
    },
    personality: {
        eyebrow:  'How you tend to show up',
        tag:      'Personality',
        title:    'Who you are in the room',
        subtitle: 'Patterns in how others recognise you',
    },
    skills: {
        eyebrow:  "What you're getting good at",
        tag:      'Skills',
        title:    "What's growing in your hands",
        subtitle: "Things you've practised into shape",
    },
}
