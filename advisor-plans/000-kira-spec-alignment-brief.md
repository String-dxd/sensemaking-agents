# Plan 000: Kira Spec Alignment — Reference Brief (read first)

> **This is a reference document, not an executable plan.** Plans 001–005 cite
> it for shared decisions and vocabulary. Read it before executing any of them.
> It contains no code changes of its own.
>
> **Revised 2026-07-13** against the imported canonical spec
> (`advisor-plans/context/myworld-demo-transcripts.md`) and new maintainer
> decisions. The original brief was written from a PDF digest at `4a01fcae`.

## The source of truth

The *"MyWorld Demo Transcripts"* design spec now lives **in-repo, verbatim**:
`advisor-plans/context/myworld-demo-transcripts.md`. Cite it directly — do not
work from this brief's summaries when the spec has the actual text. It
contains, worked through one example student, **Alice (Sec 2)**:

- **9 demo transcripts** (`## 1.`–`## 9.`) — Singlish journal conversations,
  each with an emotional label, a `[readback]` close, and `[feeds: …]` tags.
- **`# Onboarding dialogue`** — the 3-screen script the bird speaks.
- **`# Prompt Design v2`** — a full Kira system-prompt design that **bans**
  the `[readback]` framing and long summaries (supersedes the "Original
  Draft" section that follows it, which the old Plan 004 was built on).
- **`# Pathway Explorer`** — Part A through-line, Part B five pathway
  profiles (trait combinations, ECG region tags, CCA anchors, risks), Part C
  CCA→PSEI map, Part D the 9-moments→VIPS table.
- **`# Scratchpad`** — the DGE student profile + milestone checklist.

The repo implements most of the *machinery*; the work is **alignment**.

## How the current code maps to the spec

| Spec concept | Current implementation | Gap |
|---|---|---|
| Conversational capture | `src/agents/openai-realtime/mirror-realtime-live.prompt.md` (live_audio) | Prompt Design v2 divergences (short turns, no readback framing, Singlish register) — needs a re-planned 004 |
| Structured notes pass | `src/agents/mirror.prompt.md` (json mode) | Correct as-is; its "no questions" rule governs the post-hoc pass only — do not "fix" it |
| Demo content | `test/ablation/fixtures/seed-multistudent.json` + `src/db/seed.ts`; demo signs in as `demo-a` (`src/auth/demo.ts:4`) | `demo-a` is a different student; no moods seeded; trajectory is not the spec's — **Plan 001** |
| Onboarding script | `src/engine/student-space/Game/View/Onboarding/copy.js` + narrator beats in `FirstChat.tsx` | Copy ≠ the spec's 3 screens — **Plan 003** |
| Teacher-initiated prompts | Letters → `ask` capture (mechanic exists) | Content only — **Plan 002** |
| Pathway evidence ("traceable to a recorded moment") | `timeline_entry_id` chain exists in DB; UI drops it | **Plan 005** |

## Decision 1 — Naming (REVISED 2026-07-13; affects 003, 004)

Maintainer decision: **the student is Alice; "Alice" is the bird's default
name — kept editable; "Kira" in the spec's transcripts is likewise a stand-in
for the companion name.**

- Keep **Mirror** as the internal agent id (engineering vocabulary, unseen).
- The companion stays **user-named** via the egg-name step; the input is
  **pre-filled with "Alice"** (Plan 003) so the demo matches the spec's script
  without hardcoding.
- All student-facing copy keeps `{companionName}` — never a literal "Alice" or
  "Kira".
- The old collision concern (demo student named "Alice") dissolves with Plan
  001: `demo-a` becomes Alice.

## Decision 2 — `[feeds]` tags vs the VIPS taxonomy (unchanged; affects 001, 002)

The spec tags entries with: values, personality, relationships, strengths,
identity, interests, choices. The runtime taxonomy
(`src/data/vips-taxonomy.ts`) has four dimensions. Mapping:

| Spec feed tag | Maps to |
|---|---|
| `values` | `values.*` |
| `interests` | `interests.*` (RIASEC) |
| `strengths` | `skills.*` |
| `personality` | `personality.*` (extraversion / neuroticism only) |
| `relationships` | `values.relationships` and/or `context_type: peer/family` |
| `identity` | `personality.*` + the Trajectory through-line |
| `choices` | Cartographer pathways / Trajectory |

Do **not** extend the taxonomy. `[feeds]` is an authoring vocabulary; seed
fixtures use canonical ids + the `context_type` enum only.

## Decision 3 — The demo student IS Alice (new; affects 001)

Keep the student id **`demo-a`** and replace its content (profile, 9 mirrors,
VIPS pages, timeline, trajectory). No auth changes; existing demo cookies keep
working; `demo-b`…`d` stay as background corpus (seed-loader test needs ≥3
students). Do not add a 5th student for this (that was v1 of Plan 001,
superseded).

## Decision 4 — Seeded moods + date compression (new; affects 001)

- **Moods**: History's calendar derives mood shapes from `mood:<emotion>` tags
  on mirror entries (`src/server/mood-tags.ts`); the seed never wrote them, so
  seeded students show no moods. Plan 001 adds a `mood` field to the seed
  fixture + tag write. Valid ids come from `MoodSchema`
  (`src/agents/tools/schemas.ts:172`). **Never seed
  `embarrassed`/`embarrassment`** — the schema and the shape registry
  (`src/lib/student-space/mood-shapes.ts`) disagree on that id.
- **Dates**: the spec's timeline (Jan → Sep) is compressed to Jan → the
  current week so the History calendar opens non-empty and the newest entry
  (subject-combo, `pending`) demos the Need-review filter. Fixture dates are
  fixed ISO strings and will age — refresh the tail dates when the demo
  staleness shows.

## Voice rules distilled from the spec (for 001, 003, 004)

1. **Match the student's register.** Keep Singlish exactly
   (`lah, lor, sia, leh, ah`), lowercase, fragments. Never correct or clean up.
2. **The bird's voice** is warm, casual, quick — never stiff, moralizing, or
   scripted. (Prompt Design v2 tightens this further: 5–20 word turns, one
   question per turn, no "fair?" closers — that's Plan 004-replan territory.)
3. **No clinical/therapist phrasing**; no advice; no filler validation.
4. **Short entries are complete entries.**
5. Repo copy constraints still bind onboarding strings (`copy.js` header):
   no exclamation marks, no emoji, ≤ ~80 chars per line — the spec's `!`/`:)`
   are dropped at authoring time.

## Commands (verified; apply to all plans)

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 (Biome + `tsc --noEmit`) |
| Tests (one-shot) | `pnpm test` | all pass |
| Filtered test | `pnpm test -- <path-or-name>` | target passes |
| DB migrate (local) | `pnpm db:migrate` | exit 0 |
| Seed | `pnpm seed` | seeds demo corpus |
| Re-seed one student | `SEED_REPLACE_EXISTING=1 SEED_STUDENT_IDS=demo-a pnpm seed` | wipes + reseeds demo-a |
| Re-provision managed agents (after prompt edits) | `pnpm provision:managed-agents -- --update-existing connector,cartographer` | exit 0 |

`pnpm check` does not cover `island-editor/`; none of these plans touch it.

## Planned-at commits

- 000 (this revision), 001 v2, 003 v2, 005: `0e4122b6`, 2026-07-13.
- 002, 004: `4a01fcae`, 2026-07-07 (004 additionally flagged stale — see its
  banner and the README).
