/**
 * Shared facet theme catalog — the single source of truth for the four VIPS
 * facets' accent / soft / ink color tokens and human-facing eyebrow labels.
 *
 * Replaces the inline table that lived in FacetView.js (v1.0). Now consumed
 * by FacetView (legacy on-island pick card), ProfileSheet (the new four-tab
 * sheet), CalendarSheet (uses personality.accent for the today outline),
 * and LettersSheet (uses personality.accent for the unread dot).
 *
 * Personality was retired as an on-island facet in DESIGN.md v0.3 ("the
 * island as a whole"); v1.1 re-introduces it as the four-tab sheet's third
 * tab plus two ambient objects (Phase G). The lavender token below is the
 * only flora hue not yet load-bearing for another facet — pink belongs to
 * Interests, green to Skills, brown to Values.
 */

export const FACET_THEMES = {
    values:      { accent: '#A07659', soft: '#EAD7BE', ink: '#6A4A26', eyebrow: 'V — Values' },
    interests:   { accent: '#FF8E8E', soft: '#FDE0E0', ink: '#A84D4D', eyebrow: 'I — Interests' },
    personality: { accent: '#8E6FB8', soft: '#E8DDF2', ink: '#4C3470', eyebrow: 'P — Personality' },
    skills:      { accent: '#82B16A', soft: '#DDEDC6', ink: '#3F6F2A', eyebrow: 'S — Skills' },
}

/**
 * Student-voice header strings per facet. Used by the half-sheet
 * (FacetView) and the ProfileSheet tabs so both surfaces present the
 * facet in the student's language with the taxonomy word demoted to a
 * small tag chip — the eyebrow/tag/title/subtitle pattern from the v1.2
 * Values panel reference.
 */
export const FACET_HEADERS = {
    values: {
        eyebrow:  'WHAT MATTERS TO ME',
        tag:      'Values',
        title:    'What you keep coming back to',
        subtitle: 'A pattern across your touchstones',
    },
    interests: {
        eyebrow:  'WHAT PULLS YOUR ATTENTION',
        tag:      'Interests',
        title:    'What lights you up',
        subtitle: 'Small sparks across your week',
    },
    personality: {
        eyebrow:  'HOW YOU TEND TO SHOW UP',
        tag:      'Personality',
        title:    'Who you are in the room',
        subtitle: 'Patterns in how others recognise you',
    },
    skills: {
        eyebrow:  'WHAT YOU’RE GETTING GOOD AT',
        tag:      'Skills',
        title:    'What’s growing in your hands',
        subtitle: 'Things you’ve practised into shape',
    },
}

/** Convenience writer — sets the three CSS vars on an element from a facet id. */
export function applyFacetVars(el, facetId)
{
    const theme = FACET_THEMES[facetId]
    if(!theme) return
    el.style.setProperty('--facet-accent', theme.accent)
    el.style.setProperty('--facet-soft',   theme.soft)
    el.style.setProperty('--facet-ink',    theme.ink)
}
