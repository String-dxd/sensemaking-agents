---
date: 2026-05-18
topic: sensemaking-agents-next
focus: "check the state of the app, and figure out what should we do next"
mode: repo-grounded
---

# Ideation: What's Next for sensemaking-agents

Surprise-me run. Six frames (pain & friction, inversion/removal, assumption-breaking, leverage, cross-domain analogy, constraint-flipping) generated 48 candidates plus an 8-item cross-cutting synthesis. 7 survivors below; 41 ideas rejected with reasons in the summary.

The dominant signal across frames is convergence on three structural moves: (1) Connector should run at capture time and its verifier outcomes should reach the student; (2) the counsellor brief is a dead-end whose elegant resolution is marginalia, not edit/reply; (3) the team has a learnings-store problem that compounds invisibly. The in-flight `2026-05-15-001-fix-world-stage-real-data` plan should land before any of these, but it sets up cleanly for most of them.

## Grounding Context (Codebase)

**Stack.** TS + React 19 + TanStack Start (SSR) + Three.js 0.184 + Postgres (Drizzle, RLS via per-request GUC) + Anthropic Managed Agents + WorkOS/Google OAuth + OpenAI Whisper STT.

**Pipeline.** voice → Whisper → Mirror (transcript-faithful, no identity claims) → Connector (proposes VIPS links; deterministic verifier gates commits; auto-runs at 18:00 SGT) → Cartographer (Trajectory synthesis; no prescriptive advice). Library is the review surface. VIPS taxonomy is closed (13 values × 6 RIASEC × 8 personality × 10 skills + Trajectory).

**Active tracks.** Recent commits enriched the Three.js island (aurora, caustics, grass wind, prompt bird, fireflies, mailbox interactions) and unified island+library. Uncommitted work (plan `2026-05-15-001`) is a 7-unit fix restoring the "faithful mirror" contract: remove decorative `withStudentSpaceBaseline` trees/flowers (U1–U3), surface student name on FloatingWorldActions (U4), deterministic prompt bird seed (U5), seed real VIPS data for demo-b/c/d (U6), browser smoke (U7).

**Settled positioning (do not relitigate).** No conversational/voice AI in Mirror ("the threat isn't another app, it's silence"); no cross-student inference; closed VIPS vocabulary code-enforced; parallax rule (`strength:high` requires ≥2 different context types); deterministic verifier > LLM judge; transcription is dumb capture; timeline append-only, pages derived; no streaks/scores; no in-wiki editing of compiled truth.

**Vetted but unshipped (from prior ideation Resume passes).** Source-aware taxonomy crosswalks (UofT word-bank → values, SkillsFuture CCS → skills) at 88%; "no label fits" feedback channel; label-fit confidence separate from evidence strength; Postgres RLS as second-layer enforcement.

**Open follow-ups (`docs/followups.md`).** `pg@9` deprecation around `Promise.all(db.execute(...))` patterns; Managed Agents token accounting under-counts inputs (observability mislead).

**External signals.** Cognitive Mirror (Frontiers in Ed 2025) — Protégé Effect via "AI as teachable novice." Mem 2.0 / A-Mem — capture-time linking gives +29.6pt on temporal queries vs batch. Granola — "invisible during capture, visible at reflection moments." None of the 40+ AI-journaling competitors surfaces their taxonomy to students. Outer Wilds / Obra Dinn — game state should *change as a direct read* on internal state, not just accumulate.

## Topic Axes

Decomposition skipped — surprise-me mode.

## Ranked Ideas

### 1. Capture-time Connector + verifier-outcome surface

**Description:** Replace the 18:00 SGT batch cron with incremental Connector that runs immediately after `persistMirror` (verifier gates remain unchanged). At the same time, surface what the verifier did to the student: render *admitted*, *downgraded*, and *dropped* outcomes on the post-reflection screen. The audit data already lives in `vips_proposed_diffs`; the route to read it doesn't exist. Together these two moves close two distinct silences — between recording and visible state change, and between the verifier and the person whose evidence it gated.

**Basis:**
- `direct:` `vercel.json` lines 14-17 (single `"0 10 * * *"` cron, no retry, no per-student gating); `src/server/auto-connector.handler.server.ts:251-295` (verifier outcomes persisted to audit, never read by a route); `docs/followups.md` + grounding line on "Counsellor mailbox brief is display-only."
- `external:` Mem 2.0 / A-Mem (April 2026) — capture-time linking +29.6pt on temporal queries, +23.1pt on multi-hop reasoning vs batch. Granola's "invisible-during-capture / visible-at-reflection" pattern (Mar 2026, $1.5B valuation, 70% retention).
- Subsumes the vetted "No label fits" feedback channel (88% confidence) by making downgraded/dropped outcomes a real surface instead of a parked idea.

**Rationale:** Reflection without feedback is dot-creation without confirmation that the mesh is forming. Today a student records, gets the Mirror synthesis, and then... nothing happens until next morning, *if* the cron fires. The verifier's "almost-matched but parallax<2" decisions — the most interesting structured signal in the system — are discarded. The Mem 2.0 evidence is the team's strongest unused lever, and the verifier surface is the most elegant way to honor the deterministic-verifier rule while making the system feel alive.

**Downsides:** Capture-time Connector raises tail latency on persistMirror and re-opens the cost question (Opus tokenizer is 35% heavier than Sonnet per the prior managed-agents ideation). The verifier-rejection surface risks looking discouraging if rendered as "your evidence was rejected" rather than "almost-claims; here's what would corroborate." Both are solvable; both warrant care.

**Confidence:** 82%
**Complexity:** Medium–High
**Status:** Unexplored

---

### 2. Ablation as CI floor + weekly tape ritual (both, not one)

**Description:** Two complementary moves. (a) Wire `test/ablation/` rubric (safety, specificity, actionability, sycophancy, parallax discipline) into a `pnpm test:ablation` suite that runs on PRs touching `src/agents/` or `test/ablation/fixtures/*`, with per-rubric score floors that fail CI on regression. (b) Add a separate weekly `pnpm eval:tape` view that surfaces the 10 worst Cartographer reads of the week (low specificity, high sycophancy) with the transcript queued — for prompt iteration, not for gating. CI is the floor; tape is the ceiling.

**Basis:**
- `direct:` `package.json:20-25` (ablate scripts isolated from `test`); `vitest.config.ts:11` (excludes `test/ablation/reports/**`); `test/ablation/mirror-tools-off.test.ts:20-22` ("gated by `OPENAI_API_KEY` and skipped here").
- `external:` Bill Walsh / Synergy Sports film-cutting practice — coaches review clip-level "decision moments" weekly, not every play. Unit tests are referee whistles; tape is coaching. Two genres, two cadences.
- `reasoned:` The strongest quality signal the team has runs whenever a human remembers to run it. Every Connector/Mirror/Cartographer change ships without an ablation rerun, risking silent regression on dimensions the team has explicitly chosen to defend.

**Rationale:** The 2026-05-13 vips-label-boundary ablation report is the kind of artifact the team needs *before* a change ships, not after. CI integration turns "we have evals" into "evals defend the contract." The tape ritual is a different shape (selection + replay, not pass/fail) and serves prompt iteration, which CI can't. Together they convert ablation from documentation into both regression gate and improvement loop.

**Downsides:** CI rubric eval costs real LLM tokens per PR — must be gated to only ML-touching PRs or amortized via nightly + on-demand. Score floors require calibration to avoid false negatives that block legitimate prompt work. Weekly tape adds a recurring ritual whose value depends on someone actually running it.

**Confidence:** 88%
**Complexity:** Low–Medium
**Status:** Unexplored

---

### 3. Marginalia-style counsellor layer + mailbox deep-links to Trajectory

**Description:** The counsellor brief is currently a one-way Markdown download. Reject the "edit/reply the brief" path. Instead: (a) the mailbox on the island deep-links straight to the student's Trajectory page (the brief *is* the wiki); (b) counsellors can annotate beside specific timeline entries or VIPS claims in a marginalia layer — dated, named, never overwriting the compiled truth. Counsellor input becomes evidence-adjacent commentary, not a parallel narrative.

**Basis:**
- `direct:` `src/server/counsellor-brief.handler.server.ts:1-15` (handler returns `{ markdown }` with no persistence, ends in browser Blob); grounding pain point #5 ("Counsellor mailbox brief is display-only").
- `external:` Glossa Ordinaria tradition in medieval scriptoria — authoritative text vs commentary tradition. The structural problem ("how do you let an authority figure react to a record without contaminating its provenance?") is identical and was solved a millennium ago. eLife / PubPeer for the contemporary equivalent (reviewer disagreement as first-class signal).
- `reasoned:` Settled positioning bans in-wiki editing of compiled truth. Marginalia is the only cultural form that resolves "react without overwrite" without violating that contract.

**Rationale:** The most subtle compounding pain in the system: the counsellor reads the brief, talks to the student, forms an opinion — and has no surface to write back. The carefully-built Cartographer → brief pipeline ends in a manila folder. Marginalia threads the needle. Mailbox-as-deep-link removes the lossy summary layer entirely (the Granola "AI-summary-handoff loses nuance" failure mode); the Trajectory page is the brief, in canonical form.

**Downsides:** Adds a new write surface, which means a new permission model (counsellor-vs-student visibility), new moderation questions, and probably new RLS policies. The marginalia surface is easy to design badly (clutter, dominance over the canonical record). Worth a brainstorm before implementation.

**Confidence:** 78%
**Complexity:** Medium
**Status:** Unexplored

---

### 4. Empty island as honest signal, expressed via succession grammar

**Description:** Codify "empty evidence = empty island" as a tested invariant (after `withStudentSpaceBaseline` removal lands in U1–U3). Then express the *non-emptiness* as ecological succession stages: bare scree → lichen/moss → meadow → softwood → climax hardwood, gated by cumulative evidence types (parallax progression). A new student isn't broken — they're a meadow before trees. A sparse-evidence student isn't padded — they're early succession.

**Basis:**
- `direct:` U1–U3 in `docs/plans/2026-05-15-001-fix-world-stage-real-data-plan.md` (active fix removing decorative trees/flowers). Plan's own Risks section names "Removing decorative trees makes early-onboarding islands look bare."
- `external:` Ecological succession (Clements 1916; Connell & Slatyer 1977) — stages are readouts of substrate maturity, not decoration. Outer Wilds / Obra Dinn — game state changes *as a direct read* on internal state.
- `reasoned:` "Faithful mirror" is the load-bearing world-stage contract. Decoration violated it because it lied. *Sparseness*, however, isn't a lie if the visual grammar names it correctly. Succession is a principled vocabulary for sparseness that doesn't require padding.

**Rationale:** The current U1–U3 work fixes one half of the contract (no fakes); succession grammar fixes the other (sparseness reads as state, not bug). Resolves the plan's own stated risk without adding decorative geometry. Compounds with idea #1 — succession stages can transition on verifier-admitted evidence in real time.

**Downsides:** Requires visual design work to define and tune the stage transitions (when does meadow become softwood?). Risk of importing game-progression mechanics if stages feel rewardlike — but stages are *substrate*, not score, and that distinction can be preserved with care.

**Confidence:** 84%
**Complexity:** Low–Medium
**Status:** Unexplored

---

### 5. Bootstrap `docs/solutions/` from existing dated docs

**Description:** Stand up `docs/solutions/` (the path the `ce-compound-refresh` skill already expects) and seed it with 6–10 short pattern docs extracted from existing brainstorms, plans, and `docs/followups.md`. Candidates from the institutional knowledge already in the repo: parallax rule, deterministic verifier > LLM judge, descriptor boundary, transcription-is-dumb-capture, Schwartz adolescent inflation, closed VIPS taxonomy enforced in code, no-conversational-Mirror rationale. Each as one short pattern doc with citations back to the source.

**Basis:**
- `direct:` Grounding pain point #6 — "No `docs/solutions/` learnings store — hard-won rules scattered across 12+ dated docs." Confirmed by `ls docs/` (brainstorms/, ideation/, plans/, followups.md exist; `solutions/` absent). The `ce-compound-refresh` skill description explicitly references `docs/solutions/` as the canonical location.
- `reasoned:` Every new contributor (human or fresh Claude session) re-learns the same 6 rules by archaeology across 12+ docs. Every new plan re-cites the same constraints. A small extraction pass converts this from a recurring cost into a one-grep lookup.

**Rationale:** Lowest complexity, highest compounding leverage of any survivor. The team consistently produces high-quality rationale and files it by date; the rationale just isn't indexed. Pairs with the existing `ce-compound` workflow for capturing future learnings.

**Downsides:** Solutions docs drift if not refreshed (the `ce-compound-refresh` skill is the answer, but adds another ritual). Risk of premature codification — some "rules" in dated docs are still being learned and shouldn't be frozen yet.

**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

---

### 6. Mirror "explain back" — one async cue, A&R-style

**Description:** Sparingly, after Mirror persists a transcript, surface ONE structured question back to the student: "I think I heard X — did I get this right?" or "you said Y about Z three weeks ago; was Z the part that mattered?" Single async prompt, no follow-up, no chat — the student's reply becomes a new Mirror entry (or marks the prior one as confirmed). Imports the Protégé Effect / Cognitive Mirror finding while preserving "no conversational AI in Mirror" by being one-shot, not turn-taking.

**Basis:**
- `external:` *The Cognitive Mirror: A Framework for AI-Powered Metacognition and Self-Regulated Learning* (Tomisu, Ueda, Yamanaka — Frontiers in Education, 2025) — "AI as teachable novice"; student explains, AI mirrors quality. Cited Teaching Quality Index gates response modes. A&R demo-review practice — playback + one structural question, then silence.
- `reasoned:` The settled "no conversational Mirror" rule was about turn-taking AI breaking reflective state. A *single* asynchronous prompt is not a conversation; it's a mirror with a hole in it. The student paces the response.
- `direct:` Sub-frame convergence — three independent frames (inversion, assumption-breaking, cross-domain analogy) landed on the same pattern, which is the surprise-me signal that the move sits in an unexplored gap.

**Rationale:** The most ambitious idea in the survivor set. Mirror today is one-way synthesis; the Protégé Effect evidence says inverting one step durably deepens reflection. Threading it carefully through "no conversational AI" (one cue, not a turn) is the design challenge, and the rationale is strong enough to be worth the brainstorm.

**Downsides:** Easy to misexecute — a poorly-tuned prompt feels like a quiz and breaks the quiet-mirror contract immediately. Cadence is critical (too frequent → interview feeling). The line between "one async cue" and "turn-taking AI" is thin enough that it warrants explicit positioning before any UI work.

**Confidence:** 70%
**Complexity:** Medium
**Status:** Unexplored

---

### 7. `seedStudent(spec)` builder + persona-grounded demos

**Description:** Replace U6 ("seed real VIPS data for demo-b/c/d") with a `seedStudent({ persona, evidenceCount, claims, transcripts })` builder that produces a coherent student (mirror entries → connector events → pages → trajectory) deterministically. Demos b/c/d become explicit persona archetypes — the disengaged student, the over-narrating student, the contradictory-evidence student — not "another populated student." The four demos become the spec for what the product claims to handle.

**Basis:**
- `direct:` U6 in `2026-05-15-001` plan; grounding pain point #2 (only demo-a populated).
- `reasoned:` Three frames (assumption-breaking, leverage, constraint-flipping) converged on the same observation: U6 is currently framed as a data-entry task, but four demos with one populated student silently encodes that the team has one user in their heads. Naming demo-b/c/d explicitly forces commitment to the *edge of the product's claim*.

**Rationale:** Pairs with idea #2 (ablation) and idea #1 (capture-time Connector) — all three want the same primitive (a coherent, deterministic student fixture). Without this, every new ablation test reinvents seeding, and every new feature demo is a manual scramble. Compounds with idea #4 (empty island succession) by giving each demo a defined developmental stage to render.

**Downsides:** Replacing U6 with a builder expands its scope from "fill data" to "design the personas," which may delay the in-flight plan. Best landed as a follow-up *after* U1–U7 closes, not as a substitute.

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason rejected |
|---|------|-----------------|
| F1#3 | `pendingTranscript` retry lives in React state — lost on refresh | Tactical bug; worth fixing but below "next direction" ambition floor — file as a quality followup |
| F1#5 | Token accounting under-counts every cost decision | Already in `docs/followups.md` as triaged; tactical, not directional |
| F2#7 | Replace self-critique eval with hard verifier failure (or delete) | Tactical cleanup call; warrants discussion but below directional floor; consider as small hygiene PR |
| F3#2 | Unit of capture isn't a voice note (photos, screenshots, music) | Strong reframe but high scope; better as a brainstorm seed than an immediate track |
| F3#4 | VIPS visibility isn't binary — per-axis decision | Interesting positioning question but better as brainstorm variant than build direction |
| F3#6 | Per-student-forever ≠ per-student-alone (aggregate awareness) | Borderline relitigates settled "no cross-student inference"; revisit only if explicitly reopened |
| F4#1 | Descriptor fixture library + `renderDescriptor()` replay harness | Strong infra idea; partially subsumed by idea #7 (seedStudent) — fold in there if pursued |
| F4#2 / F4#3 / X8 | Append-only `student_events` event log as one true spine (+ withStudent enforcement) | High-leverage but high-complexity; substantial architectural reshape competing with the in-flight U1–U7 fix. Worth a dedicated brainstorm if/when scaling pressure appears |
| F4#6 | `vips_claim_crosswalk` table for UofT word-bank + SkillsFuture CCS | Already vetted at 88% in prior ideation Resume pass — pick from there directly when ready; not a "what's next" discovery |
| F5#3 | Trajectory as naturalist field journal (Darwin/Anning genre) | Useful visual-design direction but not a "next track" — fold into design language work |
| F5#5 | Prompt bird as stigmergic pheromone trail | Elegant standalone but narrow scope; consider as second-pass enhancement after U5 lands |
| F5#6 | VIPS library as museum curation (provenance, attribution-confidence) | Overlaps with F5#3 (genre-as-positioning); both are design-language calls |
| F6#1 | Single-student forever (longitudinal-depth design) | Thought experiment, not actionable as a track; subject-scope risk |
| F6#2 | Zero-compute Mirror (Whisper + deterministic template form only) | Too radical to land without ablation evidence Mirror inference is harmful; revisit only if synthesis failures dominate |
| F6#3 | One-reflection-per-year island (ritual artifact) | Thought experiment; subject-replacement risk |
| F6#6 | 30-second reflection budget (hard timeout) | Interesting brainstorm seed; not load-bearing as direction |
| (≈25 more) | Various single-frame ideas duplicated by stronger cross-cutting synthesis | Folded into surviving cross-cuts (X1 through X7) |

## Notes on the survivor set

- **Sequencing.** The in-flight `2026-05-15-001` plan (U1–U7) should land *first*. Survivors #1, #3, and #4 sit naturally on top of that fix. Survivor #5 (`docs/solutions/`) and survivor #2 (ablation CI + tape) are independent and can run in parallel.
- **Largest unknown.** Survivor #6 (Mirror "explain back") is the highest-novelty, highest-risk candidate — it threads a needle through settled positioning. Worth a brainstorm before any UI work; cheap to defer if the bar isn't met.
- **Compounding cluster.** Survivors #2, #5, and #7 share a "compound knowledge" character — ablation evals, learnings store, demo-as-spec — and reinforce each other. If only one slot exists, pick #5 (lowest complexity, highest immediate compounding).
- **No-axis run.** Surprise-me mode skipped Phase 1.5 decomposition; survivor spread is across subsystems (agent runtime × 2, world stage × 1, counsellor flow × 1, process/eval × 2, demo infra × 1) and across "fix existing dead end" vs "introduce new mechanism" axes.
