# Plan 005 (v2): Surface pathway → mirror evidence links on the Trajectory page

> **Executor instructions**: Follow step by step; verify each step. Honor STOP
> conditions. Update this plan's row in `advisor-plans/README.md` when done.
>
> **Read first**: `advisor-plans/000-kira-spec-alignment-brief.md`.
> Requires Plan 001 executed (Alice trajectory with `timeline_key`s seeded)
> for the end-to-end demo check; the code changes themselves don't depend on it.
>
> **Drift check (run first)**:
> `git diff --stat 0e4122b6..HEAD -- src/lib/student-space/backend-snapshot.ts src/lib/student-space/backend-bridge.ts src/engine/student-space/Game/State/schema.js src/components/student-space/sheets/TrajectorySheet.tsx`
> On drift, reconcile "Current state" against live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the engine capture-merge allowlist)
- **Depends on**: 001 (for demo verification)
- **Category**: direction / feature
- **Planned at**: commit `0e4122b6`, 2026-07-13 (v2 — attach point and
  serialization boundary corrected after cold-read review)

## Why this matters

The spec's Pathway Explorer grounds every pathway in *recorded moments* —
"five directions, every one traceable to a moment she actually recorded". The
data chain already exists: seeded pathways carry
`trait_combination[].timeline_entry_id` → `vips_timeline_entries.reflection_id`
→ `mirror_entries.id`. But the client mapping drops it: trait chips on the
Trajectory page are static labels with no way to tap through to the mirror
that evidences them. This plan resolves the chain **client-side** (all the
data is already in the snapshot inputs) and makes trait chips link to
`/mirror/$id` when evidence exists.

## Current state (verified at `0e4122b6`; line refs from cold-read verification)

### Data path (note: snapshot assembly is CLIENT-side)

1. Server: `loadTrajectory` (`src/server/load-trajectory.functions.ts:10`) →
   handler `src/server/load-trajectory.handler.server.ts:23–29` runs
   `latestCartographerOutput(studentId, { ctx })` inside `withStudent`.
   Separately, `loadVipsPages` already returns
   `timeline_by_dimension: Record<VipsDimension, VipsTimelineEntryRow[]>`
   (`src/server/load-vips-pages.handler.server.ts:50`) — and
   `VipsTimelineEntryRow` carries `id` and `reflection_id` (nullable)
   (`src/db/queries.ts:900–912`). **No new server query is needed.**
   Caveat: `timeline_by_dimension` contains non-forgotten entries only
   (handler line 49) — acceptable: forgotten mirrors shouldn't be linked.
2. Client: `refreshSnapshot` (`src/lib/student-space/backend-bridge.ts:172–184`)
   does `Promise.all([loadVipsPages, loadWiki, loadTrajectory, loadAuthMenu])`
   → `createStudentSpaceBackendSnapshot({ vips, wiki, trajectory, authMenu })`.
3. Mapping: `createStudentSpaceBackendSnapshot`
   (`src/lib/student-space/backend-snapshot.ts:168`) calls
   `mapTrajectoryResultToStudentSpaceCapture` (defined ~line 304), which wraps
   `mapCartographerOutputToTrajectoryCapture` (lines 311–333). That mapper
   keeps `trait_combination[].claim_id` → `traitTags: string[]` (line 327) and
   **drops `timeline_entry_id`**. There is a second call site in
   `backend-bridge.ts:260` (post-run refresh) — both must get the timeline arg.
4. Engine boundary (⚠ the real serialization gate):
   `src/engine/student-space/Game/State/schema.js:242` defines
   `TRAJECTORY_BEARING_KEYS = { id, title, prompt, traitTags, ecgTags, risk, msfUrl }`;
   `mergeTrajectoryBearing` (lines 244–264) **drops any key not in that
   allowlist** ("dropping unknown key", line 250) and only merges
   string / string-array values (lines 252–260). A new `traitRefs` field is
   silently stripped here unless the allowlist AND the merge logic are
   extended. There is **no zod response validation** on the server fns (input
   validators only) — this engine merge is the only stripping boundary.
5. UI: `src/components/student-space/sheets/TrajectorySheet.tsx` — `Bearing`
   type (lines 59–67, local); `EvidenceDisclosure` (693–731) renders chips
   inside a custom `InlineDisclosure` (499–531, a `useState` button toggle —
   chips are siblings of the toggle, **not** nested in it, so wrapping a chip
   in a `<Link>` creates no nested-interactive conflict); `TraitChip` is a
   `<span>` (742–758); `traitChipOf(id)` returns
   `{ kicker: '', label: id, title: id }` for unknown ids
   (`src/engine/student-space/Game/View/trajectoryHeuristics.js:243`) — safe.
6. Existing mirror-link pattern to copy:
   `src/components/student-space/sheets/DayDetailCard.tsx:221–268` —
   `Number(...)` + `Number.isInteger && > 0` guard, then
   `<Link to="/mirror/$id" params={{ id: String(entryId) }}>`.

### Existing tests to extend

- `test/lib/student-space/backend-snapshot.test.ts` — already exercises a
  pathway `trait_combination` with `timeline_entry_id: 7` and asserts
  `traitTags` (lines ~93–120). Extend this file.
- `test/components/student-space/sheets/trajectory-sheet.test.tsx` — extend
  for chip-link rendering.

## Approach (client-side resolution — no server changes)

1. **Mapping**: give `mapTrajectoryResultToStudentSpaceCapture` /
   `mapCartographerOutputToTrajectoryCapture` an optional second argument —
   the vips result's `timeline_by_dimension` — and build
   `timelineToMirror: Map<number, number>` from it (flatten all dimensions;
   skip entries whose `reflection_id` is null). Emit per bearing, alongside
   the existing `traitTags`:
   `traitRefs: Array<{ claimId: string; mirrorEntryId?: number }>`
   (one element per `trait_combination` item, `mirrorEntryId` present only
   when `timeline_entry_id` resolves). Keep `traitTags` — other consumers and
   the local preview generator still use it.
2. **Call sites**: pass the vips result at both
   `backend-snapshot.ts:168` (inside `createStudentSpaceBackendSnapshot`,
   which already has `vips` in scope) and `backend-bridge.ts:260`.
3. **Engine schema**: in `src/engine/student-space/Game/State/schema.js`, add
   `traitRefs` to `TRAJECTORY_BEARING_KEYS` and extend `mergeTrajectoryBearing`
   to sanitize it: accept an array of objects, keep only
   `{ claimId: string, mirrorEntryId?: positive integer }`, drop anything
   malformed (match the file's existing defensive style — it logs and drops
   rather than throws).
4. **UI**: `Bearing` gains `traitRefs?: Array<{ claimId: string; mirrorEntryId?: number }>`.
   In `EvidenceDisclosure`/`ChipGroup`, when a trait has a positive-integer
   `mirrorEntryId`, wrap its `TraitChip` in
   `<Link to="/mirror/$id" params={{ id: String(mirrorEntryId) }}>` (guard
   exactly like `DayDetailCard.tsx:221–268`), with a hover affordance
   consistent with existing sheet link styling; otherwise render the current
   static span. Prefer `traitRefs` when present, fall back to `traitTags`
   (local preview / legacy captures have no refs).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 |
| Snapshot tests | `pnpm test -- backend-snapshot` | pass |
| Sheet tests | `pnpm test -- trajectory-sheet` | pass |
| Full test | `pnpm test` | all pass |

## Scope

**In scope:**
- `src/lib/student-space/backend-snapshot.ts`
- `src/lib/student-space/backend-bridge.ts` (second mapping call site only)
- `src/engine/student-space/Game/State/schema.js` (allowlist + merge for
  `traitRefs` only)
- `src/components/student-space/sheets/TrajectorySheet.tsx`
- `test/lib/student-space/backend-snapshot.test.ts`,
  `test/components/student-space/sheets/trajectory-sheet.test.tsx`

**Out of scope:**
- All server handlers/functions (`load-trajectory.*`, `load-vips-pages.*`) —
  the data is already returned; do not add queries.
- Seed files (Plan 001); `trajectoryHeuristics.js` (local preview stays
  linkless); Cartographer agent/runtime; the `/mirror/$id` route;
  `src/db/queries.ts`.

## Git workflow

Branch `advisor/005-pathway-evidence-links`; commit e.g.
`feat(trajectory): trait chips link to their evidencing mirror`.
Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extend the mapping (backend-snapshot.ts)

Implement Approach 1–2. The resolution is pure data-plumbing: flatten
`vips.timeline_by_dimension` values, build `Map(entry.id → entry.reflection_id)`
skipping null `reflection_id`, and look up each trait's `timeline_entry_id`.

**Verify**: extend `test/lib/student-space/backend-snapshot.test.ts` (model on
the existing trait-combination case at ~93–120): a trait with
`timeline_entry_id: 7` and a timeline entry `{ id: 7, reflection_id: 42 }`
maps to `traitRefs: [{ claimId: …, mirrorEntryId: 42 }]`; an unresolvable id
yields a ref without `mirrorEntryId`; `traitTags` unchanged.
`pnpm test -- backend-snapshot` → pass.

### Step 2: Extend the engine merge allowlist (schema.js)

Implement Approach 3. Match the file's existing merge style for `traitTags`
(string-array handling at lines 252–260) — add an object-array branch for
`traitRefs` only.

**Verify**: `pnpm check` → exit 0, and the Step 1 test still passes when the
capture round-trips through `applyStudentSpaceBackendSnapshot` (if the
existing snapshot test doesn't round-trip through the engine merge, add one
assertion that `traitRefs` survives `mergeTrajectoryBearing` — import it
directly).

### Step 3: Render the links (TrajectorySheet.tsx)

Implement Approach 4.

**Verify**: extend `trajectory-sheet.test.tsx`: a bearing with
`traitRefs: [{ claimId: 'values.contribution', mirrorEntryId: 42 }]` renders a
link with `href` containing `/mirror/42`; a ref without `mirrorEntryId`
renders a static chip; a legacy bearing with only `traitTags` renders as
today. `pnpm test -- trajectory-sheet` → pass.

### Step 4: Gates + demo check

- `pnpm check`, `pnpm test` → exit 0.
- With a seeded local DB (after Plan 001): `pnpm dev`, sign in with demo, open
  Path Finder, expand a pathway's evidence, click a trait chip → lands on the
  mirror detail page for the right entry.

## Test plan

Covered per-step above: two mapping cases + engine-merge survival
(backend-snapshot.test.ts), three rendering cases (trajectory-sheet.test.tsx).
No new test files.

## Done criteria

- [ ] Seeded pathway trait chips deep-link to `/mirror/$id`; chips without
      evidence stay static; local-preview trajectories unaffected.
- [ ] `traitRefs` survives the engine capture merge (schema.js allowlist +
      sanitizer extended; nothing else in schema.js changed).
- [ ] No server files modified.
- [ ] New test cases pass; `pnpm check` + `pnpm test` exit 0.
- [ ] README status row updated.

## STOP conditions

- `mergeTrajectoryBearing` / `TRAJECTORY_BEARING_KEYS` don't match the excerpt
  (engine drift) — reconcile first; do not force fields through a merge you
  don't understand.
- `mapCartographerOutputToTrajectoryCapture` turns out to have consumers that
  break on a second argument — report rather than fork the function.
- Linking requires data not present in `timeline_by_dimension` (e.g. a trait
  resolves to a *forgotten* timeline entry you believe must be linked) — the
  non-forgotten filter is intentional; report, don't bypass it.

## Maintenance notes

- Runtime Cartographer outputs carry `timeline_entry_id` only if the
  agent/verifier pipeline sets it; seeded rows always do. The link must remain
  optional forever.
- If `traitTags` proves to have no consumer other than the chip fallback,
  delete it in a follow-up rather than carrying both shapes indefinitely.
- If a `loadTrajectory`-side server resolution is ever preferred (e.g. to link
  forgotten-entry evidence), the handler is
  `src/server/load-trajectory.handler.server.ts:23–29` — keep any new query
  inside the `withStudent` envelope (tenancy rule).
