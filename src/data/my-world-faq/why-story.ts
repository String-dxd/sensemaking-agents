export interface MyWorldFaqWhyStory {
  eyebrow: string
  heading: string
  introduction: string
}

export const DEFAULT_MY_WORLD_FAQ_WHY_STORY = {
  eyebrow: 'Why we are exploring this',
  heading: 'A small moment can become evidence a student can return to.',
  introduction:
    'My World tests whether low-effort capture helps students notice patterns, then bring clearer language into conversations with people they trust. That outcome is still unproven.',
} as const satisfies MyWorldFaqWhyStory

type WhyStoryDocument = {
  page: {
    why?: MyWorldFaqWhyStory
  }
}

export function materializeMyWorldFaqWhyStory<T extends WhyStoryDocument>(
  document: T,
): T & { page: T['page'] & { why: MyWorldFaqWhyStory } } {
  if (document.page.why) {
    return document as T & { page: T['page'] & { why: MyWorldFaqWhyStory } }
  }

  return {
    ...document,
    page: {
      ...document.page,
      why: { ...DEFAULT_MY_WORLD_FAQ_WHY_STORY },
    },
  }
}
