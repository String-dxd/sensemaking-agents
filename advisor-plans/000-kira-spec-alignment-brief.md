# Plan 000: Kira Spec Alignment — Reference Brief (read first)

> **This is a reference document, not an executable plan.** Plans 001–004 cite
> it for shared decisions and vocabulary. Read it before executing any of them.
> It contains no code changes of its own.

## The source of truth

A design PDF — *"MyWorld Demo Transcripts"* — specifies the intended behavior of
**Kira**, a conversational journaling companion for Singapore secondary-school
students. It is worked through one example student, **Ming Liang (Sec 2)**, with:

- **9 demo transcripts** — realistic Singlish journal conversations, each ending
  in a spoken `[readback]` and tagged `[feeds: …]`.
- **3-screen voice-first onboarding copy** (narrated by "Mei").
- **A full "Kira System Prompt Design"** — identity, non-negotiables, a 3-phase
  conversational arc (Open → Elaborate → Readback), question-design rules, a
  coaching mode, and voice calibration.

The repo already implements most of the *machinery* (a conversational live voice
prompt, a VIPS pipeline, a seed corpus, an onboarding ceremony). The work is
**alignment**, not new architecture.

## How the current code maps to the spec

| Spec concept | Current implementation | Gap |
|---|---|---|
| Conversational capture (Open/Elaborate) | `src/agents/openai-realtime/mirror-realtime-live.prompt.md` (`live_audio` mode) — already has gathering/reflecting modes and ask/reflect/surface moves | Bans Singlish; no explicit readback-for-confirmation; no coaching mode; no teacher-prompt opener |
| Structured notes after the conversation | `src/agents/mirror.prompt.md` (`json` mode) → `validation`, `inferred_meaning`, `story_reframe` | This is a *separate pass*; its "no questions" rule is correct for JSON mode and must stay |
| `[feeds: …]` → student profile | Connector (`src/agents/connector.prompt.md`) writes VIPS pages; taxonomy in `src/data/vips-taxonomy.ts` / `docs/vips-taxonomy.md` | Feed tags are a superset of VIPS — see mapping below |
| Demo content | `test/ablation/fixtures/seed-multistudent.json` (4 students) + `src/db/seed.ts` | No Ming Liang; no teacher-initiated entries |
| Onboarding | `src/components/student-space/onboarding/*` + `src/engine/student-space/Game/View/Onboarding/copy.js` | Egg/bird-hatching ceremony, longer copy — not the PDF's tight 3 screens |

**Key correction to a common misreading:** `mirror.prompt.md` says *"No questions.
You are not interviewing. The session is over."* That is **not** the live
conversation prompt — it governs the post-hoc JSON structured-output pass
(`buildRealtimeMirrorInstructions` in `src/agents/openai-realtime/mirror-prompt.ts`).
The live conversation runs on `mirror-realtime-live.prompt.md`
(`buildRealtimeMirrorLiveInstructions`). Do not "fix" the JSON prompt to allow
questions — the two modes are intentionally different.

## Decision 1 — Canonical naming (affects 003, 004)

The spec uses **Kira** (companion in conversation) and **Mei** (onboarding
narrator voice). The code uses **Mirror** (agent id, internal), a
**user-named bird** companion (onboarding), and the engine view object is called
`kira`. "Mei" also appears as an offline demo *student* name
(`OFFLINE_DEMO_STUDENTS`), which collides with using "Mei" as the narrator.

**Recommended decision (used as the default in 003/004):**
- Keep **Mirror** as the internal agent id and file names (no code-wide rename —
  high churn, low value). This is engineering vocabulary the student never sees.
- The **student-facing companion is the user-named bird** (unchanged). The PDF's
  "Kira"/"Mei" are placeholder names for that same companion; do not hardcode
  "Kira" or "Mei" into student-facing copy where a companion name variable
  already exists (`{companionName}`).
- Where onboarding narrates *before* the companion is named, use neutral copy
  (no proper name), OR the companion's chosen name if already picked.
- **Do not** introduce "Mei" as a narrator name — it collides with the demo
  student. If a pre-naming narrator name is wanted, raise it as an open question
  rather than shipping the collision.

If the product owner wants a hard rename to "Kira" as the product-facing name,
that is a separate, larger plan — flag it, don't fold it in.

## Decision 2 — `[feeds]` tags vs the VIPS taxonomy (affects 001, 002)

The PDF tags entries with: **values, personality, relationships, strengths,
identity, interests, choices**. The runtime taxonomy (`src/data/vips-taxonomy.ts`)
has four dimensions: **values, interests, personality, skills**. Mapping:

| PDF feed tag | Maps to | Notes |
|---|---|---|
| `values` | `values.*` | direct |
| `interests` | `interests.*` (RIASEC) | direct |
| `personality` | `personality.*` (Extraversion/Neuroticism, behavior-shape) | direct |
| `strengths` | `skills.*` | "strengths" ≈ competencies-practiced |
| `relationships` | `values.relationships` **and/or** context/parallax tag | there is a *Value* `values.relationships`; relationships-as-a-theme is also captured via `context_type: peer/family` |
| `identity` | `personality.*` rendered as behavior-shape + Cartographer trajectory | not a separate stored dimension |
| `choices` | Cartographer pathways / Trajectory | decision-making surfaces in Trajectory, not a VIPS page |

**Recommended decision:** do **not** extend the runtime taxonomy. The seven feed
tags are all expressible through the existing four VIPS dimensions plus the
`context_type` enum (`school/family/peer/hobby/civic`) and the Trajectory page.
The `[feeds]` tags in the PDF are an *authoring* vocabulary, not a storage schema.
Seed fixtures therefore use the existing `context_type` enum and
`canonical_claim_id` values — never the raw feed words.

## Voice rules distilled from the PDF (for 001, 003, 004)

Used verbatim as authoring constraints in the plans below:

1. **Match the student's register.** Mirror their code-switching and Singlish
   particles (`lah, lor, sia, leh, ah`) where natural. Never correct, clean up,
   or comment on slang.
2. **Kira's own voice** stays warm, casual, grammatically clean — contractions
   throughout, never stiff, bureaucratic, or scripted.
3. **No clinical / therapist phrasing.** Banned: "how did that make you feel",
   "I hear that you're feeling", "it sounds like you're struggling with".
4. **No advice, no solutions, no moralizing.** Help the student *articulate and
   notice*, not fix.
5. **No filler validation** ("that's totally valid", "you're right to feel that
   way", "that's really interesting"). Acknowledge through specific, grounded
   reflection instead.
6. **One question per turn**, concrete over abstract, anchored to a person /
   place / object / activity the student already named.
7. **Readback** closes an entry: a short synthesis *in Kira's own words* (not a
   quote-back), preserving any ambivalence/contradiction unresolved, ending with
   a casual check matched to register ("fair?", "sound right?").
8. **Short entries are complete entries.** Never imply a two-line entry was done
   wrong.

## Commands (verified during recon, apply to all plans)

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 (Biome + `tsc --noEmit`) |
| Tests (one-shot) | `pnpm test` | all pass |
| Filtered test | `pnpm test -- <path-or-name>` | target passes |
| DB migrate (local) | `pnpm db:migrate` | exit 0 |
| Seed | `pnpm seed` | seeds demo corpus |
| Re-provision managed agents (after prompt/model edits) | `pnpm provision:managed-agents -- --update-existing connector,cartographer` | exit 0 |

Note: `pnpm check` does **not** cover the `island-editor` workspace; none of
these plans touch it, so that's irrelevant here.

## Planned-at commit

All plans in this suite were written against commit `4a01fcae`.
