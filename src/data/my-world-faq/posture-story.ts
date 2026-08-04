export interface MyWorldFaqPostureStory {
  eyebrow: string
  heading: string
  introduction: string
  decisionNote: string
}

/**
 * Publication copy for the current-position section. Its evidence counts,
 * labels and review date remain derived from the document and are not part of
 * this editable story.
 */
export const DEFAULT_MY_WORLD_FAQ_POSTURE_STORY = {
  eyebrow: 'Where this is up to',
  heading: 'Still gathering, not yet deciding.',
  introduction:
    'We are gathering comments, research and prototype evidence. Each answer shows what supports it and what remains unknown.',
  decisionNote: 'No pilot has been approved. We will update this page when a decision is made.',
} as const satisfies MyWorldFaqPostureStory

type PostureStoryDocument = {
  page: {
    posture?: MyWorldFaqPostureStory
  }
}

/**
 * Complete `page.posture` at the protected editor boundary only. Public reads,
 * canonicalisation and restores must leave historical revisions without this
 * optional section byte-for-byte unchanged.
 */
export function materializeMyWorldFaqPostureStory<T extends PostureStoryDocument>(
  document: T,
): T & { page: T['page'] & { posture: MyWorldFaqPostureStory } } {
  if (document.page.posture) {
    return document as T & { page: T['page'] & { posture: MyWorldFaqPostureStory } }
  }

  return {
    ...document,
    page: {
      ...document.page,
      posture: { ...DEFAULT_MY_WORLD_FAQ_POSTURE_STORY },
    },
  }
}
