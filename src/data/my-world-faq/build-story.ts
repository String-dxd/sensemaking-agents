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
  eyebrow: 'How it is being built',
  heading: 'Playful on the surface. Deliberate underneath.',
  introduction:
    'Students meet a playful world designed to make reflection inviting and easier to begin. Below the waterline, different roles are designed for conversation, interpretation, evidence and possible directions.',
  surfaceLabel: 'What students meet',
  companionBody: 'Brief prompts are intended to leave most of the conversation with the student.',
  captureBody: 'Voice or text makes one real moment easier to record.',
  islandBody: 'Gentle progress adds warmth without scores, rankings or competition.',
  waterlineLabel: 'The waterline',
  backstageLabel: 'What happens backstage',
  backstageIntroduction: 'These are separate stages. They do not all run after every capture.',
  mirrorAction: 'After a capture',
  mirrorBody: 'Drafts a tentative reflection. It offers words to inspect, not an identity label.',
  connectorAction: 'Later, after review',
  connectorBody:
    'Reads confirmed reflections and proposes links between the student’s own words and Values, Interests, Personality and Skills.',
  verifierAction: 'For Connector links',
  verifierBody:
    'Plain code checks the cited quote, vocabulary and confidence. Unsupported Connector links are downgraded or dropped.',
  cartographerAction: 'When sensemaking is requested',
  cartographerBody:
    'Sketches several directions from verified patterns. It does not choose a future for the student.',
  reviewLabel: 'Guardrails, shaped with AI experts',
  reviewBody:
    'AI experts will work closely with us on conversational design, guardrails, evidence checks and testing before any pilot. A separate review can flag weak grounding, flattery and overreach. It is advisory, not a fail-safe.',
  reviewTeamBody:
    'Human review stays central. The product team and AI experts decide what is safe to test, what needs stronger evidence and what would stop a pilot.',
  decisionEyebrow: 'One deliberate decision',
  decisionHeading: 'The world keeps the student’s time.',
  clockLabel: 'Your local time',
  clockBody: 'My World follows this clock too.',
  quietHoursBody:
    'At 10pm local time, the island darkens and the Companion settles into rest until 6am. It does not send an overnight prompt. A student can still choose to open Capture.',
  precedentBody:
    'Animal Crossing: New Horizons also follows real-world time and continues while players are away. It shows how a world can feel alive without an infinite feed.',
  caveatBody:
    'The precedent is not proof. A pilot must still measure session time, sleep and displaced activities.',
  sourceLinkLabel: 'View Nintendo’s description',
  closingBody:
    'Winning students’ hearts matters because a reflection tool only helps when students choose it. We intend to earn that trust without pressure loops, while feedback and evidence keep changing the design.',
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
