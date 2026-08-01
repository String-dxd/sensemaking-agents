---
title: "feat: Clarify the My World FAQ story with an iceberg build section"
type: feat
status: completed
date: 2026-08-01
origin: docs/brainstorms/2026-07-28-my-world-signals-faq-requirements.md
---

# feat: Clarify the My World FAQ story with an iceberg build section

## Problem frame

The FAQ explains the visible prototype and answers individual concerns, but it does not yet
connect the playful student experience to the deliberate design, agent separation and human
review behind it. The current order also places project status before Q&A, which interrupts the
reader's path from understanding the product to inspecting the team's answers.

This change should make the page readable as one simple story:

1. Opener
2. Product at a glance
3. How it is being built
4. Why the team is exploring it
5. Q&A
6. Where the work is up to, followed by feedback

The page must remain concise, truthful about what code can and cannot guarantee, and compatible
with the existing collaborative authoring and stored-revision contract (see origin:
`docs/brainstorms/2026-07-28-my-world-signals-faq-requirements.md`).

## Scope and requirements trace

- Preserve the current opener, real desktop product clips, three-column FAQ cards, evidence
  disclosure, anonymous feedback and two-item top navigation.
- Replace the standalone restraint argument with one accessible iceberg section that connects the
  visible experience to the current Companion, Mirror, Connector, deterministic verifier and
  Cartographer layers.
- Describe self-critique as a best-effort review lens, not a safety gate.
- Keep the local-time 10pm–6am resting behaviour as one concrete example of deliberate design,
  while retaining the existing caveat that a pilot must measure actual use and displacement.
- Recast the audience-question section as the tension inside “Why we are exploring this,” without
  treating event comments or reported engagement as outcome evidence.
- Move the project posture section after Q&A and before the existing feedback surface.
- Keep meaningful iceberg text in semantic HTML. Decorative geometry must not be the only source
  of information.
- Preserve phone, keyboard, text-scaling and reduced-motion behaviour required by R18 and AE10.

### Outside this change

- No new agent runtime, product safeguard, pilot claim or evaluation evidence.
- No required-field or structure-version change to published FAQ revisions.
- No new top-level navigation items, page-builder controls or rich-text fields.
- No import of agent runtime code into the public FAQ bundle.
- No claim that My World is proven safe, non-addictive, effective or validated.

## Research and existing patterns

- `src/components/my-world-faq/MyWorldFaqPage.tsx` owns the page composition and currently renders
  `ProductLoop → RestraintPanel → SignalSourceStrip → PosturePanel → QuestionField → feedback`.
- `src/components/my-world-faq/RestraintPanel.tsx` already contains the local-clock example and the
  necessary “design choice, not proof” boundary.
- `src/components/my-world-faq/SignalSourceStrip.tsx` already renders editable audience quotations
  and identifies them as signals rather than survey results.
- `src/agents/openai-realtime/mirror-realtime-live.prompt.md`, `src/agents/mirror.prompt.md`,
  `src/agents/connector.prompt.md`, `src/agents/verifier.ts`, and
  `src/agents/cartographer.prompt.md` establish the separation between conversation, reflection,
  evidence linking, deterministic structural checks and possible directions.
- `src/agents/self-critique-eval.ts` establishes that self-critique is best-effort and non-blocking.
- `src/styles.css` provides the FAQ's warm geometric palette, irregular silhouettes, focus tokens
  and reduced-motion safety net.
- Existing stored revisions are strict. New page copy therefore needs optional fields and an
  editor-only materialised projection rather than new required fields.

## Key decisions

### One continuous iceberg, not another card grid

Use a single framed figure with a visible waterline. The light upper field names what students
experience; the dark lower field carries an ordered agent flow. Readable labels remain in normal
document flow beside decorative SVG/CSS shapes, so mobile and assistive technology receive the
same story.

### Architecture wording follows actual boundaries

- Companion keeps the conversational floor with the student.
- Mirror drafts a tentative reflection from one captured moment.
- Connector proposes evidence-bound VIPS links later.
- The deterministic verifier checks the cited quote, closed vocabulary and confidence rules before
  Connector timeline links are persisted. It does not verify every generated sentence.
- Cartographer sketches several possible directions from verified evidence. It does not choose a
  future for the student.
- Self-critique is shown as an advisory review lens that may be absent or fail without blocking.

### Deliberate design remains falsifiable

The local-time resting behaviour demonstrates one implemented choice: the world darkens and the
Companion settles into a rest pose from 10pm to 6am. This is a stopping cue, not a lockout; a
student can still choose to open Capture. The section must still say that design intent cannot
establish real usage outcomes; a pilot would need to measure session time, sleep and displaced
activities.

### Keep authoring stable and complete

The new build and Why narratives are sensitive claims, so they must remain editable by the team.
Add them as optional document objects with compiled defaults. Old revisions continue to validate,
digest and restore exactly as written; only the protected editor receives a materialised working
projection. The next save can publish those fields without a structure-version change.

## Implementation units

### U1. Build the iceberg explanation

**Files**

- Create: `src/components/my-world-faq/BuildIcebergPanel.tsx`
- Remove: `src/components/my-world-faq/RestraintPanel.tsx`
- Modify: `src/styles.css` only if the silhouette cannot be expressed clearly with existing utility
  classes and an inline decorative SVG
- Test: `test/components/my-world-faq/MyWorldFaqPage.test.tsx`

**Approach**

- Render one section with a concise heading, one-sentence bridge, surface labels and an ordered
  backstage flow.
- Keep all meaningful copy outside `aria-hidden` SVG geometry.
- Add a compact “One deliberate decision” area containing the reader-local clock, the 10pm–6am
  boundary, the Animal Crossing precedent and the limitation.
- Use static composition. Do not add looping water motion or interaction required to reveal text.

**Test scenarios**

- The section exposes the surface/backstage contrast and all five core roles without interaction.
- The verifier and self-critique limitations are present.
- The local-time example keeps its non-announcing decorative clock and its explicit 10pm–6am text.
- No public component imports `~/agents`, engine, Three, database or editor runtime code.

### U2. Simplify the information architecture

**Files**

- Modify: `src/components/my-world-faq/MyWorldFaqPage.tsx`
- Modify: `src/components/my-world-faq/SignalSourceStrip.tsx`
- Test: `test/components/my-world-faq/MyWorldFaqPage.test.tsx`
- Test: `test/routes/my-world-faq.test.ts`

**Approach**

- Compose `ProductLoop → BuildIcebergPanel → Why/SignalSourceStrip → QuestionField → PosturePanel
  → contribution/feedback`.
- Add a short “Why we are exploring this” lead inside the signal section. Keep the editable event
  question heading and quotations as the concerns that keep the hypothesis honest.
- Retain the two top-level navigation items because six anchor links would add navigation noise.

**Test scenarios**

- DOM order matches the six-part reader story.
- Existing editable fields render once and continue to update the same manifest paths.
- All 34 canonical questions and five event quotations remain available.
- The posture counts remain informational and appear after Q&A.

### U3. Verify responsive and editorial quality

**Files**

- Test: the FAQ files above

**Approach**

- Run targeted FAQ component/route tests, then `pnpm check`.
- Inspect the public and editor routes at 375×812, 768×1024 and 1440×900.
- Confirm no horizontal overflow, no hidden meaningful text, correct section order, readable
  waterline and unchanged FAQ/editor interactions.

**Test scenarios**

- Mobile linearises the surface, waterline and backstage layers without absolute-positioned text.
- Desktop reads as one continuous iceberg rather than a grid of interchangeable cards.
- Reduced motion does not hide content or depend on a flip/animation.
- The editor still unlocks and displays its existing inline fields and Add FAQ card control.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The visual implies all agent output is hard-gated | Name the deterministic verifier's narrow Connector-link scope and label self-critique advisory. |
| The section becomes another wall of text | Keep each role to one plain sentence and move detailed evidence to the existing FAQ. |
| The playful/serious contrast feels like two unrelated designs | Use one shared silhouette and waterline inside the current FAQ palette. |
| New copy breaks old revisions | Use optional fields and materialise defaults only at protected editor boundaries. |
| “Why” turns concern into proof of demand | State that comments and early enthusiasm are signals, not outcome evidence. |

## Verification boundary

The implementation is complete when an unfamiliar reader can state, without opening an FAQ card,
what students see, why the experience is playful, how the agent roles stay separate, which checks
are deterministic, and what still needs human judgement and pilot evidence.

## Completion record

- Shipped the reader journey as `opener → product → build → why → Q&A → posture → feedback`.
- Added the semantic iceberg, narrow verifier wording, advisory review boundary and local-time
  design example without importing agent runtime code into the FAQ.
- Added editable build, why and posture narratives while keeping historical revision bodies
  canonical and protecting projected defaults with a projection digest.
- Verified the public and protected editor routes in-browser at desktop and phone widths with no
  horizontal overflow or console errors.
- Passed `pnpm check`, a production build, 58 focused component/editor tests and 67 focused
  data/server/route tests on 2026-08-01.
