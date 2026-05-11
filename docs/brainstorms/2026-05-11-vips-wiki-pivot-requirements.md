---
date: 2026-05-11
topic: vips-wiki-pivot
---

# VIPS Wiki Pivot — Sensemaking Agents v0.2

## Summary

v0.2 reshapes the post-Mirror agent pipeline so each student maintains four living VIPS wiki pages (Values, Interests, Personality, Skills) with agent-rewritable compiled-truth summaries and append-only evidence timelines, plus a separate Trajectory page of under-specified lead-sheet pathways — all evidence-quote-anchored, plain-code verified, and demo-seeded with a sample of multiple Singapore secondary students.

---

## Problem Frame

Three problems with v0.1's Connector + Pathfinder shape:

First, **the agents make plausible-sounding claims with no actual citation enforcement.** The Connector emits `patterns` with `evidence_reflection_ids`, and Pathfinder cites those IDs forward — but the schema only proves an ID was emitted, not that the cited reflection supports the claim. Research is unambiguous here: prompt-level "leave blank if no evidence" is unreliable (LangExtract's `char_interval=None` filtering and the "Cited but Not Verified" arXiv paper both show frontier models hallucinate citations even with the strictest instructions). v0.1's anti-sycophancy is aspirational, not structural.

Second, **the agents speak a vocabulary MOE counsellors don't use.** Singapore secondary students doing Education and Career Guidance work with their school counsellors in the V/I/P/S (Values, Interests, Personality, Skills) frame — established at Temasek JC, Kranji, BPGHS, Peicai, and across MOE's "Discovering Purpose" pillar. v0.1's free-form `patterns` field has nowhere to land that vocabulary. The output is hard for a counsellor to triage or cross-reference.

Third, **each sense-making run starts from scratch.** v0.1's Connector reads the corpus, emits patterns, discards them; the next run re-derives whatever it can. Patterns can "weaken, contradict, or harden over time" (the prompt itself acknowledges this) but the schema gives that intuition no home. There's no accumulation, no audit trail, no signal that a once-strong claim has aged.

The cost of leaving v0.1 as-is is invisible right now because v0.1 ships demo-mode with `student_id='demo'`. But the bigger the corpus gets, the worse the gap between what the agents are pretending to do (evidence-grounded inference) and what they structurally enforce (none) — and the harder it gets to defend in front of a real MOE counsellor.

---

## Actors

- A1. **Student** — Singapore secondary school student. Records reflections, reviews proposed VIPS-page additions right after each session, browses the four V/I/P/S wiki pages and the Trajectory page, can soft-delete ("forget") timeline entries from the wiki.
- A2. **Mirror agent** — Unchanged from v0.1. Runs async on a transcript at session end; emits `{validation, inferred_meaning, story_reframe}`.
- A3. **Connector agent** — Reshaped. Runs automatically after every Mirror session. Reads the new reflection plus the student's existing VIPS pages. Proposes diffs to the four V/I/P/S pages (compiled-truth rewrites + new timeline entries). Proposed diffs pass through a deterministic verifier before reaching the student.
- A4. **Cartographer agent** — Renamed from Pathfinder. Runs only on manual "Run sense-making" trigger. Reads the (verified) VIPS pages. Rewrites the student's Trajectory page with under-specified lead-sheet pathways referencing claim IDs from the VIPS pages.
- A5. **Deterministic verifier** — Not an LLM. Plain code. Runs between Connector output and the student review surface. Checks each proposed timeline entry's verbatim quote against the cited reflection; drops or downgrades unsupported claims.
- A6. **Operator (demo)** — Person running the demo. May press "Run sense-making" to showcase the agent chain. In production this is the student.

---

## Key Flows

- F1. **Reflection + post-session VIPS-page review**
  - **Trigger:** Student finishes a Mirror session (presses Stop).
  - **Actors:** A1, A2, A3, A5
  - **Steps:** (1) Whisper transcribes the audio. (2) Mirror agent runs async; emits its three-field reflection. (3) Connector agent runs automatically against the new reflection + the student's existing four VIPS pages; proposes diffs (compiled-truth rewrites + new timeline entries). (4) Deterministic verifier checks each proposed timeline entry's verbatim quote against the cited reflection; drops unsupported, downgrades single-context. (5) Student sees a review surface immediately: "Since this reflection, here's what was added to your V/I/P/S pages." (6) Student confirms or forgets each proposed entry. (7) Confirmed entries land on the wiki; forgotten entries go to an archived folder (excluded from future sense-making context but kept in the audit trail). (8) If the student leaves before completing the review, unreviewed proposed diffs persist as a "pending review" state surfaced on next app open — they do not auto-commit and do not expire silently.
  - **Outcome:** Student's V/I/P/S wiki pages reflect the new reflection. Wiki pages are read-only after commit.
  - **Covered by:** R1, R2, R3, R5, R6, R7, R8, R10, R11, R13, R14, R30

- F2. **Manual sense-making run with live visualization**
  - **Trigger:** Student or operator presses "Run sense-making" in the wiki view.
  - **Actors:** A1 / A6, A4
  - **Steps:** (1) Wiki view enters live run mode. (2) Cartographer agent runs; reads the four VIPS pages plus the corpus. (3) After the run completes, step-event replay renders in the wiki view (started, tool calls, partial output, completed). (4) Cartographer rewrites the student's Trajectory page: trajectory paragraph + 2–5 lead-sheet pathways + open questions + disclaimer. (5) Trajectory page renders in the wiki when complete; run can be re-triggered.
  - **Outcome:** Student's Trajectory page is fresh; the run's step events were visible to the student/operator throughout the replay.
  - **Covered by:** R15, R16, R17, R18

- F3. **Soft-delete via "forget"**
  - **Trigger:** Student selects a timeline entry on a VIPS wiki page and chooses "forget."
  - **Actors:** A1
  - **Steps:** (1) Timeline entry moves to a per-student archived folder. (2) Entry is excluded from sense-making context for all future Connector and Cartographer runs. (3) Entry is also excluded from hybrid retrieval (its vector embedding, if any, is removed from the search index or filtered at query time). (4) Audit trail of forgotten entries is preserved (entries remain in storage; only the access path changes). (5) The forget-count per VIPS dimension is recorded but is NOT surfaced to agents or to the student in v0.2.
  - **Outcome:** Wiki content reflects student agency; agents cannot undo a forget; forgotten content does not leak into future inferences via retrieval.
  - **Covered by:** R19, R20

---

## Requirements

**VIPS wiki pages**
- R1. Each student has exactly **four VIPS wiki pages**: Values, Interests, Personality, Skills. Pages are addressable, persistent, per-student.
- R2. Each VIPS page has two parts: (a) a **compiled-truth** summary paragraph the agent rewrites as evidence accrues, written in second-person empathetic voice; (b) an **append-only timeline** of verified claim entries with verbatim quotes and reflection-ID pointers. **Each rewrite of compiled-truth must preserve any claim from the prior compiled-truth that still has supporting evidence in the current (non-forgotten) timeline; the agent may not delete or contradict a claim that has not been superseded, contradicted, or forgotten.** This bounds drift to evidence-driven change.
- R3. Wiki pages are **read-only** to the student. The student cannot edit compiled-truth or delete timeline entries directly. The only mutation a student can perform on a VIPS page is "forget" (soft-delete a timeline entry — see R19).
- R4. The compiled-truth paragraph **uses canonical VIPS sub-dimension IDs** from a closed vocabulary (e.g., `values.contribution`, `interests.investigative`, `personality.extraversion`, `skills.interpersonal`). Free-form prose is allowed in the surrounding paragraph but tagged claims must reference canonical IDs.
- R5. Each VIPS page has an **"Open question"** line at the end of its compiled truth — the question the corpus is almost-but-not-yet able to answer. The Connector emits this line.

**Connector agent — per-session enrichment**
- R6. The Connector agent **runs automatically after every Mirror session**, against the new reflection plus the student's existing four VIPS pages. It does NOT require manual triggering for this step.
- R7. The Connector emits **proposed diffs**: compiled-truth rewrites and new timeline entry additions per VIPS page. It does not commit directly to the wiki.
- R8. Each proposed timeline entry has: (a) a **verbatim quote** from a specific reflection, (b) a **reflection_id**, (c) a **canonical VIPS claim ID**, (d) a **strength rating** (`low | medium | high`), (e) a **parallax tag** (list of context types the claim is supported by — e.g., `[school, peer]`), (f) optional `superseded_by` and `reinforces` pointers to other entries (kept as a schema stub for v0.3 reconciliation; in v0.2, only `reinforces` is populated by the Connector at proposal time).
- R9. The Connector uses an existing v0.1 tool surface plus one new tool: `search_past_mirrors`, `lookup_ecg_taxonomy`, `self_critique` (all carried forward) plus **`lookup_vips_taxonomy`** — new tool that returns canonical VIPS sub-dimension definitions and behavioral indicators.

**Deterministic verifier**
- R10. A **deterministic verifier** (plain code, not an LLM) runs between the Connector's proposed diffs and the student review surface. For each proposed timeline entry, it re-fetches the cited reflection and confirms the verbatim quote appears in it. The matching algorithm is **normalized substring**: substring match against the cited reflection text after normalizing whitespace, capitalization, and punctuation. Entries with no match are dropped; entries with partial matches (substring overlap below a full-quote match but above a minimum span) are downgraded to `strength: low`. AE7 below pins the calibration pair (honest paraphrase admitted, fabricated quote dropped).
- R11. **Parallax confidence rule**: a timeline entry can only be marked `strength: high` if it is supported by reflections from **two or more different context types**. Single-context claims are marked aspirational (visible flag in the review surface) and capped at `strength: low`.
- R12. Reflections carry a **context type tag** at persistence time (one of: `school`, `family`, `peer`, `hobby`, `civic`). Tagging mechanism (auto-inferred vs student-confirmed vs explicit picker) is a planning decision.

**Post-Mirror review surface**
- R13. Immediately after a Mirror session and Connector enrichment, the student sees a **review surface** with the verified proposed diffs grouped by VIPS dimension.
- R14. For each proposed entry the student can **confirm** (entry commits to the wiki) or **forget** (entry never commits, never appears in audit). No claim reaches the wiki without student confirmation.

**Cartographer agent — Trajectory page**
- R15. The Cartographer agent (renamed from v0.1's Pathfinder) **runs only on the manual "Run sense-making" trigger**. It does not run on cron or per-Mirror-session.
- R16. The Cartographer reads the student's four (verified) VIPS pages plus the corpus, and emits a single **Trajectory page** containing: (a) one-paragraph trajectory, (b) 2–5 lead-sheet pathways, (c) open questions, (d) disclaimer.
- R17. Each lead-sheet pathway has: (a) a **label**, (b) a **trait combination** (references to claim IDs across the VIPS pages — these IDs themselves carry the VIPS dimension provenance), (c) **ECG region tags** (not specific destinations — e.g., `cluster.healthcare`, not `medicine`), (d) **risks/tradeoffs** in SG context, (e) an **exploration prompt** (concrete next learning step — a person to talk to, an experience to seek, a question to ask).
- R18. The Cartographer's run uses **step-event replay** in the wiki view (started, tool calls, partial output, completed) after the run completes. Granularity is step-level, not token-level (carries forward from v0.1 R12). Real-time streaming during the run remains out of scope (see Scope Boundaries).

**Soft-delete ("forget")**
- R19. The student can **forget** any timeline entry from a VIPS wiki page. Forgotten entries are moved to a per-student archived folder, **excluded from future sense-making context** for both Connector and Cartographer, and **excluded from hybrid retrieval** (their vector embeddings, if any, are removed from the search index or filtered at query time). Entries are **preserved in the audit trail** (not hard-deleted). Forgotten content is **persistent-with-disclosure** in v0.2: it remains in the local SQLite file indefinitely. v0.2 ships demo-mode only — no real student data is in the loop, so the retention surface is bounded to the developer's local machine. Real retention work (TTL-then-purge or cryptographic erasure) is deferred to v0.3 when PDPA scope opens up.
- R20. The count of forgotten entries per VIPS dimension is recorded in storage. In v0.2, this count is **NOT surfaced to agents** in their prompt context and **NOT surfaced to the student** in the UI. Agent and student behaviour in response to this signal is deferred to v0.3 once the product response is defined.

**ECG taxonomy crosswalks**
- R21. The ECG taxonomy fixture's existing `links?: string[]` field is **populated** with subject↔cluster and cca↔cluster crosswalks (e.g., `subject.h2-pcme → [cluster.engineering, cluster.computing]`). Typed edges are added via deterministic extraction (regex/structured patterns), not LLM inference.

**Counsellor brief export (side-export)**
- R22. A **pure-function `(VIPS pages + Trajectory page) → counsellor-brief.md` export** is available as a side-export — not the primary product surface. The brief is a plain markdown render (per-VIPS-dimension claims with verbatim quotes, top pathways with their risks and exploration prompts, gaps, disclaimer). No versioned-schema stability contract in v0.2 — the brief is a developer/demo debugging artifact. The export is **student-initiated** (or operator-initiated with explicit student consent in demo context); the output is not auto-persisted to disk or transmitted; rendering is on-demand.

**Model and infrastructure**
- R23. All three agents (Mirror, Connector, Cartographer) move from `gpt-4.1` to **`gpt-5.5`**. Model is centralized in one config — no hardcoded model strings scattered across agent files.
- R24. The v0.1 hard 3-entry corpus gate on "Run sense-making" is **removed**. Replaced with a universal **"patterns may be weak — run anyway?"** confirm dialog when the corpus has fewer than 3 verified VIPS claims across all dimensions.

**Demo seed data**
- R25. The demo seed updates from 8-reflection single-`demo`-student to a **sample of 3–5 Singapore secondary students** (e.g., `demo-a`, `demo-b`, …), each with **6–10 reflections** spanning context types (school + family + peer + hobby + civic per student) so parallax is actually exercised. Each student exhibits a **distinct emerging VIPS profile** — different Values dominant, different RIASEC tilt, different Skills evident — so the agents demonstrate they pick up different signals from different students.
- R26. Seeded reflections span **positive + ordinary + negative experiences** per student (v0.1's R6 — soccer win and parent fight equally valid — carries forward) and use **authentic SG secondary student voice** (vernacular, real school references such as JC / IP / poly tracks, real CCAs and subject combinations drawn from the existing ECG taxonomy fixture).

**Carry-forward (unchanged from v0.1)**
- R27. Per-student tenancy invariant carries forward unchanged (no cross-student inference; everything scoped to `student_id`).
- R28. Mirror agent's three-field output (`{validation, inferred_meaning, story_reframe}`), webcam-visual-only, transcripts-only audio policy, single-vendor OpenAI, and the silent-ritual reflection UI all carry forward unchanged.

**Voice and tone**
- R29. **Compiled-truth voice is calibrated per VIPS dimension.** Values — cite evidence, avoid aspirational inflation. Interests — behaviour-shape language drawn from canonical RIASEC items. Personality — no diagnostic or trait-typing labels (carries forward the v0.1 no-diagnostic-language rule). Skills — frame as "competencies the corpus shows being practiced," not "competencies you have." No section should read in the same uniform warm register as another.

**Pending-review behaviour**
- R30. If a student does not complete the review surface (closes the app, loses connection, defers), proposed diffs persist as a **"pending review"** state surfaced on next app open. Diffs do not auto-commit and do not expire silently. The student must explicitly confirm or forget each entry from the pending-review surface before a new Mirror session's diffs land on top of unreviewed ones.

---

## Acceptance Examples

- AE1. **Covers R6, R7, R10, R13, R14.** Given a student finishes a Mirror session, when the Mirror agent's output persists, then the Connector agent runs automatically against the new reflection + existing VIPS pages, then the deterministic verifier checks each proposed timeline entry's quote against its cited reflection, then the student is shown the review surface with verified diffs grouped by VIPS dimension, and no diff is committed to the wiki without the student's confirm action.

- AE2. **Covers R10, R11.** Given the Connector proposes a timeline entry with quote "I hated when the teacher told us exactly what to do" citing reflection #5, when the verifier checks reflection #5's transcript and finds the quote does not appear verbatim, then the entry is dropped and never reaches the student review surface. Given a timeline entry whose quote appears in reflections tagged only `school`, when the verifier applies the parallax rule, then the entry is marked aspirational and capped at `strength: low` regardless of the agent's proposed strength.

- AE3. **Covers R3, R19, R20.** Given a confirmed timeline entry exists on a student's Values page, when the student selects "forget" on that entry, then the entry moves to the archived folder, then the next Connector and Cartographer runs do not see the entry's content in their prompt context, then hybrid retrieval no longer surfaces the entry's vector neighbourhood, then the forget-count is recorded in storage but not surfaced to either agents or the student, and the entry is never hard-deleted from storage.

- AE4. **Covers R15, R16, R17.** Given a student presses "Run sense-making" in the wiki view with at least one verified claim across their VIPS pages, when the Cartographer runs, then it emits a Trajectory page with 2–5 lead-sheet pathways, then each pathway's `trait_combination` references claim IDs that exist on at least one of the student's VIPS pages, and each pathway's `ecg_region_tags` come from the ECG taxonomy fixture (no invented IDs).

- AE5. **Covers R24.** Given a student presses "Run sense-making" with zero verified claims in their VIPS pages, when the wiki view renders, then the run-button is enabled and the confirm dialog ("patterns may be weak — run anyway?") fires when pressed; the student can proceed.

- AE6. **Covers R25.** Given the build is checked out and `pnpm seed` runs, when the database is populated, then there are at least 3 distinct `student_id` values, each with at least 6 reflections, and across each student's reflections at least 3 different context type tags appear.

- AE7. **Covers R10.** *Verifier calibration pair.* Given the student says aloud "i hated when teacher told us exactly what to do" and Whisper transcribes that with normalized capitalization, when the Connector proposes a timeline entry citing the reflection with the quote "i hated when teacher told us exactly what to do" (verbatim against the transcript), then the verifier confirms the quote appears and the entry is admitted. Given the same situation but the Connector proposes the quote "I really hated being told what to do in class" (paraphrase the student did not say), then the verifier finds no verbatim match and the entry is dropped.

- AE8. **Covers R30.** Given a student closes the app after seeing the post-Mirror review surface but before confirming or forgetting any proposed diff, when the student re-opens the app, then the pending-review state is surfaced first, the unreviewed diffs from the prior session are still actionable (confirm or forget per entry), and no new Mirror session can stack diffs on top until the pending review is cleared.

---

## Success Criteria

- A Singapore secondary student can finish a Mirror reflection, see what the system noticed about their values/interests/personality/skills (with verbatim quotes from their own words backing each claim), forget anything that feels wrong, and trust that nothing surfaces in their wiki that wasn't actually said.
- **v0.3+ aspiration**: If the counsellor brief is shown to an MOE ECG counsellor in a future pilot, they should be able to identify which evidence supports each pathway recommendation, see where the student's signal is strong vs aspirational, and have specific exploration questions ready to start a 20-minute session with. (Not a v0.2 acceptance gate — no MOE counsellor is in the v0.2 loop. Listed here to anchor v0.3 trajectory.)
- A new contributor reads this requirements doc plus the v0.1 brainstorms and can identify exactly what changes between v0.1's `{patterns, still_unclear}` + `{trajectory, pathways, disclaimer}` shape and v0.2's VIPS-page + Trajectory-page shape without re-reading the conversation that produced this doc.
- The ablation harness (reshaped from v0.1) shows that v0.2's tools-on output beats tools-off output on **provenance, specificity, novelty, anti-sycophancy** at the v0.1 bar (≥2 points across ≥3 dimensions).
- Implementation choices (DB schema, exact verifier algorithm pending Resolve-Before-Planning, UI component shape, prompt wording) are explicitly the planner's job, not this doc's.

---

## Scope Boundaries

- **In-wiki editing of compiled-truth or timeline entries** — student cannot edit; only forget. v0.1's wiki-edit primitives do not apply to VIPS pages.
- **Active per-claim validation on the wiki** ("that's me / not quite / context missing" buttons on each entry) — replaced by review-after-session.
- **Hard deletion of claims** — only soft-delete via forget; nothing is destroyed. Forgotten content is persistent-with-disclosure in v0.2 (local SQLite, indefinite). TTL-and-purge or cryptographic erasure is deferred to v0.3 with PDPA scope.
- **Counsellor-facing UI or app** — counsellor brief is markdown export only; no separate counsellor portal in v0.2. No counsellor is in the v0.2 loop.
- **Versioned brief schema with stability contract** — deferred to v0.3, when a counsellor pilot exists to consume the schema. In v0.2 the brief is a plain markdown render with no compatibility commitment.
- **Cross-student inference / cohort patterns** — still per-student forever, unchanged from v0.1.
- **Weekly background reconciliation pass** — deferred to v0.3, where a live accumulating corpus actually has drift to reconcile. The `superseded_by` field on timeline entries stays as a schema stub for v0.3 to fill in; v0.2 only populates `reinforces` at proposal time.
- **Hybrid retrieval (sqlite-vss + RRF) for `search_past_mirrors`** — deferred to v0.3. FTS5 is sufficient at v0.2 seed scale (18–50 reflections per student).
- **Agent-visible forget-count signal** — deferred to v0.3. The count is recorded in storage but neither agents nor students see it in v0.2.
- **Student-visible forget-count** — same: recorded, not displayed in v0.2.
- **FormData/base64 plan-vs-code drift fix** — out of v0.2 scope; not blocking.
- **Auth, multi-tenant, PDPA layer** — still demo-mode for v0.2. Note: R19's retention path and R22's access control are Resolve-Before-Planning decisions even in demo-mode because they shape data lifecycle, not because PDPA is in scope.
- **VIPS dimensions beyond V/I/P/S** — no fifth dimension, no MBTI sub-types, no Big5 facets beyond Extraversion + Neuroticism (the empirically reliable dimensions from reflection-text inference).
- **Per-pathway "VIPS fit notes" as separate fields** — `trait_combination` claim IDs (R17.b) already encode dimension provenance; separate fit-prose-per-dimension is deferred to v0.3 (or to the counsellor brief if a counsellor pilot ships).
- **Trigger.dev / cron infrastructure / WebRTC / `gpt-realtime-2` / TTS** — all stay out (carried from v0.1).
- **Real student-collected reflections** — v0.2 seed is curated fixture data; collecting real-student reflections requires consent/PDPA work that belongs in v0.3+. Anonymized or adapted versions of real student reflections are treated equivalently and are also excluded from the v0.2 seed.
- **Audio for seed reflections** — seed ships as text transcripts only; the live Whisper transcription path stays unexercised by seed but works in live sessions.
- **Renaming Connector** — name stands; the rename effort is scoped to Pathfinder → Cartographer.

---

## Key Decisions

- **VIPS wiki pages as compiled-truth + timeline (the v0.2 thesis).** Rationale: prompt-level "leave blank if no evidence" is unreliable (LangExtract `char_interval=None` pattern, "Cited but Not Verified" arXiv paper, gbrain production usage). Compiled-truth + timeline gives evidence-before-inference a schema home; "patterns weakening, contradicting, hardening over time" finally has somewhere to live.
- **Compiled-truth is bounded by the timeline.** Rewrites must preserve still-supported claims; this prevents the user-visible top-of-page from oscillating in ways the durable-timeline framing would otherwise mask.
- **Pathfinder renamed to Cartographer.** Rationale: "Pathfinder" implies finding *the* path; the v0.2 lead-sheet shape is about mapping territory, not picking destinations. "Cartographer" pairs with Connector (one connects, one maps) and inherits depersonalization for free.
- **Review after Mirror session, not on the wiki page.** Rationale: the student is already in reflective mode immediately after their session — the moment of attention matches the review task. Splitting review onto the wiki page would either force per-claim buttons (heavy) or require the student to remember to check (passive failure mode).
- **Wiki pages are read-only; only forget is permitted.** Rationale: the wiki accumulates trust as a durable record; in-wiki editing would let students rewrite history rather than soft-delete with audit trail. The gbrain `forget` pattern (soft-delete, never hard-DELETE) preserves provenance.
- **Connector runs per-session; Cartographer runs only on manual trigger.** Rationale: VIPS pages are an enrichment of the existing reflection commit flow (the cost of a Connector run is amortized into the reflection's natural latency); Cartographer's Trajectory page is a synthesis the student/operator chooses to invoke explicitly (it requires the VIPS pages to have something to read from).
- **Deterministic verifier between Connector and student review.** Rationale: prompt-level grounding instructions are unreliable; post-hoc verbatim verification is the only structural enforcement of evidence anchoring.
- **Verifier algorithm: normalized substring.** Rationale: pure substring is too strict (drops legitimate quotes whenever Whisper or the agent normalizes capitalization or trims punctuation); span-overlap-with-threshold introduces a tunable that can silently re-admit hallucination. Normalized substring (whitespace + capitalization + punctuation tolerance) catches fabrication while admitting Whisper's normalization variations. AE7 pins the pass/fail bar; span-overlap remains an option for v0.3 if normalized proves insufficient.
- **Retention: persistent-with-disclosure for v0.2 demo-mode.** Rationale: v0.2 is single-machine, single-developer, no real student data — TTL-then-purge would erode R19's audit-trail guarantee for no PDPA benefit, and cryptographic erasure adds key-management complexity disproportionate to demo scope. Persistent-with-disclosure (explicit doc note + Scope Boundary) is honest about the retention surface and defers real lifecycle work to v0.3.
- **Parallax confidence rule (multi-context required for `strength: high`).** Rationale: directly attacks the aspirational-vs-operative trap that Schwartz-style values inference falls into for adolescents (Personal Values Dictionary r=0.1–0.4 with 3/10 values at non-significance; aspirational values inflate in school contexts).
- **Lead-sheet pathways are under-specified.** Rationale: Cartographer doesn't know the student's venue/player/audience; over-specification = overclaim. Region tags (`cluster.healthcare`) instead of destinations (`medicine`).
- **Sample of 3–5 SG secondary students in seed.** Rationale: v0.2's architecture only exercises if each student has distinct emerging signals AND context-diverse reflections. A single-student seed cannot validate parallax, dimension asymmetry, or counsellor-brief differentiation.
- **`gpt-4.1` → `gpt-5.5` with ablation re-baselining.** Rationale: stronger reasoning + instruction-following directly helps the no-diagnostic-language rule and evidence-anchoring; v0.1's ablation rubric was baselined against `gpt-4.1` and must re-baseline before claiming v0.2 wins.
- **Counsellor brief is a side-export, not the product.** Rationale: student-is-primary audience decision; MOE counsellor pilot remains a v0.3+ destination. The brief is a demo/dev artifact, not a versioned schema contract.
- **Forget-count is recorded but not surfaced (to agents or students) in v0.2.** Rationale: shipping a behaviour-shaping signal without a defined behaviour spec creates two opposite reasonable failure modes (agent becomes over-conservative; agent over-corrects to sycophancy). v0.3 owns the product response.
- **Reconciliation deferred.** Rationale: at v0.2 seed scale (static fixture, no live accumulating corpus), reconciliation has no work to do. The `superseded_by` schema stub is preserved so v0.3 doesn't require a breaking change.
- **Hybrid retrieval deferred.** Rationale: FTS5 is sufficient at v0.2 corpus sizes; sqlite-vss + RRF is leverage for a larger corpus, not for the grounding goal.

---

## Dependencies / Assumptions

- Assumes the **OpenAI Agents SDK** supports `gpt-5.5` via the existing `@openai/agents` import path and tool/handoff primitives.
- Assumes the **VIPS canonical vocabulary** (8 Values, RIASEC 6, Big5 E+N, Skills categories) can be curated in v0.2 timeframe — drawn from MOE-aligned sources (Temasek JC ECG, Kranji ECG, MOE ECG overview).
- Assumes **per-student SQLite** remains the v0.2 storage layer; no Postgres migration in this scope.
- Assumes the **v0.2 first test subject is still the user** — no real Singapore secondary student in the loop yet; that's v0.3+.
- Assumes the existing ECG taxonomy fixture's `links?: string[]` field can be populated cleanly without breaking v0.1 consumers (the field is declared but currently unused across all 30 entries — verified during ideation).
- Assumes **v0.2 demo-mode retention is bounded to the local dev SQLite file**: forgotten content persists indefinitely on the developer's machine; this is acceptable because no real student data is in the v0.2 loop. Real retention work (TTL-then-purge or cryptographic erasure) is v0.3+ when PDPA scope opens up.

---

## Outstanding Questions

### Resolve Before Planning

*(none — verifier algorithm locked to **normalized substring** (see R10 and Key Decisions); retention path locked to **persistent-with-disclosure for v0.2 demo-mode** (see R19, Scope Boundaries, Dependencies). Planning is unblocked.)*

### Deferred to Planning

- [Affects R12][Technical] Mechanism for reflection context-type tagging: at-save inference (cheap LLM call or rule-based heuristic) vs student-confirmed at session end vs explicit context-picker UI. Trade-offs around accuracy, friction, and student burden.
- [Affects R23][Technical] Centralized model-config shape: single `MODEL` constant vs per-agent config (Mirror could stay on a cheaper model since its prompts are short and outputs simple). A/B-ability is a design value.
- [Affects R25, R26][Needs research] Seeding mechanism: hand-curated transcripts (slow, authentic) vs LLM-generated transcripts (fast, risk of inauthenticity). The seed sets the realistic-data bar for ablation; this matters. Anonymized adaptation of real student corpora is excluded by Scope Boundaries.
- [Affects R5][Technical] How the compiled-truth's "Open question" line is constructed and updated. Always emitted by Connector? Part of the VIPS-page diff payload? Does Cartographer also write open questions on the Trajectory page?
- [Affects R8][Technical] `reinforces` pointer mechanism: how the Connector identifies which prior timeline entry a new entry reinforces. (`superseded_by` is reserved for v0.3 reconciliation.)
- [Affects all R-IDs in Success Criteria][Needs research] v0.2 ablation rubric reshape for wiki-page output. The v0.1 rubric (provenance, specificity, novelty, anti-sycophancy) carries forward; the new dimension on counsellor-utility moved to v0.3 aspiration so its operationalization defers with it.
- [Affects R23][Technical] Model-swap re-baselining method: re-run v0.1's existing ablation tests with `gpt-5.5` before v0.2 surface changes land, to isolate the model-swap effect from the architecture-change effect.
