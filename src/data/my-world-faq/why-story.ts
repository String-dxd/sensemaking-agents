export interface MyWorldFaqWhyStory {
  /** Legacy fields retained so revisions published before the research story still validate. */
  eyebrow: string
  heading: string
  introduction: string
  frequencyEyebrow?: string
  frequencyHeading?: string
  frequencyIntroduction?: string
  researchBody?: string
  hypothesisBody?: string
}

export const DEFAULT_MY_WORLD_FAQ_WHY_STORY = {
  eyebrow: 'Why we are exploring this',
  heading: 'A small moment can become evidence a student can return to.',
  introduction:
    'My World tests whether low-effort capture helps students notice patterns, then bring clearer language into conversations with people they trust. That outcome is still unproven.',
  frequencyEyebrow: 'Why this pattern may help',
  frequencyHeading: 'Small signals over time may show what one snapshot smooths away.',
  frequencyIntroduction:
    'A wearable does not replace a clinical test. Repeated readings can reveal patterns across ordinary days. My World borrows that rhythm, not the medical claim.',
  researchBody:
    'Studies using brief, in-the-moment reports suggest they can reduce recall bias and show variation across days. That supports testing a lighter Capture rhythm.',
  hypothesisBody:
    'Joyful Capture may help students share candid bites of experience instead of polished survey answers. That remains a hypothesis. A pilot must compare value, burden and candour with simpler options.',
} as const satisfies MyWorldFaqWhyStory

export type ResolvedMyWorldFaqWhyStory = MyWorldFaqWhyStory & {
  frequencyEyebrow: string
  frequencyHeading: string
  frequencyIntroduction: string
  researchBody: string
  hypothesisBody: string
}

export function resolveMyWorldFaqWhyStory(
  story: MyWorldFaqWhyStory | undefined,
): ResolvedMyWorldFaqWhyStory {
  return {
    ...DEFAULT_MY_WORLD_FAQ_WHY_STORY,
    ...story,
    frequencyEyebrow: story?.frequencyEyebrow ?? DEFAULT_MY_WORLD_FAQ_WHY_STORY.frequencyEyebrow,
    frequencyHeading: story?.frequencyHeading ?? DEFAULT_MY_WORLD_FAQ_WHY_STORY.frequencyHeading,
    frequencyIntroduction:
      story?.frequencyIntroduction ?? DEFAULT_MY_WORLD_FAQ_WHY_STORY.frequencyIntroduction,
    researchBody: story?.researchBody ?? DEFAULT_MY_WORLD_FAQ_WHY_STORY.researchBody,
    hypothesisBody: story?.hypothesisBody ?? DEFAULT_MY_WORLD_FAQ_WHY_STORY.hypothesisBody,
  }
}

type WhyStoryDocument = {
  page: {
    why?: MyWorldFaqWhyStory
  }
}

export function materializeMyWorldFaqWhyStory<T extends WhyStoryDocument>(
  document: T,
): T & { page: T['page'] & { why: ResolvedMyWorldFaqWhyStory } } {
  return {
    ...document,
    page: {
      ...document.page,
      why: resolveMyWorldFaqWhyStory(document.page.why),
    },
  }
}
