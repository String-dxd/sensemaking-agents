---
title: "feat: CCE identity-status–aware Path Finder (Marcia quadrants)"
type: feat
status: active
date: 2026-05-19
---

# feat: CCE identity-status–aware Path Finder (Marcia quadrants)

## Overview

Today the Path Finder (`TrajectorySheet`) shows the same surface to every student: a through-line and three generic pathway "bearings". That assumes the student already has enough exploration signal for broad pathways to be useful — which is wrong for the two extremes (no signal yet, or already committed to a direction). The MOE CCE brief explicitly grounds the project in Marcia's identity statuses: **Diffused · Foreclosed · Searching · Achieved** on Exploration × Commitment axes. Path Finder should adapt to which quadrant a student is currently in.

This plan introduces a deterministic, client-side **identity-status classifier** that reads existing engine slices (`Profile`, `Captures`, `Choices`) and routes the Path Finder sheet to one of four differentiated surfaces — plus a starter state for cold-start students.

---

## Problem Frame

The CCE brief names the explicit success metric: *"move students in 'Searching' and 'Foreclosed' to 'Achieved'; move 'Diffused' to 'Searching'."* That movement only happens if the surface a student lands on **meets them at their current status** rather than handing every student the same generic compass.

Concretely:
- A **Diffused** student (no captures, no facet quotes) seeing three abstract pathway tiles ("Healthcare-adjacent care work") gets no traction — they don't yet have enough self-knowledge to evaluate a pathway. They need a starter prompt to begin reflecting.
- A **Foreclosed** student (committed direction, low exploration) treated as if they were exploring is mildly insulted by trajectories that ignore the direction they've already named. They need a challenge frame.
- A **Searching** student is the only one for whom the current "three pathways to consider" UX is genuinely on-target.
- An **Achieved** student looking at exploratory bearings is being pushed *backwards* on Marcia's grid — they need concrete near-term actions, not "have you considered…".

Without status awareness, Path Finder pushes the wrong move on three of four quadrants.

---

## Requirements Trace

- R1. Path Finder must infer a Marcia identity status — `diffused`, `searching`, `foreclosed`, `achieved` — from existing engine state at open time, with a fifth **starter** state for cold-start (no profile quotes, no captures).
- R2. The status pill is visible in the sheet header, with a hover/tooltip explaining how it was computed. The student is never typecast silently.
- R3. Each status renders a differentiated body:
  - **Starter**: single primary CTA opening Ask with a starter prompt; no pathways.
  - **Diffused**: three short reflection nudges (each opens Ask with a seed prompt); no pathways yet.
  - **Searching**: the existing through-line + 3 pathway bearings (current UX).
  - **Foreclosed**: surface their committed direction (from `Choices.intentions` or dominant pattern), then 1–2 *adjacent* bearings framed as "widen the lens".
  - **Achieved**: bearings re-skinned as **Next concrete steps** — each pathway gains a 3-item near-term action list and keeps the MySkillsFuture link.
- R4. A "Show me all paths" escape hatch is available on every non-starter status so a student can step out of the inferred frame and see the full trajectory bearings list. This is one tap, not buried.
- R5. The classifier is **deterministic, pure-function, no LLM** — same inputs always produce the same status. Reads `Profile.facets`, `Captures.entries`, `Choices.decisions`, `Choices.intentions`. No new agent, no new backend table.
- R6. The classifier exposes its inputs (exploration score, commitment score, thresholds) in a debug-readable `audit` object on the returned status, so QA can verify which signals drove the call.
- R7. The React `/library/trajectory` route reads the same classifier (or accepts a status prop) and adopts the same status pill in its header. Content remains based on whatever Cartographer output is in the DB; the route is otherwise unchanged.
- R8. The TopNav "Path Finder" chip surface and label are unchanged.
- R9. Status calc is reactive: opening the sheet recomputes status fresh from current state (no caching across opens) so a student who just logged a decision sees the move from Searching → Achieved on the next open.
- R10. The redesign must not regress the current Searching-quadrant UX — the existing through-line + bearings + traits/ECG chips + risks panel survive intact when the inferred status is `searching` or when the escape hatch is engaged.

---

## Scope Boundaries

- No backend tables, no schema changes, no migrations. Engine slices already carry every signal needed.
- No new agent. The classifier and quadrant copy live in a new `statusHeuristics.js` next to the existing `trajectoryHeuristics.js`.
- No re-implementation of Cartographer or the bearings generator — `trajectoryFor()` is reused as-is; status only swaps the *frame* around the bearings.
- No edits to the VIPS taxonomy, the Connector / Cartographer pipelines, or the verifier.
- No persistence of inferred status. Status is derived on every open from current slice state (R9). If a follow-up wants longitudinal status, that's a separate plan.
- No teacher / counsellor view. Status pill is student-facing only.
- No share-page (`/share/$token`) surfacing of status. Public share view stays a present-tense Cartographer snapshot.

### Deferred to Follow-Up Work

- A teacher dashboard that surfaces "N students currently in Diffused" for class-level facilitation (the CCE brief calls this out at the *lesson segment* level — out of scope here).
- Longitudinal status history (status pill over time) — would need a server-authoritative log; defer.
- LLM-authored quadrant copy / nudges — first pass uses a small hand-authored prompt set per quadrant, deterministic and reviewable.
- A pre-survey quiz that lets a student self-report their status (the CCE lesson plan mentions one) — out of scope; the classifier is implicit-only in v1.
- Foreclosed-quadrant pathway selection that explicitly inverts their stated direction. v1 picks the next two bearings *adjacent* to their direction; smarter contrarian selection is a follow-up.

---

## Context & Research

### Marcia framework (from the CCE doc)

Two binary axes — **Exploration** (have they explored alternatives?) and **Commitment** (have they committed to a direction?) — give four statuses:

|                      | Low Exploration | High Exploration |
|----------------------|-----------------|------------------|
| **Low Commitment**   | Diffused        | Searching        |
| **High Commitment**  | Foreclosed      | Achieved         |

Plus a practical fifth state — **Starter** — for students who have done literally nothing yet (no Ask, no facets, no Choices), where the four-quadrant classifier is uninformative.

### Signal sources (already in engine state)

- **`Profile.facets`** — VIPS quotes per claim. Quote count × confidence weight = `explorationScore` contribution. Already weighted in `trajectoryHeuristics.scoreProfile`.
- **`Captures.entries`** — every `'ask'` capture is a reflection moment. Count contributes to exploration.
- **`Choices.decisions`** — each logged decision contributes to commitment. A non-null `dominantPatternTag()` adds extra weight.
- **`Choices.intentions`** — each forward-looking change intention is a commitment signal (heavier weight than a decision, since intentions are explicitly future-facing).
- **Cartographer trajectory** (via `Captures` of `kind:'trajectory'` with `backendCartographerOutputId`) — presence is a strong exploration signal (the student has actually been processed through the pipeline).

### Thresholds (initial; tunable)

```
explorationScore =
    distinctClaimsWithQuotes  // facets touched
  + askCaptureCount × 0.5
  + (hasBackendCartographer ? 3 : 0)

commitmentScore =
    decisionCount × 1
  + intentionCount × 1.5
  + (dominantPatternTag ? 1 : 0)

LOW_EXPLORATION  = explorationScore < 2
HIGH_EXPLORATION = explorationScore >= 4
LOW_COMMITMENT   = commitmentScore < 1
HIGH_COMMITMENT  = commitmentScore >= 2

// 2-3 exploration → "emerging" — same bucket as low for Marcia binary
// 1 commitment    → same bucket as low (one decision isn't a committed direction yet)

isStarter = explorationScore === 0 && commitmentScore === 0
```

Thresholds are intentionally conservative — most demo students will land in **Searching** (which is the closest to current behaviour) until the project hits a richer state, which is the desired migration path.

### Relevant Code and Patterns

- **`src/engine/student-space/Game/View/TrajectorySheet.js`** — the live Path Finder sheet (~317 lines). All status routing happens here. The existing `_render` / `_renderEmpty` pair becomes `_renderForStatus(status, capture)`.
- **`src/engine/student-space/Game/View/trajectoryHeuristics.js`** — pure-function bearings generator. **Untouched** by this plan. Reused as-is.
- **NEW** `src/engine/student-space/Game/View/statusHeuristics.js` — pure-function classifier. Mirrors `trajectoryHeuristics.js` posture: no LLM, no DOM, voice-of-Kira copy.
- **`src/engine/student-space/Game/State/Profile.js`** — read `facets` (quote counts).
- **`src/engine/student-space/Game/State/Captures.js`** — read `entries` (filter by `kind:'ask'`).
- **`src/engine/student-space/Game/State/Choices.js`** — read `decisions`, `intentions`, `dominantPatternTag()`.
- **`src/engine/student-space/Game/View/OverlayController.js`** — the `'ask'` overlay exists. Diffused / Starter CTAs call `OverlayController.getInstance().open('ask', { prompt, dismissOnBack: true })`. The pattern is already used by `ObjectPeek.js` (line 101) and `KiraNarrator.js` (line 280) — same signature.
- **`src/engine/student-space/Game/View/TopNav.js`** — Path Finder chip already opens `'trajectory'`. Untouched.
- **`src/engine/student-space/Game/View/ProfileSheet.js`** — Status pill component pattern (line ~? eyebrow + title) is the visual reference for the Path Finder eyebrow row.
- **`src/components/TrajectoryPageView.tsx`** — React surface that mirrors the engine sheet's content. Gets a small status-pill header addition for parity (R7).
- **`src/routes/library.trajectory.tsx`** — passes data through to `TrajectoryPageView`. Adds a status calc using the same classifier shape (rebuilt in TS, not imported from the JS engine — see Key Technical Decision #2).

### Institutional Learnings

- `[[project-engine-substrate]]` — `src/components/world/*` is dormant; the engine is the live home. **Implement engine-first**, React parity is the smaller diff.
- `[[feedback-engine-slice-template]]` — singleton + subscribe + persist. Not directly invoked here (we only *read* slices), but referenced if a follow-up wants to cache status.
- `[[project-history-ia-followup]]` — Calendar + Growth should combine under a History parent. Out of scope here but a useful reminder that the TopNav surface is in flux.
- `[[project-irc-framework-on-hold]]` — VIPS remains canonical. The CCE quadrant is layered on top of VIPS evidence; we do not introduce a competing taxonomy. Status is a **read** over VIPS + Choices, not a new dimension.

### External References

- Marcia, J. E. — Identity Status Theory (referenced in the CCE brief). The two-axis 2×2 is the canonical framing; v1 maps to binary thresholds on each axis, which is the standard simplification.
- MOE CCE 2026 Year 4 lesson plan (the doc itself) — confirms the four statuses are pedagogically named in the classroom; teachers will be facilitating with this vocabulary, so the **status pill copy must match the doc's wording exactly**.

---

## Key Technical Decisions

### 1. Status classification is implicit, client-side, deterministic

We do **not** ask the student to self-report their status (the CCE lesson plan has a separate pre-survey for that — out of scope, R10 boundary). We do **not** call an LLM. The classifier is pure-function over existing slices so:
- It runs synchronously at sheet open with no I/O.
- QA can write deterministic tests against fixed slice snapshots.
- A future LLM-augmented version can swap in behind the same `statusFor()` signature without changing call sites.

### 2. React parity duplicates the classifier (small, deterministic)

The React route reads from the server-side trajectory row, not the engine slices. The classifier needs access to *engine* state (Captures, Choices) to be honest, and those aren't bridged to the server today. v1 ports the threshold logic to a small TS function that runs on the same engine state via the existing engine→React bridge (`src/engine/student-space/profile-tab-react-bridge.tsx` is the template). If the route is opened *before* the engine has hydrated (cold-start direct link), it renders without a status pill — graceful degradation, not blocking.

### 3. The classifier exposes its audit, not just its label

```ts
type IdentityStatusAudit = {
  status: 'starter' | 'diffused' | 'foreclosed' | 'searching' | 'achieved'
  exploration: { score: number; band: 'low' | 'emerging' | 'high'; inputs: {…} }
  commitment:  { score: number; band: 'low' | 'high'; inputs: {…} }
  reason: string  // one-line human-readable
}
```

The view shows the label + a tooltip with the `reason` line. The full audit is exposed on the global `__SS_DEBUG__` for dev inspection and powers the deterministic unit tests.

### 4. Achieved's "concrete next steps" reuse bearings, do not invent a new model

For the Achieved quadrant we don't run a different agent or fetch new data — we reuse the same `trajectoryFor()` output and add a quadrant-specific **3-step action list** rendered alongside each bearing. The action list is templated per cluster (mirrors the existing `BEARING_COPY` table). Concrete enough to feel actionable, generic enough to not over-promise without student-specific data.

### 5. Foreclosed selection prefers *adjacent* clusters, not opposites

The pedagogical move for Foreclosed isn't "you're wrong, here's the opposite" — it's "widen the lens slightly". So Foreclosed surfaces bearings that share *some* affinity with the student's committed direction (from `Choices.intentions[*].change`) plus a clear "what would change your mind?" exploration prompt. The "opposite of your direction" framing is a deferred follow-up — likely too confrontational for a v1 pedagogy surface.

---

## Implementation Outline

### Files added

- `src/engine/student-space/Game/View/statusHeuristics.js` — `statusFor(profile, captures, choices, identity)` → `IdentityStatusAudit`. Pure function. Mirrors `trajectoryHeuristics.js` shape.
- `src/lib/student-space/identity-status.ts` — TS shim that reads engine singletons and returns the same audit shape, for use in React (`library.trajectory.tsx`). Imports the engine JS classifier; the JS file remains the source of truth.
- `test/engine/statusHeuristics.test.ts` — Vitest unit tests covering each quadrant + starter + threshold boundaries.

### Files modified

- `src/engine/student-space/Game/View/TrajectorySheet.js` — replace single `_render`/`_renderEmpty` with `_renderForStatus`. Add status pill in header. Add "Show me all paths" escape-hatch button. Wire Diffused / Starter CTAs to `OverlayController.open('ask', { prompt })`. Reuse `trajectoryFor()` output for Searching/Achieved/Foreclosed/escape; do not call it for Starter/Diffused.
- `src/engine/student-space/style.css` — new selectors: `.trajectory-sheet__status-pill`, `.trajectory-sheet__starter`, `.trajectory-sheet__nudges`, `.trajectory-sheet__action-list`, `.trajectory-sheet__foreclosed-frame`. Reuse existing color tokens; no new palette.
- `src/components/TrajectoryPageView.tsx` — add an optional `statusAudit?: IdentityStatusAudit` prop and render a header pill + escape-hatch toggle. When absent (legacy callers), render unchanged.
- `src/routes/library.trajectory.tsx` — compute status from engine via the new TS shim if available, pass to `TrajectoryPageView`. Falls back silently to the legacy render if the engine isn't hydrated yet.

### Test plan

- Unit: `statusFor()` returns each of the five statuses for fixture profiles.
- Unit: threshold boundary cases — exploration score === 1 stays low, exploration score === 2 enters emerging (≠ high), exploration score === 4 enters high; same for commitment at 1 / 2.
- Unit: `isStarter` requires both axes at 0, not just one.
- Integration (engine smoke): open the sheet on a fresh local profile → status pill reads "Starter" with `reason` mentioning "no captures yet". Add an `'ask'` capture → reopen → status pill shifts.
- Integration (React): `/library/trajectory` with a populated engine snapshot renders the pill; without an engine snapshot, renders the legacy header.
- Manual: visual review of all five quadrants. Tap the "Show me all paths" escape hatch from Foreclosed → returns to the Searching layout.

---

## Addendum (2026-05-19) — Profile-side status preview controller

The first implementation pass shipped a status-preview controller on the
**Profile sheet** so the user can force any of the five statuses without
having to mint realistic state. Added concurrently with the rest of this
plan but worth flagging separately because it touches state, persistence,
and a sheet outside the scope above.

- New slice: `src/engine/student-space/Game/State/IdentityStatusOverride.js`
  (+ `.d.ts`). Singleton + subscribe + persist per
  [[feedback-engine-slice-template]]. Persists under the new
  `ss:v1:identityStatusOverride` key. `setOverride('auto' | null)` clears.
- `Persistence.js` learns the new slice (KEY + SLICES + empty shape).
  `Persistence.d.ts` updated to keep `load()` typed.
- `State.js` constructs + hydrates the slice alongside the rest.
- `TrajectorySheet._currentAudit()` now checks
  `state.identityStatusOverride.current`: when set, the inferred audit's
  status is replaced and the reason line spells out both the preview status
  and the underlying inferred status. The status pill renders
  `PREVIEW · <Status>` and a `data-preview="on"` attribute hangs off the
  sheet root for any CSS that wants to flag the preview state.
- `ProfileSheet.js` renders a `<aside class="profile-status-control">`
  between the tab rail and the panel — eyebrow + helper line + a radiogroup
  of six chips (Auto + the five statuses). Click handler dispatches via the
  existing `_onClick` delegation. A subscriber keeps chip state in sync
  with mutations from anywhere else (e.g. dev console). Dispose path
  releases the subscription.
- CSS additions: `.profile-status-control*` + `.profile-status-chip*` next
  to the existing `.profile-sheet__panel` rules. The card flips from a
  dashed border to a solid amber-tinted border when an override is active.
- Tests: `test/engine/IdentityStatusOverride.test.ts` (9 tests covering
  set / clear / hydrate / persistence round-trip / lenient garbage / pub-sub
  crash isolation). `test/engine/student-space-trajectory.test.ts` extended
  with 5 tests verifying that each forced status renders the right body
  (starter card / nudges / foreclosed frame / achieved actions / preview pill).

This is intentionally a student-facing preview affordance (not dev-only) —
it doubles as a classroom demo lever where a teacher can show students
what each status surface looks like before assigning them to one through
the CCE pre-survey.

## Open Questions

1. **Should the Starter state be a one-tap chat-with-Kira launcher, or a 2-step "here's what Path Finder does → start chat"?** v1 ships the single-CTA version; if user testing shows students don't understand the surface, add a one-screen explainer in a follow-up.
2. **Foreclosed's "what would change your mind?" CTA — does it open Ask with a seeded prompt, or does it open the Choices tab?** v1 wires it to Ask (consistent with Diffused nudges). Choices tab handoff is a candidate refinement if the student already has decisions logged.
3. **Should the React surface read engine state at all, or should the route lose the status pill entirely?** v1 reads engine state on the client via the existing bridge. If the route is genuinely server-rendered first (it's not today — it's a TanStack client route), the pill renders on hydrate.
