# Plan 004: Align the live voice prompt with the Kira spec (Singlish, readback, coaching)

> **Executor instructions**: Follow step by step; verify each step. Honor STOP
> conditions. Update this plan's row in `advisor-plans/README.md` when done.
>
> **Read `advisor-plans/000-kira-spec-alignment-brief.md` first** — it explains
> why `mirror.prompt.md` (JSON mode) must NOT change and the voice rules below.
>
> **Drift check (run first)**:
> `git diff --stat 4a01fcae..HEAD -- src/agents/openai-realtime/mirror-realtime-live.prompt.md src/agents/openai-realtime/mirror-payloads.ts src/agents/mirror.prompt.md`
> If any changed, reconcile "Current state" against live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (changes live student-facing conversation behavior; hard to unit-test)
- **Depends on**: none (but 000's naming + voice decisions apply)
- **Category**: direction / agent-behavior
- **Planned at**: commit `4a01fcae`, 2026-07-07

## Why this matters

The live voice conversation already exists and is good, but it diverges from the
PDF's "Kira System Prompt Design" on four points that materially change the
student's experience:

1. **Language.** The live prompt says *"Do not switch to … Singlish"* and forces
   English. The PDF's entire voice is **Singlish-aware** — Kira must match the
   student's register and mirror particles (`lah/lor/sia/leh/ah`) and
   code-switching without correcting them. For Singapore secondary students this
   is the difference between "talking to a friend" and "talking to a form."
2. **Readback.** The PDF makes a spoken **readback-for-confirmation** the closing
   move of every entry (*"[readback] … fair?/sound right?"*), which the student
   confirms or corrects. The live prompt has no such closing move — it just lets
   the conversation "end when it ends" and defers all synthesis to a separate
   silent pass.
3. **Coaching mode.** The PDF specifies a light **GROW-style coaching mode** for
   decision entries (subject combo, CCA/NCOC): clarify the desired end-state,
   surface patterns by asking where else they've felt this, name obstacles by
   asking, end on a self-authored next step. The live prompt has no coaching mode.
4. **Teacher-initiated openers.** The PDF's teacher-initiated entries have the
   student *responding to a prompt*; Kira's first line responds to what the
   student wrote, not to the prompt. The live prompt doesn't mention this case
   (Plan 002 seeds the prompts; this plan teaches Kira how to open on them).

## Current state — the two prompt modes (do not confuse them)

`src/agents/openai-realtime/mirror-prompt.ts` builds two different instruction
strings:

- **`live_audio` mode** → `buildRealtimeMirrorLiveInstructions()` →
  `src/agents/openai-realtime/mirror-realtime-live.prompt.md`. **This is the live
  spoken conversation. It is the ONLY prompt this plan edits.**
- **`json` mode** → `buildRealtimeMirrorInstructions()` →
  `src/agents/mirror.prompt.md` + hardcoded rules including *"Do not ask
  questions"* and *"write the final Mirror JSON fields in English."* This is the
  **post-conversation structured-notes pass** (`validation`, `inferred_meaning`,
  `story_reframe`). Its "no questions / English" rules are **correct for JSON
  output** and MUST NOT be changed by this plan.

Relevant excerpts from `mirror-realtime-live.prompt.md` (the file to edit):

- Line 3 (the language contradiction):
  > *"Always respond in English. If the student speaks in English, keep every
  > spoken reply and follow-up in natural English. Do not switch to Indonesian,
  > Malay, Singlish, or any other language unless the student explicitly asks to
  > practice that language."*
- Lines 136–146 ("How a conversation moves") — ends with *"The conversation ends
  when it ends."* No readback move.
- Line 190 — *"The app will prepare structured notes separately."*

Also check the transcription-language setting in
`src/agents/openai-realtime/mirror-payloads.ts`:
`OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE`. If it is pinned to `'en'`, the
**speech-to-text** may mis-transcribe Singlish/Mandarin code-switching even after
the prompt allows it. Inspect it (Step 4) — but treat any change there as
lower-confidence and gate it behind a STOP if unclear.

## The four edits (target behavior)

Keep the file's existing structure and tone. These are additive/surgical edits,
not a rewrite.

1. **Language → register-matching.** Replace the line-3 English-only rule with the
   PDF's register rule (000 voice rule 1): *Kira matches the student's register.
   If they write in Singlish or code-switch, mirror their particles and slang
   naturally where it fits, without overdoing it or performing their voice back
   at them. Never correct, clean up, or comment on how they talk. Kira's own base
   voice stays warm, casual, and clear.* Keep the safety valve that Kira doesn't
   switch into a *different full language* the student didn't use.
2. **Add a Readback closing move.** Add a short section (after "How a conversation
   moves") defining the readback: when the student has said what they came to say,
   Kira closes with **one** short synthesis *in her own words* (not a quote-back),
   that **preserves any ambivalence/contradiction unresolved**, adds no advice or
   interpretation they didn't reach themselves, and ends with a casual check
   matched to register (*"fair?"*, *"sound right?"*, *"that about it?"*). If the
   student corrects it, fold the correction in without defensiveness. This is a
   *spoken* move; it does not replace the separate JSON notes pass.
3. **Add a Coaching-mode section.** For decision entries (subject combo, CCA/NCOC,
   "what should I do about X"): start by clarifying what the student wants to be
   true by the end (in their words); surface patterns by asking *where else*
   they've felt a similar thing (never naming the pattern first); name obstacles
   only by asking what's getting in the way; end by asking what a small concrete
   next step might be **only if the student arrives at one themselves** — never
   supply it. The readback in these entries may name a pattern explicitly, since
   by then the student has said it in their own words. Stay in voice; never become
   prescriptive.
4. **Add a teacher-prompt opener rule.** If the conversation was opened by a
   teacher prompt (the student is answering a question like "three things that
   stood out at the career fair"), Kira's first line responds to **what the
   student actually said**, not to the prompt text, and otherwise proceeds
   normally (gathering → reflecting → readback).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 |
| Prompt/agents tests | `pnpm test -- realtime` and `pnpm test -- mirror` | pass (or "no tests") |
| Full test | `pnpm test` | all pass |
| Live smoke (manual, optional) | `pnpm smoke:mirror` | completes a live turn — requires `OPENAI_API_KEY` |

Note: managed-agent re-provisioning (`pnpm provision:managed-agents`) is for
Connector/Cartographer (Claude). Mirror is OpenAI Realtime — its prompt is read
from the `.md` file at session build time (`getMirrorSystemPrompt` /
`buildRealtimeMirrorLiveInstructions`), so **no re-provision step is needed**;
the file edit takes effect on the next session. Confirm by reading
`mirror-prompt.ts` (it `readFileSync`s the prompt).

## Scope

**In scope:**
- `src/agents/openai-realtime/mirror-realtime-live.prompt.md` — the four edits.
- `src/agents/openai-realtime/mirror-payloads.ts` — **only** the transcription
  language setting, and **only** if Step 4 concludes it blocks Singlish and the
  change is safe. Otherwise leave untouched.

**Out of scope (do NOT touch):**
- `src/agents/mirror.prompt.md` — the JSON structured-output prompt. Its
  "no questions" / "English fields" rules are correct; changing them is a bug.
  (The **stored notes stay English**; only the *spoken conversation* becomes
  register-matching.)
- `buildRealtimeMirrorInstructions` (json mode) and its hardcoded rules.
- Connector / Cartographer prompts (their second-person English page voice is a
  separate concern; not part of this plan).
- Any transcription **model** change (only the language field is in question).

## Git workflow

- Branch: `advisor/004-kira-live-prompt`
- Commit style: conventional commits, e.g.
  `feat(agents): Singlish-aware live prompt + readback + coaching mode`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Replace the English-only rule with register-matching

Edit line ~3 of `mirror-realtime-live.prompt.md` per edit (1) above. Keep it to a
short paragraph. Do not delete the "don't switch into an unrelated full language"
safety.

**Verify**: `grep -n "Do not switch to" src/agents/openai-realtime/mirror-realtime-live.prompt.md`
returns nothing (the blanket ban is gone), **and**
`grep -ni "singlish\|register\|lah" src/agents/openai-realtime/mirror-realtime-live.prompt.md`
returns the new register rule.

### Step 2: Add the Readback section

Insert a `## Readback` (or `## Closing the entry`) section after the "How a
conversation moves" section, per edit (2). Keep the existing "conversation ends
when it ends" spirit — the readback is the move Kira makes *as* it ends, not a
forced extra turn for every one-line entry (000 rule 8: a two-line entry is
complete — a light "that about it?" is a valid readback).

**Verify**: `grep -ni "readback\|fair?\|sound right" src/agents/openai-realtime/mirror-realtime-live.prompt.md`
returns the new section.

### Step 3: Add Coaching-mode + teacher-prompt-opener sections

Add per edits (3) and (4). Coaching mode is a *variant*, not the default — it
should say it applies to decision/what-should-I-do entries and otherwise Kira
stays in the normal gathering/reflecting flow.

**Verify**: `grep -ni "coaching\|next step\|teacher" src/agents/openai-realtime/mirror-realtime-live.prompt.md`
returns the new sections.

### Step 4: Inspect (do not blindly change) the transcription language

Read `OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE` in `mirror-payloads.ts`.
- If it is unset / `undefined` / auto-detect: no change needed — note it.
- If it is pinned (e.g. `'en'`): changing it to allow auto-detection *may* improve
  Singlish/Mandarin transcription, but it can also regress accuracy for
  predominantly-English speech and there may be a test asserting the value. **Do
  not change it in this plan** unless a test or reviewer confirms it's safe —
  instead record a one-line follow-up in the maintenance section. Prompt-level
  register-matching (Steps 1–3) is the primary, safe win; transcription-language
  is a separate experiment.

**Verify**: state in your status update which branch of Step 4 applied.

### Step 5: Gates

**Verify**:
- `pnpm check` → exit 0.
- `pnpm test -- realtime` and `pnpm test -- mirror` → pass (or report "no tests
  matched", then rely on `pnpm test`).
- `pnpm test` → all pass. If a test asserts the old English-only line verbatim,
  update that assertion to the new rule (it's testing prompt content, not
  behavior) — but if a test asserts *JSON-mode* English, that's the wrong file;
  do not touch it (STOP).

## Test plan

- Prompt content is not deeply unit-testable. The gates are: `pnpm check`, the
  existing realtime/mirror tests still pass, and the grep-based presence checks in
  Steps 1–3.
- **Manual acceptance (recommended, not blocking):** run `pnpm smoke:mirror` (needs
  `OPENAI_API_KEY`) and confirm, against the PDF transcripts, that: Kira mirrors
  Singlish naturally, asks one concrete question per turn, and closes with a
  readback that ends in a casual check. Record the observation in the PR.

## Done criteria

ALL must hold:
- [ ] The blanket "Do not switch to Singlish" ban is removed and replaced with a
      register-matching rule.
- [ ] A Readback closing section exists (spoken synthesis + casual check).
- [ ] Coaching-mode and teacher-prompt-opener sections exist.
- [ ] `src/agents/mirror.prompt.md` is **unchanged** (`git status`).
- [ ] `pnpm check` exits 0; `pnpm test` exits 0.
- [ ] Only in-scope files modified.
- [ ] `advisor-plans/README.md` status row updated, noting the Step 4 branch taken.

## STOP conditions

Stop and report if:
- You cannot find `buildRealtimeMirrorLiveInstructions` reading
  `mirror-realtime-live.prompt.md` (the wiring changed — the edit may not take
  effect).
- A test asserts the JSON-mode "no questions" / English-fields rules and appears
  to require editing `mirror.prompt.md` — that's out of scope; the stored notes
  stay English.
- Changing the transcription language is the only way to pass an acceptance check
  — that's a separate experiment; report rather than force it.
- The readback risks becoming a mandatory extra turn that would violate "a
  two-line entry is complete" — rewrite it as the closing *move*, not a required
  step.

## Maintenance notes

- The **spoken** conversation is now register-matching, but the **stored** VIPS
  notes remain English (JSON mode unchanged). Keep that split: it's intentional —
  Singlish rapport in the room, clean English on the wiki pages.
- Follow-up (deferred): evaluate auto-detect transcription language for
  code-switched speech (`mirror-payloads.ts`) as a measured experiment with a
  before/after on transcription accuracy.
- If Connector/Cartographer page voice is later reviewed for the same Singlish
  question, note that those are *written wiki pages* the student re-reads — clean
  second-person English is the current, deliberate choice (see their prompts).
- Reviewers should read the diff against the PDF's "Kira System Prompt Design"
  sections 2–7 to confirm nothing prescriptive or clinical slipped in.
