# Plan 001 (v3): Refactor the demo corpus — `demo-a` becomes Alice

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `advisor-plans/README.md`.
>
> **Read first**: `advisor-plans/000-kira-spec-alignment-brief.md` (decisions +
> voice rules). The canonical spec is
> `advisor-plans/context/myworld-demo-transcripts.md`; all fixture content you
> need is already authored in **Appendix A** below — paste it, do not re-author.
>
> **Drift check (run first)**:
> `git diff --stat 0e4122b6..HEAD -- test/ablation/fixtures/seed-multistudent.json src/db/seed.ts src/server/load-vips-pages.handler.server.ts test/server/load-vips-pages-world.test.ts test/db.test.ts`
> If any of these changed since `0e4122b6`, compare the "Current state"
> excerpts below against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M (content is pre-authored in Appendix A; two small code edits + one test update)
- **Risk**: LOW–MED
- **Depends on**: none
- **Category**: direction / content
- **Planned at**: commit `0e4122b6`, 2026-07-13 (v3 — deepened after cold-read review)
- **Supersedes**: v1 (added Alice as a 5th student) and v2 (left content
  authoring to the executor). Content now inlined.

## Why this matters

"Use a demo account" signs the user in as **`demo-a`**
(`DEFAULT_DEMO_STUDENT_ID`, `src/auth/demo.ts:4`). Everything the demo shows —
History calendar, day cards, mirror detail pages, VIPS pages, Trajectory — is
seeded from `demo-a`'s block in `test/ablation/fixtures/seed-multistudent.json`.
That block currently holds a different student ("Alice, Sec 4"). The canonical
design spec works the entire product narrative through **Alice (Sec 2)**:
9 Singlish transcripts, a 9-moments→VIPS mapping, and a full Pathway Explorer.
This plan replaces `demo-a`'s content with Alice's so the demo tells the
spec's story end-to-end, and adds the one capability the seed path is missing:
**seeded moods** (today the History calendar shows zero mood shapes for seeded
students, because moods derive from `mood:*` tags that only the runtime submit
path writes).

**Identity decision (000, Decision 3):** keep the student id `demo-a`, replace
its *content*. No auth code changes; existing demo cookies keep working. Do
NOT rename the id. `demo-b`/`c`/`d` stay untouched (the seed-loader test
requires ≥3 students).

## Current state (verified at `0e4122b6`)

### The fixture

`test/ablation/fixtures/seed-multistudent.json` — top-level
`{ description, students: SeedStudent[] }`, 4 students `demo-a`…`demo-d`.
`demo-a` currently: profile `"Alice (Sec 4, NA)"`, 8 reflections (all May 2026,
all `confirmed`), 4 curated `vips_pages`, 15 `vips_timeline_entries` (with
`key` fields like `values-contribution-buddy-reading`), and one `trajectory`
block (3 pathways). `demo-b`/`c`/`d` have reflections only.
`loadSeedCorpus` (`src/db/seed.ts:119–122`) is a plain
`JSON.parse(...) as MultiStudentSeedCorpus` — no zod; a new `mood` field is
not rejected at parse time.

### The seed loader — `src/db/seed.ts`

Fixture interfaces at lines 41–110. The reflection shape has **no mood field**:

```ts
// src/db/seed.ts:41
export interface SeedReflectionFixture {
  context_type: VipsContextType   // 'school'|'family'|'peer'|'hobby'|'civic'
  transcript: string
  validation?: string
  inferred_meaning?: string
  story_reframe?: string
  review_status?: SeedMirrorReviewStatus  // 'pending'|'confirmed'|'forgotten'
  created_at: string
}
```

Per reflection it inserts one `mirror_entries` row, then
`applyMirrorReviewStatus` (lines 340–369) upserts a `tags` row
(`system:mirror-confirmed` / `system:mirror-forgotten`) and links it via
`mirror_entry_tags` — the tag-upsert body is lines 354–368. VIPS pages upsert
per dimension (209–221); timeline entries insert with `reflection_index`
(1-based) → `reflectionId` and record `key` → id in `timelineKeyToId`
(223–247); a `trajectory` block becomes one `cartographer_outputs` row via
`resolveTrajectoryPathways` + `insertCartographerOutput` (249–270), resolving
each `trait_combination[].timeline_key` through `timelineKeyToId` (371–390 —
a missing key silently omits `timeline_entry_id`, so keys MUST match exactly).

Re-seeding: per-student idempotent; `SEED_REPLACE_EXISTING=1` wipes and
re-seeds a student (`resetSeedStudent`, lines 320–338).

### How moods reach the History calendar

- `src/server/load-vips-pages.handler.server.ts:113` —
  `listMirrorEntries(studentId, { ctx, limit: 7 })`, then
  `deriveRecentMoodsFromMirrorEntries` (lines 133–151) calls
  `moodFromMirrorTags(entry.tags)`.
- `src/server/mood-tags.ts` — a mood exists iff the entry has a `mood:<emotion>`
  tag (`MIRROR_MOOD_TAG_PREFIX = 'mood:'`), validated against `MoodSchema`.
- `MoodSchema` (`src/agents/tools/schemas.ts:172`):
  `joy | sadness | anger | fear | disgust | anxiety | envy | embarrassed | ennui`.
- The calendar renders shapes via the `EMOTIONS` registry
  (`src/lib/student-space/mood-shapes.ts:8–17`; `EMOTION_BY_ID` at line 79)
  whose ids are `joy, sadness, anger, fear, disgust, anxiety, envy,`
  **`embarrassment`**`, ennui`. **⚠ id mismatch**: schema `embarrassed` vs
  registry `embarrassment` — do NOT seed that mood (see STOP conditions).
- At runtime, mood tags are written by
  `src/server/persist-mirror.handler.server.ts:83`
  (`tags: taggedMood ? [mirrorMoodTag(taggedMood)] : undefined`); the submit
  handler (`submit-student-space-reflection.handler.server.ts:74`) only passes
  the mood through. The seed writes no `mood:*` tags today.

### The 7-mirror ceiling

`load-vips-pages.handler.server.ts:113` fetches only the 7 most recent
mirrors. Alice has **9** — without a bump, the two oldest entries never
reach History.

### Tests that pin demo-a's current content

- `test/server/load-vips-pages-world.test.ts:73–74` asserts the demo shell
  identity `{ name: 'Alice', className: 'Sec 4, NA' }` and that calendar-event
  dates contain `'2025-10-14'`. Both derive from the fixture via
  `src/lib/student-space/demo-shell-data.server.ts` (identity from
  `parseNameHandle(profile.name_handle)` — regex `^(.+?)\s*\((.+)\)$`, lines
  168–175; calendar-event dates from reflection `created_at`s,
  `buildCalendarEvents`, lines 85–121). **These assertions MUST be updated in
  Step 5** — with the new content, identity becomes
  `{ name: 'Alice', className: 'Sec 2' }` and event dates come from the
  new reflection dates. (`teacherLetters[0].from: 'Mr. Tan'` is hardcoded in
  `demo-shell-data.server.ts:139` and does not break.)
- `test/db.test.ts` (`seed loader` describe, skipped without `DATABASE_URL`):
  student count between 3 and 5 — unchanged by this plan (still 4 students);
  per-student ≥6 entries / ≥3 context types — satisfied (9 entries, 4 types).
  **No edit needed.** No other test depends on demo-a's fixture content
  (ablation tests construct their own student objects; `backend-snapshot.test.ts`
  uses mocks).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 |
| Full test | `pnpm test` | all pass |
| Filtered test | `pnpm test -- test/server/load-vips-pages-world.test.ts` | passes |
| JSON validity | `node -e "JSON.parse(require('fs').readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); console.log('ok')"` | `ok` |
| Re-seed demo-a (only with local `DATABASE_URL`) | `SEED_REPLACE_EXISTING=1 SEED_STUDENT_IDS=demo-a pnpm seed` | demo-a replaced |

## Scope

**In scope (the only files you may modify):**
- `test/ablation/fixtures/seed-multistudent.json` — replace the `demo-a`
  block's `profile`, `coverage_matrix`, `reflections`, `vips_pages`,
  `vips_timeline_entries`, `trajectory` with Appendix A; update the top-level
  `description` sentence to note demo-a is Alice, the canonical spec demo
  student.
- `src/db/seed.ts` — optional `mood` on `SeedReflectionFixture` + write a
  `mood:<mood>` tag per seeded reflection (Step 2).
- `src/server/load-vips-pages.handler.server.ts` — `limit: 7` → `limit: 12`
  (Step 3).
- `test/server/load-vips-pages-world.test.ts` — update the two pinned
  assertions (Step 5).

**Out of scope (do NOT touch):**
- `demo-b`/`demo-c`/`demo-d` blocks; `test/ablation/fixtures/_archive/*`.
- `src/auth/demo.ts` / demo-session code (id stays `demo-a`).
- `src/data/vips-taxonomy.ts`, `src/data/ecg-taxonomy.ts` (000 Decision 2).
- `src/lib/student-space/demo-shell-data.server.ts` — identity/calendar/letters
  derive from the fixture automatically. (Letter content is Plan 002.)
- Onboarding copy (Plan 003), TrajectorySheet UI (Plan 005), `test/db.test.ts`.

## Git workflow

Branch `advisor/001-alice-corpus`; conventional commit, e.g.
`feat(seed): demo-a becomes Alice — spec corpus, moods, trajectory`.
Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm canonical ids

`grep -oE "(values|interests|personality|skills)\.[a-z-]+" src/data/vips-taxonomy.ts | sort -u`
must include: `values.contribution`, `values.learning`, `values.relationships`,
`values.independence`, `interests.investigative`, `interests.realistic`,
`interests.enterprising`, `personality.neuroticism`, `skills.practical`,
`skills.analytical`, `skills.leadership`, `skills.communication`.
`grep -oE "cluster\.[a-z-]+" src/data/ecg-taxonomy.ts | sort -u` must include:
`cluster.healthcare`, `cluster.public-service`, `cluster.applied-sciences`,
`cluster.engineering`, `cluster.business-finance`. Any missing → STOP.

### Step 2: Add seeded-mood support to the loader

In `src/db/seed.ts`:
1. Add to `SeedReflectionFixture`: `mood?: Mood` (import `type Mood` from
   `~/agents/tools/schemas`).
2. Import `mirrorMoodTag` from `~/server/mood-tags`.
3. Extract the tag-upsert body of `applyMirrorReviewStatus` (lines 354–368)
   into `attachMirrorTag(db: SeedTransaction, studentId: string, entryId: number, label: string)`;
   call it from `applyMirrorReviewStatus`; then in the reflection loop, after
   the `applyMirrorReviewStatus` call (line 202), add:
   `if (r.mood) await attachMirrorTag(ctx.db, student.student_id, reflectionId, mirrorMoodTag(r.mood))`.

**Verify**: `pnpm check` → exit 0.

### Step 3: Bump the mirror fetch limit

`src/server/load-vips-pages.handler.server.ts:113`: `limit: 7` → `limit: 12`.
**Verify**: `grep -n "limit: 12" src/server/load-vips-pages.handler.server.ts`
→ one hit.

### Step 4: Replace the demo-a fixture block with Appendix A

Paste Appendix A's JSON as the new `demo-a` object (keep `student_id:
"demo-a"`). Update the top-level `description`. Then run ALL of:

1. JSON validity (see Commands) → `ok`.
2. Structure check:
   `node -e "const d=JSON.parse(require('fs').readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); const m=d.students.find(s=>s.student_id==='demo-a'); if(m.reflections.length!==9) throw 'want 9 refl'; if(!m.profile.name_handle.includes('Alice')) throw 'profile'; if(m.vips_pages.length!==4) throw 'want 4 vips pages'; if(m.vips_timeline_entries.length!==17) throw 'want 17 timeline entries'; if(m.trajectory.pathways.length!==5) throw 'want 5 pathways'; const keys=new Set(m.vips_timeline_entries.map(t=>t.key)); for(const p of m.trajectory.pathways) for(const t of p.trait_combination) if(t.timeline_key && !keys.has(t.timeline_key)) throw 'dangling key: '+t.timeline_key; const moods=m.reflections.map(r=>r.mood); if(moods.some(x=>!x)) throw 'every reflection needs a mood'; let prev=''; for(const r of m.reflections){ if(r.created_at<=prev) throw 'dates not increasing'; prev=r.created_at } console.log('ok')"`
   → `ok`.
3. Quote-in-transcript check:
   `node -e "const d=JSON.parse(require('fs').readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); const m=d.students.find(s=>s.student_id==='demo-a'); for(const t of m.vips_timeline_entries){ const r=m.reflections[t.reflection_index-1]; if(!r.transcript.includes(t.verbatim_quote)) throw 'quote not in transcript: '+t.key } console.log('quotes ok')"`
   → `quotes ok`.
4. No-Kira-lines check (transcripts must be student speech only):
   `node -e "const d=JSON.parse(require('fs').readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); const m=d.students.find(s=>s.student_id==='demo-a'); for(const r of m.reflections) for(const bad of ['Kira:','[readback','[feeds','Teacher prompt:']) if(r.transcript.includes(bad)) throw 'transcript contains '+bad; console.log('clean ok')"`
   → `clean ok`.
5. Claim-id existence check:
   `node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('test/ablation/fixtures/seed-multistudent.json','utf8')); const tax=fs.readFileSync('src/data/vips-taxonomy.ts','utf8'); const m=d.students.find(s=>s.student_id==='demo-a'); const ids=new Set([...m.vips_timeline_entries.map(t=>t.canonical_claim_id), ...m.trajectory.pathways.flatMap(p=>p.trait_combination.map(t=>t.claim_id))]); const ecg=fs.readFileSync('src/data/ecg-taxonomy.ts','utf8'); const clusters=new Set(m.trajectory.pathways.flatMap(p=>p.ecg_region_tags)); for(const id of ids) if(!tax.includes(id)) throw 'unknown VIPS id '+id; for(const c of clusters) if(!ecg.includes(c)) throw 'unknown ECG id '+c; console.log('ids ok', ids.size, 'claims,', clusters.size, 'clusters')"`
   → `ids ok …`.

### Step 5: Update the pinned world test

In `test/server/load-vips-pages-world.test.ts`:
- Line ~73: identity expectation →
  `{ name: 'Alice', className: 'Sec 2' }`.
- Line ~74: the calendar-event date assertion — events derive from reflection
  dates via `buildCalendarEvents` (first `school` reflection, first
  `civic`-or-`hobby` reflection, latest reflection). With Appendix A's dates
  those are `2026-04-15` (first school), `2026-01-20` (first civic), and
  `2026-07-09` (latest). Update the assertion accordingly (e.g.
  `toContain('2026-01-20')`).

**Verify**: `pnpm test -- test/server/load-vips-pages-world.test.ts` → passes.

### Step 6: Gates + reseed

- `pnpm check` → exit 0.
- `pnpm test` → all pass (`seed loader` describe may report skipped without
  `DATABASE_URL` — expected locally; Step 4's node checks are then binding).
- If a local `DATABASE_URL` is configured:
  `SEED_REPLACE_EXISTING=1 SEED_STUDENT_IDS=demo-a pnpm seed` → reports demo-a
  replaced, 9 entries, 17 timeline rows, 1 trajectory row. Then `pnpm dev`,
  sign in with demo → History calendar shows mood shapes + reflections
  Jan–Jul; Path Finder shows the 5-pathway trajectory.

## Test plan

No new test file. Coverage comes from: the existing `seed loader` describe
(`test/db.test.ts`), the updated `load-vips-pages-world.test.ts` assertions,
and Step 4's five machine checks (which are the binding gate for fixture
content when no DB is available).

## Done criteria

- [ ] Step 4 checks print `ok`, `quotes ok`, `clean ok`, `ids ok …`.
- [ ] `SeedReflectionFixture.mood` seeds a `mood:*` tag (Step 2).
- [ ] Mirror fetch limit is 12 (Step 3).
- [ ] `pnpm test -- test/server/load-vips-pages-world.test.ts` passes with the
      Alice identity.
- [ ] `pnpm check` and `pnpm test` exit 0.
- [ ] Only in-scope files modified (`git status`).
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

- Any canonical VIPS/ECG id in Step 1 is missing from the taxonomies.
- `SeedReflectionFixture` / seeding flow in `src/db/seed.ts` differs
  materially from the excerpts (drift).
- You are tempted to seed mood `embarrassed`/`embarrassment` — don't; the two
  registries disagree on the id (schema `embarrassed`, registry
  `embarrassment`). Appendix A uses neither. Report as a follow-up bug if
  asked to add it.
- Anything requires touching `demo-b`…`d`, the taxonomies, or auth code.
- A test other than `load-vips-pages-world.test.ts` fails on demo-a content —
  report it; do not chase it with content edits.

## Maintenance notes

- Entry 9's date (`2026-07-09`) will age; the demo reads best when the latest
  entry is recent. Refresh the tail `created_at`s (and the Step 5 date
  assertion) when staleness shows.
- After seeding, VIPS pages/timeline/trajectory are the day-one snapshot; the
  Connector/Cartographer agents will overwrite/extend them if run — expected.
- The `mood:*` tag mechanism matches the runtime write path
  (`persist-mirror.handler.server.ts:83`), so seeded and live entries render
  identically on the calendar.
- Plan 005 consumes the `timeline_key` links seeded here; if you rename a key,
  fix both the trajectory refs (same file) and re-run Step 4 check 2.

---

## Appendix A — paste-ready `demo-a` content

Authored against the spec (`advisor-plans/context/myworld-demo-transcripts.md`)
per 000's voice rules: transcripts are the student's turns only (verbatim
Singlish, lightly joined); `validation`/`inferred_meaning`/`story_reframe` are
in Mirror's voice (readbacks used as raw material, rewritten). Do not edit the
wording except to fix JSON escaping errors.

```json
{
  "student_id": "demo-a",
  "profile": {
    "name_handle": "Alice (Sec 2)",
    "year_level": "Sec 2",
    "school_type": "sec",
    "values_dominance": ["values.contribution", "values.learning"],
    "riasec_tilt": ["interests.investigative", "interests.realistic"],
    "skills_evident": ["skills.practical", "skills.analytical"],
    "notes_for_review": "Bubbly, curious, slow to open up to strangers, warm with friends. Working-class family (dad drives Grab, mum does catering). Physics clicks because Ms Lim ties it to real demos — the 'oh that's why' feeling. St John's Brigade reluctantly; resents foot drills, proud of CPR (thinks of her grandfather). Coming off a failed Standard First Aid badge (froze in the CPR scenario) which dented her usual composure under pressure. Open threads: NCOC (leaning on whether friend Jaya signs up), a Beyblade SIL project her form teacher Mr Lim encouraged, a crush from another school met via walkathon planning, and the JC-vs-poly subject-combo decision. Emerging pattern: drawn to hands-on learning and to understanding how things work under the surface. The negative entry (badge failure) must stay ungeneralized: she's disappointed, not defeated."
  },
  "coverage_matrix": "context_type coverage for demo-a (Alice): civic (r1, r2, r3, r4), peer (r5), school (r6, r7, r9), hobby (r8). 4 of 5 enum values; ≥3 satisfied. Affect spread: positive (r2, r5, r7, r8), ordinary (r1, r6), negative (r3), mixed (r4, r9). Initiation: teacher-initiated (r6, r7), self-initiated (rest). Moods: anger r1, joy r2/r5/r7/r8, sadness r3, anxiety r4/r9, fear r6.",
  "reflections": [
    {
      "context_type": "civic",
      "mood": "anger",
      "transcript": "eh todays drill so long sia. marching for what i dont get it. stand there 40min just turn left turn right. sergeant major say our turns not sharp. i was like ok and then. no lor just say discipline discipline. i get discipline for CPR. this one i dunno leh",
      "validation": "You sat with the part that felt pointless instead of just complaining and moving on. Wanting to know what the marching builds toward is a fair question, not a discipline problem.",
      "inferred_meaning": "Effort lands for you when you can see what it is building toward — CPR has an obvious why, the drills don't yet.",
      "story_reframe": "Forty minutes of turns felt pointless to Alice, not because she minds discipline — she takes CPR seriously — but because nobody could say what the marching was for. The frustration points at something steadier: she works best when the why is visible.",
      "review_status": "confirmed",
      "created_at": "2026-01-20T09:30:00Z"
    },
    {
      "context_type": "civic",
      "mood": "joy",
      "transcript": "today we learned cpr compressions properly. like the proper depth and rate and everything. actually quite fun? like everyone was eww you have to do mouth to mouth on the mannequin lah disgusting like that. but i was thinking actually if i ever need to do this for my grandparents at home i would be quite glad i know how. cos like my ah gong heart not that good already, my mum always worried. so when we were doing the compressions i was counting in my head and thinking eh if this really happens one day i actually know what to do now. the instructor was saying push hard push fast, dont be scared to break a rib even, better than not pushing hard enough. i was like ok i need to remember this properly, not just pass the test and forget. probably the rate. they taught us a song to keep the beat, i think i can still hum it now. the rest i think will come back if i actually have to do it, like muscle memory maybe",
      "validation": "While your friends were joking about the mannequin, you were counting compressions for your ah gong. You turned a class exercise into something you intend to keep.",
      "inferred_meaning": "Training matters to you when someone real is behind it — you learn for use, not just to pass.",
      "story_reframe": "CPR class landed differently for Alice than for her friends. She was thinking about her grandfather's heart, so the depth, the rate, the beat-keeping song all got filed under things she might really need — not things on the test.",
      "review_status": "confirmed",
      "created_at": "2026-02-03T09:00:00Z"
    },
    {
      "context_type": "civic",
      "mood": "sadness",
      "transcript": "failed my badge today. dunno. just failed lor. the cpr scenario one. i dont know. i just froze i think. the patient was like acting distressed and shouting and i didnt know what to do first. i think i missed checking the scene safety also. examiner just said cannot, fail. i think the freezing. like i trained so many times already and then real scenario i just blank. not really. usually im ok under pressure. this one just got to me sia. dunno why. maybe cos got outside examiner watching, made it feel more real or something. gonna have to redo next year now",
      "validation": "You trained hard and still froze when the casualty started shouting — that gap between practice and the real scenario stings more than the result itself.",
      "inferred_meaning": "The freeze bothers you more than the fail, because it doesn't match how you usually are under pressure.",
      "story_reframe": "Alice failed the CPR scenario of her Standard First Aid badge: a distressed casualty, a missed scene-safety check, an examiner watching. What stays with her isn't the grade — it's freezing when she usually doesn't. One bad day, with a retry next year.",
      "review_status": "confirmed",
      "created_at": "2026-03-06T10:30:00Z"
    },
    {
      "context_type": "civic",
      "mood": "anxiety",
      "transcript": "my OC asked if i want to sign up for the zone NCOC course. dunno leh. like half of me wants to try, half dont. like i did ok in the cca so far even though i failed the badge thing. ncoc is like a level up i guess, more leadership stuff. could be good. but i just remember how much i complained about foot drills and discipline stuff. ncoc probably got even more of that. dont know if i can tahan more of it. actually ya. my friend jaya also thinking about it. if she goes i think i go also. easier la with someone i know. ya i guess thats true huh. didnt think of it like that. need to ask her first i think",
      "validation": "You laid out both halves honestly — the pull of the level-up and the memory of the drills — and you noticed mid-sentence that the decision is currently resting on Jaya.",
      "inferred_meaning": "Right now the NCOC question is less about wanting it and more about not walking in alone.",
      "story_reframe": "Alice is torn on NCOC: the leadership side appeals, the discipline-heavy culture doesn't, and the tiebreaker has quietly become whether Jaya signs up. Naming that out loud was new — the next step she set herself is asking her.",
      "review_status": "confirmed",
      "created_at": "2026-03-24T11:00:00Z"
    },
    {
      "context_type": "peer",
      "mood": "joy",
      "transcript": "ok so the walkathon planning meeting today was actually really fun. like i was so reluctant when teacher first asked me to help organize but today i actually enjoyed it. we had to coordinate with other schools right, so there were students from like four other secondary schools there. and theres this girl from one of the other schools, she's actually super organized like she had a whole spreadsheet already for the route logistics and i was like wow ok. ya lah ok fine i admit i kind of have a crush on her now. dont laugh. she's quite funny actually, dry humor, she made this joke about how our school's route always somehow ends up the longest one and everyone laughed. and she actually listens when people talk, like she'll remember small things you said earlier in the meeting. we were both in charge of the hydration point planning so we had to discuss together. i kept trying to think of stuff to ask her but everything i thought of sounded lame in my head so i didnt say half of it. like what school she's from, what cca she does, normal things. but somehow felt awkward to ask straight up. next month theres a walk through of the route before the actual day, so i guess i have another chance. nervous but also looking forward to it lah. like the actual organizing work also genuinely interesting, i didnt expect that. i used to think this kind of stuff was just admin work but theres actually a lot of coordination and problem solving in it",
      "validation": "Two surprises in one afternoon: the organizing work turned out to be real problem-solving, and someone from another school turned out to be worth being tongue-tied around.",
      "inferred_meaning": "Work you wrote off as admin got interesting once you were inside it — and the crush is its own separate discovery.",
      "story_reframe": "Alice went into walkathon planning reluctant and came out having enjoyed the coordination itself — hydration points across four schools read as a puzzle, not paperwork. There is also a girl with a spreadsheet and dry humor; next month's route walkthrough suddenly matters more.",
      "review_status": "confirmed",
      "created_at": "2026-04-08T10:00:00Z"
    },
    {
      "context_type": "school",
      "mood": "fear",
      "transcript": "camp was alright lah. tiring but ok. actually the tchoukball thing keeps coming back to me. my friend joseph twisted his ankle quite badly during the game. it happened so fast. he was just running for the ball and then suddenly he was on the ground holding his ankle and everyone kind of froze for a sec before the facilitators ran over. i think i was just worried for him, like is it broken, can he walk. and then after the facilitators handled it i was thinking damn i actually dont know what to do in that kind of situation, like injury thats not cpr related. like i know cpr now from cca but this was different, more like sports injury kind of thing. made me realize theres other stuff i dont know how to handle. rest of camp was just normal team games and stuff, fun in the moment but nothing i keep thinking about after",
      "validation": "Out of a whole camp, the moment that stayed is the one where you didn't know how to help. That's you taking your own readiness seriously.",
      "inferred_meaning": "You measure yourself by whether you'd know what to do when it matters — and you just found an edge of that map.",
      "story_reframe": "Joseph's ankle is the piece of camp Alice can't put down: how fast it happened, the worry, and then the quieter thought — CPR training doesn't cover this. She walked away with a gap she now knows exists.",
      "review_status": "confirmed",
      "created_at": "2026-04-15T08:30:00Z"
    },
    {
      "context_type": "school",
      "mood": "joy",
      "transcript": "ok 3 things. first one, theres this whole industry for making artificial flavors and fragrances, like the people who make the chip flavors and shampoo smells. never knew that was a job. i thought food was either you cook it or some factory just makes it, didnt think there was a whole science behind the flavor part. second, one of the booth people, turns out he used to write for mothership and he went to my school. that was kind of cool, like oh a senior actually did something like that. i guess i never really thought about what alumni end up doing, this one just made it feel more real, like ok people from here actually go do interesting stuff after. third, the physiotherapist talk. he does sports injury rehab. he had his hair gelled back, studied in australia, just seemed like a cool guy honestly. how he explained the recovery process, like why certain exercises come before others depending on the injury. and actually ya, joseph twisted his ankle at camp, i remember thinking after that i didnt know what to do for that kind of thing. and now hearing the physio talk i was like oh thats probably what joseph needs to be doing now, the exercises and stuff. didnt realize it until now but the camp thing and the career fair thing are actually connected for me. probably the physio one im still thinking about the most. partly cos the job sounds cool, but also cos of the joseph thing",
      "validation": "You walked in for a school event and walked out with a connection you made yourself — the physio's recovery logic snapped onto Joseph's ankle from camp.",
      "inferred_meaning": "The 'oh that's why' feeling showed up again — this time about how bodies recover, and it linked two separate weeks of your life.",
      "story_reframe": "Three things stood out to Alice at the career fair: a whole science behind chip flavours, a Mothership writer from her own school, and a physiotherapist whose talk on recovery sequencing suddenly explained what Joseph's ankle needs. The physio one is still sitting with her.",
      "review_status": "confirmed",
      "created_at": "2026-04-28T09:30:00Z"
    },
    {
      "context_type": "hobby",
      "mood": "joy",
      "transcript": "bro mr lim caught us playing beyblade in class today and i thought confirm kena scolded. he came over and i was like preparing to apologize already, but he just asked if we wanted to do something beyblade related for our student initiated learning project. i was so shocked lor. like wait we can do that? i thought sil project had to be like serious topic, recycling or community service kind of thing. didnt think beyblade count. not sure yet what we'd do, still thinking. maybe something about the physics of how they spin so long, since i like physics anyway with ms lim. or maybe just how the community around it works, like why so many of us got into it suddenly",
      "validation": "You expected a scolding and got an invitation — and instead of shrugging it off, you already have two possible angles for it.",
      "inferred_meaning": "Being told your own interest counts as real learning opened something: the spin physics and the why-did-everyone-get-into-it question are both live.",
      "story_reframe": "Mr Lim caught the Beyblades and, instead of confiscating them, offered Alice a project. Now she's weighing two directions — the physics of a long spin, or the social side of a sudden craze — and the surprise that play can count as schoolwork hasn't worn off.",
      "review_status": "confirmed",
      "created_at": "2026-06-02T07:45:00Z"
    },
    {
      "context_type": "school",
      "mood": "anxiety",
      "transcript": "eh subject combo deadline coming and i still dont know what to pick. like everyone keeps asking me jc or poly and i dont even know. and then within that also need to pick subjects. i just feel lost lah. i guess what i want is knowing what subjects i actually want to study, not just what sounds safe. and maybe having a rough idea why. physics for sure i enjoy. ms lim makes it actually make sense, like she always shows us real stuff, not just formulas. i remember the demonstration she did on pressure, that one was so cool. the real life connection i think. like i remember thinking oh thats why XYZ happens. i like when things click like that. actually at the career fair when the physio was talking, i had that feeling too. like he was explaining how the body recovers from injury and i was thinking about my friend joseph who twisted his ankle at camp, and it suddenly made sense why he had to do specific exercises after. maybe like... understanding how things work under the surface? not just what happens but why. i think i dont know if im smart enough for the higher level subjects. and also dont know if jc or poly suits me better, like poly seems more hands on which i think i'd like, but everyone says jc keeps more options open. poly feels like actually building or doing things, not just sitting and listening. the physio thing, if that was a poly course i feel like there'd be more of that. jc is more like still figuring things out broadly before committing, keeping options open like people say. i think i want to look more into poly courses related to like sports science or rehab stuff. but also scared to fully rule out jc in case i change my mind. maybe talking to someone whos actually in a poly course like that would help. or maybe asking the physio guy from the career fair if i can ask him more questions. just good to say it out loud actually, didnt realize i already had some idea",
      "validation": "You came in lost and talked your way to a pattern — the same 'oh that's why' click in physics class and the physio talk — and even named a next step yourself.",
      "inferred_meaning": "You lean toward understanding how things work under the surface, hands-on — which is quietly pointing at poly sports-science or rehab courses, without closing the JC door.",
      "story_reframe": "The subject-combo deadline had Alice feeling lost until she traced what actually clicks: Ms Lim's demos, the physio's recovery logic. The pattern she named — why over what, hands-on over listening — points toward poly sports science or rehab, with JC not yet ruled out. Her next step: find someone in that world to ask.",
      "review_status": "pending",
      "created_at": "2026-07-09T11:30:00Z"
    }
  ],
  "vips_pages": [
    {
      "dimension": "values",
      "compiled_truth": "Purpose-linked effort sits at the centre of Alice's decision-making: she commits when she can see what the work builds toward (CPR, being ready for her ah gong) and bristles when she can't (foot drills). Contribution shows up as readiness — being the one who knows what to do when someone real needs it. An independence thread is emerging in the subject-combo entry: wanting what she actually wants to study, not what sounds safe.",
      "open_question": "How does she keep effort meaningful when nobody hands her the why — can she build the habit of finding it herself?"
    },
    {
      "dimension": "interests",
      "compiled_truth": "A strong Investigative tilt with a hands-on Realistic edge. The repeated signal is the 'oh that's why' feeling: Ms Lim's physics demos, the physio's recovery sequencing, the science behind chip flavours, the physics of a long Beyblade spin. Interest sustains when understanding connects to something real she can touch or do; an Enterprising thread surfaced unexpectedly in walkathon coordination.",
      "open_question": "Which setting keeps the 'oh that's why' feeling alive after the novelty wears off — rehab, applied science, or the operational puzzle of making events run?"
    },
    {
      "dimension": "personality",
      "compiled_truth": "Usually composed under pressure, with one tested exception — the badge-day freeze under an external examiner — that bothered her precisely because it was out of character. Decisions lean on trusted peers (NCOC currently rests on Jaya), and she can notice that pattern when it is mirrored back. Warm and easygoing with friends, slower to open with strangers.",
      "open_question": "Can she rebuild trust in her own composure — and find a reason of her own for decisions currently anchored to friends?"
    },
    {
      "dimension": "skills",
      "compiled_truth": "Procedural first aid is real and retained — she still carries the compression rhythm months later. Coordination showed up unexpectedly at walkathon planning: hydration-point logistics across four schools read as problem-solving, not admin. With light scaffolding she names her own patterns — the subject-combo conversation ended with her articulating 'how things work under the surface' herself.",
      "open_question": "Which structured roles let her practise these skills under real conditions — a badge re-attempt with rehearsed scenarios, a named walkathon role, the SIL project?"
    }
  ],
  "vips_timeline_entries": [
    { "key": "values-learning-drills-why", "dimension": "values", "canonical_claim_id": "values.learning", "verbatim_quote": "i get discipline for CPR. this one i dunno leh", "reflection_index": 1, "strength": "medium", "parallax_tag": ["civic"], "committed_at": "2026-01-20T10:30:00Z" },
    { "key": "values-contribution-cpr-grandfather", "dimension": "values", "canonical_claim_id": "values.contribution", "verbatim_quote": "if i ever need to do this for my grandparents at home i would be quite glad i know how", "reflection_index": 2, "strength": "high", "parallax_tag": ["civic", "family"], "committed_at": "2026-02-03T10:00:00Z" },
    { "key": "skills-practical-cpr-rhythm", "dimension": "skills", "canonical_claim_id": "skills.practical", "verbatim_quote": "they taught us a song to keep the beat, i think i can still hum it now", "reflection_index": 2, "strength": "medium", "parallax_tag": ["civic"], "committed_at": "2026-02-03T10:00:00Z" },
    { "key": "personality-neuroticism-badge-freeze", "dimension": "personality", "canonical_claim_id": "personality.neuroticism", "verbatim_quote": "usually im ok under pressure. this one just got to me sia", "reflection_index": 3, "strength": "medium", "parallax_tag": ["civic"], "committed_at": "2026-03-06T11:30:00Z" },
    { "key": "values-relationships-ncoc-jaya", "dimension": "values", "canonical_claim_id": "values.relationships", "verbatim_quote": "my friend jaya also thinking about it. if she goes i think i go also", "reflection_index": 4, "strength": "high", "parallax_tag": ["civic", "peer"], "committed_at": "2026-03-24T12:00:00Z" },
    { "key": "skills-leadership-ncoc-levelup", "dimension": "skills", "canonical_claim_id": "skills.leadership", "verbatim_quote": "ncoc is like a level up i guess, more leadership stuff", "reflection_index": 4, "strength": "low", "parallax_tag": ["civic"], "committed_at": "2026-03-24T12:00:00Z" },
    { "key": "interests-enterprising-walkathon", "dimension": "interests", "canonical_claim_id": "interests.enterprising", "verbatim_quote": "i used to think this kind of stuff was just admin work but theres actually a lot of coordination and problem solving in it", "reflection_index": 5, "strength": "medium", "parallax_tag": ["peer", "school"], "committed_at": "2026-04-08T11:00:00Z" },
    { "key": "skills-communication-hydration-planning", "dimension": "skills", "canonical_claim_id": "skills.communication", "verbatim_quote": "we were both in charge of the hydration point planning so we had to discuss together", "reflection_index": 5, "strength": "medium", "parallax_tag": ["peer"], "committed_at": "2026-04-08T11:00:00Z" },
    { "key": "values-contribution-camp-readiness", "dimension": "values", "canonical_claim_id": "values.contribution", "verbatim_quote": "i was just worried for him, like is it broken, can he walk", "reflection_index": 6, "strength": "medium", "parallax_tag": ["school", "peer"], "committed_at": "2026-04-15T09:30:00Z" },
    { "key": "skills-analytical-camp-gap", "dimension": "skills", "canonical_claim_id": "skills.analytical", "verbatim_quote": "made me realize theres other stuff i dont know how to handle", "reflection_index": 6, "strength": "medium", "parallax_tag": ["school"], "committed_at": "2026-04-15T09:30:00Z" },
    { "key": "interests-investigative-careerfair-physio", "dimension": "interests", "canonical_claim_id": "interests.investigative", "verbatim_quote": "how he explained the recovery process, like why certain exercises come before others depending on the injury", "reflection_index": 7, "strength": "high", "parallax_tag": ["school"], "committed_at": "2026-04-28T10:30:00Z" },
    { "key": "interests-investigative-careerfair-flavour", "dimension": "interests", "canonical_claim_id": "interests.investigative", "verbatim_quote": "didnt think there was a whole science behind the flavor part", "reflection_index": 7, "strength": "medium", "parallax_tag": ["school"], "committed_at": "2026-04-28T10:30:00Z" },
    { "key": "values-independence-careerfair-horizons", "dimension": "values", "canonical_claim_id": "values.independence", "verbatim_quote": "i guess i never really thought about what alumni end up doing", "reflection_index": 7, "strength": "medium", "parallax_tag": ["school"], "committed_at": "2026-04-28T10:30:00Z" },
    { "key": "interests-investigative-beyblade-physics", "dimension": "interests", "canonical_claim_id": "interests.investigative", "verbatim_quote": "maybe something about the physics of how they spin so long, since i like physics anyway with ms lim", "reflection_index": 8, "strength": "high", "parallax_tag": ["hobby"], "committed_at": "2026-06-02T08:45:00Z" },
    { "key": "interests-realistic-subjectcombo-handson", "dimension": "interests", "canonical_claim_id": "interests.realistic", "verbatim_quote": "poly seems more hands on which i think i'd like", "reflection_index": 9, "strength": "high", "parallax_tag": ["school"], "committed_at": "2026-07-09T12:30:00Z" },
    { "key": "values-independence-subjectcombo-authentic", "dimension": "values", "canonical_claim_id": "values.independence", "verbatim_quote": "knowing what subjects i actually want to study, not just what sounds safe", "reflection_index": 9, "strength": "high", "parallax_tag": ["school"], "committed_at": "2026-07-09T12:30:00Z" },
    { "key": "skills-analytical-subjectcombo-pattern", "dimension": "skills", "canonical_claim_id": "skills.analytical", "verbatim_quote": "maybe like... understanding how things work under the surface? not just what happens but why", "reflection_index": 9, "strength": "medium", "parallax_tag": ["school"], "committed_at": "2026-07-09T12:30:00Z" }
  ],
  "trajectory": {
    "trajectory_text": "Alice's current through-line is not simply 'likes physics' or 'likes helping'; it is wanting to understand how things work beneath the surface — and wanting to be ready when it matters for someone real. The strongest evidence points toward hands-on, applied pathways where knowing why translates into doing: healthcare and rehabilitation, applied science, and the operational work of making events happen. The main developmental task is to test which of these keeps giving her the 'oh, that's why' feeling when the novelty wears off — and to rebuild trust in her own composure after one bad assessment day.",
    "pathways": [
      {
        "label": "Sports rehabilitation, nursing and healthcare foundations",
        "trait_combination": [
          { "claim_id": "values.contribution", "dimension": "values", "timeline_key": "values-contribution-cpr-grandfather" },
          { "claim_id": "interests.investigative", "dimension": "interests", "timeline_key": "interests-investigative-careerfair-physio" },
          { "claim_id": "skills.practical", "dimension": "skills", "timeline_key": "skills-practical-cpr-rhythm" },
          { "claim_id": "personality.neuroticism", "dimension": "personality", "timeline_key": "personality-neuroticism-badge-freeze" }
        ],
        "ecg_region_tags": ["cluster.healthcare", "cluster.public-service"],
        "risks_tradeoffs": "This route fits her readiness-to-help values and her existing first-aid base, but healthcare pathways are assessment-heavy, and her confidence took a real knock from one external exam. She would need to check that she is drawn to the slow work of recovery — the exercises, the sequences, the repetition — and not only the rescue moment. One failed badge is a data point, not a verdict.",
        "exploration_prompt": "Set up a conversation with the physiotherapist from the career fair — she already named this as her own next step — and prepare three questions about what the daily work actually involves beyond the cool moments. Treat the badge re-attempt next year as a second experiment: practise the distressed-casualty scenario with a friend playing the casualty, and track whether the freeze was a one-off or something that needs a routine."
      },
      {
        "label": "Applied physical sciences: how things work beneath the surface",
        "trait_combination": [
          { "claim_id": "interests.investigative", "dimension": "interests", "timeline_key": "interests-investigative-beyblade-physics" },
          { "claim_id": "skills.analytical", "dimension": "skills", "timeline_key": "skills-analytical-subjectcombo-pattern" },
          { "claim_id": "values.learning", "dimension": "values", "timeline_key": "values-learning-drills-why" }
        ],
        "ecg_region_tags": ["cluster.applied-sciences", "cluster.engineering"],
        "risks_tradeoffs": "Her physics enjoyment is currently teacher-shaped — Ms Lim's real-world demonstrations do a lot of the work. Applied science routes at poly keep the hands-on flavour she wants, but the theory load is real, and her 'am I smart enough' doubt needs testing against evidence, not assumption. The SIL project is a low-stakes way to find out before subject combination locks anything in.",
        "exploration_prompt": "Take the physics angle on the Beyblade SIL project: build a simple test rig, change one variable at a time (weight distribution, launch speed, tip shape), and measure spin duration. Track whether the enjoyment survives the measuring and the maths — that is the honest test of whether 'oh, that's why' extends from watching demonstrations to doing the investigation."
      },
      {
        "label": "Event operations, coordination and enterprise",
        "trait_combination": [
          { "claim_id": "skills.communication", "dimension": "skills", "timeline_key": "skills-communication-hydration-planning" },
          { "claim_id": "interests.enterprising", "dimension": "interests", "timeline_key": "interests-enterprising-walkathon" },
          { "claim_id": "values.relationships", "dimension": "values", "timeline_key": "values-relationships-ncoc-jaya" }
        ],
        "ecg_region_tags": ["cluster.business-finance", "cluster.public-service"],
        "risks_tradeoffs": "She discovered the organising work was 'genuinely interesting' at the same meeting she developed a crush — the two discoveries are entangled, and the next walkthrough will partly be a test of which one was doing the lifting. Operations and enterprise routes reward her coordination instincts, but sustained admin without a visible mission may drain her the way foot drills do: she needs to see what the effort builds toward.",
        "exploration_prompt": "Take a named role in next month's walkathon route walkthrough — own one deliverable end to end, not just help. Then run the class Beyblade interest as a small organised tournament: brackets, rules, a borrowed timer, maybe a five-dollar budget. Afterwards, note which part energised her: the planning, the people, or the problem-solving when something went wrong."
      },
      {
        "label": "Uniformed leadership: the NCOC track",
        "trait_combination": [
          { "claim_id": "values.relationships", "dimension": "values", "timeline_key": "values-relationships-ncoc-jaya" },
          { "claim_id": "skills.leadership", "dimension": "skills", "timeline_key": "skills-leadership-ncoc-levelup" },
          { "claim_id": "values.learning", "dimension": "values", "timeline_key": "values-learning-drills-why" }
        ],
        "ecg_region_tags": ["cluster.public-service"],
        "risks_tradeoffs": "The evidence genuinely cuts both ways. The leadership side appeals ('a level up'), and she has stayed committed through a failed badge — but her strongest recorded frustration is with exactly the discipline-heavy culture NCOC contains more of, and her current deciding rule is 'if she goes i think i go also.' This pathway is included not as a recommendation but as a decision she is already inside of; the experiment is designed to give her a reason of her own either way.",
        "exploration_prompt": "Before the sign-up decision, talk to one current NCOC senior and ask directly: how much of the course is drills and regimentation, and how much is the leadership and real-responsibility work? Then decide with a reason that would still stand if Jaya said no — the decision can include her, but it shouldn't rest on her."
      },
      {
        "label": "Flavour, fragrance and the chemistry of everyday sensations",
        "trait_combination": [
          { "claim_id": "interests.investigative", "dimension": "interests", "timeline_key": "interests-investigative-careerfair-flavour" },
          { "claim_id": "values.independence", "dimension": "values", "timeline_key": "values-independence-careerfair-horizons" }
        ],
        "ecg_region_tags": ["cluster.applied-sciences"],
        "risks_tradeoffs": "One moment of surprise is the thinnest evidence base of the five — that is what makes it divergent rather than aligned. The pathway is chemistry-heavy, which she has no recorded signal on yet, positive or negative. Its value in the demo is precisely this: the app doesn't only confirm who a student already is; it keeps genuinely new doors visibly open, anchored to a real recorded moment rather than invented from nothing.",
        "exploration_prompt": "Visit a polytechnic food science or chemical technology lab during open house, and try one kitchen-table experiment: blind-taste two brands of the same chip flavour and try to name what differs. If the why behind taste and smell hooks her the way spin physics does, this is a live thread; if not, it cost one afternoon."
      }
    ],
    "open_questions": [
      "Which of these directions keeps giving her the 'oh, that's why' feeling once the novelty wears off — the honest test for all five?",
      "Was the badge-day freeze a one-off under an external examiner, or does performing under assessment need a rehearsed routine?",
      "What reason of her own for (or against) NCOC would still stand if Jaya said no?"
    ],
    "disclaimer": "This trajectory is a working hypothesis from Alice's reflections, not a placement decision. It should open conversations with her teachers and family, not close them."
  }
}
```
