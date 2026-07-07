# Plan 002: Add the teacher-initiated prompt letters (career fair + camp)

> **Executor instructions**: Follow step by step; run every verification and
> confirm its expected result before moving on. Honor STOP conditions. Update
> this plan's row in `advisor-plans/README.md` when done.
>
> **Read `advisor-plans/000-kira-spec-alignment-brief.md` first** for voice rules.
>
> **Drift check (run first)**:
> `git diff --stat 4a01fcae..HEAD -- src/engine/student-space/Game/Data/lettersSeed.js src/components/student-space/sheets/LettersSheet.tsx src/engine/student-space/Game/State/TeacherLetters.js`
> If any changed, compare "Current state" excerpts to live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction / content
- **Planned at**: commit `4a01fcae`, 2026-07-07

## Why this matters

The PDF has two **teacher-initiated** entries (Sec 2 camp; ECG career fair) — a
teacher poses a reflective prompt and the student answers it in a capture. This
mechanic **already exists in the app**: a seed letter can carry an optional
`prompt`, and the Letters sheet renders a "Capture" button that opens the normal
`ask` capture pre-seeded with that prompt. The Sec 2 camp prompt is already
seeded. The **career-fair prompt is missing** — so half of the PDF's
teacher-initiated demo can't be reproduced. This plan closes that content gap
(one new seed letter) and corrects a stale code comment that implies the
mechanic is still unbuilt.

## Current state — the mechanic is already built

- `src/components/student-space/sheets/LettersSheet.tsx`:
  - Letter type carries `prompt?: string` (line ~40).
  - When `selected.prompt` is set, the sheet renders a **Capture** button
    (lines ~186–197) whose click calls `handleCapture(selected.prompt)`.
  - `handleCapture` (lines ~110–123) opens the capture:
    ```ts
    overlay?.open('ask', { prompt, dismissOnBack: true, letterId: selectedId })
    ```
- `src/engine/student-space/Game/Data/lettersSeed.js` — `LETTERS_SEED` array.
  The camp letter already exists **with** a prompt:
  ```js
  {
    id: 'lt_camp_reflect',
    from: 'Ms. Tan',
    subject: 'After Sec 2 camp — three moments',
    body: '…Tap Capture below when you have one…',
    sentAt: isoDaysAgo(0),
    read: false,
    prompt: 'What are three moments from Sec 2 camp that have stayed with you?',
  }
  ```
  Other letters (`lt_01`…`lt_03`) omit `prompt` (no Capture button) — that is the
  correct pattern for a letter that is just a noticing, not an assignment.
- `src/engine/student-space/Game/State/TeacherLetters.js` — the slice. Its header
  comment (line ~6) says *"v1.2 will add a 'letter response → ask capture' path;
  that lives off this"*. **This comment is stale** — `LettersSheet` already
  implements that path. (Correcting the comment is Step 3; optional but tidy.)

The voice of these letters is defined in the `lettersSeed.js` header: *"a real
Singaporean secondary-school form teacher writing to one student, intimate but
not familiar. Not a notification. Not a graded comment… Keep them short."* Match
it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 |
| Letters tests (if any) | `pnpm test -- Letters` | pass (or "no tests" — then run full) |
| Full test | `pnpm test` | all pass |

## Scope

**In scope:**
- `src/engine/student-space/Game/Data/lettersSeed.js` — add the career-fair
  letter (Step 1); optionally align the camp prompt wording (Step 2).
- `src/engine/student-space/Game/State/TeacherLetters.js` — fix the stale comment
  (Step 3, optional).

**Out of scope (do NOT touch):**
- `LettersSheet.tsx` and `OverlayController` — the mechanic works; changing it is
  out of scope. If you believe a code change is needed to make the Capture button
  appear, STOP — the only requirement is a `prompt` field on the letter.
- The `ask` capture flow / Mirror prompts — that's Plan 004.
- Any letter that intentionally has no `prompt` (`lt_01`…`lt_03`).

## Git workflow

- Branch: `advisor/002-teacher-prompt-letters`
- Commit style: conventional commits, e.g.
  `feat(letters): add ECG career-fair teacher prompt`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the career-fair teacher letter

In `LETTERS_SEED` (`lettersSeed.js`), add one object modeled exactly on
`lt_camp_reflect`. Requirements:

- `id`: `'lt_careerfair_reflect'`
- `from`: `'Ms. Tan'` (keep the single-teacher voice consistent with the file)
- `subject`: something short in Ms. Tan's register, e.g.
  `'After the career fair — what stood out'`
- `body`: 2–3 short paragraphs in the file's established voice. It must
  (a) reference the annual career fair, (b) invite three specific things that
  stood out and *why*, and (c) tell the student to tap Capture below to answer in
  the usual place. Do **not** hint at any "right" answer or nudge toward a career.
  No advice, no exclamation marks.
- `sentAt`: `isoDaysAgo(1)` (recent, but not colliding with the camp letter's
  `isoDaysAgo(0)` — keep the inbox ordering readable).
- `read`: `false`
- `prompt`: `'At the career fair, what were three things that stood out to you, and why?'`
  (This is the string that seeds the capture — mirror the PDF's teacher prompt:
  *"What were 3 things that stood out to you and why?"*.)

**Verify**:
`node -e "const s=require('fs').readFileSync('src/engine/student-space/Game/Data/lettersSeed.js','utf8'); if(!s.includes('lt_careerfair_reflect')) throw 'missing letter'; if(!/career fair/i.test(s)) throw 'no career-fair copy'; console.log('ok')"`
→ prints `ok`.

### Step 2 (optional): Align the camp prompt to the PDF wording

The PDF's camp prompt is open-ended (*"what were some of the things that stuck
with you since?"*), while the seed says *"three moments"*. If the product owner
wants the demo to match the PDF verbatim, change **only** the `prompt` value of
`lt_camp_reflect` to `'Thinking back to Sec 2 camp, what are some things that have stuck with you since?'`
Leave the `body` as-is (it already reads well). If unsure, **skip this step** —
the existing prompt is fine and this is cosmetic.

**Verify** (only if done): `pnpm check` → exit 0.

### Step 3 (optional): Correct the stale comment

In `TeacherLetters.js`, the header comment claiming the letter→capture path is a
future addition is inaccurate. Update it to reflect that `LettersSheet` already
opens an `ask` capture from a letter's `prompt`. Keep it to one line; do not
change any code.

**Verify**: `grep -n "v1.2 will add" src/engine/student-space/Game/State/TeacherLetters.js`
returns nothing (comment updated).

### Step 4: Gates

**Verify**:
- `pnpm check` → exit 0.
- `pnpm test` → all pass.

## Test plan

- No new automated test is strictly required (this is seed content). If a test
  file exercising `LETTERS_SEED` or `TeacherLetters` exists (check:
  `find test -iname '*etter*'`), add an assertion that a letter with
  `id === 'lt_careerfair_reflect'` exists and has a non-empty `prompt`, modeled
  on the nearest existing letters test. If no such test exists, do **not** create
  a new test harness for this — note it in the maintenance section instead.

## Done criteria

ALL must hold:
- [ ] `lt_careerfair_reflect` exists in `LETTERS_SEED` with a non-empty `prompt`.
- [ ] The career-fair letter follows the Ms. Tan voice (short, no advice, no "!").
- [ ] `pnpm check` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] Only in-scope files modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- `LettersSheet.tsx` does not render a Capture button off `selected.prompt`
  (mechanic drifted — the whole premise of this plan changes).
- The letter type no longer accepts a `prompt` field (schema drift).
- A test hard-codes the exact number of seed letters (adding one would break it)
  — report it; the fix is to update that count, but confirm first.

## Maintenance notes

- Teacher-initiated prompts are delivered as **letters with a `prompt`**. To add
  more, append to `LETTERS_SEED`; no code change needed.
- The link between a capture and the letter that prompted it is carried as
  `letterId` in the `ask` overlay open call — if analytics or the Library ever
  needs to show "answered from Ms. Tan's letter", that id is the hook.
- If teacher prompts should eventually be authored by real teachers (not seeded),
  that's a backend feature well beyond this plan — flag as a separate direction.
