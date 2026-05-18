/**
 * Per-flower lore for the two-step flower interaction.
 *
 *   peek    : short sentence shown in the FlowerPeek popover when the camera
 *             zooms in (≤90 chars, observational, no advice).
 *   lore    : 2–3 sentences for Kira to deliver after she walks over and
 *             picks the flower up. Same voice as KiraNarrator FLOWER_NARRATION.
 *   ask     : seed prompt handed to AskSheet when "Talk about it more" is hit,
 *             so the compose stage opens already framed around this interest.
 *
 * Species ids match View/Flowers.js SPECIES (daisy / tulip / rose / lily /
 * pansy / hyacinth) and the RIASEC mapping in Data/vipsTaxonomy.js (interests
 * facet, flower objects).
 */

export const FLOWER_MEANINGS = {
    daisy: {
        peek: 'A small interest in motion — it opens with attention and closes when you look away.',
        lore: "Daisies map to the realistic side of your interests — the part of you that learns by touching the actual thing. They’re honest flowers: they don’t pretend to be more than they are. If you notice yourself reaching for one of these, that’s usually a signal that you want fewer abstractions and more contact with the real shape of a problem.",
        ask:  'Tell me about a small, real-world thing you’ve been wanting to try with your hands.',
    },
    tulip: {
        peek: 'Held close, like a secret — interests you’ve only said out loud once or twice.',
        lore: "Tulips sit on the enterprising end of your interests — leading, persuading, organising people toward something. They’re cupped tight at the top because the impulse to convince others is often a private one before it’s a public one. Worth asking: who or what would you most want to move, if you weren’t worried about looking like you were trying?",
        ask:  'When have you wanted to convince a group of something, even quietly?',
    },
    rose: {
        peek: 'Something you tend with care — interests with layers that reward returning to them.',
        lore: "Roses point to the artistic interest — the practice of making something where the path isn’t pre-drawn. They have layers because creative work is layered: you put something down, look at it, scrape it back, add the next thing. The reward is rarely instant; the reward is the texture you keep building each time you return.",
        ask:  'What’s a piece of work you’ve gone back to more than once just to make it more yours?',
    },
    lily: {
        peek: 'Reaching, generous — the interests that pull other people in.',
        lore: "Lilies are the social bloom — the interests that get bigger when there’s a person on the other end. The petals open wide because this kind of attention isn’t held inward; it’s shared. If lilies keep showing up for you, the question isn’t whether you like people — it’s which kinds of people-shaped work actually leaves you fuller instead of more tired.",
        ask:  'Which kinds of people-shaped help leave you full instead of drained?',
    },
    pansy: {
        peek: 'Curious, watching — interests that are mostly about noticing.',
        lore: "Pansies belong to the investigative line — wanting to know why, how, what underneath. They face you because investigation always starts with paying close attention to a single thing. If you keep being drawn to pansies, watch for the small questions you ask that nobody asked you to: those are usually the early shape of a research instinct.",
        ask:  'What’s a small question you keep returning to that nobody asked you to investigate?',
    },
    hyacinth: {
        peek: 'A quiet build of attention — small noticings stacked over time.',
        lore: "Hyacinths show the conventional thread — interests that love structure, order, and the texture of doing the small thing correctly. They grow as a stack because this kind of attention is cumulative: one careful entry, then another, until the whole list reads cleanly. Not every interest needs to be loud — some of yours might just want to be kept in order.",
        ask:  'Where do you find yourself wanting things to be in clean, careful order?',
    },
}

export function meaningForSpecies(speciesId)
{
    return FLOWER_MEANINGS[speciesId] || null
}
