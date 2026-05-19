---
title: "feat: Add Relationships and Choices tabs to Profile (same level as VIPS)"
type: feat
status: active
date: 2026-05-19
---

> **Scope expansion landed during execution (2026-05-19):** The plan's
> Key Technical Decision #2 specified a deep-link first pass for the
> engine ProfileSheet — close the sheet and `router.push('/library/...')`
> for the two non-VIPS tabs. During implementation review the user rejected
> that UX as inconsistent with how VIPS tabs swap content under the rail.
> Commit `00c55c2 feat(engine): Relationships + Choices swap in-sheet like
> VIPS` promoted the tabs to native engine panels by mounting a React
> subtree inside the engine `ProfileSheet` panel area (see
> `src/engine/student-space/profile-tab-react-bridge.tsx` and the new
> `omitChrome` prop on both page views). The "Engine-side rich panels for
> the two tabs" item in **Deferred to Follow-Up Work** is therefore
> resolved by this PR rather than a follow-up plan.

# feat: Add Relationships and Choices tabs to Profile (same level as VIPS)

## Overview

Add two top-level tabs to the Profile surface — **Relationships** and **Choices** — sitting beside the existing four VIPS tabs (Values, Interests, Personality, Skills). Each tab carries three MECE sections grounded in the MOE CCE framing.

The change reshapes the *tab vocabulary* (today: a `VipsDimension` is the only tab kind) into a *Profile tab* concept that contains the four VIPS dimensions plus two non-VIPS panels with their own data shapes and view surfaces. VIPS canonical taxonomy stays untouched.

---

## Problem Frame

The current Profile surface treats the four VIPS dimensions as the entirety of "who I am" content. The MOE CCE framing names two additional first-class surfaces that VIPS does not cover:

1. **Relationships** — not "how I behave in relationships" (already inside VIPS Personality/Skills) but literally *who is in my life and how I belong*. Grounded in the CCE "People Who Matter" unit and the "Building Connections" theme. Today this content has nowhere to live.
2. **Choices** — not values (already inside VIPS Values) but *the log of decisions I've actually made, the patterns across them, and what I want to change*. Grounded in CCE Responsible Decision-Making (Situation Analysis + consequential thinking). Today there is no decision log surface in the product.

Without these tabs, two pedagogically important sensemaking moves — *belonging vs. participating*, and *which forces actually shape my decisions* — have no home, and the product silently flattens the student's identity into the four VIPS dimensions.

---

## Requirements Trace

- R1. Add **Relationships** and **Choices** tabs at the same level as the existing four VIPS tabs in the Profile tab rail.
- R2. **Relationships** tab renders three sections: My relationship map · Where I belong · How others see me differently from how I see myself.
- R3. **Choices** tab renders three sections: Decisions I've made and why · Patterns in how I handle hard situations · What I want to change.
- R4. Both new tabs must work on the React `/library/$dimension`-equivalent route AND on the engine-rendered `ProfileSheet` (`src/engine/student-space/Game/View/ProfileSheet.js`) — the engine is the live substrate.
- R5. New tabs must persist student-entered content locally (engine `Persistence` pattern) and survive reload.
- R6. New tabs must NOT be added to `VIPS_DIMENSIONS` or `FACET_IDS` — VIPS canonical taxonomy stays exactly four dimensions to keep Connector/Cartographer/verifier downstream intact.
- R7. Empty states must clearly communicate purpose and prompt the first entry; first-pass scope is fully student-driven entry (no agent rewrites of Relationships/Choices content).
- R8. Cross-tab linkage: Relationships §3 ("How others see me…") must visibly reference the student's VIPS-side identity so the reader can see the gap between self-reported and other-reported.
- R9. Cross-tab linkage: Choices §3 ("What I want to change") must visibly reference Choices §2 patterns so the change intention is anchored to the observed pattern.

---

## Scope Boundaries

- No new agent that rewrites Relationships or Choices content (Connector and Cartographer stay VIPS-only).
- No backend tables for the new data shapes in this plan — local engine state + Persistence only.
- No auto-derivation of belonging level, decision pattern tag, or self/other gap — first pass is student-tagged.
- No edits to the VIPS taxonomy, the Connector/Cartographer pipelines, the verifier, or the library reflections sheet.
- No companion/island/sprout integration for the new tabs (they live only inside Profile).

### Deferred to Follow-Up Work

- Engine-side rich panels for the two tabs (first pass: engine tab buttons deep-link to the React route): follow-up plan once the React surfaces are validated.
- Server-side persistence + sync of Relationships/Choices entries: follow-up plan (mirrors the VIPS pages backend bridge in `src/server/load-vips-pages.handler.server.ts`).
- Auto-pattern detection across the decision log (Choices §2): follow-up — requires a small rules engine or a Cartographer extension; first pass is manual tagging.
- Auto-gap detection between self-reported VIPS and other-reported observations (Relationships §3): follow-up — first pass surfaces both columns side-by-side without diff scoring.

---

## Context & Research

### Relevant Code and Patterns

- `src/data/vips-taxonomy.ts` — canonical `VIPS_DIMENSIONS` list. The new `ProfileTab` superset must NOT mutate this.
- `src/components/ProfileSheetChrome.tsx` — renders the tab rail. The chrome currently iterates `VIPS_DIMENSIONS` directly (line ~161). This is the only file that needs to learn the broader `ProfileTab` concept on the React side.
- `src/components/ProfileSheetView.tsx` — the React profile entry; defaults `activeDimension` to `'values'` when the open sheet isn't a VIPS dimension.
- `src/components/VipsPageView.tsx` — the dimension page view; re-uses `ProfileStudentChrome` and passes `openSheet` for highlight. Same chrome will be reused by the new view files.
- `src/components/SheetEntryRail.tsx` — secondary rail with its own `SheetKey` union (`VipsDimension | 'profile' | 'reflections' | 'trajectory'`). Needs `'relationships' | 'choices'` added to the union.
- `src/routes/library.$dimension.tsx` — the per-dimension route. Pattern to mirror for the new routes.
- `src/engine/student-space/Game/View/ProfileSheet.js` — engine-side ProfileSheet. `TAB_ORDER` at line 34 is the live tab list. Has its own bento + timeline that don't apply to the new tabs.
- `src/engine/student-space/Game/State/Profile.js` — singleton state slice pattern (per `[[feedback-engine-slice-template]]` memory). New `Relationships.js` and `Choices.js` follow this exact shape.
- `src/engine/student-space/Game/State/Persistence.js` — keyed save/load. New persistence keys `ss:v1:relationships` and `ss:v1:choices`.
- `src/engine/student-space/Game/State/schema.js` — `mergeProfile` defensive merger; new slices need analogous `mergeRelationships` / `mergeChoices`.
- `src/engine/student-space/Game/State/State.js` — top-level state composition; engine subscribes here.
- `src/engine/student-space/Game/View/View.js` lines 111, 119, 240 — pattern for registering a sheet into `overlayController`. The two new tabs do NOT need new top-level sheets in v1; they share `ProfileSheet`'s overlay and live as new panels.

### Institutional Learnings

- `[[project-engine-substrate]]` — `src/components/world/*` is dormant; the engine is the live home. Any "Profile UI" claim must check engine parity, not just React.
- `[[feedback-engine-slice-template]]` — singleton + subscribe + persist pattern. New state slices must follow it verbatim, including the React-bridge snapshot stability guidance if React reads engine state.
- `[[project-connector-cadence]]` — auto-connector exists but is NOT invoked from `persistMirror` today. The new tabs are entirely outside Connector's reach (R6), so this is informational only.

### External References

- MOE CCE "People Who Matter" unit, "Building Connections" theme (referenced in brief, used to ground Relationships sections).
- MOE CCE Responsible Decision-Making — Situation Analysis + consequential thinking (referenced in brief, used to ground Choices sections).

---

## Key Technical Decisions

- **Introduce a `ProfileTab` superset, do NOT extend `VipsDimension`.** Rationale: VIPS is a closed canonical taxonomy used by Connector/Cartographer/verifier/seed data/server. Polluting it with `'relationships' | 'choices'` would cascade type churn into the pipeline. Instead, `ProfileTab = VipsDimension | 'relationships' | 'choices'` lives next to `VIPS_DIMENSIONS` and only the chrome + new view files consume it.
- **Engine-side first-pass strategy: deep-link out for v1.** The two new engine tab buttons close the `ProfileSheet` overlay and navigate to `/library/relationships` (or `/library/choices`) via the existing `history.pushState` / router. Rationale: building two full engine panels (header + body + persistence wiring + Renderer integration) is the same cost as the React route, and a deep-link first pass lets us validate the IA before committing engine surface area. Follow-up plan can promote the React panels into native engine views.
- **First pass is entirely local + student-driven.** No backend tables, no agent rewrites, no auto-derivation. Rationale: keeps the change-surface small, the test surface deterministic, and the user-side validation honest (the student is the only author).
- **Cross-tab linkage uses read-only references, not joins.** Relationships §3 renders the student's top VIPS claims read-only beside the "How others see me" entries; Choices §3 renders the dominant pattern tag from §2 entries read-only as a prompt seed. No bidirectional state, no derived storage.
- **Tab order: `values, interests, personality, skills, relationships, choices`** — keeps the VIPS block visually grouped, treats the two new tabs as a second cluster.

---

## Open Questions

### Resolved During Planning

- Q: Should new tabs extend `VipsDimension`? → No. Introduce `ProfileTab` superset (see Key Technical Decisions).
- Q: Engine vs React for first pass? → Engine surfaces the tab buttons; React owns the panel content via deep-link.
- Q: Where does data live? → Engine state slices + local Persistence; no backend in v1.
- Q: Does "Identity tab" in the brief mean a literal new Identity tab? → No. The brief uses "Identity" to mean the VIPS surface collectively (the self-reported identity layer). No new Identity tab needed; cross-references point at the VIPS panels.

### Deferred to Implementation

- Exact prompt copy for empty-state CTAs (resolve while wiring U2/U3).
- Exact icon choice for the two new tab buttons — the existing tab rail uses text only (`DIMENSION_LABEL`), so plain text labels are the safe default.
- Whether to add new theme colors to `PROFILE_THEMES` for the two new tabs or reuse a neutral palette (resolve at U1; suggested: introduce a 5th and 6th palette keyed by tab name).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Tab surface map (React side):**

```
ProfileStudentChrome  ──renders──▶  PROFILE_TABS = [...VIPS_DIMENSIONS, 'relationships', 'choices']
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
  VipsPageView (×4)              RelationshipsPageView              ChoicesPageView
  /library/$dimension            /library/relationships             /library/choices
        │                                 │                                 │
        ▼                                 ▼                                 ▼
  loadVipsPages                  loadRelationships (local)          loadChoices (local)
                                          │                                 │
                                          ▼                                 ▼
                                  Relationships state slice         Choices state slice
                                  (engine singleton + persist)      (engine singleton + persist)
```

**Data shapes (Relationships):**

```
RelationshipMapEntry  = { id, name, category, quality?, note?, createdAt }
  category : 'family' | 'cca' | 'close-friend' | 'teacher' | 'other'
  quality  : 'rely-on' | 'give-to' | 'mutual' | 'uncertain'

BelongingEntry        = { id, groupKind, groupName, belongLevel, note?, createdAt }
  groupKind   : 'cca' | 'class' | 'school' | 'society' | 'other'
  belongLevel : 'belong' | 'participate' | 'edge'

OutsidePerspectiveEntry = { id, source, sourceLabel?, observation,
                             vipsDimensionRef?, agreementSelf?, createdAt }
  source        : 'peer' | 'teacher' | 'coach' | 'family' | 'other'
  vipsDimensionRef? : VipsDimension      # optional anchor for cross-link
  agreementSelf : 'matches' | 'partly' | 'differs' | 'unknown'
```

**Data shapes (Choices):**

```
DecisionEntry   = { id, decision, options[], chose, forces[], when, note?, createdAt }
  forces : ('consequential' | 'peer-acceptance' | 'values' | 'family' | 'gut' | 'other')[]

DecisionPatternTag = 'avoidant' | 'impulsive' | 'deliberate'
  (attached per-entry in v1 via student tag; aggregation derived at read time)

ChangeIntention = { id, current, change, byWhen?, linkedPatternTag?, createdAt }
```

**Engine tab routing (deep-link pattern):**

```
ProfileSheet.tabs (engine)
  ├─ values / interests / personality / skills   →  in-sheet panel render (today)
  ├─ relationships                                →  close()  +  router.push('/library/relationships')
  └─ choices                                      →  close()  +  router.push('/library/choices')
```

---

## Implementation Units

- U1. **Introduce `ProfileTab` superset and tab metadata**

**Goal:** Make "profile tab" a first-class concept distinct from "VIPS dimension", and expose its metadata (label, theme, header copy) without touching `VIPS_DIMENSIONS`.

**Requirements:** R1, R6

**Dependencies:** None.

**Files:**
- Create: `src/data/profile-tabs.ts`
- Modify: `src/components/ProfileSheetChrome.tsx`
- Modify: `src/components/SheetEntryRail.tsx`
- Test: `test/data/profile-tabs.test.ts`
- Test: `test/components/ProfileSheetChrome.test.tsx` (extend existing if present, else create)

**Approach:**
- Export `PROFILE_TABS = [...VIPS_DIMENSIONS, 'relationships', 'choices'] as const` and `ProfileTab` type.
- Move `DIMENSION_LABEL` / `PROFILE_HEADERS` / `PROFILE_THEMES` extensions for the two new tabs into the new file (or re-export from chrome). Add palette + header copy for both: Relationships ("Who is in my life") and Choices ("What I've chosen, and why").
- `ProfileStudentChrome` iterates `PROFILE_TABS` instead of `VIPS_DIMENSIONS`. Tab `data-testid` becomes `profile-tab-${tab}` (already true; just widens the set).
- `SheetEntryRail.SheetKey` union gains `'relationships' | 'choices'`. Rail renders the existing 4 entries plus the 2 new ones in the same row.
- Active-tab matching in `ProfileSheetView` is generalized: `activeTab` falls back to `'values'` when `openSheet` is not a known `ProfileTab`.

**Patterns to follow:**
- `src/components/ProfileSheetChrome.tsx` PROFILE_THEMES record — mirror its shape per new tab.

**Test scenarios:**
- Happy path: `PROFILE_TABS` contains all four VIPS dimensions in their canonical order followed by `'relationships'` then `'choices'`.
- Happy path: `ProfileStudentChrome` renders 6 tab buttons in canonical order; clicking each calls `onOpenSheet` with the corresponding key.
- Edge case: `SheetEntryRail` with `openSheet='relationships'` marks only the relationships entry as `aria-expanded=true`.
- Edge case: `VIPS_DIMENSIONS` length and contents are unchanged after this unit (regression guard for R6).

**Verification:**
- Profile sheet tab bar shows 6 buttons; existing VIPS tabs still navigate to `/library/$dimension` correctly.
- TypeScript build passes with the widened union (no untyped `as` casts in downstream files).

---

- U2. **Relationships React view + route**

**Goal:** Land a working Relationships panel with three sections, empty states, and an "Add" affordance per section, reachable at `/library/relationships`.

**Requirements:** R1, R2, R5, R7, R8

**Dependencies:** U1, U4.

**Files:**
- Create: `src/components/RelationshipsPageView.tsx`
- Create: `src/routes/library.relationships.tsx`
- Modify: `src/routeTree.gen.ts` (regenerated by TanStack Router on dev — verify it picks up the new route)
- Test: `test/components/RelationshipsPageView.test.tsx`

**Approach:**
- Page shell mirrors `VipsPageView` skeleton: `ProfileStudentChrome` at top, `max-w-[760px]` content column, three sections divided by `border-b border-[#e3d8c4]`.
- **Section 1 — My relationship map:** grid of `RelationshipMapEntry` cards grouped by `category`. Empty state: "No one named yet. Who's in your circle right now?" + an "Add a person" button that opens an inline `EditableField`-style form (name + category select + quality select + optional note). Reuse `src/components/EditableField.tsx` for the form fields.
- **Section 2 — Where I belong:** list of `BelongingEntry` rows showing group + a three-state pill (`belong` / `participate` / `edge`). Empty state: "Which groups do you actually feel part of?" + add affordance.
- **Section 3 — How others see me differently:** two-column layout. Left column renders the student's top VIPS claim per dimension (read-only, pulled from the VIPS pages query already used by `library.$dimension.tsx`). Right column renders `OutsidePerspectiveEntry` items. Empty state for the right column: "Ask one peer, teacher, or coach what they see in you. Log one observation here."
- Reads from the engine state slice via a thin selector hook (`useRelationships`) that subscribes to the engine state and returns a snapshot per `[[feedback-engine-slice-template]]`. Mutations call slice methods (add/remove/update) which persist via `Persistence`.
- Route loader follows the `library.$dimension.tsx` pattern but does not need server data — it just ensures the engine slice is hydrated.

**Patterns to follow:**
- `src/components/VipsPageView.tsx` layout shell (header chrome + content column + section dividers).
- `src/components/EditableField.tsx` for inline edit affordances.
- `src/routes/library.$dimension.tsx` route file shape.

**Test scenarios:**
- Happy path: route renders `ProfileStudentChrome` with `relationships` tab marked active.
- Happy path: section 1 with one entry renders the entry's name, category badge, and quality pill.
- Happy path: section 2 with one entry renders the belonging level pill in the right state.
- Happy path: section 3 left column shows the student's top VIPS claim per dimension (4 items) when VIPS data is present.
- Edge case: empty state for each section renders the correct CTA copy and an enabled "Add" button.
- Edge case: section 3 right column with no `OutsidePerspectiveEntry` shows the empty-state CTA but the left column still renders self-side claims.
- Error path: TanStack Router loader returning a hydration failure renders a graceful fallback (mirrors the soft-fail in `library.$dimension.tsx`).
- Integration: clicking "Add a person", filling the form, and confirming creates an entry; the entry appears immediately and persists across a remount (Persistence write).

**Verification:**
- Visiting `/library/relationships` shows the chrome + three sections.
- Adding an entry in each section persists across page reload.
- Section 3 visibly references the VIPS surface (the two read-only/log columns sit beside each other and are visually distinguishable).

---

- U3. **Choices React view + route**

**Goal:** Land a working Choices panel with three sections, empty states, and an "Add" affordance per section, reachable at `/library/choices`.

**Requirements:** R1, R3, R5, R7, R9

**Dependencies:** U1, U4.

**Files:**
- Create: `src/components/ChoicesPageView.tsx`
- Create: `src/routes/library.choices.tsx`
- Modify: `src/routeTree.gen.ts` (autogenerated; verify pickup)
- Test: `test/components/ChoicesPageView.test.tsx`

**Approach:**
- Same shell pattern as U2.
- **Section 1 — Decisions I've made and why:** chronological list of `DecisionEntry` cards. Each card shows `decision` headline, the chosen option, the rejected options as muted chips, and the `forces` as colored chips. Empty state prompts the first log: "Log a real choice — CCA leadership, subject combination, a conflict you handled."
- **Section 2 — Patterns in how I handle hard situations:** rollup view of `DecisionEntry` items grouped by `DecisionPatternTag`. v1 surfaces a count per tag and a "Tag this one" affordance on each entry in section 1 so the student manually marks `avoidant` / `impulsive` / `deliberate`. Empty state when no entries are tagged yet: "Once you've logged a few decisions, tag each one so the pattern surfaces here."
- **Section 3 — What I want to change:** list of `ChangeIntention` items, each linkable to a `DecisionPatternTag` from section 2. Empty state prompts: "Given the pattern you see, what's one thing you want to do differently?" When the user adds an intention, the form pre-selects the dominant pattern tag from §2 (if any) as a non-required default.
- Same engine slice + subscribe pattern as Relationships.

**Patterns to follow:**
- `src/components/VipsPageView.tsx` shell.
- `src/components/ui/badge.tsx` for force chips and pattern tags.

**Test scenarios:**
- Happy path: route renders chrome with `choices` tab active.
- Happy path: §1 with one entry shows chosen + rejected options + force chips.
- Happy path: §2 with three tagged entries (2 `deliberate`, 1 `avoidant`) renders both groups with correct counts and `deliberate` first (descending count).
- Happy path: §3 add-intention form pre-selects the dominant pattern from §2 when present.
- Edge case: §2 with zero tagged entries renders the "tag your decisions to see patterns" empty state, not a misleading zero rollup.
- Edge case: §3 add-intention with no §2 patterns yet renders without a pre-selected tag and still allows save.
- Edge case: a `DecisionEntry` with `forces=[]` renders without a "forces:" label (no empty UI).
- Integration: adding a `DecisionEntry`, tagging it `deliberate`, then adding a `ChangeIntention` results in all three sections showing aligned content and persistence across reload.

**Verification:**
- Visiting `/library/choices` shows the chrome + three sections.
- All three sections accept entries and persist them.
- Section 3 visibly references section 2 (the pre-selected pattern tag is observable in the add form).

---

- U4. **Engine state slices for Relationships and Choices**

**Goal:** Add `Relationships` and `Choices` engine state slices following the singleton + subscribe + persist pattern, with defensive merge helpers and persistence keys.

**Requirements:** R5, R6

**Dependencies:** None (can land before or with U2/U3).

**Files:**
- Create: `src/engine/student-space/Game/State/Relationships.js`
- Create: `src/engine/student-space/Game/State/Choices.js`
- Modify: `src/engine/student-space/Game/State/schema.js` (add `mergeRelationships`, `mergeChoices`, `mergeRelationshipMapEntry`, `mergeBelongingEntry`, `mergeOutsidePerspectiveEntry`, `mergeDecisionEntry`, `mergeChangeIntention`)
- Modify: `src/engine/student-space/Game/State/State.js` (compose the new slices into top-level state)
- Modify: `src/engine/student-space/Game/State/Persistence.js` IF the persistence registry is enumerated; otherwise no change beyond using new keys (`ss:v1:relationships`, `ss:v1:choices`)
- Test: `test/engine/state/Relationships.test.js`
- Test: `test/engine/state/Choices.test.js`

**Approach:**
- Each slice is a singleton (`static getInstance()`) holding an in-memory list of entries plus the `subscribers` Set, mirroring `Profile.js` lines 18–54.
- API per slice: `add(partial)`, `update(id, partial)`, `remove(id)`, `list()`, plus the cross-cutting `subscribe(cb)` / `_notify(event)` / `_persist()` shape.
- `Relationships.js` exposes `addPerson`, `addBelonging`, `addOutsidePerspective`, and matching update/remove. `Choices.js` exposes `addDecision`, `tagDecisionPattern`, `addChangeIntention`, etc.
- Merge helpers in `schema.js` follow the lenient pattern used by `mergeProfileFacet` (lines 139–148) — unknown keys dropped, defaults filled, ID auto-assigned when missing, ISO timestamps validated.
- `_persist()` calls `Persistence.getInstance()?.save('relationships', this.serialize())` / `…save('choices', …)`.
- Hydration: `State.js` calls `Persistence.load('relationships')` / `…load('choices')` at boot and invokes `slice.hydrate(snapshot)` (same shape as `Profile.hydrate`).
- React-bridge snapshot stability: list-returning methods must return a stable identity per state version so React's `useSyncExternalStore` can avoid infinite loops (per `[[feedback-engine-slice-template]]`).

**Patterns to follow:**
- `src/engine/student-space/Game/State/Profile.js` — singleton + subscribe + persist template.
- `src/engine/student-space/Game/State/schema.js` `mergeProfileFacet` — lenient defensive merge shape.

**Test scenarios:**
- Happy path: `Relationships.addPerson({ name, category })` creates an entry with auto-id, stamps `createdAt`, and notifies subscribers.
- Happy path: `Relationships.remove(id)` removes the matching entry; missing id is a no-op.
- Happy path: `Choices.tagDecisionPattern(decisionId, 'deliberate')` mutates the entry's pattern tag and notifies.
- Edge case: `Relationships.hydrate(null)` does not throw and leaves state empty.
- Edge case: `Relationships.hydrate({ map: [{...malformed}] })` drops the malformed entry but keeps the well-formed ones (matches `mergeQuote` leniency).
- Edge case: snapshot from `list()` after no mutation returns the same array reference (stability for React bridge).
- Error path: `Choices.addDecision({})` without `decision` text returns null and does not mutate (or stamps a `?` placeholder — pick one and document; default: reject).
- Integration: after `addDecision` + `tagDecisionPattern` + Persistence flush + reload via `hydrate`, the entry returns intact with its pattern tag preserved.

**Verification:**
- Slices visible on `State.getInstance().relationships` / `State.getInstance().choices`.
- Mutations survive a simulated reload via `serialize()` → `hydrate()`.
- No write fan-out from a single mutation (Persistence's existing debounce respected; no double-_notify in tests).

---

- U5. **Engine ProfileSheet tab parity (deep-link first pass)**

**Goal:** Surface the two new tabs in the engine-rendered `ProfileSheet` tab rail so the live substrate matches the React chrome.

**Requirements:** R1, R4

**Dependencies:** U1 (for label parity), U2, U3 (so the deep-link targets exist).

**Files:**
- Modify: `src/engine/student-space/Game/View/ProfileSheet.js` (extend `TAB_ORDER` and add click routing for the two new tabs; close sheet + navigate)
- Modify: `src/engine/student-space/style.css` IF the existing tab styles assume exactly 4 children (verify; the `.profile-sheet__tabs` selector should be width-agnostic). If a max-width or grid-template-columns rule pins to 4, widen it.
- Test: `test/engine/view/ProfileSheet.test.js` (existing if present; else create a small jsdom-based test covering tab click routing)

**Approach:**
- Extend `TAB_ORDER = ['values', 'interests', 'personality', 'skills', 'relationships', 'choices']`.
- For tab labels, reuse the React `DIMENSION_LABEL`-equivalent values, but the engine uses `FACET_THEMES[f].eyebrow.split(' — ')[1] || f` today; for non-VIPS tabs, supply explicit labels via a small lookup added at the top of the file (or hoist to a shared engine `data/profile-tabs.js` if appetite allows; not required for v1).
- Click handler for `relationships` / `choices`: call `this.close()`, then `window.location.assign('/library/relationships')` (or `/library/choices`). Document the deep-link intent inline so the next reader sees the deferred follow-up to native panels.
- Active state for the two new tabs is never "in-sheet" (the sheet closes), so no `is-active` toggle is needed for them inside the sheet.

**Patterns to follow:**
- `src/engine/student-space/Game/View/ProfileSheet.js` existing `_onClick` handler (line 411) that closes-on-tab pattern.

**Test scenarios:**
- Happy path: opening `ProfileSheet` renders 6 tab buttons in canonical order.
- Happy path: clicking the values/interests/personality/skills tabs continues to render the corresponding panel in-sheet (regression guard).
- Happy path: clicking the `relationships` tab calls `close()` and navigates to `/library/relationships`.
- Happy path: clicking the `choices` tab calls `close()` and navigates to `/library/choices`.
- Edge case: clicking the `relationships` tab when the sheet is already closing does not stack two navigations (debounce / idempotence).

**Verification:**
- Engine ProfileSheet tab rail shows 6 tabs; the existing 4 still work as before; the 2 new ones land the user on the React surfaces.
- No CSS regression on the 4-tab layout (visual check on the rail width).

---

- U6. **Cross-tab linkage glue + smoke tests**

**Goal:** Make the cross-tab references in Relationships §3 and Choices §3 work end-to-end and add a smoke test that covers the full Profile → new-tab → entry → reload loop.

**Requirements:** R8, R9

**Dependencies:** U1, U2, U3, U4.

**Files:**
- Modify: `src/components/RelationshipsPageView.tsx` — wire the §3 self-side column to the existing `loadVipsPages` query (read-only).
- Modify: `src/components/ChoicesPageView.tsx` — wire the §3 add-intention form's pre-select to the §2 aggregation.
- Test: `test/components/RelationshipsPageView.cross-tab.test.tsx`
- Test: `test/components/ChoicesPageView.cross-tab.test.tsx`
- Test (smoke): `test/smoke/profile-new-tabs.test.tsx` (or extend existing smoke harness in `docs/smoke-tests/` parity)

**Approach:**
- Relationships §3 self-side: reuse the `VIPS_TAXONOMY` import + `getClaimHighlights` pattern from `VipsPageView.tsx` line 348–378. Pull the top claim per dimension from the VIPS pages query; render each as a static card the student can compare against. No mutation; no derivation; no diff scoring (deferred).
- Choices §3 pre-select: compute the dominant tag from §2 (`avoidant | impulsive | deliberate`) by simple count from `Choices.list()`; pass into the add-intention form as `defaultPatternTag`. If a tie or zero tags, default is empty.
- Smoke test exercises: open Profile → click Relationships tab → add a person → reload → see the person; open Choices tab → add a decision → tag it deliberate → add a change intention → confirm the pre-select wired in.

**Patterns to follow:**
- `src/components/VipsPageView.tsx` `getClaimHighlights` (line 348) for the per-dimension top-claim selection.

**Test scenarios:**
- Happy path: Relationships §3 left column shows 4 self-side cards (one per VIPS dimension) when VIPS data is present.
- Happy path: Choices §3 add-intention form's default pattern matches the dominant tag from §2.
- Edge case: Relationships §3 with empty VIPS pages renders the left column with "no signal yet" placeholders per dimension (mirrors `getClaimHighlights` fallback).
- Edge case: Choices §3 with a tie between two pattern tags falls back to no default (deterministic).
- Integration smoke: round-trip — open Profile, add one Relationships entry, add one Choices entry, reload, all entries present and visible.

**Verification:**
- Side-by-side self/other layout reads as intended on the deployed dev build.
- Manual: log a decision tagged `deliberate`, open §3, observe the pre-selected default.

---

## System-Wide Impact

- **Interaction graph:** Profile tab rail (both React `ProfileStudentChrome` and engine `ProfileSheet`) gains two new entries. Existing 4 VIPS tabs unchanged in behavior. New routes `/library/relationships` and `/library/choices` are added to the TanStack route tree (autogen via `src/routeTree.gen.ts`).
- **Error propagation:** Engine state slice mutations propagate through `subscribe` callbacks and Persistence saves; same path as `Profile.js` today. New routes' loaders fail-soft (render fallback) the same way `library.$dimension.tsx` does on missing data.
- **State lifecycle risks:** New persistence keys (`ss:v1:relationships`, `ss:v1:choices`) join the existing `ss:v1:*` namespace cleared by `clearStudentSpaceLocalState` (`src/lib/clear-student-space-local-state.ts`) on sign-out. Verify that helper iterates the namespace prefix rather than an enumerated list, so the new keys are wiped on sign-out without extra wiring.
- **API surface parity:** `SheetKey` union widens; any switch over it elsewhere must compile-error rather than silently fall through. Audit `grep -rn "SheetKey" src` after U1.
- **Integration coverage:** Engine → React deep link (U5) crosses the engine/React boundary; the smoke test in U6 exercises this round-trip.
- **Unchanged invariants:** `VIPS_DIMENSIONS`, `FACET_IDS`, the Connector/Cartographer/verifier pipeline, the VIPS pages backend bridge, and all reflection/timeline behavior are unchanged. The new tabs are a parallel surface, not an extension of VIPS taxonomy.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| New tabs visually crowd the rail on mobile widths | Tab rail already uses `overflow-x-auto` (chrome line 158). Verify horizontal scroll works on 360px width. |
| Persistence key wipe on sign-out misses the new keys | Audit `clear-student-space-local-state.ts` during U4 to confirm prefix-based clear, not enumerated. |
| Cross-tab linkage (R8/R9) gets misread as an automatic diff feature | Empty-state copy + section labels must explicitly say "side-by-side, your call" — no scoring. Lock in copy at U2/U3 review. |
| Engine ProfileSheet deep-link feels jarring (close-then-navigate) | First pass accepts the seam; follow-up plan promotes the tabs to native engine panels. Surface this in PR description so reviewers know it's intentional. |
| `routeTree.gen.ts` not picked up on first dev cycle | Run TanStack Router's codegen (or restart dev server) after U2/U3; confirm the two routes appear in the generated tree before integration test. |

---

## Documentation / Operational Notes

- Update `docs/vips-taxonomy.md` (or the relevant Profile IA doc) with a note that VIPS is one of three Profile tab clusters now (VIPS / Relationships / Choices), not the whole Profile.
- No env vars, migrations, or feature flags needed in v1 (all client-local).
- No analytics/observability changes in v1; follow-up plan adds them when backend sync lands.

---

## Sources & References

- Brief in conversation (Relationships + Choices MECE sections grounded in MOE CCE).
- Prior plan: [docs/plans/2026-05-14-002-feat-student-space-profile-sheet-ia-plan.md](../../docs/plans/2026-05-14-002-feat-student-space-profile-sheet-ia-plan.md) — established the Profile tab + chrome IA this plan extends.
- Memory: `[[project-engine-substrate]]`, `[[feedback-engine-slice-template]]`, `[[project-history-ia-followup]]`.
- Related code: `src/components/ProfileSheetChrome.tsx`, `src/components/VipsPageView.tsx`, `src/engine/student-space/Game/View/ProfileSheet.js`, `src/engine/student-space/Game/State/Profile.js`.
