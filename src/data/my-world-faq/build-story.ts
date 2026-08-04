export interface MyWorldFaqBuildStory {
  eyebrow: string
  heading: string
  introduction: string
  surfaceLabel: string
  companionBody: string
  captureBody: string
  islandBody: string
  waterlineLabel: string
  backstageLabel: string
  backstageIntroduction: string
  /** Legacy timing fields retained so published revisions continue to validate. They are not shown. */
  mirrorAction: string
  mirrorBody: string
  connectorAction: string
  connectorBody: string
  verifierAction: string
  verifierBody: string
  cartographerAction: string
  cartographerBody: string
  reviewLabel: string
  reviewBody: string
  reviewTeamBody: string
  decisionEyebrow: string
  decisionHeading: string
  clockLabel: string
  clockBody: string
  quietHoursBody: string
  precedentBody: string
  caveatBody: string
  sourceLinkLabel: string
  closingBody: string
}

/**
 * Copy for the build-story section. Role names are intentionally absent: they
 * are structural labels in the interface rather than editable publication
 * content.
 */
export const DEFAULT_MY_WORLD_FAQ_BUILD_STORY = {
  eyebrow: 'How we are building it',
  heading: 'Playful on the surface. Deliberate underneath.',
  introduction:
    'Students see a playful world that makes reflection easier to begin. Behind it, each AI role has a narrow job and clear limits.',
  surfaceLabel: 'What students meet',
  companionBody: 'Offers brief prompts, then gives the conversation back to the student.',
  captureBody: 'Lets students record one real moment by voice or text.',
  islandBody: 'Shows gentle progress without scores, rankings or competition.',
  waterlineLabel: 'The waterline',
  backstageLabel: 'What happens backstage',
  backstageIntroduction: 'Each role has one job. Human teams set the boundaries.',
  mirrorAction: 'After a capture',
  mirrorBody:
    'Turns a capture into a draft reflection for the student to review. It does not define who they are.',
  connectorAction: 'Later, after review',
  connectorBody:
    'Suggests links between confirmed reflections and the student’s Values, Interests, Personality and Skills.',
  verifierAction: 'For Connector links',
  verifierBody:
    'Checks whether each suggested link is supported by the student’s own words. Weak or unsupported links are lowered or removed before the student reviews them.',
  cartographerAction: 'When sensemaking is requested',
  cartographerBody:
    'Uses reviewed patterns to suggest several directions. It does not decide the student’s future.',
  reviewLabel: 'AI specialists and product team',
  reviewBody:
    'AI specialists help shape the conversation design, safety rules and testing. They check how the system responds before it is used with students.',
  reviewTeamBody:
    'The product team owns the content and product direction. Together, both teams decide what is safe to test and what must change before a pilot.',
  decisionEyebrow: 'One deliberate decision',
  decisionHeading: 'The world keeps the student’s time.',
  clockLabel: 'Your local time',
  clockBody: 'My World follows this clock too.',
  quietHoursBody:
    'At 10pm local time, the island darkens and the Companion rests until 6am. It sends no overnight prompts. A student can still open Capture.',
  precedentBody:
    'Animal Crossing: New Horizons also follows real-world time and continues while players are away. It shows that a world can feel alive without an infinite feed.',
  caveatBody:
    'The precedent is not proof. A pilot must still measure session time, sleep and displaced activities.',
  sourceLinkLabel: 'View Nintendo’s description',
  closingBody:
    'Reflection only helps when students choose it. We want My World to earn their trust without pressure or endless engagement. Feedback and evidence will keep shaping the design.',
} as const satisfies MyWorldFaqBuildStory

type BuildStoryDocument = {
  page: {
    build?: MyWorldFaqBuildStory
  }
}

/**
 * Old revisions predate `page.build`. The editor needs a complete form, but
 * persistence, public reads, digests and restores must keep those revisions
 * byte-for-byte canonical. Materialise defaults only in an editor projection.
 */
export function materializeMyWorldFaqBuildStory<T extends BuildStoryDocument>(
  document: T,
): T & { page: T['page'] & { build: MyWorldFaqBuildStory } } {
  if (document.page.build) {
    return document as T & { page: T['page'] & { build: MyWorldFaqBuildStory } }
  }

  return {
    ...document,
    page: {
      ...document.page,
      build: { ...DEFAULT_MY_WORLD_FAQ_BUILD_STORY },
    },
  }
}
