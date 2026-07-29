import type { FaqAsset } from './types'

/**
 * The six event-signal screenshots are authorised for this unlisted
 * comprehension prototype and recorded one-to-one in the source inventory.
 * Approval deliberately remains `team-check`: prototype use is not blanket
 * publication approval. The four current-interface recordings and poster
 * frames use synthetic demo data and retain the same team-check posture
 * pending wider publication.
 */
export const FAQ_ASSETS = [
  {
    id: 'product-01-capture',
    kind: 'product-step',
    publicPath: '/my-world-faq/product/capture-desktop-poster.png',
    videoPath: '/my-world-faq/product/capture-desktop.webm',
    width: 1440,
    height: 900,
    alt: 'Desktop My World island interface with Capture open in Text mode and a neutral synthetic reflection left unsent.',
    transcript:
      'The desktop island opens Capture. Text mode is selected and a neutral synthetic reflection is typed. Send is never pressed.',
    provenance:
      'Agent Browser recording from the current branch with synthetic demo-a data at 1440×900 on 2026-07-29; video SHA-256 f3833a12ab8f47f6e4c59ed25d427ba8b8da1d2c87818b5ea47ed3388a30bfea.',
    cropNote:
      'The clip was trimmed to the relevant interaction. The poster is a frame from the clip.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-29',
    lastReviewed: '2026-07-29',
  },
  {
    id: 'product-02-sensemake',
    kind: 'product-step',
    publicPath: '/my-world-faq/product/identity-desktop-poster.png',
    videoPath: '/my-world-faq/product/identity-desktop.webm',
    width: 1440,
    height: 900,
    alt: 'Desktop My Identity interface moving from Values to Interests and opening Investigative evidence from synthetic reflections.',
    transcript:
      'My Identity moves from Values to Interests, then filters the synthetic evidence timeline to Investigative.',
    provenance:
      'Agent Browser recording from the current branch with synthetic demo-a data at 1440×900 on 2026-07-29; video SHA-256 80995d1151b18dc520150260d9750ad207efe4564641c0bfb417a853e381e2f1.',
    cropNote:
      'The clip was trimmed to the relevant interaction. The poster is a frame from the clip.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-29',
    lastReviewed: '2026-07-29',
  },
  {
    id: 'product-03-review',
    kind: 'product-step',
    publicPath: '/my-world-faq/product/history-desktop-poster.png',
    videoPath: '/my-world-faq/product/history-desktop.webm',
    width: 1440,
    height: 900,
    alt: 'Desktop History interface opening the synthetic 25 July ECG Career Fair reflection and its evidence.',
    transcript:
      'History selects 25 July and opens the synthetic ECG Career Fair reflection with the original moment and Mirror notes.',
    provenance:
      'Agent Browser recording from the current branch with synthetic demo-a data at 1440×900 on 2026-07-29; video SHA-256 2d4ea5cb82d3fc26a315e2a470c4b0174a9f10d47d846f598d0239e44bf0db85.',
    cropNote:
      'The clip was trimmed to the relevant interaction. The poster is a frame from the clip.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-29',
    lastReviewed: '2026-07-29',
  },
  {
    id: 'product-04-act-return',
    kind: 'product-step',
    publicPath: '/my-world-faq/product/path-finder-desktop-poster.png',
    videoPath: '/my-world-faq/product/path-finder-desktop.webm',
    width: 1440,
    height: 900,
    alt: 'Desktop Path Finder interface opening evidence for a possible pathway, then returning from its synthetic source reflection.',
    transcript:
      'Path Finder expands the first evidence set, opens its synthetic source reflection, then returns to the pathway.',
    provenance:
      'Agent Browser recording from the current branch with synthetic demo-a data at 1440×900 on 2026-07-29; video SHA-256 56440b0b924f7b4c5d336e0d6babb7441d548a7ff985829a878fe5e421cd49fd.',
    cropNote:
      'The clip was trimmed to the relevant interaction. The poster is a frame from the clip.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-29',
    lastReviewed: '2026-07-29',
  },
  {
    id: 'signal-01',
    kind: 'event-signal',
    publicPath: '/my-world-faq/signals/signal-01.png',
    width: 720,
    height: 1574,
    alt: 'Mobile Pigeonhole screen showing an anonymous dinner-table displacement question and an unsent draft reply.',
    transcript:
      'Question: “My World lets kids process their day with an AI chatbot instead of a parent. As we build fast, we should ask if we’re replacing the dinner table conversation, not just adding a feature.” Draft comment visible: “Agree! My world is one of the service touch points for students including the dinner table.”',
    provenance:
      'Product-team attachment codex-clipboard-MHjTyW.png, received 2026-07-28; source inventory SHA-256 043f947479f6eeb1d97b8b4eff3dd6642d4af81472a8065539653f278ed55789.',
    cropNote: 'No crop or annotation. The public PNG is a byte-for-byte clean copy.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-28',
    lastReviewed: '2026-07-28',
  },
  {
    id: 'signal-02',
    kind: 'event-signal',
    publicPath: '/my-world-faq/signals/signal-02.png',
    width: 716,
    height: 1510,
    alt: 'Mobile Pigeonhole screen showing the dinner-table question, an answer-rating row, and two anonymous comments.',
    transcript:
      'The dinner-table question is followed by “How well was this question answered?” and two visible comments: “What is the intent of My World? Is it really necessary and relevant?” and “As a parent I am concerned are we encouraging this as a ministry?”',
    provenance:
      'Product-team attachment codex-clipboard-WrabOJ.png, received 2026-07-28; source inventory SHA-256 e0d68666ecc325843d0a8906ac51daa720da3703bfa7c50fd4066a04a7ea0363.',
    cropNote: 'No crop or annotation. The public PNG is a byte-for-byte clean copy.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-28',
    lastReviewed: '2026-07-28',
  },
  {
    id: 'signal-03',
    kind: 'event-signal',
    publicPath: '/my-world-faq/signals/signal-03.png',
    width: 718,
    height: 1554,
    alt: 'Mobile Pigeonhole comment list with a deleted comment and anonymous questions about safe homes, validation, and learning science.',
    transcript:
      'Visible entries include “Comment deleted”; “Not all students have a safe space at home to share with too”; a collapsed question beginning “Before deciding to further develop My World, how did DXD validate that it addresses a real student need?”; an edited, collapsed learning-science comment about milestones, reflection practice, self-assessment, and the student journey; and “How can we validate this is what students or teachers want”. Collapsed text is visibly marked “Show more”.',
    provenance:
      'Product-team attachment codex-clipboard-JN5Ift.png, received 2026-07-28; source inventory SHA-256 367699d1c66636e0ae90ee54dbf6be613c4e3714f98d41fb537c20fe407fbc83.',
    cropNote: 'No crop or annotation. The public PNG is a byte-for-byte clean copy.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-28',
    lastReviewed: '2026-07-28',
  },
  {
    id: 'signal-04',
    kind: 'event-signal',
    publicPath: '/my-world-faq/signals/signal-04.png',
    width: 706,
    height: 1514,
    alt: 'Mobile Pigeonhole comment list with anonymous concerns about human touchpoints, long-term evidence, screen time, and parent and educator perspectives.',
    transcript:
      'Visible comments say: “Agreed—My World should earn students’ trust as one of several safe touchpoints for reflection, complementing conversations at the dinner table rather than replacing them.” “Is this a high risk experiment worth pursuing without having evidence about the long term scientifically backed consequence?” “With the national push to keep students’ screen time under two hours daily, would this product add to it, given they already spend significant time on SLS?” “As a parent, and an educator, I am concerned too.” A fifth comment begins “Given the impatient nature of the kids these days” and continues below the captured frame.',
    provenance:
      'Product-team attachment codex-clipboard-pCr9PM.png, received 2026-07-28; source inventory SHA-256 4ddb548ebca1e175440df0f4b13351dd567f008e1e59bc4aec5039ad077ca5e9.',
    cropNote: 'No crop or annotation. The public PNG is a byte-for-byte clean copy.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-28',
    lastReviewed: '2026-07-28',
  },
  {
    id: 'signal-05',
    kind: 'event-signal',
    publicPath: '/my-world-faq/signals/signal-05.png',
    width: 704,
    height: 1558,
    alt: 'Mobile Pigeonhole comment list with anonymous concerns about screen time, phone habits, and privacy.',
    transcript:
      'Visible comments say: “With the national push to keep students’ screen time under two hours daily, would this product add to it, given they already spend significant time on SLS?” “As a parent, and an educator, I am concerned too.” “Given the impatient nature of the kids these days they might already shutdown because they already spoke with the app and they rather spend time with phone. This maybe cultivating wrong habits” and “Need very strong privacy guardrails in place before this can safely be released out to students, no student is going to like the idea that MOE holds all of this data, if the students are even aware of the risks themselves”.',
    provenance:
      'Product-team attachment codex-clipboard-nsKdRr.png, received 2026-07-28; source inventory SHA-256 0312744a89a21099817840ec5b39afb284e99058ffaa56da79a81c6867238416.',
    cropNote: 'No crop or annotation. The public PNG is a byte-for-byte clean copy.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-28',
    lastReviewed: '2026-07-28',
  },
  {
    id: 'signal-06',
    kind: 'event-signal',
    publicPath: '/my-world-faq/signals/signal-06.png',
    width: 708,
    height: 1566,
    alt: 'Mobile Pigeonhole comment list with anonymous questions about validated need, reflection practice, demand, and complementary human support.',
    transcript:
      'Visible comments ask what user research, adoption rates, and outcome metrics show a real student need; suggest milestones as reflection practice for self-assessment while questioning the landing page and superficial gamification; ask “How can we validate this is what students or teachers want”; and begin a comment that My World should be one of several safe reflection touchpoints complementing dinner-table conversations. The final comment continues below the captured frame.',
    provenance:
      'Product-team attachment codex-clipboard-Wo8Qmu.png, received 2026-07-28; source inventory SHA-256 c42c8994f9479f9bc50e7fa5a18f97009bd6086f9d4176ce03732f18b2570ad2.',
    cropNote: 'No crop or annotation. The public PNG is a byte-for-byte clean copy.',
    approval: 'team-check',
    capturedOrReceivedOn: '2026-07-28',
    lastReviewed: '2026-07-28',
  },
] as const satisfies readonly FaqAsset[]
