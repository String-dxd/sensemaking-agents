# Plan 001: Seed the Ming Liang demo corpus into the multi-student fixture

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `advisor-plans/README.md`.
>
> **Read `advisor-plans/000-kira-spec-alignment-brief.md` first** — it defines
> the `[feeds]`→VIPS mapping and voice rules this plan depends on.
>
> **Drift check (run first)**:
> `git diff --stat 4a01fcae..HEAD -- test/ablation/fixtures/seed-multistudent.json src/db/seed.ts test/db.test.ts`
> If any of these changed since `4a01fcae`, compare the "Current state" excerpts
> against live code before proceeding; on a mismatch, treat it as a STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (read 000 brief)
- **Category**: direction / content
- **Planned at**: commit `4a01fcae`, 2026-07-07

## Why this matters

The design PDF is worked entirely through one student, **Ming Liang (Sec 2)** —
9 hand-authored Singlish transcripts that demonstrate the exact conversational
quality and content coverage the product is aiming for (St John's Brigade, a
failed first-aid badge, an NCOC decision, a career fair, a Beyblade SIL project,
and a coaching-tone subject-combo conversation that connects the dots across
prior entries). The repo's demo corpus (`seed-multistudent.json`) has four other
students but **not** Ming Liang. Seeding him makes the canonical demo narrative
runnable end-to-end — Library, VIPS pages, and Trajectory all populate from the
same story the PDF tells — which is the fastest way to see whether the rest of
the alignment work (onboarding, agent prompt) actually lands.

## Current state

- `test/ablation/fixtures/seed-multistudent.json` — the demo corpus. Top-level
  `{ description, students: SeedStudent[] }`. Currently **4 students**
  (`demo-a`…`demo-d`) with 7–9 reflections each.
- `src/db/seed.ts` — loads that JSON (`SEED_PATH`, line ~117), inserts per
  student through the `withStudent` RLS envelope. Idempotent per student (skips a
  student who already has `mirror_entries`). Interfaces at lines 40–115:

  ```ts
  // src/db/seed.ts:40
  export interface SeedReflectionFixture {
    context_type: VipsContextType            // 'school'|'family'|'peer'|'hobby'|'civic'
    transcript: string
    validation?: string
    inferred_meaning?: string
    story_reframe?: string
    review_status?: SeedMirrorReviewStatus   // 'pending'|'confirmed'|'forgotten'
    created_at: string                       // ISO
  }
  export interface SeedStudentProfile {
    name_handle: string
    year_level: string
    school_type: 'IP' | 'JC' | 'sec' | 'poly'
    values_dominance: string[]               // canonical values.* ids
    riasec_tilt: string[]                    // canonical interests.* ids
    skills_evident: string[]                 // canonical skills.* ids
    notes_for_review: string
  }
  export interface SeedStudent {
    student_id: string
    profile: SeedStudentProfile
    coverage_matrix?: string                 // human-readable, self-describing
    reflections: SeedReflectionFixture[]
    // demo-a also carries optional vips_pages / vips_timeline_entries /
    // trajectory — these are OPTIONAL and demo-b..d omit them. This plan omits
    // them too (Connector/Cartographer generate them at runtime).
  }
  ```

- **Shape of an existing reflection** (model yours on this — `demo-a`, reflection 1):

  ```json
  {
    "context_type": "school",
    "transcript": "Today during CCE Ms Norhayati paired me with Daryl ...",
    "validation": "...",
    "inferred_meaning": "...",
    "story_reframe": "...",
    "review_status": "confirmed",
    "created_at": "2026-01-14T09:20:00.000Z"
  }
  ```

- **Load-bearing test** — `test/db.test.ts` (the `seed loader` describe, lines
  ~161–190), skipped unless `DATABASE_URL` is set:

  ```ts
  expect(result.studentsSeeded.length).toBeGreaterThanOrEqual(3)
  expect(result.studentsSeeded.length).toBeLessThanOrEqual(5)   // ← ceiling
  // each seeded student:
  expect(rows.length).toBeGreaterThanOrEqual(6)                 // ≥6 mirror_entries
  expect(contextTypes.size).toBeGreaterThanOrEqual(3)           // ≥3 context types
  ```

  Currently 4 students. Adding Ming Liang → **5**, which still satisfies `<= 5`
  but leaves **zero headroom**. This plan bumps the ceiling to 6 (Step 3) so the
  next content addition doesn't fail this assertion.

### `context_type` mapping for the 9 PDF transcripts

The enum is `school | family | peer | hobby | civic`. St John's Brigade is a CCA
→ `civic`. Map the PDF's 9 entries as follows (gives 4 distinct types, ≥3 ✓):

| # | PDF entry | `context_type` | initiation |
|---|---|---|---|
| 1 | Foot drills frustration | `civic` | self |
| 2 | CPR training / grandfather | `civic` | self |
| 3 | Failing the Standard First Aid badge | `civic` | self |
| 4 | NCOC decision | `civic` | self |
| 5 | Walkathon planning + crush | `peer` | self |
| 6 | Sec 2 camp (Joseph's ankle) | `school` | teacher |
| 7 | ECG career fair | `school` | teacher |
| 8 | Beyblade + SIL project | `hobby` | self |
| 9 | Subject-combination decision | `school` | self |

(Teacher-initiated entries 6 & 7 are seeded here as plain reflections; the
*teacher-prompt opener mechanic* is Plan 002. The transcript text for 6 & 7 may
retain the student's spoken content; do not prepend the teacher prompt into the
`transcript` field — keep `transcript` as the student's words only, matching how
existing fixtures store student speech.)

### Ming Liang's profile (from the PDF "Who is this student?" + DGE profile)

```json
"profile": {
  "name_handle": "Ming Liang (Sec 2)",
  "year_level": "Sec 2",
  "school_type": "sec",
  "values_dominance": ["values.contribution", "values.learning"],
  "riasec_tilt": ["interests.investigative", "interests.realistic"],
  "skills_evident": ["skills.practical", "skills.analytical"],
  "notes_for_review": "Bubbly, curious, slow to open up to strangers, warm with friends. Working-class family (dad drives Grab, mum does catering). Physics clicks because Ms Lim ties it to real demos — the 'oh that's why' feeling. St John's Brigade reluctantly; resents foot drills, proud of CPR (thinks of his grandfather). Coming off a failed Standard First Aid badge (froze in the CPR scenario) which dented his usual composure under pressure. Open threads: NCOC (leaning on whether friend Jaya signs up), a Beyblade SIL project his form teacher Mr Lim encouraged, a crush from another school met via walkathon planning, and the JC-vs-poly / subject-combo decision. Emerging pattern: drawn to hands-on learning and to understanding how things work under the surface — points toward sports-science / physio / rehab, though he hasn't named it. The negative entry (badge failure) must stay ungeneralized: he's disappointed, not defeated."
}
```

Choose the canonical ids above from `src/data/vips-taxonomy.ts` — they already
exist; do not invent new ones. (`values.contribution`, `values.learning`,
`interests.investigative`, `interests.realistic`, `skills.practical`,
`skills.analytical` are all present — verify in Step 1.)

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Validate JSON parses | `node -e "JSON.parse(require('fs').readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); console.log('ok')"` | prints `ok` |
| Typecheck + lint | `pnpm check` | exit 0 |
| Seed-loader test | `pnpm test -- test/db.test.ts` | all pass (or skipped if no `DATABASE_URL` — see STOP) |
| Full test | `pnpm test` | all pass |

## Scope

**In scope:**
- `test/ablation/fixtures/seed-multistudent.json` — add the `demo-ming` student.
- `test/db.test.ts` — bump the `<= 5` ceiling to `<= 6` (one line).

**Out of scope (do NOT touch):**
- `src/db/seed.ts` — the loader already handles N students generically; no code
  change needed. If you think it does, STOP.
- `src/agents/*`, `src/data/vips-taxonomy.ts` — no taxonomy changes (see 000
  Decision 2). Reuse existing canonical ids only.
- The other four students' records.
- `test/ablation/fixtures/_archive/*`.

## Git workflow

- Branch: `advisor/001-seed-ming-liang`
- Commit style: conventional commits (repo uses e.g.
  `feat(island-editor): …`, `fix(...)`). Use `feat(seed): add Ming Liang demo corpus`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the canonical ids exist

Run:
`grep -oE "(values|interests|personality|skills)\.[a-z]+" src/data/vips-taxonomy.ts | sort -u`

Confirm the six ids in the profile above all appear. If any is missing, STOP —
do not substitute a different id without confirming the mapping.

**Verify**: all of `values.contribution`, `values.learning`,
`interests.investigative`, `interests.realistic`, `skills.practical`,
`skills.analytical` are present in the output.

### Step 2: Add the `demo-ming` student to the fixture

Append a fifth object to the `students` array in
`test/ablation/fixtures/seed-multistudent.json`. Use:

- `student_id`: `"demo-ming"`
- `profile`: the JSON block from "Current state" above.
- `coverage_matrix`: a human-readable string in the same style as `demo-a`'s,
  e.g. `"context_type coverage for demo-ming: civic (r1, r2, r3, r4), peer (r5), school (r6, r7, r9), hobby (r8). 4 of 5 enum values; ≥3 satisfied. Affect spread: positive (r2, r5, r7, r8), ordinary (r1, r6, r9), negative (r3, r4)."`
- `reflections`: **9** entries, one per PDF transcript, in the table order.
  For each entry:
  - `context_type` per the mapping table.
  - `transcript`: the **student's spoken words** from the PDF, in Singlish, kept
    verbatim to the transcript's student lines (concatenate the student's turns
    into a natural monologue; do NOT include "Kira:" lines or the `[readback]`).
    Keep the Singlish exactly — `lah/lor/sia/leh`, lowercase, fragments. Do not
    clean it up (000 voice rule 1).
  - `validation`, `inferred_meaning`, `story_reframe`: author these in **Mirror's
    voice** per `src/agents/mirror.prompt.md` — second person ("you …"), plain,
    non-diagnostic, no advice. `story_reframe` is a 3–5 sentence second-person
    retelling. Use the PDF's `[readback]` as raw material but rewrite in Mirror's
    register, not verbatim.
  - `review_status`: `"confirmed"` for entries 1–8, `"pending"` for entry 9 (the
    subject-combo conversation is the most recent — leaving it pending
    demonstrates the `Need review` filter on a realistic latest entry).
  - `created_at`: spread across the school year so ordering reads naturally, e.g.
    r1 `2026-01`, r5 (Feb, walkathon per PDF), r6 (post-camp), r7 (April, career
    fair per PDF), r9 (Sep, subject combo per PDF). Use ISO 8601 with a Singapore
    daytime hour (e.g. `T15:30:00.000Z`). Keep them strictly increasing r1→r9.

**Verify**:
`node -e "const d=JSON.parse(require('fs').readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); const m=d.students.find(s=>s.student_id==='demo-ming'); if(!m) throw 'missing'; if(m.reflections.length!==9) throw 'want 9 got '+m.reflections.length; const cts=new Set(m.reflections.map(r=>r.context_type)); if(cts.size<3) throw 'need >=3 context types'; console.log('ok', [...cts].join(','))"`
→ prints `ok civic,peer,school,hobby` (order may vary).

### Step 3: Raise the seed-count ceiling in the test

In `test/db.test.ts`, find:
`expect(result.studentsSeeded.length).toBeLessThanOrEqual(5)`
and change `5` → `6`. (The lower bound and per-student assertions stay as-is.)

**Verify**: `grep -n "toBeLessThanOrEqual(6)" test/db.test.ts` returns one line.

### Step 4: Validate and run gates

**Verify**:
- `pnpm check` → exit 0.
- `pnpm test -- test/db.test.ts` → passes. If it prints that the `seed loader`
  describe was **skipped** (no `DATABASE_URL`), that is expected locally — record
  it and move on; the JSON validity + count checks in Steps 2–3 are the binding
  gates in that case.
- `pnpm test` → all pass.

## Test plan

- No new test file. This plan extends fixture data covered by the existing
  `seed loader` describe in `test/db.test.ts` and bumps its ceiling.
- If `DATABASE_URL` is available in the executor environment, the seed-loader
  test exercises the new student automatically (asserts ≥6 entries, ≥3 context
  types — Ming Liang has 9 entries / 4 types).
- Model the fixture record structurally on the existing `demo-a` entry.

## Done criteria

ALL must hold:
- [ ] `demo-ming` exists in `seed-multistudent.json` with exactly 9 reflections.
- [ ] Its reflections span ≥3 `context_type` values (Step 2 verify prints ok).
- [ ] Every `canonical` id used in the profile exists in `src/data/vips-taxonomy.ts`.
- [ ] `test/db.test.ts` ceiling is `<= 6`.
- [ ] `pnpm check` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] Only the two in-scope files are modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:
- The fixture's top-level shape is not `{ description, students: [...] }`, or
  `SeedStudent`/`SeedReflectionFixture` in `src/db/seed.ts` differs from the
  excerpt (drift).
- Any of the six canonical ids in the profile is absent from the taxonomy —
  report which, and propose the nearest existing id; do not invent one.
- `test/db.test.ts` no longer contains the `toBeLessThanOrEqual(5)` assertion
  (someone already changed it — reconcile rather than guessing).
- `src/db/seed.ts` appears to require a code change to load a 5th student.
- Mapping a transcript to the `context_type` enum forces you outside
  `school|family|peer|hobby|civic` — report it.

## Maintenance notes

- If a later plan adds a 6th seed student, the ceiling (now 6) must be bumped
  again — or converted to a computed bound.
- `values_dominance`/`riasec_tilt`/`skills_evident` are authoring hints for
  reviewers; they do **not** by themselves create VIPS timeline entries. Those
  come from running Connector over the reflections. If a reviewer expects Ming
  Liang's VIPS pages to be populated immediately after `pnpm seed`, note that
  Connector must run (Library `Run Connector` or the scheduled pass) first —
  unless a future plan chooses to seed `vips_pages`/`vips_timeline_entries`
  directly the way `demo-a` does.
- The teacher-initiated framing of entries 6 & 7 is content-only here; the
  interactive teacher-prompt opener is Plan 002.
