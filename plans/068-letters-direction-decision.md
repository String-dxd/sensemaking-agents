# Plan 068: Decide what `/letters` is — a real correspondence channel or an honestly-scoped prompt surface

> **Executor instructions**: This is a **design/spike plan**, not a
> build-everything plan. Its deliverable is a written decision document plus,
> only if authorized, one small verified build increment. Follow the steps in
> order, run every verification command, and confirm the expected result
> before moving on. If anything in the "STOP conditions" section occurs, stop
> and report — do not improvise. When done, update the status row for this
> plan in `plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/components/student-space/sheets/LettersSheet.tsx src/engine/student-space/Game/Data/lettersSeed.js src/engine/student-space/Game/State/TeacherLetters.js src/components/student-space/capture/AskSheet.tsx src/lib/student-space/demo-shell-data.server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S if the decision is to scope down; M for the verified build
  increment below; L (and a separate plan) for a real authoring/messaging
  channel
- **Risk**: MED — student↔adult messaging in a school product is a
  safeguarding surface, not just a feature
- **Depends on**: `plans/067-counsellor-surface-design.md` should be decided
  first — it settles *who the adult is*; this plan settles *the channel*
- **Category**: direction
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`/letters` is a first-class product surface — a top-level route, a permanent
SideRail item, a physical mailbox object in the 3D world with its own hover
copy and an onboarding beat — backed by a **hardcoded two-entry array**. There
is no letters table anywhere in the schema, so no teacher can ever actually
send one. This is the surface where the product's world-model (a mailbox
implies correspondence) and its implementation diverge most visibly, and
leaving it ambiguous means the next agent either builds on a fixture or
rebuilds something that already exists.

**Read this before anything else, because the audit that generated this plan
got it partly wrong and the advisor corrected it**: the letter → prompted
capture direction is **already built end-to-end**. Do not rebuild it. The two
genuine gaps are narrower and more interesting, and they are stated precisely
below.

## Current state

Verified facts, with the corrections that matter:

**Already built — do NOT rebuild:**

- `src/components/student-space/sheets/LettersSheet.tsx:110-127` — each letter
  with a `prompt` renders a Capture action that deep-links into the Ask
  overlay carrying both the prompt and the letter id:

  ```tsx
  const handleCapture = (prompt: string) => {
    // …
    overlay?.open('ask', { prompt, dismissOnBack: true, letterId: selectedId })
  }
  ```

  and `:191-198` renders the prompt block plus the button. So "make each letter
  deep-link into a prompted capture" is **done**.
- `src/components/student-space/capture/AskSheet.tsx:215, 312-314, 720, 787` —
  the Ask sheet reads `letterId` from the overlay options, resolves the letter
  from the engine slice, and stamps `letterId` onto the capture entry it
  creates (`commitCapture`, ~:714-726).
- `src/engine/student-space/Game/State/schema.js:240` — `'letterId'` is in the
  `KNOWN_CAPTURE_KEYS` allow-list, so it survives the engine's persistence
  round-trip rather than being dropped at the React↔engine seam.
- `src/engine/student-space/Game/Data/lettersSeed.js:18-40` — the two letters
  (`lt_camp_reflect`, `lt_careerfair_reflect`), both `from: 'Mr. Tan'`, each
  with a `prompt` field and `sentAt: isoDaysAgo(0)` / `isoDaysAgo(1)`. The copy
  is careful and demo-tuned; treat it as authored content, not filler.
- `src/engine/student-space/Game/State/TeacherLetters.js:12,26` — the slice
  merges `LETTERS_SEED` with any persisted state (`mergeArray(...)`), and owns
  `markRead(id)`.

**Gap 1 — the fixture has no backing store.**
`src/lib/student-space/demo-shell-data.server.ts:65` returns
`teacherLetters: []` with the comment "Letters come from the engine seed
(LETTERS_SEED) only — the two teacher-prompt letters (camp, career fair). The
shell no longer generates extra pattern/first-thread letters." Grepping
`src/db/schema.ts` and `src/db/queries.ts` for "letter" returns **nothing**.
So every student sees the same two letters forever, and no adult can send one.

**Gap 2 — the prompt→reflection thread breaks at the server boundary.**
`grep -n letterId src/server/*.ts src/lib/student-space/backend-bridge.ts src/db/schema.ts src/db/queries.ts` returns **no matches**. The
`letterId` association exists only on the local engine capture in
`ss:v1:*` localStorage — it never reaches the mirror entry in Postgres. So the
one piece of information that would make this a thread ("this reflection
answers Mr. Tan's camp letter") is lost exactly where it would become useful,
and it is destroyed outright whenever local state is cleared on an identity
change (see `src/lib/clear-student-space-local-state.ts`).

**Surrounding context:**

- `src/routes/_app.letters.tsx` (route), the SideRail item via `SHEET_HREFS`
  (round-trip-enforced by `test/engine/SideRail.hrefs.test.ts`), the world
  mailbox peek copy in
  `src/components/student-space/world/WorldInteractions.tsx` (~:1012, reading
  `state?.letters?.unreadCount?.()`), and an onboarding beat that puts the
  mailbox in onboarding mode (`src/components/student-space/onboarding/OnboardingFlow.tsx`,
  `view?.mailbox?.setOnboardingMode?.(true)`).
- The same mailbox metaphor is already carrying counsellor-brief status in the
  other direction (`src/server/load-vips-pages.handler.server.ts:122` →
  `world_mailbox`), which is why plan 067 should be decided first.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 pre-existing lint warnings OK, 0 errors) |
| Tests | `pnpm test` | 0 failures (baseline 911 passed / 128 skipped) |
| Migration | `pnpm db:generate` | new file under `src/db/migrations/` |
| Seed/reset | `pnpm demo:reset` | exit 0 (needs `DATABASE_URL`) |

## Scope

**In scope**:
- `docs/solutions/2026-07-25-letters-direction-decision.md` (create — the
  decision document is the primary deliverable)
- Only if the decision authorizes the increment (Step 3): persisting
  `letterId` on the mirror entry — `src/db/schema.ts` (+ generated migration),
  `src/db/queries.ts`, the submit/persist server handlers, and
  `src/lib/student-space/backend-bridge.ts`, with tests.
- Only if the decision is to scope down (Step 4): documentation/copy
  adjustments so nobody builds on a fixture again.

**Out of scope** (do NOT build in this plan):
- Any authoring surface for whoever sends letters, and any student→teacher
  *reply* channel. That is a safeguarding and moderation design problem, and
  it inherits every consent question in plan 067. If the decision points
  there, the deliverable is a follow-up plan, not code.
- Rebuilding the letter→capture deep link (it exists — see above).
- Rewriting the seeded letter copy.
- The counsellor-brief direction (plan 067) and the world mailbox's brief
  status indicator.
- Any change to `KNOWN_CAPTURE_KEYS` semantics beyond what persisting
  `letterId` server-side requires.

## Git workflow

- Branch: `advisor/068-letters-direction`
- Conventional commits, e.g.
  `docs(letters): record the letters-surface decision` then, if authorized,
  `feat(capture): persist letterId on mirror entries so prompt threads survive`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the facts above, then write the decision document

Re-run the greps in "Current state" and confirm each claim (especially that
`letterId` reaches no server file — if it now does, that is drift and a STOP
condition). Then write
`docs/solutions/2026-07-25-letters-direction-decision.md` covering:

1. **What is already built** — the deep link, the `letterId` stamp, the
   allow-list entry — with `file:line` references, so no future session
   rebuilds it.
2. **The two verified gaps** — no backing store; the thread breaking at the
   server boundary.
3. **The decision, framed as three options**, each with its cost and its
   safeguarding implications:
   - **(A) Scope down honestly.** Letters stay one-directional teacher
     prompts backed by the seed; the surface copy and a code comment say so;
     nobody builds on a fixture by accident. Cheapest, loses nothing that
     exists today.
   - **(B) Make the thread real, keep it one-directional.** Persist
     `letterId` on the mirror entry (Step 3) and add a `teacher_letters`
     table seeded from `LETTERS_SEED`, so letters become data an adult could
     eventually author and a reflection can be attributed to the prompt that
     produced it. No messaging channel, no reply path — the student still
     only ever writes reflections, exactly as today.
   - **(C) Full two-way correspondence.** A table, a write path, an authoring
     surface, and moderation. Out of scope here; would need its own plan and
     a safeguarding review.
4. **Your recommendation** with reasoning. The advisor's view, for you to
   weigh rather than inherit: (B)'s first half — persisting `letterId` — is
   worth doing on its own merits regardless of the letters question, because
   it fixes real data loss; the table and the authoring surface should wait
   for plan 067 to settle who the adult is.

**Verify**: the file exists, states what is already built with references,
names both gaps, presents three options with costs, and gives one
recommendation → yes.

### Step 2: STOP for the maintainer's decision

This is a product and safeguarding decision, not an executor decision. Report
your recommendation and **stop**. Do not proceed to Step 3 or 4 without an
explicit answer.

**Verify**: you have reported and paused → yes.

### Step 3 (only if option B's `letterId` persistence is authorized): thread the association to the server

Add a nullable `letter_id` text column to the mirror-entries table in
`src/db/schema.ts` (read the file first and match its column/index
conventions), generate the migration with `pnpm db:generate`, and thread the
value through: the submit/persist request schema, the insert in
`src/db/queries.ts`, and the client payload in
`src/lib/student-space/backend-bridge.ts`. Keep every write inside the
existing `withStudent` envelope — bypassing it is a tenancy bug
(`CLAUDE.md`). Treat the field as advisory metadata: a missing or unknown
`letterId` must never fail a capture.

Do **not** add a foreign key to a letters table (there is none, and creating
one is option C's territory).

**Verify**: `pnpm check` → exit 0. `pnpm db:generate` produced exactly one new
migration file and `git status` shows no other schema churn. New test
asserting a capture submitted with a `letterId` persists it and one without
persists null → passes. `pnpm test` → 0 failures.

### Step 4 (only if option A is chosen): make the scoping explicit

Update the module comment in `src/engine/student-space/Game/Data/lettersSeed.js`
and the `LettersSheet.tsx` header to state plainly that letters are seeded
teacher prompts with no backing store and no reply path, and that the
`letterId` on a capture is local-only. Record the decision link in
`docs/followups.md` if it is still the live-followups file (plan 064 prunes
it — check its state first).

**Verify**: `pnpm check` → exit 0; `pnpm test` → 0 failures;
`grep -n "no backing store" src/engine/student-space/Game/Data/lettersSeed.js`
→ one match.

## Test plan

- If Step 3 runs: two cases on the capture-persist path (with `letterId` →
  persisted; without → null), plus confirmation that an unknown `letterId`
  string does not reject the capture. Find the existing persist-path test and
  match its structure; note that some DB-backed suites are `DATABASE_URL`-gated
  (see `plans/059-revive-dark-db-tests.md`), so add a mocked-layer test if the
  gated one cannot run locally, and say which you did.
- If Step 4 runs: no new tests; the gate is that `pnpm check` and `pnpm test`
  stay green.

## Done criteria

ALL must hold:

- [ ] `docs/solutions/2026-07-25-letters-direction-decision.md` exists,
      documents what is already built, both gaps, three options, and one
      recommendation
- [ ] The maintainer's decision is recorded in that file (or the plan is
      reported as awaiting it — Step 2)
- [ ] If Step 3 ran: `pnpm check` exits 0, `pnpm test` exits 0, exactly one new
      migration file exists, and the new `letterId` tests pass
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -n letterId src/server src/db -r` now returns matches (drift — the
  thread may already have been wired since this plan was written).
- The excerpts in "Current state" do not match the live code.
- The decision points at option C (two-way correspondence) — write the
  follow-up plan and a safeguarding-questions list instead of building.
- Persisting `letterId` appears to require a foreign key, a letters table, or
  any change to how captures are validated beyond adding one optional field.
- You find yourself editing the seeded letter copy for any reason.

## Maintenance notes

- Sequencing: plan 067 decides *who the adult is*; this plan decides *the
  channel*. Both touch the world mailbox metaphor, which today carries
  counsellor-brief status in one direction and letter unread counts in the
  other — if either becomes a real two-way channel, that metaphor needs one
  owner.
- If a `teacher_letters` table ever lands, `LETTERS_SEED` becomes its seed
  source and `TeacherLetters.js`'s `mergeArray(LETTERS_SEED, …)` merge
  behavior needs revisiting so DB rows win over the fixture.
- A reviewer should scrutinize: that no reply/messaging path was added; that
  `letterId` stays advisory (never able to fail a capture); and that the
  `withStudent` envelope wraps the new write.
- Deferred deliberately: letter authoring UI, moderation, notifications, and
  any student→adult message path.
