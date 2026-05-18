---
title: "feat: Wire Student Space island elements to backend evidence"
type: feat
status: completed
date: 2026-05-18
origin: user request
---

# feat: Wire Student Space island elements to backend evidence

## Summary

The active Student Space shell at `/` hydrates backend VIPS pages and timeline
entries into the engine `Profile` state, but many island interactions still
start from local species metaphors only: `pansy`, `rose`, `fig`, `oak`, and so
on. The backend evidence is visible once the student opens the full profile
sheet, but the island object itself does not clearly resolve to the matching
canonical claim or timeline-backed evidence.

This plan wires the live island objects to the backend-backed profile evidence
already available in memory. A picked flower should resolve to its Interest
claim, a fruit to its Skill claim, and a tree to its Value claim where the
current visual vocabulary supports it. The hover chip, Kira/object narration,
half-sheet detail, and profile handoff should all speak from the same resolved
claim instead of re-deriving local species copy in each surface.

## Assumptions

- Do not ask the user for scope confirmation; this is a headless continuation.
- Keep the current Student Space engine as the active surface. The older React
  `components/world` scene remains covered by existing tests but is not the
  primary target for this work.
- This pass should wire UI interactions to existing backend snapshot data, not
  add new server functions, agent prompts, schema changes, or a new rendering
  system.
- Sparse evidence remains honest: if a visible island metaphor has no backend
  timeline entries yet, its UI should say it has no noticings yet rather than
  inventing evidence.

## Problem Frame

The backend data flow is already present:

1. `StudentSpaceHost` creates the backend bridge and hydrates the engine with
   `refreshSnapshot`.
2. `createStudentSpaceBackendSnapshot` maps `loadVipsPages` timeline rows into
   `Profile` facets and quote objects.
3. `ProfileSheet` can filter a facet timeline by `claimId`.

The missing link is the island object boundary. `HoverProbe` produces targets
like `{ kind: 'flower', species: { id: 'pansy' } }`; `HoverCta`,
`ObjectPeek`, `KiraNarrator`, and `FacetView` each translate that species into
copy separately. None of those surfaces has a shared, backend-aware resolver
that says "this pansy is `interests.investigative`, it has N confirmed timeline
entries, the latest quote is X, and the profile CTA should open the Interests
tab filtered to that claim."

## Requirements

- R1. A picked tree, flower, or fruit must resolve to a canonical VIPS claim
  using the engine taxonomy in `src/engine/student-space/Game/Data/vipsTaxonomy.js`.
- R2. The resolver must read evidence from the hydrated engine `Profile`, so
  backend timeline rows mapped by `createStudentSpaceBackendSnapshot` affect
  island hover/detail text without another fetch.
- R3. Interest flowers must show the backend-backed Interest claim, evidence
  count, and latest quote when available.
- R4. Skill fruit and supported Value trees must use the same resolver and not
  duplicate claim/species mapping logic.
- R5. If no evidence exists for a canonical claim, the UI must keep the
  metaphor visible but describe it as empty or not yet noticed.
- R6. The half-sheet CTA should open `ProfileSheet` filtered to the exact
  resolved claim when one exists.
- R7. The wiring must preserve existing object flows: flower uses ObjectPeek,
  mailbox opens Letters, telescope opens Trajectory, Kira opens Ask, and
  profile forget still flows through the backend bridge.

## Scope Boundaries

- No database migrations.
- No new backend routes or server functions.
- No new agent behavior.
- No changes to the inactive React `components/world` rendering path unless
  required by shared tests.
- No visual rebuild of the island geometry, tree species inventory, or fruit
  placement set in this pass.

## Existing Patterns

- `src/engine/student-space/Game/Data/vipsTaxonomy.js` already maps canonical
  claim IDs to object species.
- `src/engine/student-space/Game/State/Profile.js` exposes
  `getQuotesForClaim` and `countByClaim`, with backend hydration handled by
  `hydrateBackend`.
- `src/engine/student-space/Game/View/ProfileSheet.js` already supports
  `open({ tab, claimId })` to filter the timeline.
- `src/engine/student-space/Game/View/HoverCta.js`,
  `src/engine/student-space/Game/View/ObjectPeek.js`,
  `src/engine/student-space/Game/View/KiraNarrator.js`, and
  `src/engine/student-space/Game/View/FacetView.js` already accept a
  `HoverProbe` target and can be changed to call a shared helper.

## Key Decisions

- Add a small view-layer evidence resolver rather than making every Three
  object store backend state. Backend snapshots can hydrate after the scene is
  constructed, so resolving at hover/click time avoids stale metadata.
- Use canonical claim metadata for labels and definitions, and keep species
  copy as the metaphor layer. The object remains a pansy/fig/oak visually, but
  the UI says what backend claim it represents.
- Keep "no evidence yet" explicit. A visible metaphor can still be an
  invitation, but it must not pretend to have timeline entries.
- Open the profile sheet with `{ tab, claimId }` from the half-sheet CTA so the
  user lands on the exact backend-backed timeline slice.

## Implementation Units

### U1. Add shared island evidence resolver

**Files**

- Create: `src/engine/student-space/Game/View/elementEvidence.js`
- Create: `test/engine/student-space-element-evidence.test.ts`

**Approach**

- Implement helpers that:
  - normalize target species from strings or species objects;
  - resolve `target.kind + species` to a VIPS taxonomy claim;
  - collect quotes through `profile.getQuotesForClaim(claimId)`;
  - return `facetId`, `claimId`, `claimLabel`, `definition`, `speciesLabel`,
    `evidenceCount`, `latestQuote`, and backend/source IDs when available;
  - produce short human-readable snippets for count and latest evidence.

**Test Scenarios**

- Flower target `pansy` resolves to `interests.investigative`.
- Resolver returns evidence count and latest quote from a mock profile.
- Empty evidence returns the canonical claim with count 0 and no fabricated
  quote.

### U2. Wire hover, narration, and object peek to resolved evidence

**Files**

- Modify: `src/engine/student-space/Game/View/HoverCta.js`
- Modify: `src/engine/student-space/Game/View/ObjectPeek.js`
- Modify: `src/engine/student-space/Game/View/KiraNarrator.js`

**Approach**

- Use the resolver in the hover chip title/line for tree, flower, and fruit
  targets.
- Use the resolver in ObjectPeek so flowers introduce the backend-backed
  Interest claim and latest evidence when available.
- Use the resolver in KiraNarrator for tree and fruit targets, since flowers
  route through ObjectPeek.

**Test Scenarios**

- Covered through resolver tests plus existing engine smoke coverage.
- Manual/browser verification should show the chip and narration using claim
  names instead of only species names.

### U3. Wire half-sheet detail and CTA to exact backend claim

**Files**

- Modify: `src/engine/student-space/Game/View/FacetView.js`

**Approach**

- Resolve the clicked target on `openFor`.
- Use the claim label as the detail title when available.
- Add evidence rows for canonical claim, evidence count, and latest quote.
- Make the CTA open `ProfileSheet` with `{ tab: facetId, claimId }` so the
  timeline is filtered to the exact claim.

**Test Scenarios**

- Existing `ProfileSheet.open({ tab, claimId })` behavior stays intact.
- New resolver test covers the data shape consumed by `FacetView`.

### U4. Update docs and verify

**Files**

- Modify: `plans/CURRENT_STATE.md`

**Approach**

- Document that live island element interactions resolve through the hydrated
  backend profile snapshot.
- Run targeted tests, full checks, and build.

**Verification**

- `pnpm test test/engine/student-space-element-evidence.test.ts`
- `pnpm check`
- `pnpm test`
- `pnpm build`
- `git diff --check`

## Risks

| Risk | Mitigation |
| --- | --- |
| Backend hydration arrives after scene construction. | Resolve evidence at interaction time from `State.profile`, not during object construction. |
| Species mapping is incomplete for values because the live tree system only renders oak/cherry today. | Wire supported visible species now; empty or unsupported species fall back to existing metaphor copy without crashing. |
| Copy becomes too dense inside the small hover chip. | Keep hover to claim name plus one short evidence line; put detailed quote in the half-sheet. |

## Definition of Done

- Hovering/clicking an Interest flower can show which backend Interest claim it
  represents and whether timeline evidence exists.
- The flower/fruit/tree half-sheet opens the full profile filtered to the
  exact claim when available.
- Empty claims are presented as no noticings yet, not fake evidence.
- The current backend Ask/Mirror `Log` / `Forget` work remains intact.
