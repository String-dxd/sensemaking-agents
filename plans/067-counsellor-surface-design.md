# Plan 067: Decide and build the counsellor surface — or delete the dead brief pipeline

> **Executor instructions**: This is a **design/spike plan**, not a
> build-everything plan. Its deliverable is a written decision document plus
> the smallest reversible build the decision authorizes. Follow the steps in
> order, run every verification command, and confirm the expected result
> before moving on. If anything in the "STOP conditions" section occurs, stop
> and report — do not improvise. When done, update the status row for this
> plan in `plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/server/counsellor-brief.functions.ts src/server/counsellor-brief.handler.server.ts src/lib/counsellor-brief-renderer.ts src/server/load-vips-pages.handler.server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M for the decision + student-initiated download; L (and a
  separate plan) for an authenticated counsellor view
- **Risk**: MED — this is a privacy design question before it is a code
  question; anything that moves a minor's reflections toward an adult needs
  the consent framing settled first
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

The counsellor brief pipeline is fully built and tested but has **zero
callers**: two server functions, a pure renderer with 12 passing tests, and a
multi-party authorization model — and no route, no button, no download
anywhere in the app. For a Singapore school product the counsellor or form
teacher is the second user and the one who makes it institutionally adoptable,
so this is either the cheapest high-value surface in the repo or it is dead
code that should be deleted rather than left as a trap for the next agent. The
honest read is that the code itself says the former was never decided: the
renderer's header calls it "a developer/demo debugging artifact in v0.2 … No
counsellor portal, no per-school styling." So this plan's job is to **settle
the product question with evidence and then execute the smallest thing the
answer justifies** — not to assume the surface should exist.

## Current state

Inlined so you do not have to reconstruct it:

- `src/server/counsellor-brief.functions.ts` — two `createServerFn` endpoints
  with a documented client contract:

  ```ts
  /**
   * U12 — Render a markdown counsellor brief for the student. The client
   * receives `{ markdown }` and triggers a `Blob`-based download — the server
   * never persists or transmits the file per R22.
   */
  export const counsellorBrief = createServerFn({ method: 'GET' })
    .inputValidator((raw: unknown) => counsellorBriefInputSchema.parse(raw))
    .handler(async ({ data }) => {
      const { counsellorBriefHandler } = await import('./counsellor-brief.handler.server')
      return counsellorBriefHandler(data)
    })

  export const loadCounsellorBriefStatus = createServerFn({ method: 'GET' })
    // …loadCounsellorBriefStatusHandler
  ```

  Grepping `src/**/*.tsx` for either exported symbol returns **nothing**.
- `src/server/counsellor-brief.handler.server.ts:1-23` — the handler reads the
  four VIPS pages, per-dimension non-forgotten timeline entries, and the
  latest `cartographer_outputs` row inside one `withStudent` transaction, then
  defers to the pure renderer. Its header records the privacy boundary:
  "R22 boundary: the handler does NOT write the markdown to disk and does NOT
  transmit it anywhere — it returns `{ markdown }` to the client, which
  triggers a `Blob`-based download. The brief is on-demand, student-initiated,
  and not auto-persisted."
- `src/lib/counsellor-brief-renderer.ts:1-30` — pure, no DB, no fetches.
  Carries voice rules (values cite evidence; personality runs through
  `checkPersonalityRewriteForDiagnosticLanguage` and is replaced with a
  withheld-pending-review line if flagged; markdown special characters in
  student-authored strings escaped via `escapeForMarkdownBlockquote`).
  **Its scope note is the crux of this plan**: "this is a developer/demo
  debugging artifact in v0.2 … No counsellor portal, no per-school styling."
- `test/lib/counsellor-brief-renderer.test.ts` — 12 passing cases (happy path,
  Trajectory-absent, empty-dimension, blockquote escaping).
- The only wired consumer is a *status* adapter feeding an unread indicator:
  `src/server/load-vips-pages.handler.server.ts:122` —
  `const worldMailbox = await loadCounsellorBriefStatusForStudent(studentId, { ctx })`
  — surfaced by the in-world mailbox in
  `src/components/student-space/world/WorldInteractions.tsx` (~:1012, the
  `mailbox` peek entry, which today reads `state?.letters?.unreadCount?.()`).
- The authorization model is already multi-party: `src/auth/identity.ts`
  resolves a **counselor** principal, and `src/db/client.ts` exports
  `assertCounselorHasStudent` (:174), `findFirstAttachedStudent` (:196), and
  `attachCounselorToDemoStudents` (:247), with `counselor_students` rows in
  the schema and `listAttachedStudentIds` (`src/db/queries.ts:529`) used by the
  cron. Every student today is reached *through* a counsellor principal — the
  data model is built for a surface that was never rendered.

Repo conventions that apply if you build UI:

- Routed sheets are TanStack Router file routes composing
  `src/components/ui/sheet.tsx` (Base UI `Dialog.Root`, `modal={false}`) in
  the shape documented in `CLAUDE.md` (`SheetSurface` → `SheetSidebar` +
  `SheetContent`). Read `src/components/student-space/sheets/SettingsSheet.tsx`
  as the closest exemplar for a settings-style action.
- `SHEET_HREFS` in the SideRail nav is the single source of truth for nav
  paths, round-trip-enforced by `test/engine/SideRail.hrefs.test.ts`.
- Every DB read/write goes through `withStudent` — bypassing it is a tenancy
  bug (`CLAUDE.md`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 pre-existing lint warnings OK, 0 errors) |
| Tests | `pnpm test` | 0 failures (baseline 911 passed / 128 skipped) |
| Targeted | `pnpm vitest run test/lib/counsellor-brief-renderer.test.ts` | 12 pass |
| Dead-code check | `grep -rn "counsellorBrief" src --include=*.tsx` | see steps |

## Scope

**In scope**:
- `docs/solutions/2026-07-25-counsellor-surface-decision.md` (create — the
  decision document is the primary deliverable)
- Only if the decision is BUILD: one student-initiated download action in an
  existing routed sheet (`SettingsSheet.tsx` or `ProfileSheet.tsx`) plus its
  test.
- Only if the decision is DELETE: removal of
  `src/server/counsellor-brief.functions.ts`,
  `src/server/counsellor-brief.handler.server.ts`,
  `src/lib/counsellor-brief-renderer.ts`, their tests, and the
  `counsellorBriefInputSchema` entry in `src/server/function-schemas.ts` —
  but see the STOP condition about the mailbox status adapter, which is
  *wired* and must survive either way.

**Out of scope** (do NOT build in this plan, even though the primitives exist):
- An authenticated counsellor-facing *view* across attached students. That
  needs its own product and privacy framing; `assertCounselorHasStudent` is
  the enforcement primitive, not the design. If the decision points there,
  the deliverable is a follow-up plan, not code.
- Any change to what the brief *contains* (the renderer's voice rules and
  redaction behavior are settled and tested).
- The letters/mailbox two-way question — that is `plans/068-letters-direction-decision.md`.
- Auto-persisting or transmitting the brief anywhere. The R22 boundary in the
  handler header is a decided constraint: student-initiated, not
  auto-persisted. Do not weaken it.

## Git workflow

- Branch: `advisor/067-counsellor-surface`
- Conventional commits, e.g.
  `docs(counsellor): record the counsellor-surface decision` then
  `feat(profile): student-initiated counsellor brief download`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish the facts, then write the decision document

Verify each claim in "Current state" yourself (the greps and file reads are
listed there). Then write
`docs/solutions/2026-07-25-counsellor-surface-decision.md` covering:

1. **What exists** — the three modules, their tests, the wired status adapter,
   and the authorization primitives, with `file:line` references.
2. **The four open questions**, each with your recommendation and reasoning:
   - Does the student always initiate the share, or can an attached
     counsellor pull the brief? (The handler header's "student-initiated"
     boundary and the fact that the brief covers a minor's reflections both
     argue for student-initiated; say so if you agree.)
   - Does the brief include raw reflection quotes, or only the Cartographer
     synthesis? (The renderer currently includes verbatim quotes as
     blockquotes — note that this is what the student would be handing over.)
   - Is the artifact a download the student hands over out-of-band, or does
     the product ever transmit it?
   - Does the in-world mailbox become the shared metaphor for both
     directions? (Cross-reference plan 068 — do not decide it here.)
3. **The recommendation**: BUILD the student-initiated download, DEFER, or
   DELETE the pipeline — with the reasoning that follows from the answers.
4. **What the renderer header's "developer/demo debugging artifact" scope note
   means for the recommendation** — i.e. whether that scope was a deliberate
   stopping point or has simply gone stale.

**Verify**: the file exists, contains all four questions with a recommendation
each, and a single stated overall recommendation → yes.

### Step 2: STOP for the maintainer's decision

This is a product decision, not an executor decision. Report your
recommendation and **stop**. Do not proceed to Step 3 or 4 without an explicit
answer from the maintainer.

**Verify**: you have reported and paused → yes.

### Step 3 (only if the decision is BUILD): wire the student-initiated download

Add one action — a labelled button in an existing routed sheet (recommend a
"Your data" or equivalent group in `SettingsSheet.tsx`; read that file first
and match its existing action rows) that calls the existing `counsellorBrief`
server function and triggers a `Blob` download of the returned markdown. Do
not create a new route or nav item unless the decision document says to.
Copy must make clear to a student what they are downloading and that it
contains their own words — read `src/components/student-space/sheets/SettingsSheet.tsx`
for the established tone and reuse its label/description structure.

Filename convention: derive from the student's own display name and the SGT
date via the existing helper (`sgToday()` from `src/lib/entry-date.ts`) —
do not hand-roll a date string.

**Verify**: `pnpm check` → exit 0. New test in
`test/components/student-space/sheets/settings-sheet.test.ts` (read it for the
pattern) asserting the action calls the server function and that a download is
triggered with the returned markdown → passes. `pnpm test` → 0 failures.

### Step 4 (only if the decision is DELETE): remove the pipeline, keep the status adapter

Delete the two server modules, the renderer, and their tests, plus the
`counsellorBriefInputSchema` entry in `src/server/function-schemas.ts`.
**The `loadCounsellorBriefStatusForStudent` path used at
`src/server/load-vips-pages.handler.server.ts:122` is live and feeds the world
mailbox — it must keep working.** Read that function first and determine
whether it can stand alone or whether deletion would break the mailbox; if it
cannot be cleanly separated, that is a STOP condition, not a reason to delete
the mailbox indicator.

**Verify**: `pnpm check` → exit 0; `pnpm test` → 0 failures;
`grep -rn "counsellorBrief\|renderCounsellorBrief" src test` → only the
surviving status-adapter references.

## Test plan

- If BUILD: one component test for the download action (server fn called,
  `Blob` download triggered, markdown passed through); the renderer's existing
  12 tests must stay green untouched.
- If DELETE: no new tests; the gate is that `pnpm test` stays at zero failures
  with the deleted files' tests removed, and the world-mailbox indicator still
  has coverage (check whether `test/server/load-vips-pages-world.test.ts`
  covers it — it exists and currently passes).

## Done criteria

ALL must hold:

- [ ] `docs/solutions/2026-07-25-counsellor-surface-decision.md` exists with
      four questions answered and one overall recommendation
- [ ] The maintainer's decision is recorded in that file (or the plan is
      reported as awaiting it — Step 2)
- [ ] If BUILD or DELETE was authorized: `pnpm check` exits 0 and `pnpm test`
      exits 0 with no new failures
- [ ] The world-mailbox status path still works (its test passes)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code (drift — someone
  may have wired or removed the pipeline since this plan was written).
- You cannot separate `loadCounsellorBriefStatusForStudent` from the modules a
  DELETE decision would remove without breaking the world mailbox.
- The decision points at an authenticated counsellor *view* — that is
  explicitly out of scope here; write the follow-up plan instead of building.
- Building the download would require weakening the R22 boundary (persisting
  or transmitting the markdown server-side).
- You find yourself changing the renderer's redaction or voice behavior for
  any reason.

## Maintenance notes

- The renderer's "developer/demo debugging artifact in v0.2" scope note should
  be updated or deleted once this decision lands — a stale scope note is what
  made this finding ambiguous in the first place.
- If the answer is BUILD, the natural follow-up is whether the counsellor can
  *request* a brief (a pull direction), which reopens the consent question and
  interacts with plan 068's mailbox metaphor. Keep them sequenced: 067
  decides who the adult is, 068 decides the channel.
- A reviewer should scrutinize: that nothing in this plan persists or
  transmits the brief; that student-facing copy makes the contents explicit;
  and that `withStudent` still wraps every read.
- Deferred deliberately: per-school styling, PDF export, and any bulk/roster
  view.
