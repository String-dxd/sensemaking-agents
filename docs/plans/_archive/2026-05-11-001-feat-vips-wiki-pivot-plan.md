---
title: "feat: VIPS Wiki Pivot — compiled-truth + timeline, deterministic verifier, post-Mirror review, Cartographer"
type: feat
status: completed
date: 2026-05-11
origin: docs/brainstorms/2026-05-11-vips-wiki-pivot-requirements.md
---

# feat: VIPS Wiki Pivot — compiled-truth + timeline, deterministic verifier, post-Mirror review, Cartographer

## Summary

Reshape the post-Mirror agent pipeline so each student maintains four canonical VIPS wiki pages (Values, Interests, Personality, Skills) with agent-rewritable compiled-truth summaries plus append-only timelines of verbatim-quote-anchored claims. Connector runs automatically after every Mirror session and proposes diffs that pass through a plain-code deterministic verifier (normalized-substring quote check + parallax confidence rule + structural `reinforces` computation) before the student reviews them in a post-session surface and confirms or forgets each entry. Pathfinder is renamed to Cartographer and rewrites a single Trajectory page (2–5 lead-sheet pathways) on the manual "Run sense-making" trigger. Soft-delete "forget" removes entries from agent context and hybrid retrieval while preserving the audit trail. Model swaps from `gpt-4.1` to `gpt-5.5` across all three agents via a centralized config; the 3-entry hard gate is replaced with a "patterns may be weak — run anyway?" confirm; the demo seed reshapes from 1 student × 8 reflections to 3–5 SG secondary students × 6–10 reflections each spanning ≥3 context types; a counsellor-brief markdown export ships as a side-export.

---

## Problem Frame

The pivot rationale, premise checks, and architectural commitments are established in `docs/brainstorms/2026-05-11-vips-wiki-pivot-requirements.md`. This plan covers the implementation only. v0.1's `{patterns, still_unclear}` Connector + `{trajectory, pathways, disclaimer}` Pathfinder shape ships in `plans/2026-05-08-002-feat-quiet-mirror-pivot-plan.md` and remains the baseline this plan reshapes.

---

## Assumptions

*This plan was authored without synchronous user confirmation. The items below are agent inferences that fill gaps in the input — un-validated bets that downstream review and the implementing agent should scrutinize.*

- A1. **Context-type tagging mechanism: student-confirmed picker on Stop.** A one-tap closed-vocabulary picker (school / family / peer / hobby / civic) renders between the transcribe step and the `persistMirror` call in `MirrorSession.tsx`. Rationale: the parallax confidence rule (R11) makes a wrong tag silently inflate `strength: high`; automated tagging fails silently, and "Just talk to yourself" + "what context was this about?" is one extra tap the student is already in reflective mode for. The picker remembers the last-selected value as the default. Tradeoff: one extra tap vs. trust in the parallax rule.
- A2. **Centralized model config: per-agent constants in `src/agents/config.ts` + env override.** Each agent imports its constant (`MIRROR_MODEL`, `CONNECTOR_MODEL`, `CARTOGRAPHER_MODEL`) from one file; an `AGENT_MODEL` env var (set by `pnpm ablate:*`) overrides all three at once when present. Default for all three in v0.2 is `gpt-5.5`. Tradeoff: a small extra constant vs. clean A/B-ability and the option to keep Mirror on a cheaper model in v0.3 without re-plumbing.
- A3. **Seed mechanism: hybrid — hand-curated student profiles + LLM-generated reflections + hand-review pass.** Each of the 3–5 students gets a hand-curated profile (Values dominance, RIASEC tilt, Skills evident, vernacular notes, real SG school/CCA references drawn from `src/data/ecg-taxonomy.ts`); reflections are LLM-generated against per-profile prompts that pin context-type coverage; a hand-review pass catches inauthentic vernacular before commit. Tradeoff: ~1–2 days of curation vs. weeks of pure hand-curation OR ablation-poisoning slop from pure LLM generation.
- A4. **`Open question` line authorship: Connector emits per-VIPS-page open question in every compiled-truth rewrite.** R5 specifies the question is per-VIPS-dimension ("the question the corpus is almost-but-not-yet able to answer"). The Cartographer's Trajectory page carries its own (separate) `open_questions` section per R16(c). Tradeoff: a bit more output from Connector each session vs. a coherent per-dimension surface.
- A5. **`reinforces` pointer: deterministic verifier computes structurally; agent does not emit a hint.** Rule: same VIPS page + same canonical claim ID + most-recent non-forgotten match → set `reinforces` to that entry's ID. The agent does not propose `reinforces` in its diff payload. Rationale: the whole point of the verifier is that agent-emitted pointers without structural confirmation drift; `evidence before inference` extends to provenance pointers, not just quotes. `superseded_by` remains as a schema stub for v0.3 reconciliation. Tradeoff: a simpler agent contract vs. the verifier owning slightly more logic.
- A6. **Ablation rubric: carry forward four v0.1 dimensions + add a fifth `parallax discipline` dimension.** Five dimensions scored 0–3: provenance, specificity, novelty, anti-sycophancy, parallax discipline. The v0.1 bar (ON beats OFF by ≥2 points across ≥3 dimensions) still applies, scored across the larger five-dimension space. Novelty is preserved because the compiled-truth's "Open question" line surfaces non-obvious gaps the corpus is almost-but-not-yet able to answer — that's still a novelty signal, not "track the corpus" boilerplate. Parallax discipline scores whether single-context claims are correctly capped at `low`. Tradeoff: one extra dimension to score vs. keeping the v0.1 pass condition coherent across surface changes.
- A7. **Model-swap re-baselining: run `pnpm ablate:mirror` only on the v0.1 surface with `gpt-5.5` before v0.2 surface changes land.** Mirror's output shape is unchanged in v0.2 (`{validation, inferred_meaning, story_reframe}` per R28), so this isolates the model-swap effect cleanly. The sensemake surface changes substantively (Connector goes from `{patterns, still_unclear}` to proposed-diffs; Pathfinder → Cartographer with different output) — running v0.1-on-gpt-5.5 there would baseline an about-to-be-deprecated shape. Capture as `test/ablation/reports/2026-05-11-mirror-ablation-gpt-5.5.md`. Tradeoff: less coverage but cleaner isolation; the v0.2 sensemake baseline lands once the new surface ships in U11.
- A8. **VIPS schema migration: drop-and-reseed on schema_version mismatch.** Bump `SCHEMA_VERSION` from `'2'` → `'3'` in `src/db/client.ts`. v0.1's drop-and-reseed pattern carries forward (A5 of v0.1 plan) — v0.2 still demo-mode, no production data. Tradeoff: any in-flight demo `app.db` is wiped; acceptable.
- A9. **VIPS canonical vocabulary scope.** 8 Values (drawn from MOE-aligned Schwartz/CCE sources: `contribution`, `achievement`, `tradition`, `security`, `independence`, `relationships`, `wellbeing`, `learning`), RIASEC 6 (Realistic, Investigative, Artistic, Social, Enterprising, Conventional), Big5 E+N only (Extraversion, Neuroticism — the empirically reliable dimensions from reflection-text inference, per Scope Boundaries), Skills categories (`interpersonal`, `analytical`, `creative`, `practical`, `leadership`, `communication`). Each sub-dimension has an ID, a label, a one-line definition, 2–3 behavioral indicators. Sourced from MOE ECG / CCE materials; not invented. Tradeoff: a curation pass before U2 lands; the closed vocabulary is what makes R4's "canonical IDs" enforceable.
- A10. **Pending-review storage shape.** `vips_proposed_diffs` table with `status: 'pending' | 'confirmed' | 'forgotten'` + `created_at` + `reviewed_at?`. Pending diffs are not committed to `vips_pages` / `vips_timeline_entries` until confirmed; on Mirror save, if `vips_proposed_diffs.status='pending'` exists for the student, the new Mirror entry persists but the new Connector run is queued (not executed) until prior pending diffs clear. The review surface re-opens on next app load with the pending diffs. Tradeoff: explicit two-table staging vs. a status column on the wiki tables; the staging table keeps wiki tables append-only-after-commit, which the audit trail needs.
- A11. **Auto-Connector failure mode.** If the auto-Connector run after `persistMirror` fails (timeout, schema-reject, OpenAI 5xx), the Mirror entry is still persisted and the student lands on a "Review pending — Retry" surface for that Mirror session. Mirror reflection is not blocked by Connector failure. Carries forward v0.1's transcript-only-persist pattern from the v0.1 plan U4.
- A12. **Cartographer step-event compatibility.** The existing `RunStepEvent` discriminated union in `src/agents/run-events.ts` widens `AgentName` from `'connector' | 'pathfinder'` to `'connector' | 'cartographer'`. The Cartographer chain becomes a single-agent run (no handoff to a downstream agent); the `AgentRunVisualizer` two-card hardcoding becomes single-card-with-card-stack-style. The `handoff` event variant remains in the union (still emitted internally for the F1 verifier → review-surface transition logged in `agent_traces`, but not rendered in the visualizer). Tradeoff: a UI rewrite in U9 + U10 vs. preserving the v0.1 visualizer pattern.

---

## Requirements

Carried from `docs/brainstorms/2026-05-11-vips-wiki-pivot-requirements.md`. R-IDs match origin.

- R1. Each student has exactly four VIPS wiki pages (Values, Interests, Personality, Skills); pages are addressable, persistent, per-student.
- R2. Each VIPS page has compiled-truth (agent-rewritable second-person paragraph) + append-only timeline (verbatim-quoted entries). Rewrites preserve any prior claim still supported by current non-forgotten timeline.
- R3. Wiki pages are read-only to the student; the only mutation is "forget" (soft-delete a timeline entry).
- R4. Compiled-truth uses canonical VIPS sub-dimension IDs from a closed vocabulary.
- R5. Each VIPS page has an "Open question" line (per-dimension, agent-emitted).
- R6. Connector auto-runs after every Mirror session.
- R7. Connector emits proposed diffs; does not commit to the wiki.
- R8. Each proposed timeline entry has: verbatim quote, reflection_id, canonical claim ID, strength (low/medium/high), parallax tag (list of context types), optional `superseded_by` (schema stub for v0.3) and `reinforces` pointers.
- R9. Connector tool surface: `search_past_mirrors`, `lookup_ecg_taxonomy`, `self_critique` (carried forward) + `lookup_vips_taxonomy` (new).
- R10. Deterministic verifier (plain code, not LLM) runs between Connector and student review surface; normalized-substring quote match; entries with no match dropped; partial-match entries downgraded to `strength: low`.
- R11. Parallax rule: `strength: high` requires ≥2 different context types; single-context claims capped at `strength: low` and visibly flagged.
- R12. Reflections carry a context-type tag at persistence time, from the closed enum `{school, family, peer, hobby, civic}`.
- R13. Post-Mirror review surface shows verified proposed diffs grouped by VIPS dimension.
- R14. Per-entry confirm (commit) or forget (drop) on the review surface; no claim reaches the wiki without student confirm.
- R15. Cartographer runs only on manual "Run sense-making" trigger (no auto-run).
- R16. Cartographer reads the four VIPS pages + corpus, emits a Trajectory page with one-paragraph trajectory + 2–5 lead-sheet pathways + open questions + disclaimer.
- R17. Each lead-sheet pathway has: label, trait_combination (claim ID refs across VIPS pages), ECG region tags (cluster-level), risks/tradeoffs in SG context, exploration prompt.
- R18. Cartographer run renders step-event replay in the wiki view (post-run, step-level granularity).
- R19. "Forget" moves a timeline entry to an archived folder; excluded from future Connector + Cartographer context and from hybrid retrieval; preserved in audit trail.
- R20. Forget-count per VIPS dimension is recorded but NOT surfaced to agents or to the student in v0.2.
- R21. ECG taxonomy `links?: string[]` field is populated with subject↔cluster and cca↔cluster crosswalks via deterministic extraction (regex/structured patterns).
- R22. Counsellor brief side-export: pure-function `(VIPS pages + Trajectory page) → counsellor-brief.md`; student-initiated, on-demand, not auto-persisted.
- R23. All three agents move from `gpt-4.1` → `gpt-5.5`; model centralized in one config.
- R24. v0.1's hard 3-entry corpus gate on "Run sense-making" removed; replaced with a "patterns may be weak — run anyway?" confirm when fewer than 3 verified VIPS claims exist across dimensions.
- R25. Demo seed: 3–5 distinct SG secondary students, 6–10 reflections each, ≥3 different context types per student, each student with a distinct emerging VIPS profile.
- R26. Seeded reflections span positive + ordinary + negative experiences per student in authentic SG vernacular with real school references.
- R27. Per-student tenancy invariant carries forward unchanged.
- R28. Mirror agent's three-field output, webcam-visual-only, transcripts-only audio policy, single-vendor OpenAI, silent-ritual UI all carry forward unchanged.
- R29. Compiled-truth voice is calibrated per VIPS dimension (Values cite evidence; Interests behaviour-shape RIASEC language; Personality no diagnostic labels; Skills "competencies practiced" framing).
- R30. Pending-review state persists; new Mirror session's diffs cannot stack on top of unreviewed prior diffs; student must explicitly confirm or forget each pending entry first.

**Origin actors:** A1 Student, A2 Mirror agent, A3 Connector agent (reshaped), A4 Cartographer agent (renamed from Pathfinder), A5 Deterministic verifier, A6 Operator (demo).
**Origin flows:** F1 Reflection + post-session VIPS-page review (R1, R2, R3, R5, R6, R7, R8, R10, R11, R13, R14, R30), F2 Manual sense-making with live visualization (R15, R16, R17, R18), F3 Soft-delete via "forget" (R19, R20).
**Origin acceptance examples:** AE1 (R6, R7, R10, R13, R14), AE2 (R10, R11), AE3 (R3, R19, R20), AE4 (R15, R16, R17), AE5 (R24), AE6 (R25), AE7 (R10 verifier calibration pair), AE8 (R30 pending-review).

---

## Scope Boundaries

- In-wiki editing of compiled-truth or timeline entries — student cannot edit; only forget
- Active per-claim validation on the wiki ("that's me / not quite") — replaced by review-after-session
- Hard deletion of claims — soft-delete via forget only; persistent-with-disclosure in v0.2
- Counsellor-facing UI / app — markdown export only, no counsellor portal
- Versioned brief schema with stability contract — deferred to v0.3
- Cross-student inference / cohort patterns — still per-student forever
- Weekly background reconciliation pass — deferred to v0.3 (`superseded_by` remains a schema stub)
- Hybrid retrieval (sqlite-vss + RRF) for `search_past_mirrors` — FTS5 sufficient at v0.2 seed scale
- Agent-visible or student-visible forget-count — recorded only, not surfaced
- FormData/base64 plan-vs-code drift fix — out of v0.2 scope
- Auth, multi-tenant, PDPA layer — still demo-mode
- VIPS dimensions beyond V/I/P/S, MBTI sub-types, Big5 facets beyond E+N — out
- Per-pathway "VIPS fit notes" as separate fields — `trait_combination` claim IDs already encode dimension provenance
- Trigger.dev / cron / WebRTC / `gpt-realtime-2` / TTS — all stay out (carried from v0.1)
- Real student-collected or anonymized real-student reflections — seed is curated fixture data only
- Audio for seed reflections — text transcripts only
- Renaming Connector — name stands; the rename effort is scoped to Pathfinder → Cartographer

### Deferred to Follow-Up Work

- Capture chosen VIPS taxonomy curation, normalized-substring verifier calibration, and per-agent model-config pattern as durable learnings under `docs/solutions/` (the directory does not exist yet) — can land as a separate PR after the pivot stabilizes.
- Counsellor-pilot-shaped versioned brief schema with stability contract — separate PR in v0.3.
- Removal of v0.1's now-superseded `connector_outputs` and `pathfinder_outputs` tables once nothing reads them — the v0.2 plan keeps them around through the cutover; cleanup PR after.

---

## Context & Research

### Relevant Code and Patterns

- **Server-fn split convention** (load-bearing): every server endpoint is `*.functions.ts` (TanStack `createServerFn` thin wrapper) + `*.handler.server.ts` (pure handler + Zod input schema + custom error class). Examples: `src/server/persist-mirror.{functions,handler.server}.ts`, `src/server/run-sensemaking.{functions,handler.server}.ts`. New v0.2 endpoints follow this exactly.
- **Tool factory + typed-schema registration** (load-bearing): every Zod schema field passed to `tool({parameters})` must have a concrete `type` — `z.unknown()`/`z.any()` does not work with OpenAI's tool-parameter validator. The `self_critique` tool encodes this lesson at `src/agents/tools/schemas.ts:64-75` (commit `665e07c`): for variable-shape payloads, JSON-stringify and re-parse server-side. New `lookup_vips_taxonomy` tool follows the same pattern. Tool I/O Zod schemas all live in `src/agents/tools/schemas.ts` — single source of truth.
- **Tenancy** (load-bearing): `src/server/tenancy.server.ts` `withStudent(studentId, fn)` — every DB-touching handler wraps. All new v0.2 handlers (proposed-diff persistence, confirm/forget, counsellor-brief export, etc.) obey this. Tool factories close over `studentId` at construction (e.g., `searchCorpusToolFor(studentId)` in `src/agents/tools/search-corpus.server.ts:40`) — same pattern for any new student-scoped tools.
- **Defensive SDK event mapper** (load-bearing): `mapSdkEventToStep()` in `src/agents/handoff-chain-streamed.ts:190-260` (commit `71b0510`) — every SDK shape access is `try/catch`-wrapped, multiple field shapes are probed, a single mapping failure logs a warn but does not abort the iterator. Cartographer's streaming wrapper in U11 reuses this defensiveness.
- **Step-event replay** (load-bearing): `src/agents/run-events.ts` `RunStepEvent` discriminated union; events accumulated server-side, returned in one JSON response, replayed client-side with synthetic `MIN_GAP_MS=220 / MAX_GAP_MS=1100` floors in `src/components/AgentRunVisualizer.tsx`. Cartographer reuses this. The `AgentName` union widens from `'connector' | 'pathfinder'` to `'connector' | 'cartographer'`.
- **Edit-and-confirm primitives**: `src/components/EditableField.tsx` (display↔textarea toggle) + `src/components/ConfirmAndSave.tsx` (`useMutation` + `invalidateQueries` wrapper, optimistic preview supported). The post-Mirror review surface in U8 mirrors the mutation+invalidation pattern but with confirm/forget actions rather than edit-text actions.
- **Diagnostic-language safety gating**: `src/lib/safety.ts` `checkPayloadForDiagnosticLanguage` / `checkOutputForDiagnosticLanguage` — every persist + edit boundary calls these. The Connector's proposed-diff payload (U7) and the Cartographer's Trajectory page (U11) both pass through these checks; the Personality VIPS-page voice rule (R29) extends the regex list with a small additional check.
- **Drop-and-reseed schema migration**: `src/db/client.ts` `SCHEMA_VERSION='2'` sentinel triggers drop-and-reseed on mismatch. U1 bumps to `'3'`.
- **FTS5 contentless mirror + sync triggers**: `src/db/schema.sql` lines 84-102 model the AI/AD/AU trigger pattern. Forget excludes via DELETE from the FTS5 mirror (not a `WHERE forgotten = 0` predicate, which contentless tables cannot support).
- **Prompt file convention**: `*.prompt.md` alongside the agent file, imported via `import xxxPrompt from '~/agents/xxx.prompt.md?raw'` (Vite raw loader); `scripts/ablate.ts` reads them via `readFileSync` because `tsx` does not resolve `?raw`. Mirror prompt unchanged in v0.2; Connector prompt rewrites (reshaped output); Cartographer prompt new (rename + reshape). All three prompts follow the existing `## What you do` / `## Hard constraints` / `## Output` section structure.
- **Dependency-injection test seam**: each agent file exports a `deps` param so tests inject stubs (`deps.runConnector`, etc.); DB tests use `setDbForTests(openInMemoryDb()); seed();` in `beforeEach`. All v0.2 unit tests follow this — no live OpenAI calls in `vitest`.

### Institutional Learnings

- `docs/solutions/` does not yet exist. After this pivot stabilizes, capture: VIPS canonical vocabulary curation method, normalized-substring verifier calibration (AE7 pair), per-agent model-config pattern, hybrid seed-generation workflow.
- The v0.1 4-dimension scoring rubric (provenance, specificity, novelty, anti-sycophancy) is preserved as the bar for v0.2 ablation; a fifth dimension (parallax discipline) is added.
- v0.1's drop-and-reseed schema-mismatch pattern (`SCHEMA_VERSION` sentinel) carries forward; v0.2 is still demo-mode, no production data lock-in.

### External References

- LangExtract's `char_interval=None` filtering pattern and "Cited but Not Verified" arXiv paper (cited in origin) — both confirm prompt-level "leave blank if no evidence" is unreliable for frontier models; this grounds the deterministic-verifier decision.
- gbrain's compiled-truth + timeline pattern with soft-delete (cited in origin) — grounds the wiki-page shape and the forget-not-delete semantics.
- MOE ECG counsellor materials (Temasek JC, Kranji, BPGHS, Peicai, MOE "Discovering Purpose" pillar) — sources for the VIPS canonical vocabulary in U2.
- OpenAI Agents SDK TypeScript — `@openai/agents` ^0.11.0; the existing handoff-chain streaming wrapper (U10/U11) verifies the precise event-name mapping at implementation time against the installed `node_modules/@openai/agents/dist/*.d.ts` (per v0.1 plan A14 pattern).
- `gpt-5.5` model availability — assumed; verified during U4 implementation against the OpenAI Agents SDK's accepted-model list. If the model identifier shifts (e.g., a `gpt-5-mini` substitute), update `src/agents/config.ts` and re-run U5 baseline with the substitute.

---

## Key Technical Decisions

- **Compiled-truth + timeline as the v0.2 wiki shape.** Compiled-truth is bounded by the timeline: rewrites preserve any prior claim still supported by current non-forgotten evidence (R2). This gives "patterns weakening, contradicting, hardening over time" a schema home and prevents top-of-page oscillation. Schema split: `vips_pages` (one row per `(student_id, dimension)`) carries compiled-truth + open question; `vips_timeline_entries` carries individual claims (append-only after commit, `forgotten_at` for soft-delete).
- **Deterministic verifier as plain code between Connector and student.** Not an LLM. Normalized-substring (whitespace + capitalization + punctuation tolerance) for the verbatim-quote check (R10). Full match → admit; partial match above a minimum span → downgrade to `strength: low`; no match → drop entirely. Parallax rule (R11) is enforced at the same boundary: a proposed `strength: high` is capped at `low` unless the entry's `parallax_tag` lists ≥2 distinct context types. AE7 (honest paraphrase admitted, fabricated quote dropped) is the calibration pair locked into the test suite.
- **`reinforces` is verifier-computed, not agent-emitted.** Rule: same VIPS page + same canonical claim ID + most-recent non-forgotten match → `reinforces` points to that entry's ID. The agent does not propose `reinforces` in its diff payload. Rationale: agent-emitted pointers without structural confirmation drift; provenance pointers belong in the deterministic layer. `superseded_by` remains as a schema stub for v0.3 reconciliation; v0.2 only populates `reinforces`.
- **Two-stage commit: `vips_proposed_diffs` → student review → `vips_pages` / `vips_timeline_entries`.** Connector writes to the staging table; verifier annotates the staging rows with `verifier_result`; student confirms (commits the row to wiki tables) or forgets (drops the staging row, never commits). This keeps the wiki tables append-only-after-commit and gives the pending-review state a clean home (R30).
- **Connector auto-runs after `persistMirror`; Cartographer manual-only.** Connector's run is amortized into the reflection commit's natural latency; Cartographer's Trajectory page is a synthesis the student/operator chooses to invoke. Connector failures persist the Mirror entry and surface a "Review pending — Retry" affordance; Mirror reflection is not blocked.
- **Context-type as a closed-enum column on `mirror_entries`, set by student picker.** A6 / R12 says the tag is per-reflection at persistence time; the parallax rule depends on it being right; the student is in reflective mode immediately after Stop, so a one-tap picker is the lowest-friction way to keep the tag honest. Default to the student's last-selected value.
- **Centralized model config with env override.** Three per-agent constants in `src/agents/config.ts`; an `AGENT_MODEL` env var (set by `pnpm ablate:*`) overrides all three when present. Ablation A/B-ability is a stated design value (Success Criteria); env-override is the natural seam.
- **Pathfinder → Cartographer is a rename + reshape, not a wrapper.** The new Cartographer reads VIPS pages (not raw patterns) and writes a single Trajectory page. The `AgentName` union widens to include `'cartographer'`; the `AgentRunVisualizer` two-card hardcoding becomes single-card. The v0.1 `pathfinder_outputs` table is kept in `schema.sql` through the cutover (a follow-up PR removes it once nothing reads it — see Deferred to Follow-Up Work). Trajectory pages persist in a new `cartographer_outputs` table.
- **VIPS canonical vocabulary as a hand-curated fixture, not an LLM-extracted set.** R4 says closed vocabulary; A9 enumerates the scope; `src/data/vips-taxonomy.ts` is the single source of truth (mirrors `src/data/ecg-taxonomy.ts` shape).
- **ECG crosswalks added via deterministic extraction.** R21 says regex/structured patterns, not LLM inference. Existing 30 entries get their `links?` field populated by reading category + label and applying explicit rules (e.g., subjects with "Physics" or "Math" link to `cluster.engineering` + `cluster.computing`). Inline in `src/data/ecg-taxonomy.ts`; deterministic so the fixture is reproducible.
- **Hybrid seed: hand-curated profiles + LLM-generated reflections + hand-review.** Profiles pin VIPS dominance + context-type coverage; reflections are LLM-generated against per-profile prompts; hand-review pass catches inauthentic vernacular. Reflections persisted as JSON fixtures (not generated at seed-time) so reseed is deterministic.
- **5-dimension ablation rubric (parallax discipline added).** v0.1 4 dimensions retarget at VIPS-page output; new dimension scores whether single-context claims are correctly capped at `low`. Bar (≥2 points across ≥3 dimensions) carries forward.
- **Pre-pivot baseline: `ablate:mirror` only, on `gpt-5.5`.** Run before any v0.2 surface change lands, on the v0.1 Mirror surface (shape unchanged). Captures the model-swap effect cleanly. The sensemake-surface baseline runs once v0.2 ships.

---

## Open Questions

### Resolved During Planning

- **Context-type tagging mechanism** — student picker on Stop (A1).
- **Centralized model config shape** — per-agent constants + env override (A2).
- **Seed mechanism** — hybrid profiles-curated + reflections-LLM-generated + hand-review (A3).
- **`Open question` line authorship** — Connector emits per-VIPS-page (A4).
- **`reinforces` pointer mechanism** — verifier computes structurally (A5).
- **Ablation rubric reshape** — carry forward 4 v0.1 dimensions + parallax discipline = 5 total (A6).
- **Model-swap re-baselining method** — `ablate:mirror` only, on `gpt-5.5`, before v0.2 surface (A7).

### Deferred to Implementation

- Exact wording cadence of the per-VIPS-dimension "Open question" line is LLM-produced and calibrated during U7 against the new Connector prompt (R5 + R29 voice rules).
- Whether the context-type picker requires explicit choice every session or defaults to last-used (A1) — final UX decision lands in U7 against real timing in the post-Mirror flow.
- Normalized-substring tunables: exact minimum-span threshold for partial-match downgrade vs. full drop. AE7 pins full-match-admit and fabricated-quote-drop; the partial-match boundary is implementer-tunable. Calibrated in U6 against the seed corpus.
- Pending-review surface shape (modal vs. dedicated route vs. banner on `/wiki`) — picked in U8 against real flow timing.
- Counsellor-brief markdown structure (section order, claim-density choices, voice). R22 says it is a developer/demo debugging artifact in v0.2; final markdown shape lands in U12 against a render of the seed.
- Exact LLM-generation prompts for U13's seed reflections (per-profile pinning logic) — lands during U13 against the hand-curated profiles.
- Where the v0.1 `connector_outputs` / `pathfinder_outputs` tables are dropped — kept through cutover, removed in a follow-up PR per Deferred to Follow-Up Work.

---

## Output Structure

```
src/
  agents/
    config.ts                        (NEW — per-agent model constants + env override)
    connector.prompt.md              (REWRITE — diff-proposal output)
    cartographer.ts                  (NEW — renamed from pathfinder.ts)
    cartographer.prompt.md           (NEW — renamed + reshaped)
    verifier.ts                      (NEW — plain-code verifier)
    tools/
      lookup-vips-taxonomy.ts        (NEW)
  data/
    vips-taxonomy.ts                 (NEW — closed VIPS vocabulary)
  db/
    schema.sql                       (MODIFY — VIPS tables + context_type + crosswalk index bump)
  server/
    auto-connector.handler.server.ts (NEW — chained after persistMirror)
    confirm-diff.{functions,handler.server}.ts   (NEW)
    forget-diff.{functions,handler.server}.ts    (NEW)
    forget-timeline-entry.{functions,handler.server}.ts  (NEW)
    load-pending-review.{functions,handler.server}.ts    (NEW)
    load-vips-pages.{functions,handler.server}.ts        (NEW)
    run-cartographer.{functions,handler.server}.ts       (NEW — replaces run-sensemaking for v0.2)
    counsellor-brief.{functions,handler.server}.ts       (NEW)
  components/
    PostMirrorReview.tsx             (NEW)
    VipsPageView.tsx                 (NEW)
    TrajectoryPageView.tsx           (NEW)
    ContextTypePicker.tsx            (NEW)
  routes/
    reflect.review.tsx               (NEW — post-Mirror review surface)
    wiki.index.tsx                   (REWRITE — VIPS pages overview)
    wiki.$dimension.tsx              (NEW — per-dimension page)
    wiki.trajectory.tsx              (NEW — Trajectory page)
test/
  agents/
    verifier.test.ts                 (NEW — AE7 calibration + parallax)
    cartographer.test.ts             (NEW)
  ablation/
    fixtures/
      seed-multistudent.json         (NEW — replaces seed-corpus.json)
    score.ts                         (MODIFY — 5 dimensions)
    reports/
      2026-05-11-mirror-ablation-gpt-5.5.md      (NEW — A7 baseline)
```

This is a scope declaration; the implementer may adjust file locations if a better layout emerges. Per-unit `**Files:**` sections remain authoritative.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
F1: Reflection + post-session VIPS-page review (auto chain, R6/R7/R10/R11/R13/R14/R30)

  ┌──── Browser ────┐                             ┌──── Server ────┐                  ┌──── DB ────┐
  │ MirrorSession   │                             │ transcribeMirror│                  │            │
  │  ▸ record       │ ──audio blob──────────────► │  (Whisper)      │                  │            │
  │  ▸ stop         │                             │                 │                  │            │
  │  ▸ picker       │ ◄─transcript─────────────── │                 │                  │            │
  │  (context_type) │                             │                 │                  │            │
  │  ▸ runMirror    │ ──transcript+ctx──────────► │ runMirror       │ ───── Mirror ──► │            │
  │                 │ ◄─{validation,...}────────  │                 │                  │            │
  │  ▸ persistMirror│ ──{fields+ctx_type}───────► │ persistMirror   │                  │mirror_     │
  │                 │                             │  + ctx_type col │ ─────write─────► │entries     │
  │                 │                             │  +autoConnector │ ───── Connector ►│            │
  │                 │                             │                 │ ◄diff payload──  │            │
  │                 │                             │  + verifier()   │ ───plain code──► │vips_       │
  │                 │                             │  (substring +   │ ───write staging►│proposed_   │
  │                 │                             │   parallax +    │                  │diffs       │
  │                 │                             │   reinforces)   │                  │            │
  │                 │ ◄─proposed_diffs[]────────  │                 │                  │            │
  │ PostMirrorReview│                             │                 │                  │            │
  │  per VIPS dim:  │                             │                 │                  │            │
  │  ▸ confirm ──┐  │ ──confirmDiff(id)─────────► │ confirmDiff     │ ──commit row──►  │vips_pages  │
  │  ▸ forget ──┐│  │ ──forgetDiff(id)──────────► │ forgetDiff      │ ──drop staging──►│            │
  │             ↓↓  │                             │                 │ ──update FTS5 ──►│vips_       │
  │  ▸ ✓ all done   │ ─load-vips-pages──────────► │ loadVipsPages   │                  │timeline_   │
  │  ▸ pending →    │ (on next app open if not)   │                 │                  │entries     │
  └─────────────────┘                             └─────────────────┘                  └────────────┘

F2: Manual sense-making run (R15-R18) — single-agent Cartographer

  /wiki/trajectory → "Run sense-making" button → runCartographer
                                                  ▾
                                  Cartographer reads VIPS pages + corpus
                                                  ▾
                                  AgentRunVisualizer (single-card; reuse v0.1 step events)
                                                  ▾
                                  emits {trajectory paragraph, pathways[2-5], open_questions[], disclaimer}
                                                  ▾
                                  cartographer_outputs ← write; TrajectoryPageView renders

F3: Forget (R19, R20)
  Wiki view → "forget" on a timeline entry → forgetTimelineEntry
                                              ▾
                                set forgotten_at = now; DELETE from FTS5 mirror
                                bump vips_forget_count.{dimension} (NOT surfaced)
```

The `vips_proposed_diffs` staging table is the lock-point that makes R7 ("Connector emits proposed diffs, does not commit") structural rather than aspirational. The deterministic verifier writes its `verifier_result` JSON column alongside the diff row; the student review surface reads both.

---

## Implementation Units

### U1. DB schema additions for VIPS pages, timeline, proposed diffs, and context_type

**Goal:** Add the v0.2 storage layer. New tables: `vips_pages`, `vips_timeline_entries`, `vips_proposed_diffs`, `vips_forget_count`, `cartographer_outputs`. New column: `mirror_entries.context_type` (closed enum, NOT NULL). Bump `SCHEMA_VERSION` from `'2'` → `'3'` so the next boot drops and reseeds. v0.1 `connector_outputs` and `pathfinder_outputs` tables are kept in place through the cutover (read-paths drop in U7, U10, U11; removal lands in a follow-up PR).

**Requirements:** R1, R2, R3, R8, R12, R19, R20, R27, R30

**Dependencies:** None

**Files:**
- Modify: `src/db/schema.sql` — add `vips_pages` (`{ student_id, dimension, compiled_truth, open_question, updated_at }` with PK on `(student_id, dimension)`), `vips_timeline_entries` (`{ id, student_id, dimension, canonical_claim_id, verbatim_quote, reflection_id, strength, parallax_tag_json, reinforces_id?, forgotten_at?, committed_at }`), `vips_proposed_diffs` (`{ id, student_id, mirror_entry_id, payload_json, verifier_result_json, status, created_at, reviewed_at? }`; `status` CHECK in `'pending' | 'confirmed' | 'forgotten'`), `vips_forget_count` (`{ student_id, dimension, count }` with PK on `(student_id, dimension)`), `cartographer_outputs` (`{ id, student_id, trajectory_text, pathways_json, open_questions_json, disclaimer, raw_output_json, created_at }`). Add `mirror_entries.context_type TEXT NOT NULL CHECK(context_type IN ('school','family','peer','hobby','civic'))`. Add an FTS5 mirror over `vips_timeline_entries.verbatim_quote` with AI/AD/AU triggers paralleling the existing `mirror_entries_fts` pattern; the forget path issues a DELETE from this mirror (contentless tables cannot use `WHERE forgotten_at IS NULL` predicates).
- Modify: `src/db/client.ts` — bump `SCHEMA_VERSION` to `'3'`. The existing drop-and-reseed-on-mismatch path handles the cutover.
- Modify: `src/db/queries.ts` — add typed row interfaces (`VipsPageRow`, `VipsTimelineEntryRow`, `VipsProposedDiffRow`, `CartographerOutputRow`); insert/select/update helpers; FTS-escaped `searchVipsTimelineEntries`. Insert helpers wrap `db.transaction()` and write `agent_traces` rows where applicable.
- Modify: `test/db.test.ts` — extend with: schema round-trip for each new table, FTS5 sync via AI/AD/AU on `verbatim_quote`, cross-student isolation for `vips_*` tables, `forgotten_at` filter excludes from FTS and from default queries, `context_type` enum CHECK enforced at insert.

**Approach:**
- Schema split mirrors the compiled-truth-vs-timeline distinction in R2: one row per `(student_id, dimension)` for the page; many rows per page for timeline.
- `parallax_tag_json` is a JSON array of context-type strings (e.g., `["school","peer"]`); decode in code, validate via Zod on read.
- `vips_proposed_diffs.payload_json` carries the full diff payload as emitted by the Connector (compiled_truth rewrite + new timeline entries per dimension); `verifier_result_json` carries the verifier's per-entry verdict (`admitted | downgraded | dropped` plus reason). The staging row is the source of truth between Connector emission and student confirm.
- `vips_forget_count` is intentionally a separate table (not a column on `vips_pages`) so it can be updated without touching the compiled-truth row's `updated_at` — R20 says recorded-not-surfaced, so its update should not be visible to agents through the page row.
- `context_type` on `mirror_entries` is `NOT NULL` with a CHECK on the closed enum; A1 / R12 — the parallax rule cannot tolerate `NULL`.
- The new FTS5 mirror over `vips_timeline_entries.verbatim_quote` is what makes the verifier's substring match efficient and what implements R19's "excluded from hybrid retrieval" (the forget path issues a DELETE from this mirror so future searches do not return the row).

**Patterns to follow:**
- `src/db/schema.sql` lines 84-102 for the FTS5 contentless mirror + AI/AD/AU trigger pattern.
- `src/db/queries.ts` typed row interfaces and `withStudent`-friendly query helpers (e.g., `insertMirrorEntry`).
- The v0.1 plan's U1-style atomic schema unit.

**Test scenarios:**
- Happy path: insert a `vips_pages` row, read it back; insert a `vips_timeline_entries` row, FTS5 mirror contains its quote.
- Happy path: insert a `vips_proposed_diffs` row with `status='pending'`; update to `status='confirmed'`; check `reviewed_at` is non-null after the update.
- Edge case: insert a `mirror_entries` row with `context_type='offcampus'` → CHECK rejects.
- Edge case: insert a `vips_timeline_entries` row, then set `forgotten_at = current_timestamp`; the FTS5 mirror DELETE trigger removes the row from the index; subsequent FTS query returns no match. Covers AE3's hybrid-retrieval clause.
- Edge case: cross-student isolation — `student_id='a'` inserts a `vips_pages` row; `student_id='b'` reads return zero rows for the same dimension.
- Edge case: SCHEMA_VERSION mismatch path triggers drop-and-reseed on next `openDb()` call; an existing `student_id='demo'` row is gone after.
- Integration: a full F1-like sequence — insert mirror_entry, insert vips_proposed_diff (status=pending), update to confirmed, insert linked vips_timeline_entries row — all in one transaction; cross-student isolation preserved throughout.

**Verification:**
- `pnpm test test/db.test.ts` passes.
- `pnpm seed` (after U13 lands the new seed) inserts rows into all new tables without CHECK violations.

---

### U2. VIPS canonical taxonomy fixture + `lookup_vips_taxonomy` tool

**Goal:** Hand-curate the closed VIPS vocabulary (A9) as a TypeScript fixture and add a new agent tool `lookup_vips_taxonomy` that returns canonical sub-dimension definitions and behavioral indicators. Tool follows the existing factory pattern; output Zod schema lives in `src/agents/tools/schemas.ts`. The Connector (after U7) uses this tool when proposing diffs; the Cartographer (after U11) uses it when assembling pathway `trait_combination` references.

**Requirements:** R4, R9

**Dependencies:** None (orthogonal to U1)

**Files:**
- Create: `src/data/vips-taxonomy.ts` — the closed vocabulary per A9. Shape mirrors `src/data/ecg-taxonomy.ts`: `{ id: string, dimension: 'values'|'interests'|'personality'|'skills', label: string, definition: string, behavioral_indicators: string[] }`. Sources cited inline (MOE ECG / CCE materials per External References).
- Create: `src/agents/tools/lookup-vips-taxonomy.ts` — `tool({name: 'lookup_vips_taxonomy', parameters: VipsTaxonomyInputSchema, execute})`. Pure handler `executeLookupVipsTaxonomy({query, dimension})` does case-insensitive substring match against label + definition + id; returns `JSON.stringify(result)`.
- Modify: `src/agents/tools/schemas.ts` — add `VipsTaxonomyInputSchema` (closed enum for `dimension`, `query: z.string()` for the lookup term) and `VipsTaxonomyOutputSchema` (array of taxonomy entries). Follow the typed-schema rule from commit `665e07c`: every property has a concrete type.
- Create: `test/tools/lookup-vips-taxonomy.test.ts` — tool name constant, output Zod parses against canonical results, schema-rejected outputs (`dimension: 'foo'` invalid).

**Approach:**
- Scope per A9: 8 Values (`contribution`, `achievement`, `tradition`, `security`, `independence`, `relationships`, `wellbeing`, `learning`), RIASEC 6 for Interests, Big5 E+N for Personality (no MBTI, no facets beyond E+N per Scope Boundaries), Skills (`interpersonal`, `analytical`, `creative`, `practical`, `leadership`, `communication`). Each entry's `behavioral_indicators` is 2–3 short phrases tied to MOE counsellor-recognizable behaviors (e.g., for `values.contribution`: ["volunteers when not asked", "frames work in terms of impact on others", "chooses meaningful over high-pay"]).
- The fixture is verified-shape only at plan time; the exact behavioral indicators are calibrated during implementation against MOE source materials and reviewed by a counsellor-savvy reviewer if available.
- The tool's `execute` returns `JSON.stringify` of the matching entries; the agent receives a structured payload, not free-form text.
- IDs follow the dotted form `values.contribution`, `interests.investigative`, etc., per R4.

**Patterns to follow:**
- `src/data/ecg-taxonomy.ts` for the fixture shape and inline citation style.
- `src/agents/tools/lookup-ecg-taxonomy.ts` for the tool factory + handler pattern.
- `src/agents/tools/schemas.ts` lines 64-75 (`self_critique`) for typed-schema discipline.

**Test scenarios:**
- Happy path: `lookup_vips_taxonomy({query: 'contribution', dimension: 'values'})` returns the `values.contribution` entry with full definition + behavioral indicators.
- Happy path: empty `query` returns all entries within the requested dimension.
- Edge case: `dimension` outside the closed enum → Zod input rejects.
- Edge case: `query` matches no entry → returns empty array, not an error.
- Integration: fixture count assertion — exactly 8 Values + 6 Interests + 2 Personality + 6 Skills = 22 entries; every entry has a non-empty `definition` and ≥2 `behavioral_indicators`.

**Verification:**
- `pnpm test test/tools/lookup-vips-taxonomy.test.ts` passes.
- `pnpm test test/db.test.ts` passes (the taxonomy fixture sanity test in `db.test.ts` is extended to cover VIPS).

---

### U3. ECG taxonomy crosswalk population (R21)

**Goal:** Populate the existing `links?: string[]` field on the ~30 ECG taxonomy entries in `src/data/ecg-taxonomy.ts` with subject↔cluster and cca↔cluster crosswalks via deterministic extraction (regex/structured patterns), not LLM inference. The Cartographer's `lead-sheet pathway` references claim IDs across VIPS pages but `ecg_region_tags` come from the ECG taxonomy fixture — the cluster-level crosswalks are what make the region tagging coherent.

**Requirements:** R21

**Dependencies:** None

**Files:**
- Modify: `src/data/ecg-taxonomy.ts` — populate `links` on every subject and cca entry; cluster entries remain `links: []`. Inline comment cites the extraction rule for each link added.
- Modify: `test/db.test.ts` — extend the ECG taxonomy fixture test to assert: every subject entry has at least one cluster link; every cca entry has at least one cluster link; every link target is a valid `cluster.*` ID; no link references a non-existent entry.

**Approach:**
- Extraction rules are explicit and reproducible — no LLM call. Sample rules:
  - Subjects whose label contains "Physics", "Mathematics", "Chemistry", "Computing" link to `cluster.engineering` + `cluster.computing`.
  - Subjects whose label contains "Biology", "Health" link to `cluster.healthcare` + `cluster.sciences`.
  - CCAs in `Sports` category link to `cluster.health-sport-wellness` + `cluster.education`.
  - CCAs in `Performing Arts` link to `cluster.arts-design-media` + `cluster.education`.
  - CCAs in `Uniformed Groups` link to `cluster.public-service` + `cluster.security-defence`.
- The rules live as a small in-file helper (`computeLinks(entry)`) that's invoked once during static export, so the rule source is the link source — the implementer can read off the same logic for review.

**Patterns to follow:**
- `src/data/ecg-taxonomy.ts` fixture shape — `links?: string[]` field is already declared on the interface (lines 14-20); just populate.
- Cluster IDs already exist as `cluster.*` entries in the fixture.

**Test scenarios:**
- Happy path: `subject.h2-physics` (or analogous) links to `cluster.engineering` + `cluster.computing`.
- Happy path: every cca with `category === 'Sports'` links to `cluster.health-sport-wellness`.
- Edge case: cluster entries have empty `links` (clusters do not link to other clusters in v0.2).
- Edge case: every link target resolves to an existing entry — no dangling references.
- Integration: a small property test — every subject + cca entry has at least one cluster link.

**Verification:**
- `pnpm test test/db.test.ts` passes.
- `pnpm check` passes (the populated fixture remains type-consistent with the interface).

---

### U4. Centralized model config + `gpt-4.1` → `gpt-5.5` swap

**Goal:** Introduce `src/agents/config.ts` exposing per-agent model constants with an `AGENT_MODEL` env override. Replace every hardcoded `'gpt-4.1'` string in the three agent files, the `self_critique` tool, the ablate script, and the README with the appropriate import. Default for all three in v0.2: `gpt-5.5`.

**Requirements:** R23

**Dependencies:** None

**Files:**
- Create: `src/agents/config.ts` — exports `MIRROR_MODEL`, `CONNECTOR_MODEL`, `CARTOGRAPHER_MODEL`, `SELF_CRITIQUE_MODEL`. Each constant resolves as `process.env.AGENT_MODEL ?? 'gpt-5.5'`. Inline comment documents the override convention.
- Modify: `src/agents/mirror.ts` — replace `'gpt-4.1'` with `import { MIRROR_MODEL } from './config'`.
- Modify: `src/agents/connector.ts` — same pattern (will rewrite further in U7).
- Modify: `src/agents/pathfinder.ts` — same pattern; renamed to `cartographer.ts` in U10, but lands here first.
- Modify: `src/agents/tools/self-critique.ts` — replace `'gpt-4.1'` with `SELF_CRITIQUE_MODEL`.
- Modify: `scripts/ablate.ts` — replace the three hardcoded model strings (lines ~73, ~93, ~99 per repo research) with imports from `src/agents/config.ts`. The ablate script's CLI now optionally accepts `--model=<id>` which sets `process.env.AGENT_MODEL` before importing the agent factories — that's the A/B seam for U5's pre-pivot baseline.
- Modify: `README.md` — replace the three `gpt-4.1` references with `gpt-5.5`; note the env-override convention.
- Create: `test/agents/config.test.ts` — default returns `gpt-5.5`; `AGENT_MODEL` env override returns the override value; per-agent constants resolve to the same value when override is set.

**Approach:**
- The env-driven override means the ablate harness can do `AGENT_MODEL=gpt-4.1 pnpm ablate:mirror` to swap models cleanly for the U5 baseline run without code changes.
- Reading the env at module-load time is intentional — `pnpm ablate:*` sets the env before `tsx` imports the agents.
- Per-agent constants (rather than a single `AGENT_MODEL` constant) preserve the option to keep Mirror on a cheaper model in v0.3 without re-plumbing.

**Patterns to follow:**
- The v0.1 `gpt-4.1` literal sites that this unit cleans up — `src/agents/mirror.ts:22`, `src/agents/connector.ts:22`, `src/agents/pathfinder.ts:20`, `src/agents/tools/self-critique.ts:27`, `scripts/ablate.ts:~73/93/99`.

**Test scenarios:**
- Happy path: import `MIRROR_MODEL` from `src/agents/config.ts` in a node env with no `AGENT_MODEL` set → returns `'gpt-5.5'`.
- Happy path: `process.env.AGENT_MODEL = 'gpt-4.1'`; re-import via `vitest`'s module reset → returns `'gpt-4.1'`.
- Edge case: `AGENT_MODEL = ''` (empty string) → treated as unset, returns default. (Use `process.env.AGENT_MODEL || 'gpt-5.5'` not `??`.)
- Integration: `pnpm check` still passes (no stray `gpt-4.1` literals left in the codebase outside of `test/` fixtures or comments).

**Verification:**
- `pnpm check` passes.
- `pnpm test test/agents/config.test.ts` passes.
- `grep -rn "gpt-4.1" src scripts README.md` returns empty (or only inside the config comment documenting the migration).

---

### U5. Pre-pivot ablation baseline — `pnpm ablate:mirror` on v0.1 surface with `gpt-5.5`

**Goal:** Run the existing v0.1 ablation on the v0.1 Mirror surface (output shape unchanged in v0.2 per R28) with the new model. Capture as `test/ablation/reports/2026-05-11-mirror-ablation-gpt-5.5.md`. This isolates the model-swap effect from the architecture-change effect (A7). The sensemake-surface baseline is intentionally deferred until v0.2 ships in U11 — the v0.1 sensemake output shape is about to be deprecated.

**Requirements:** R23

**Dependencies:** U4 (env-override + per-agent constants)

**Files:**
- Run: `AGENT_MODEL=gpt-5.5 pnpm ablate:mirror` (no code change; the run produces the report file).
- Create: `test/ablation/reports/2026-05-11-mirror-ablation-gpt-5.5.md` — populated by the run (the ablate script's writer).
- Modify (optional): `test/ablation/reports/README.md` (if it exists) or add a header comment to the new report — note that this is the pre-pivot baseline and that the v0.1 `2026-05-08-mirror-ablation.md` ran on `gpt-4.1`.

**Approach:**
- The Mirror output shape is `{validation, inferred_meaning, story_reframe}` in both v0.1 and v0.2 (R28), so the four-dimension v0.1 rubric scores the same artifact on both models with no surface-change confound.
- Score by a human reviewer (the ablate harness writes a scaffold; v0.1 noted "we do not auto-score").
- If `OPENAI_API_KEY` is unavailable, the script writes placeholder output and the baseline-comparison conclusion is deferred until a live run can be done — same as the v0.1 ablate path.

**Patterns to follow:**
- `test/ablation/reports/2026-05-08-mirror-ablation.md` for report shape and header.
- `scripts/ablate.ts` lines around the report-writer for the file naming convention.

**Test scenarios:** *Test expectation: none — this unit is an operational run that produces a report artifact; correctness is the comparison conclusion, not a regression-testable property.*

**Verification:**
- The new report exists at the expected path with a non-empty body.
- The report contains scores against the four v0.1 dimensions (provenance, specificity, novelty, anti-sycophancy) for both ON and OFF runs, on `gpt-5.5`.
- A short comparison-conclusion paragraph at the top of the report notes how the `gpt-5.5` Mirror scores compare to the `gpt-4.1` baseline at `test/ablation/reports/2026-05-08-mirror-ablation.md`.

---

### U6. Deterministic verifier module (R10, R11, R8 `reinforces`)

**Goal:** A plain-code module that takes a Connector-proposed diff and the corresponding mirror entry (with transcript) and returns annotated diff entries: `admitted | downgraded | dropped` with reason, plus a `reinforces_id` set by structural rule. No LLM call. AE7 (honest paraphrase admitted, fabricated quote dropped) is locked into the test suite.

**Requirements:** R8, R10, R11, R19

**Dependencies:** U1 (schemas for diff payload), U2 (canonical claim IDs)

**Files:**
- Create: `src/agents/verifier.ts` — exports `verifyProposedDiff({diff, mirrorEntry, existingTimelineEntries})` returning `VerifierResult`. Three logical phases:
  1. **Quote match** (R10): for each proposed timeline entry, take `verbatim_quote`, normalize (lowercase, collapse internal whitespace, strip punctuation `[.,!?;:'"\-—]`), normalize the cited reflection's `transcript` the same way, then test `normalized_transcript.includes(normalized_quote)`. Full match → admit. Partial match — defined as ≥80% of the normalized quote's tokens appear as a contiguous subsequence in the normalized transcript — downgrade to `strength: low` with reason `partial_quote_match`. No match → drop with reason `no_quote_match`.
  2. **Parallax cap** (R11): for each admitted entry, count distinct context types across the cited reflection plus prior non-forgotten timeline entries on the same VIPS page sharing the canonical claim ID. If count < 2 and proposed `strength` is `high`, cap to `low` with reason `single_context_parallax_cap`. The annotation flags the entry as `aspirational: true` so the review surface shows the visible flag.
  3. **Structural `reinforces`** (A5): for each admitted entry, query existing non-forgotten timeline entries on the same VIPS page with the same canonical claim ID; set `reinforces_id` to the most-recent entry's ID, or `null` if none.
- Modify: `src/agents/tools/schemas.ts` — add `VerifierResultSchema`: `{ admitted: TimelineEntry[], downgraded: TimelineEntry[], dropped: { entry, reason }[] }`.
- Create: `test/agents/verifier.test.ts` — including the **AE7 calibration pair** (a single test case that locks the verifier's pass/fail boundary).

**Approach:**
- Normalization: `s.toLowerCase().replace(/[.,!?;:'"\\-—]/g, '').replace(/\\s+/g, ' ').trim()`. Whitespace collapse + punctuation strip + lowercase covers the common Whisper variations (capitalization, trailing periods, en-dash vs hyphen) without admitting paraphrases.
- The 80%-token-subsequence rule for partial match is a planning-time bet; the implementer calibrates against the seed corpus during U6 and can tune the threshold. The boundary that matters (AE7's pass/fail bar) is full-match-admit and fabricated-quote-drop; partial-match is the soft boundary.
- The verifier reads existing timeline entries via `queries.ts` helpers, scoped through `withStudent` — no implicit cross-student access.
- The verifier never makes an OpenAI call. It is pure-with-DB-reads, easy to test, and fast.
- Forgotten entries (with non-null `forgotten_at`) are filtered out of both the parallax-context-count source and the `reinforces_id` candidate set (R19's "excluded from future sense-making context" extends to verifier inputs).

**Execution note:** Test-first. Write the AE7 calibration test before the implementation — full-match-admit and fabricated-quote-drop are the structural guarantees the unit exists to provide.

**Technical design:** *(directional only)*

```
verifyProposedDiff(diff, mirrorEntry, existingTimelineEntries)
  for each proposed timeline_entry in diff.timeline_entries:
    norm_quote   = normalize(entry.verbatim_quote)
    norm_transcript = normalize(mirrorEntry.transcript)
    if norm_transcript.includes(norm_quote):
      verdict = 'admit'
    elif token_subsequence_ratio(norm_quote, norm_transcript) >= 0.8:
      verdict = 'downgrade'; entry.strength = 'low'; entry.partial_match = true
    else:
      verdict = 'drop'

    if verdict in {'admit', 'downgrade'}:
      context_count = distinct_contexts(entry.parallax_tag + existingTimelineEntries
                                           .filter(same_claim_id, not_forgotten)
                                           .map(.parallax_tag))
      if context_count < 2 and entry.strength == 'high':
        entry.strength = 'low'; entry.aspirational = true

      entry.reinforces_id = existingTimelineEntries
                              .filter(same_vips_page, same_claim_id, not_forgotten)
                              .sortBy(committed_at desc)[0]?.id ?? null

  return { admitted, downgraded, dropped }
```

**Patterns to follow:**
- `src/lib/safety.ts` for plain-code, regex-based validation as a pre-persist gate.
- Test-DI seam pattern from `test/agents/*.test.ts` for injecting a faked `existingTimelineEntries` list.

**Test scenarios:**
- **AE7 calibration pair (locked).** Reflection transcript (Whisper-normalized): `"i hated when teacher told us exactly what to do"`. Proposed entry quote `"i hated when teacher told us exactly what to do"` → admitted. Proposed entry quote `"I really hated being told what to do in class"` → dropped (`no_quote_match`).
- Happy path: full quote match → entry admitted at the agent's proposed `strength`.
- Happy path: punctuation-only difference (`"I hated it."` vs transcript `"i hated it"`) → admitted (normalization handles it).
- Edge case: capitalization-only difference → admitted.
- Edge case: 80%-token-subsequence match → downgraded with `partial_match: true` and `strength: low`.
- Edge case: 60%-token-subsequence match → dropped.
- Edge case (parallax cap, AE2 b half): proposed entry has `parallax_tag: ["school"]`, existing entries on the same VIPS page with the same claim ID all have `parallax_tag: ["school"]`, agent proposed `strength: high` → capped to `low`, `aspirational: true`. Covers AE2.
- Happy path (parallax cap not triggered): entries span `school + peer` → admitted at proposed `high`.
- Edge case (`reinforces`): one prior non-forgotten timeline entry on same VIPS page with same canonical claim ID → admitted entry's `reinforces_id` = that prior entry's ID.
- Edge case (`reinforces` with forgotten): prior entry exists but is forgotten → `reinforces_id` is null. Covers AE3's "excluded from future sense-making context" clause for the `reinforces` lookup.
- Error path: cited `reflection_id` does not exist in `mirror_entries` → entry dropped with reason `unknown_reflection`.
- Integration: verifier called on a real-shape diff payload from U7's Connector output → annotated `VerifierResult` matches the schema.

**Verification:**
- `pnpm test test/agents/verifier.test.ts` passes.
- The AE7 calibration test is present and named such that a future regression on it is obvious.

---

### U7. Context-type picker UI + auto-Connector after `persistMirror` + reshaped Connector diff-proposal schema

**Goal:** Three tightly coupled changes that together implement F1 from Stop through proposed-diff persistence: (a) a closed-vocabulary context-type picker on the `MirrorSession` Stop flow before `persistMirror`, (b) a chained auto-Connector run after `persistMirror` that proposes diffs and invokes the verifier (U6), and (c) the new Connector prompt + output schema that emits VIPS-shaped proposed diffs (compiled-truth rewrite + new timeline entries per dimension) with the per-VIPS-page "Open question" line (R5, A4).

**Requirements:** R5, R6, R7, R8, R9, R12, R13, R29, R30 (pending-review queue rule)

**Dependencies:** U1 (mirror_entries.context_type column + vips_proposed_diffs table), U2 (`lookup_vips_taxonomy` tool), U4 (model config), U6 (verifier)

**Files:**
- Create: `src/components/ContextTypePicker.tsx` — five-button (`school`, `family`, `peer`, `hobby`, `civic`) picker with iconography + short label. Remembers last-selected value via `localStorage` and pre-highlights it. Returns the chosen value to the parent.
- Modify: `src/components/MirrorSession.tsx` — insert a `picking-context` state between `transcribing` and `reflecting` in the state machine. The picker mounts after the transcript returns and before `runMirrorOnTranscript` is called. State machine becomes: `... → transcribing → picking-context → reflecting → persisting → auto-connecting → done`. The `persistMirror` payload carries `context_type` as a new field.
- Modify: `src/server/persist-mirror.{functions,handler.server}.ts` — Zod input schema gains `context_type: z.enum(['school','family','peer','hobby','civic'])`. Handler writes the column on insert. After insert, **on success**, the handler invokes the new auto-connector chain (see below) and returns its result alongside the mirror entry row. R30 rule: before invoking auto-connector, the handler checks for existing `vips_proposed_diffs.status='pending'` rows for this student; if any exist, the new auto-connector run is **queued** (not executed) — the response surfaces a `pending_queued: true` flag, and the post-Mirror review surface re-opens with the prior pending diffs first.
- Create: `src/server/auto-connector.handler.server.ts` — `runAutoConnectorAfterMirror(studentId, mirrorEntryRow, deps?)`. Steps: (1) read the student's current VIPS pages + non-forgotten timeline entries via `withStudent`, (2) format them into the Connector's prompt context (including the new mirror entry + its context_type), (3) invoke `run(connectorAgent, prompt)` with the reshaped output schema, (4) invoke `verifyProposedDiff` (U6) on the result, (5) persist the diff + verifier result to `vips_proposed_diffs` (status=pending), (6) return the staged diff row to the caller. DI pattern with `deps.runConnector` / `deps.verify` for test injection.
- Rewrite: `src/agents/connector.ts` — `createConnectorAgent(studentId)` factory; output type is the new `ConnectorDiffSchema`. Tools: `searchCorpusToolFor(studentId)`, `lookupEcgTaxonomyTool`, `selfCritiqueTool`, `lookupVipsTaxonomyTool` (U2).
- Rewrite: `src/agents/connector.prompt.md` — the new prompt. Sections preserved: `# Connector — system prompt`, `## What you do`, `## Hard constraints`, `## Output`. The new `## What you do` describes the per-Mirror diff-proposal task; `## Hard constraints` includes the "leave a quote blank if no evidence supports it" instruction (knowing the verifier will catch fabrications regardless) and the per-dimension voice rules from R29; `## Output` cross-references `ConnectorDiffSchema`.
- Modify: `src/agents/schemas.ts` — add `ConnectorDiffSchema`: `{ diffs: Record<dimension, { compiled_truth_rewrite, open_question, new_timeline_entries: TimelineEntryDraft[] }> }`. Each `TimelineEntryDraft` has `{ canonical_claim_id, verbatim_quote, reflection_id, strength, parallax_tag }`. **Note: no `reinforces` and no `superseded_by` fields in the draft** — verifier computes `reinforces` structurally (A5), `superseded_by` is a schema stub for v0.3.
- Modify: `src/lib/safety.ts` — extend `checkOutputForDiagnosticLanguage` to also flag any compiled-truth rewrite for the Personality dimension that contains diagnostic phrasing (carries forward R28's no-diagnostic-language rule into the new surface).
- Create: `test/components/ContextTypePicker.test.tsx` — five buttons rendered; pre-highlight from `localStorage` works; selection callback fires with the right value.
- Create: `test/server/persist-mirror-v0.2.test.ts` — extends existing `persistMirror` tests with `context_type` column; pending-review queue logic; auto-connector chaining.
- Create: `test/server/auto-connector.test.ts` — DI'd stub Connector + stub verifier; happy path produces a staged diff row; Connector failure path persists mirror entry but no diff row (mirror reflection is not blocked, per A11); verifier-drop entries do not reach the staged diff payload's `admitted` list.

**Approach:**
- **Picker UX**: The picker renders below the transcript display ("Here's what I heard:"), with the prompt "What was this about?" and five large-tap buttons. Default-selects the last-used value (or `school` for first use). The student taps one (one tap → continues); the picker dismisses and the Mirror agent run starts.
- **State machine transition**: Add `picking-context` state between `transcribing` and `reflecting`. On entry, render the picker; on selection, transition to `reflecting`. Cleanup: if the student navigates away during `picking-context`, the transcript is discarded (no `persistMirror` yet; nothing committed).
- **Auto-Connector chain**: The handler runs in-process synchronously from `persistMirror`'s perspective so the client gets the proposed-diff payload in the same round trip. Wall-clock budget: 30s soft timeout (Mirror reflection itself was 20s in v0.1; Connector + verifier is a separate budget). On timeout, the handler returns `{ mirror_entry, auto_connector_status: 'timeout' }` and the UI surfaces a "Review pending — Retry" banner on `/wiki`. The mirror entry still persists.
- **R30 pending-review queue rule**: Implemented at the `persistMirror` handler level — if `vips_proposed_diffs.status='pending'` exists for the student, the new auto-connector run is skipped and the response includes `pending_queued: true`. The post-Mirror review surface (U8) navigates the student to the prior pending diffs first; once those clear, the queued auto-connector run is invoked from the review-surface "done" action.
- **Connector prompt rewrite**: The prompt explicitly describes the four VIPS dimensions, the closed canonical claim ID format (`values.contribution` etc.), and the obligation to provide `verbatim_quote` directly from the cited reflection. R29 voice rules are encoded as four short paragraphs in `## Hard constraints` — one per dimension. The "Open question" line (R5, A4) is described as the question the corpus is almost-but-not-yet able to answer — distinct from a question the agent itself wants to know.

**Execution note:** Test-first for the auto-connector chain — write a stub-Connector + stub-verifier test that asserts the staged diff row shape before wiring the real Connector. The Connector prompt rewrite is calibrated iteratively against the new seed (U13) once that lands; landing the schema + chain first unblocks U8 and U9.

**Patterns to follow:**
- `src/components/MirrorSession.tsx`'s existing state machine for the new `picking-context` state.
- `src/agents/handoff-chain.ts` for the orchestration + persistence ordering pattern.
- `src/agents/tools/schemas.ts` lines 64-75 for the typed-schema rule on the Connector's output schema (every field has a concrete type).
- The v0.1 plan's U2 / U3 chained-handler pattern.

**Test scenarios:**
- Happy path (picker): student taps `school` → `onSelect('school')` fires; the next `localStorage` read returns `'school'`.
- Edge case (picker): no prior selection → `school` pre-selected as default.
- Happy path (auto-Connector): stub Connector returns a valid diff payload → verifier admits → staged diff row written with `status='pending'`; response includes the staged row.
- Edge case (Connector schema reject): stub Connector returns malformed JSON → handler catches, no staged diff row written, response includes `auto_connector_status: 'schema_reject'`; mirror entry still persists (covers A11).
- Edge case (verifier drops all entries): stub Connector returns a diff whose entries all fail substring match → staged diff row written with `status='pending'` but `payload.admitted` is empty; the review surface shows "Nothing this reflection could verify — Forget all" affordance.
- Edge case (R30 pending queue): prior `vips_proposed_diffs.status='pending'` row exists → new auto-Connector run is queued, not executed; response includes `pending_queued: true`. Covers AE8.
- Error path (Connector timeout): stub Connector hangs past 30s → `auto_connector_status: 'timeout'`; mirror entry persists; UI surfaces Retry. Covers A11.
- Integration: full F1 happy path (with U6 verifier real, not stubbed) — Whisper-mock transcript → picker → Mirror agent → persistMirror → auto-Connector → verifier admits → staged diff row visible via `loadPendingReview`. Covers AE1.

**Verification:**
- `pnpm test test/components/ContextTypePicker.test.tsx`, `test/server/persist-mirror-v0.2.test.ts`, `test/server/auto-connector.test.ts` all pass.
- `pnpm check` passes (no stray `gpt-4.1`, no `z.unknown()` in tool params).

---

### U8. Post-Mirror review surface + confirm/forget mutations + pending-review state

**Goal:** A dedicated `/reflect/review` route (or post-Stop modal) that loads the most recent `vips_proposed_diffs` row(s) with `status='pending'` and renders them grouped by VIPS dimension. For each proposed timeline entry, render the verbatim quote, the canonical claim ID, the verifier's verdict (admitted / downgraded / dropped + reason — dropped entries appear in a collapsed section), and confirm / forget buttons. Confirm commits the entry to `vips_timeline_entries` and (if it's the first confirm in this batch) the dimension's compiled-truth rewrite to `vips_pages`. Forget drops the staged entry (never reaches the wiki) and never appears in audit. The full batch must be resolved (every entry confirmed or forgotten) before the surface dismisses. If the student leaves mid-review, the pending state surfaces again on next app load.

**Requirements:** R3, R13, R14, R20, R30

**Dependencies:** U1 (`vips_proposed_diffs`, `vips_pages`, `vips_timeline_entries`, `vips_forget_count`), U6 (verifier annotations), U7 (auto-Connector produces the staged diff rows)

**Files:**
- Create: `src/routes/reflect.review.tsx` — the route. Loader uses `context.queryClient.ensureQueryData(['pending-review', STUDENT_ID])`. Renders one `<DimensionGroup>` per VIPS dimension that has pending entries. Each group shows the compiled-truth rewrite at the top + per-entry rows below with quote / claim ID / verifier-verdict-badge + confirm / forget buttons.
- Create: `src/components/PostMirrorReview.tsx` — the surface component. Manages local state for which entries have been resolved this batch; disables "Done" until all are resolved. Shows the compiled-truth rewrite as a preview ("If you confirm any claim in this dimension, this is how your page will read") — but the compiled-truth rewrite commits only if at least one entry in that dimension is confirmed; if all are forgotten in a dimension, the compiled-truth rewrite is also dropped.
- Create: `src/server/confirm-diff.{functions,handler.server}.ts` — input: `{studentId, diffId, entryId}`. Handler: insert the entry row into `vips_timeline_entries` (with `reinforces_id` carried from the verifier result), and on **first confirm in a dimension within this batch**, also UPDATE the `vips_pages` row for that dimension with the compiled-truth rewrite + open_question. Then mark the entry as resolved within the staged diff's payload (track which entries have been confirmed inside `vips_proposed_diffs.payload_json`). On **last entry resolved across all dimensions**, set `vips_proposed_diffs.status='confirmed'` and `reviewed_at=now`. Custom error: `ConfirmDiffError`. Wrapped in `withStudent`.
- Create: `src/server/forget-diff.{functions,handler.server}.ts` — input: `{studentId, diffId, entryId}`. Handler: mark the entry as forgotten within the staged diff's payload. Does NOT update `vips_forget_count` — forget on the review surface (entry never reached the wiki) does not bump the count; the count tracks "previously committed, then forgotten" only. Covers R20's audit-trail boundary. On last entry resolved, same finalization as `confirm-diff`. Wrapped in `withStudent`.
- Create: `src/server/load-pending-review.{functions,handler.server}.ts` — input: `{studentId}`. Handler: read the most-recent `vips_proposed_diffs.status='pending'` row for the student; return the payload + verifier annotations. Returns null if no pending row. Wrapped in `withStudent`.
- Modify: `src/router.tsx` — register the new route; ensure the `/reflect` → `/reflect/review` transition is intercepted by U7's flow (on `persistMirror` success with auto-Connector result, navigate to `/reflect/review` instead of `/wiki/$entryId`).
- Modify: `src/components/MirrorSession.tsx` — `onPersisted` navigates to `/reflect/review` (not `/wiki/$entryId`). If `pending_queued: true` (R30 case), navigate to `/reflect/review` anyway — it will surface the prior queued pending diff first.
- Create: `test/server/confirm-diff.test.ts`, `test/server/forget-diff.test.ts`, `test/server/load-pending-review.test.ts` — DI'd DB seed; cover happy path, partial-batch state, last-entry finalization.
- Create: `test/components/PostMirrorReview.test.tsx` — render with stub diff; confirm-and-forget interaction; Done-disabled-until-all-resolved.

**Approach:**
- **Surface shape**: A route, not a modal. Modals on top of `/reflect` would lose state on accidental click-outside; a dedicated route is robust to back/forward navigation and persists in the URL.
- **Batch resolution**: Track resolution state inside the staged diff's `payload_json` as a per-entry `{ resolved: 'pending' | 'confirmed' | 'forgotten' }` flag. Reading and updating one JSON column on a single row is cheaper than maintaining a per-entry resolution-state row, and the batch is short-lived (commits flip the diff's overall status to `'confirmed'` and the resolution-state is no longer load-bearing).
- **Compiled-truth commit semantics**: The compiled-truth rewrite is a per-dimension property — if no entry in that dimension is confirmed, the rewrite is dropped. If at least one entry is confirmed, the rewrite commits. This implements R2's "compiled-truth bounded by timeline" rule: the wiki only ever shows compiled-truth that has at least one supporting entry in this batch (existing entries on the page support themselves).
- **Verdict badges**: Each entry shows a small badge — `verified ✓` for admitted, `aspirational ⚠` for parallax-capped, `partial match` for downgraded. Dropped entries appear in a collapsed "Quotes we couldn't find in your reflection" section, read-only (cannot be confirmed; forget is a no-op for them — they never reach the wiki regardless).
- **Pending-review surfacing**: `wiki.index.tsx` loader (rewritten in U9) checks `loadPendingReview` — if a pending diff exists, the loader redirects to `/reflect/review`. The student must clear the queue before the wiki view is accessible. This is the R30 enforcement point.

**Patterns to follow:**
- `src/components/ConfirmAndSave.tsx` for the mutation+invalidation pattern (per-entry confirm/forget mutations both invalidate `['pending-review', STUDENT_ID]`).
- `src/server/edit-wiki.{functions,handler.server}.ts` for the per-field-edit server-fn shape — confirm-diff and forget-diff follow this exactly.
- `src/routes/wiki.$entryId.tsx` for the loader + `useSuspenseQuery` pattern.

**Test scenarios:**
- Happy path: pending diff with 3 admitted entries across 2 dimensions → render two `<DimensionGroup>`s, each with its compiled-truth preview; confirm all → wiki tables show 3 timeline entries, 2 pages updated. Covers AE1.
- Happy path: confirm 2 of 3, forget 1; the forgotten one never appears in `vips_timeline_entries`; the confirmed two do; the page is updated. The `Done` button stays disabled until all 3 are resolved.
- Edge case (R20 boundary): forgetting an entry on the review surface does NOT increment `vips_forget_count` — that count is for "previously committed, then forgotten" only. Asserted by reading the count both before and after.
- Edge case: all entries forgotten in a dimension → compiled-truth rewrite is not committed for that dimension; `vips_pages` row for that dimension is unchanged.
- Edge case: dropped entries (verifier rejected) appear in collapsed section; cannot be confirmed; do not affect Done-enabled state (they are pre-resolved by the verifier).
- Edge case (R30): close the surface mid-batch → `vips_proposed_diffs.status` remains `pending`; next app open → `loadPendingReview` returns the same row; the surface re-renders with already-resolved entries dimmed and unresolved entries active. Covers AE8.
- Edge case (R30 queue): pending diff exists; F1 attempts another Mirror save → `persistMirror` writes the mirror entry but does NOT chain auto-Connector; the new mirror is queued; the review surface shows the prior pending diff first.
- Integration: full F1 → confirm-all path; after Done, `loadPendingReview` returns null and the wiki view at U9 renders the four dimensions with the new content.

**Verification:**
- `pnpm test test/server/confirm-diff.test.ts test/server/forget-diff.test.ts test/server/load-pending-review.test.ts test/components/PostMirrorReview.test.tsx` passes.
- A real-browser smoke test of the F1 flow lands on `/reflect/review` and renders the staged diff (smoke once U7 + U8 + U9 are all wired).

---

### U9. VIPS wiki pages UI + per-entry forget + 3-entry gate removal

**Goal:** Replace the v0.1 wiki list view with the four-VIPS-pages surface. `/wiki` becomes an overview showing the four dimension cards (compiled-truth excerpt + last-updated stamp); `/wiki/$dimension` is the per-dimension page (full compiled-truth + open question + timeline). Per-entry `forget` button on every timeline entry mutates via a new server fn. Remove the 3-entry hard gate (R24) and replace with a confirm dialog when fewer than 3 verified VIPS claims exist across all dimensions. The `/wiki/$entryId` per-Mirror-entry view is retained (it still shows a single Mirror reflection's three fields with edit affordances) but is reachable only via timeline-entry → "see source reflection" — not as the primary wiki shape.

**Requirements:** R1, R3, R19, R20, R24, R28 (Mirror entry view unchanged for the source-reflection lookup)

**Dependencies:** U1 (`vips_pages`, `vips_timeline_entries`, `vips_forget_count` schemas), U8 (pending-review redirect rule)

**Files:**
- Create: `src/components/VipsPageView.tsx` — renders a single VIPS dimension's page. Header: dimension label + compiled-truth paragraph (read-only) + open question line. Body: timeline entries grouped chronologically (newest first). Each timeline entry: quote, source-reflection link, strength badge, parallax tag chips, `forget` button. Voice-calibration per R29: passes a `dimension` prop that styles the compiled-truth voice section accordingly (no behavior change, just typographic restraint per dimension).
- Create: `src/routes/wiki.$dimension.tsx` — file-based route `/wiki/values`, `/wiki/interests`, etc. Loader fetches the dimension's compiled-truth + non-forgotten timeline. Loader checks `loadPendingReview` first; if a pending diff exists, redirects to `/reflect/review`.
- Rewrite: `src/routes/wiki.index.tsx` — overview view. Renders four cards (one per dimension) with compiled-truth excerpt + last-updated timestamp. Sense-making button is on this page. The 3-entry gate replaced with: button is always enabled, but clicking it when fewer than 3 verified claims exist across dimensions raises a `<ConfirmDialog>` with the text "Patterns may be weak — run anyway?" — student confirms → run proceeds. Covers AE5.
- Create: `src/components/ConfirmDialog.tsx` — simple shadcn-style dialog with Yes / Cancel buttons.
- Create: `src/server/forget-timeline-entry.{functions,handler.server}.ts` — input: `{studentId, entryId}`. Handler: set `forgotten_at = current_timestamp` on the entry, DELETE from the FTS5 mirror (R19's "excluded from hybrid retrieval"), increment `vips_forget_count.count` for that dimension. Custom error: `ForgetTimelineEntryError`. Wrapped in `withStudent`.
- Create: `src/server/load-vips-pages.{functions,handler.server}.ts` — input: `{studentId}`. Handler: returns the four `vips_pages` rows + non-forgotten timeline entries grouped by dimension + last-updated stamps + claim count per dimension (used by the gate logic). Wrapped in `withStudent`.
- Delete (or deprecate-and-redirect): `src/server/load-wiki.{functions,handler.server}.ts` is kept for the source-reflection lookup but its caller migrates to `load-vips-pages` for the overview.
- Modify: `src/routes/wiki.$entryId.tsx` — kept as the source-reflection detail. Add a back link to the linking VIPS page. The query keys remain `['wiki-entry', STUDENT_ID, entryId]`.
- Create: `test/components/VipsPageView.test.tsx`, `test/routes/wiki-dimension.test.tsx`, `test/server/forget-timeline-entry.test.ts`, `test/server/load-vips-pages.test.ts`.

**Approach:**
- **Overview page** (`/wiki`): Four cards laid out 2×2 or vertical-stack, each showing the dimension label + the first ~2 lines of compiled-truth + "Last updated 2 days ago" timestamp + claim count. Sense-making button below the grid. If `loadPendingReview` returns non-null at load, redirect to `/reflect/review` — R30 / AE8.
- **Per-dimension page** (`/wiki/$dimension`): Compiled-truth paragraph + open question + chronological timeline (newest first). Forget button on each entry is a small unobtrusive icon; clicking it raises a quick confirm (not the same dialog as the gate-skip — a smaller inline confirm). Forget is irreversible per R19 (audit-trail-preserved, not user-recoverable).
- **3-entry gate removal**: Replace the `SENSEMAKE_GATE = 3` hardcoded constant in `wiki.index.tsx` with a runtime claim-count read from `load-vips-pages`. If `claim_count < 3`, the button is enabled but on click raises the confirm dialog. Covers AE5.
- **Voice calibration (R29)**: Implemented as the per-dimension typographic restraint on `VipsPageView` — compiled-truth on the Values page uses a slightly different paragraph treatment than Interests, etc. No new fonts or colors — restraint, not decoration.
- **R20 forget-count surfacing**: `load-vips-pages` does NOT return the forget count to the client (R20 explicit). The count is incremented but lives behind the server-fn boundary. (The count is read by other v0.3 features; v0.2 leaves it on the shelf.)

**Patterns to follow:**
- `src/routes/wiki.index.tsx` (v0.1) for the loader + `useSuspenseQuery` pattern.
- `src/components/WikiEntryCard.tsx` for the read-only card shape.
- `src/server/edit-wiki.{functions,handler.server}.ts` for the per-mutation server-fn pattern.
- `STUDENT_ID = 'demo'` is hardcoded in `reflect.tsx`, `wiki.index.tsx`, `wiki.$entryId.tsx` per repo research — `wiki.$dimension.tsx` and `wiki.trajectory.tsx` (U11) also hardcode it; the multi-student seed in U13 surfaces students for selection, but the v0.2 demo flow operates on one student per browser session.

**Test scenarios:**
- Happy path: four `vips_pages` rows + a handful of timeline entries per dimension → overview renders 4 cards with the right counts.
- Happy path: navigate to `/wiki/values` → renders compiled-truth + open question + timeline (newest first).
- Edge case (R20): forget count is NOT in the `load-vips-pages` response.
- Edge case (R19 happy): click `forget` on a timeline entry → row's `forgotten_at` populated; row no longer appears in the timeline; FTS5 query for that entry's quote returns no match.
- Edge case (R19 + R20 integration): forget an entry → `vips_forget_count.count` increments by 1; the response to `load-vips-pages` is unchanged in surface-visible fields; the agent's next Connector run does not see the forgotten entry's content. Covers AE3.
- Edge case (R24 / AE5): student presses Run sense-making with zero verified VIPS claims → dialog fires; student confirms → run proceeds.
- Edge case (R30 / AE8): pending diff exists → overview redirects to `/reflect/review`; reading the URL bar shows the review-route URL.
- Integration: navigate from per-dimension page → timeline entry's "see source reflection" link → `/wiki/$entryId` of the originating Mirror entry → back link returns to the dimension page.

**Verification:**
- All new tests pass.
- A real-browser smoke test of `/wiki` → click a dimension card → forget one entry → return to overview → claim count decremented by 1; visible content updated.

---

### U10. Pathfinder → Cartographer rename + step-event widening

**Goal:** Rename `pathfinder.ts` → `cartographer.ts`, `pathfinder.prompt.md` → `cartographer.prompt.md`, `PathfinderTrajectoryCard.tsx` → (split into U11's TrajectoryPageView). Widen the `RunStepEvent.AgentName` union from `'connector' | 'pathfinder'` to `'connector' | 'cartographer'`. Update the `AgentRunVisualizer.tsx` to render a single-card layout (Cartographer-only — Connector is no longer in the manual sense-making chain since it auto-runs per Mirror session in U7). Move the existing v0.1 Pathfinder agent-creation factory + tests into the renamed file; the **output schema rewrite** happens in U11. This unit is mechanical rename only, no behavioral change.

**Requirements:** R15 (renamed agent, manual-only), R18 (step-event replay carries forward), R28 (file-naming consistency)

**Dependencies:** U4 (model config — `CARTOGRAPHER_MODEL` already exported in U4)

**Files:**
- Rename: `src/agents/pathfinder.ts` → `src/agents/cartographer.ts`. Replace the exported `pathfinderAgent` / `createPathfinderAgent` with `cartographerAgent` / `createCartographerAgent`.
- Rename: `src/agents/pathfinder.prompt.md` → `src/agents/cartographer.prompt.md`. Title and section frame stay; **prompt body is rewritten in U11** when the output shape changes.
- Modify: `src/agents/schemas.ts` — rename `PathfinderOutputSchema` → `CartographerOutputSchema` (full reshape lands in U11; this unit keeps the v0.1 shape under the new name to keep the build green).
- Modify: `src/agents/run-events.ts` — widen `AgentName` union from `'connector' | 'pathfinder'` to `'connector' | 'cartographer'`. Update the discriminated-union variants that carry an `agentName` field.
- Modify: `src/agents/handoff-chain.ts` and `src/agents/handoff-chain-streamed.ts` — update import paths, agent factory names, and the orchestrator's emitted agent names. (Note: these files are also slated for partial replacement in U11; this unit keeps them functional under the rename.)
- Modify: `src/components/AgentRunVisualizer.tsx` — replace the hardcoded two-card layout (Connector + Pathfinder) with a single-card layout for Cartographer. The `↳ handoff to pathfinder` pill row is removed (Cartographer is a single-agent chain). The `data-active` attribute and step-event consumption logic carry forward.
- Modify: `src/server/run-sensemaking.{functions,handler.server}.ts` — the v0.1 handler still works as a passthrough until U11 replaces it with `run-cartographer.{functions,handler.server}.ts`. This unit just updates internal imports.
- Modify: every test that references `pathfinder` — `test/agents/handoff-chain.test.ts`, `test/agents/handoff-chain-streamed.test.ts`, `test/agents/pathfinder.test.ts` (rename to `cartographer.test.ts`).
- Modify: `README.md` — replace `Pathfinder` references with `Cartographer`.

**Approach:**
- This is a mechanical rename. The output schema is unchanged in this unit (still `{trajectory, pathways, disclaimer}` from v0.1) so the build stays green. U11 rewrites the schema + prompt body.
- The `AgentRunVisualizer` rewrite is the only non-mechanical piece: removing the two-card hardcoding means the visualizer needs to read the agent name from events and render whichever single agent is active (Cartographer in F2; the Connector visualization moves to U7's `/reflect/review` flow where it's not visualized at all — the auto-Connector run completes in-process and the student lands on the review surface directly).
- A safety check: `grep -rn pathfinder src test scripts` after this unit should return only test fixtures, comments documenting the rename, or `connector_outputs.pathfinder_output_id` (the v0.1 FK that is kept through cutover per Scope Boundaries).

**Patterns to follow:**
- The v0.1 plan's earlier rename + delete units for the pattern of mechanical-then-behavioral splits.
- `src/agents/handoff-chain.ts` for the existing orchestration pattern.

**Test scenarios:**
- Happy path: `pnpm check` passes (no stray `Pathfinder` / `pathfinder` references except in documented places).
- Happy path: existing `handoff-chain.test.ts` still passes against the renamed file.
- Happy path: existing streamed-chain test still passes; events with `agentName: 'cartographer'` flow through unchanged.
- Edge case: a test that explicitly asserts the AgentName union now includes `'cartographer'` and excludes `'pathfinder'`.

**Verification:**
- `pnpm check` passes.
- `pnpm test` passes (all renamed tests pass).
- `grep -rn '\\bpathfinder\\b' src test scripts README.md | grep -v "rename" | grep -v "from v0.1"` returns empty (or only inside FK column-name comments).

---

### U11. Cartographer Trajectory page generation (output schema reshape + persistence + manual-trigger route)

**Goal:** Reshape Cartographer's output from v0.1's `{trajectory, pathways, disclaimer}` to v0.2's Trajectory page — one-paragraph trajectory + 2–5 lead-sheet pathways (each with label, trait_combination of claim ID refs, ECG region tags, risks/tradeoffs, exploration prompt) + open questions + disclaimer. Cartographer reads the four VIPS pages + corpus instead of Connector's raw patterns. The "Run sense-making" trigger (manual-only) invokes `runCartographer`, which streams step events into the visualizer and persists the resulting Trajectory page in `cartographer_outputs`. `/wiki/trajectory` renders the most-recent Trajectory page.

**Requirements:** R15, R16, R17, R18

**Dependencies:** U1 (`cartographer_outputs` table), U2 (`lookup_vips_taxonomy`), U3 (ECG crosswalks), U4 (`CARTOGRAPHER_MODEL`), U10 (rename + step-event widening)

**Files:**
- Modify: `src/agents/schemas.ts` — rewrite `CartographerOutputSchema`: `{ trajectory_paragraph: string, pathways: Pathway[], open_questions: string[], disclaimer: string }`. `Pathway`: `{ label: string, trait_combination: ClaimRef[], ecg_region_tags: string[], risks_tradeoffs: string, exploration_prompt: string }`. `ClaimRef`: `{ claim_id: string, dimension: 'values'|'interests'|'personality'|'skills', timeline_entry_id?: number }`. Min 2 pathways, max 5 (Zod refinement). Each pathway's `ecg_region_tags` must be values that exist in `src/data/ecg-taxonomy.ts` (cluster IDs); this is validated in the verifier-light post-process described in Approach below.
- Rewrite: `src/agents/cartographer.prompt.md` — the new prompt body. `## What you do`: read the student's four VIPS pages + corpus, propose 2–5 under-specified lead-sheet pathways. `## Hard constraints`: trait_combination references claim IDs that exist on the student's VIPS pages (no invented IDs); ecg_region_tags are cluster-level only (no specific subjects or paths); risks_tradeoffs is in SG secondary-student context; no diagnostic language; second-person empathetic voice; the trajectory paragraph stays grounded in evidence (no aspirational inflation). `## Output`: cross-references `CartographerOutputSchema`.
- Create: `src/server/run-cartographer.{functions,handler.server}.ts` — replaces `run-sensemaking.{functions,handler.server}.ts` for the F2 flow. Input: `{studentId}`. Handler: read VIPS pages + corpus, invoke `run(cartographerAgent, prompt, {stream: true})`, accumulate events via the existing defensive event mapper, validate output via `CartographerOutputSchema`, run a post-process verifier (see Approach) that checks (a) every `trait_combination[].claim_id` exists in the student's `vips_timeline_entries`, (b) every `ecg_region_tags[]` value is a valid cluster ID in `src/data/ecg-taxonomy.ts`, (c) pathway count is 2–5; on validation failure of (a) or (b), strip the offending pathway and warn. Persist the result to `cartographer_outputs`. Return `{ trajectory, events, totalDurationMs, partial }`.
- Delete (or deprecate): `src/server/run-sensemaking.{functions,handler.server}.ts` — kept for v0.1 backward-compatibility through the cutover; removal lands in the follow-up PR per Scope Boundaries.
- Create: `src/components/TrajectoryPageView.tsx` — renders the trajectory paragraph + pathway cards + open questions + disclaimer. Each pathway card shows: label header, trait_combination as clickable chips (each chip links to the source `vips/$dimension` page anchored to the timeline entry, when `timeline_entry_id` is present), ECG region tag chips (clickable to `lookup-ecg-taxonomy` modal), risks/tradeoffs paragraph, exploration prompt as a callout.
- Create: `src/routes/wiki.trajectory.tsx` — file-based route `/wiki/trajectory`. Loader checks `loadPendingReview` first (redirect on pending — R30 carries forward to F2 as well). Renders the most-recent `cartographer_outputs` row via `TrajectoryPageView`, or an empty-state ("Run sense-making to see your trajectory").
- Modify: `src/routes/wiki.index.tsx` — the "Run sense-making" button on the overview triggers `runCartographer` (via U8's confirm-dialog check first if < 3 verified claims) and navigates to `/wiki/trajectory` on success. The `AgentRunVisualizer` from U10 inlines on `/wiki` during the run, then the route transitions on completion.
- Create: `test/agents/cartographer.test.ts` — DI'd stub Cartographer; output-schema rejection; trait_combination claim-ID validation; ecg_region_tags validation; pathway count refinement.
- Create: `test/server/run-cartographer.test.ts` — stub agent + DB seed; happy path persists `cartographer_outputs`; post-process verifier drops invalid pathways; step-event sequence correct.
- Modify: `test/components/AgentRunVisualizer.test.tsx` — update to test the new single-card layout for Cartographer.

**Approach:**
- **The post-process verifier inside `run-cartographer`** is the structural enforcement of R17's "trait_combination references claim IDs that exist" and "ecg_region_tags come from the ECG taxonomy fixture (no invented IDs)" rules. It's NOT a full re-verifier (the Cartographer isn't proposing diffs, so there are no verbatim quotes to substring-match); it's a small structural validator that drops invalid pathways and warns. The Cartographer's prompt instructs it to use real IDs; the post-process is the safety net.
- **The "patterns may be weak" confirm dialog** from U9 fires before `runCartographer` is invoked — the gate-removal logic lives in the wiki overview, not in the handler. The handler runs regardless of claim count.
- **Step-event streaming**: The Cartographer chain is a single-agent run (no handoff). The streamed event sequence is `agent_started(cartographer) → tool_call_started → tool_call_completed → … → agent_completed(cartographer) → run_completed`. No `handoff` event is emitted (it's still in the union for v0.1 backward compat but the Cartographer chain doesn't fire it). The defensive event mapper from `handoff-chain-streamed.ts:190-260` carries forward.
- **Sensemaking-baseline ablation**: After this unit lands, the v0.2 sensemake-surface ablation (`pnpm ablate:sensemake`) can run with the new Cartographer output shape. The report scoring uses the new 5-dimension rubric (U13).
- **Run-button visibility on `/wiki`**: Only on `/wiki` (the overview), not on `/wiki/$dimension` pages or `/wiki/trajectory`. Per F2 trigger — the student/operator is in the overview view when invoking sense-making.

**Patterns to follow:**
- `src/agents/handoff-chain-streamed.ts` for the streaming + event-mapping pattern (lines 190-260 are the load-bearing defensive mapper to reuse).
- `src/agents/schemas.ts` Zod refinement pattern for the 2–5 pathway count.
- `src/components/PathfinderPathwaysCard.tsx` (v0.1) for the pathway-card visual treatment to mirror.
- `src/components/PathfinderTrajectoryCard.tsx` (v0.1) for the trajectory paragraph treatment.

**Test scenarios:**
- Happy path: stub Cartographer returns a 3-pathway output with valid claim IDs and ECG tags → output persisted to `cartographer_outputs`; visualizer events in order. Covers AE4.
- Edge case: 1 pathway returned → schema refinement rejects (min 2).
- Edge case: 6 pathways → schema refinement rejects (max 5).
- Edge case (claim-ID validation): pathway references `values.contribution` claim ID but no timeline entry on the student's Values page carries that ID → that pathway is dropped by the post-process verifier; remaining pathways persist; the response includes a `warnings` list.
- Edge case (ecg_region_tags validation): pathway references `cluster.xyzzy` which doesn't exist → pathway dropped; warning added.
- Edge case (R30): pending review queue exists → `wiki.trajectory` loader redirects to `/reflect/review`.
- Edge case (R24 / AE5): student presses Run sense-making with zero claims → U9's confirm dialog fires; on confirm, run proceeds; Cartographer's prompt receives an empty VIPS-pages context and emits a "still discovering" trajectory + a forgiving disclaimer.
- Error path: Cartographer schema-rejects its own output (Zod hard reject) → no `cartographer_outputs` row written; UI shows retry affordance on `/wiki/trajectory`.
- Integration: full F2 — manual press of Run sense-making on `/wiki` → AgentRunVisualizer single-card replay → navigate to `/wiki/trajectory` → renders the new Trajectory page with clickable trait-combination chips and ecg_region_tag chips. Covers AE4 end-to-end.

**Verification:**
- `pnpm test test/agents/cartographer.test.ts test/server/run-cartographer.test.ts test/components/AgentRunVisualizer.test.tsx` passes.
- A real-browser smoke test of F2: navigate to `/wiki`, press Run sense-making, watch the visualizer, land on `/wiki/trajectory` with at least 2 pathways rendered.

---

### U12. Counsellor brief markdown side-export

**Goal:** A pure function `(VIPS pages + latest Trajectory page) → markdown` exposed via a server fn `counsellorBrief({studentId})`. Output is a plain markdown document (per-VIPS-dimension claims with verbatim quotes, top pathways with their risks and exploration prompts, gaps, disclaimer). Student-initiated, on-demand, not auto-persisted, not transmitted. UI affordance is a small "Export counsellor brief" link on `/wiki` that triggers the function and downloads the markdown file directly.

**Requirements:** R22

**Dependencies:** U9 (`loadVipsPages`), U11 (`cartographer_outputs` data)

**Files:**
- Create: `src/server/counsellor-brief.{functions,handler.server}.ts` — input: `{studentId}`. Handler reads `vips_pages` + non-forgotten `vips_timeline_entries` + the most-recent `cartographer_outputs` row; passes them to a pure `renderCounsellorBrief(input)` function; returns `{ markdown: string }`. Wrapped in `withStudent`.
- Create: `src/lib/counsellor-brief-renderer.ts` — pure function `renderCounsellorBrief({pages, timelines, trajectory}): string`. Markdown structure: title with date, per-VIPS-dimension section (compiled-truth quote + top 3 timeline entries with verbatim quotes), Trajectory section with top 3 pathways (label + risks + exploration prompt), gaps section listing the four open questions, disclaimer. No counsellor-specific framing — it's a developer/demo debugging artifact (R22).
- Modify: `src/routes/wiki.index.tsx` — small text link "Export counsellor brief" below the dimension cards; on click, fetches the brief and triggers a `Blob`-based download.
- Create: `test/server/counsellor-brief.test.ts`, `test/lib/counsellor-brief-renderer.test.ts`.

**Approach:**
- **Pure rendering**: The renderer takes already-loaded data and produces a string. No DB calls inside the renderer — that keeps it test-friendly and reusable (e.g., for a future CLI export script).
- **On-demand, not persisted**: The server fn does not write to disk; the client triggers the download via `Blob` + `URL.createObjectURL`. R22 is explicit that the brief is not auto-persisted or transmitted.
- **Markdown structure** (v0.2 baseline): 
  - `# Counsellor Brief — {student_id} — {date}`
  - `## Values` (compiled-truth quote, top 3 timeline entries with their verbatim quotes + strength badge)
  - `## Interests` (same shape)
  - `## Personality` (same shape, calibrated to R29 voice)
  - `## Skills` (same shape, R29 voice)
  - `## Trajectory` (paragraph + top 3 pathways: label + risks + exploration prompt)
  - `## Open questions` (the four VIPS-page open questions + the Trajectory's open questions, dedup)
  - `## Disclaimer` (Cartographer's disclaimer text + a note that this is a developer/demo debugging artifact, not a versioned schema)
- **Voice**: Same R29 calibration per dimension, but markdown-rendered, not styled.
- **Failure modes**: If no `cartographer_outputs` row exists yet, the Trajectory section is replaced with "Trajectory not yet generated — run sense-making to populate." If a dimension has zero claims, that section is replaced with "No verified claims yet for {dimension}."

**Patterns to follow:**
- `src/server/load-wiki.handler.server.ts` for the data-loading + `withStudent` pattern.
- `src/lib/safety.ts` for the pure-function-in-`lib` shape (testable, no side effects).

**Test scenarios:**
- Happy path: full corpus (4 dimensions with claims + Trajectory exists) → markdown contains all four `##` sections + Trajectory + disclaimer.
- Edge case: no Trajectory yet → renders the "Trajectory not yet generated" placeholder.
- Edge case: one dimension has zero claims → that dimension's section renders the empty-state line.
- Edge case: forgotten timeline entries are NOT included (R19).
- Edge case: top-3 selection — when a dimension has > 3 entries, pick the 3 most-recent (newest first); when ≤ 3, render all.
- Edge case: markdown safety — verbatim quotes containing markdown special characters (`*`, `_`, backticks, `]`) are escaped so the rendered output is valid markdown.
- Integration: server-fn round trip — call `counsellorBrief({studentId: 'demo-a'})` → response markdown round-trips through a markdown parser without errors.

**Verification:**
- `pnpm test test/server/counsellor-brief.test.ts test/lib/counsellor-brief-renderer.test.ts` passes.
- A real-browser smoke test of the export link → markdown file downloads with expected sections.

---

### U13. Multi-student demo seed + v0.2 ablation rubric (5 dimensions)

**Goal:** Replace the 1-student × 8-reflections v0.1 seed (`test/ablation/fixtures/seed-corpus.json`) with the v0.2 seed: 3–5 SG secondary students × 6–10 reflections each, ≥3 distinct context types per student, distinct emerging VIPS profile per student (different Values dominance, different RIASEC tilt, different Skills evident). Reflections in authentic SG vernacular with real school/CCA/subject references drawn from `src/data/ecg-taxonomy.ts`. Mechanism per A3: hand-curated student profiles + LLM-generated reflections + hand-review pass; reflections persisted as JSON fixtures (not generated at seed-time) so reseed is deterministic. Add the fifth `parallax discipline` ablation dimension (A6) to the scoring scaffold and update reports README.

**Requirements:** R25, R26, R12 (context_type), R29 (vernacular authenticity for voice calibration validation), Success Criteria (ablation rubric)

**Dependencies:** U1 (`mirror_entries.context_type` column), U4 (model config, so ablation runs use `gpt-5.5` by default)

**Files:**
- Create: `test/ablation/fixtures/seed-multistudent.json` — the new seed. Shape: `{ students: Array<{ student_id: string, profile: ProfileMeta, reflections: Array<ReflectionFixture> }> }`. `ProfileMeta`: `{ name_handle, year_level, school_type ('IP'|'JC'|'sec'|'poly'), Values_dominance, RIASEC_tilt, Skills_evident, notes_for_review }`. `ReflectionFixture`: `{ context_type, transcript, created_at }`. 3-5 students × 6-10 reflections.
- Delete (or archive): `test/ablation/fixtures/seed-corpus.json` — the v0.1 8-reflection single-student seed. Archive under `test/ablation/fixtures/_archive/` rather than delete outright (so the v0.1 ablation comparison report remains traceable).
- Modify: `src/db/seed.ts` — iterate the new `students` array; for each student, insert one row per reflection into `mirror_entries` carrying `context_type`. Also create one `vips_pages` row per `(student_id, dimension)` × 4 dimensions per student, initialized empty (compiled_truth = "", open_question = ""). After persist-mirror runs in live demo, the auto-Connector will populate them.
- Modify: `test/ablation/score.ts` — add the fifth dimension `parallax_discipline` to the rubric. The scoring scaffold's `buildAblationReportMarkdown` function now produces 5 rows. Inline citations: the rubric's `parallax_discipline` dimension scores 0–3 against "single-context claims correctly capped at low" — concrete sub-checks per the brainstorm R11.
- Modify: `test/ablation/mirror-tools-off.test.ts`, `test/ablation/sensemake-tools-off.test.ts` — update assertions to expect 5 dimension rows.
- Modify: `scripts/ablate.ts` — read the multi-student seed; the ablate run picks one student per ablation run by default (the script CLI accepts `--student=<id>`) and reports per-student. The combined-corpus run (default if no student is specified) runs against the union of all students (cross-student isolation still preserved via `withStudent` per query).
- Modify: `README.md` — update the seed reference (mention "3–5 students × 6–10 reflections" instead of "8 reflections"), update the ablation rubric description to mention 5 dimensions, update the demo flow paragraph to mention student selection.

**Approach:**
- **Profile-curation step** (one-time): A small ts script at `scripts/draft-student-profiles.ts` (NOT a runtime dependency — used once during this unit's implementation) takes hand-edited profile metadata + a per-profile prompt template, calls OpenAI to generate reflections, writes a draft fixture. The implementer then hand-reviews the drafts for SG vernacular authenticity, real-school-reference accuracy, context-type-coverage balance, and edits any reflections that read inauthentic. The fixture commits the hand-reviewed versions. This is a one-time-per-pivot activity; the script is documented inline as such and is not part of CI.
- **Vernacular authenticity bar**: Reviewer checks include — does the student use real CCA names / subject combos / school types? Does the voice match a real SG secondary student (not a polished textbook narrator)? Are positive + ordinary + negative experiences all represented? Are at least 3 of the 5 context types represented per student?
- **Context-type coverage matrix**: For each student, the reviewer fills in a small matrix asserting which context types are represented in which reflections. The matrix is committed as a comment block inside the fixture file. This makes AE6 mechanically verifiable (the `db.test.ts` test reads the matrix and asserts ≥3 context types per student).
- **Distinct VIPS profile per student**: Hand-curated profiles ensure differentiation. Example: `demo-a` is Values=contribution + RIASEC=Social + Skills=interpersonal; `demo-b` is Values=achievement + RIASEC=Investigative + Skills=analytical. Each student's reflections demonstrate their dominant profile across multiple contexts — not just one-context-only.
- **Parallax discipline scoring rubric**: 0 = single-context claims marked high; 1 = some capping but inconsistent; 2 = consistent capping with occasional miss; 3 = all single-context claims correctly capped, multi-context claims correctly admitted at high. Sub-checks documented inline in `test/ablation/score.ts`.

**Patterns to follow:**
- `test/ablation/fixtures/seed-corpus.json` for the shape baseline (v0.1).
- `src/db/seed.ts` for the iterate-and-insert pattern.
- `test/ablation/score.ts` lines around `buildAblationReportMarkdown` for the dimension scaffold pattern.
- The v0.1 plan's U7 (cross-cutting ablation/README/smoke-test pattern) for the multi-touch unit shape.

**Test scenarios:**
- Happy path (AE6): `pnpm seed` populates ≥3 distinct `student_id` values, each with ≥6 reflections, across ≥3 different `context_type` tags per student.
- Happy path: each student's reflections include at least one positive, one ordinary, one negative experience.
- Edge case: a reflection's `context_type` is one of the closed enum values (no fixture entry violates the CHECK on `mirror_entries.context_type`).
- Edge case: each student starts with empty VIPS pages (compiled_truth = "", open_question = "") — the auto-Connector will populate them on the first live demo Mirror session.
- Integration: `pnpm test test/db.test.ts` — the existing seed-determinism test passes with the new fixture; the new context-type-coverage assertions pass.
- Integration (ablation rubric): `pnpm test test/ablation/mirror-tools-off.test.ts test/ablation/sensemake-tools-off.test.ts` — both report scaffolds now produce 5 dimension rows including `parallax_discipline`.
- Integration (v0.2 sensemake baseline, after U11 lands): `AGENT_MODEL=gpt-5.5 pnpm ablate:sensemake --student=demo-a` produces a 5-dimension report at `test/ablation/reports/2026-05-11-sensemake-ablation-{student_id}.md`.

**Verification:**
- `pnpm seed` runs idempotently against an empty `app.db` and populates the expected number of rows.
- `pnpm check` passes.
- `pnpm test` passes.
- A real-browser smoke test: `/reflect` works for `student_id='demo-a'`; full F1 path completes for at least one student.
- An ablation run on the v0.2 sensemake surface (U11 + U13) produces a report at the expected path with 5 dimensions and ON-vs-OFF scoring.

---

## System-Wide Impact

- **Interaction graph:** Mirror → persistMirror → auto-Connector → verifier → `vips_proposed_diffs` (staging) → student review surface → `vips_pages` + `vips_timeline_entries` (commit). Cartographer manual chain stays orthogonal but now reads VIPS pages instead of Connector output. `agent_traces` still records every agent invocation including the verifier (which writes a trace row with `agent_name='verifier'` for audit). New: a "queued auto-Connector" path when prior pending diffs exist (R30 / AE8).
- **Error propagation:** Verifier drops/downgrades silently — surfaced in the review surface UI, never thrown. Auto-Connector failures persist the Mirror entry and surface a "Review pending — Retry" affordance — Mirror reflection is not blocked. Cartographer schema rejections at the agent output boundary are surfaced as a `/wiki/trajectory` empty-state with retry; the post-process structural validator (invalid claim IDs or invalid ECG tags) silently drops offending pathways and includes warnings in the response.
- **State lifecycle:** `vips_proposed_diffs.status` transitions `pending → confirmed | forgotten`; never deleted. `vips_timeline_entries.forgotten_at` is set-once (no un-forget). Compiled-truth rewrites are gated on at-least-one-confirmed-entry-in-dimension. R30 pending-queue rule blocks new auto-Connector runs while pending diffs exist; new Mirror entries still persist.
- **API surface parity:** v0.1 `load-wiki` kept for source-reflection lookup; new `load-vips-pages` for the overview; new `load-pending-review` for the review-surface state; `edit-wiki` kept for the source-reflection edit (Mirror fields still editable on `/wiki/$entryId`). The v0.1 `run-sensemaking` handler is kept as a passthrough through cutover and is replaced by `run-cartographer` in U11. The `edit-wiki` server fn is unchanged in shape; the new mutations (`confirm-diff`, `forget-diff`, `forget-timeline-entry`) all follow the same `*.functions.ts` + `*.handler.server.ts` split.
- **Integration coverage:** Mocks alone do not prove (a) the full F1 chain (Mirror → picker → persist → Connector → verifier → review → confirm → wiki commit), (b) the F3 forget chain (forget → FTS5 mirror DELETE → next agent run does not see forgotten content), or (c) the F2 chain (manual Run sense-making → Cartographer streamed events → Trajectory page persist → render). These require integration tests against a real in-memory SQLite + DI'd stub agents. Specified explicitly in U6's, U7's, U8's, U9's, U11's integration scenarios.
- **Unchanged invariants:**
  - `withStudent` tenancy boundary applies to every new server fn; no cross-student access in any new path.
  - Diagnostic-language safety regex (`src/lib/safety.ts`) extends to cover Connector's compiled-truth rewrites (Personality dimension especially) and Cartographer's trajectory paragraph and pathway risks text.
  - Whisper path (`gpt-4o-mini-transcribe`) unchanged.
  - Mirror agent's three-field output (`{validation, inferred_meaning, story_reframe}`) and silent-ritual UI unchanged per R28.
  - Single-vendor OpenAI; no second LLM provider introduced for v0.2.
  - FTS5 over `story_reframe` carries forward; a new FTS5 mirror over `vips_timeline_entries.verbatim_quote` is added (used by the verifier and by hybrid retrieval's forget exclusion).
  - The v0.1 schema-mismatch drop-and-reseed pattern carries forward (A8).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Normalized-substring verifier is too strict (admits too few honest paraphrases) or too loose (admits paraphrases that should be dropped). | AE7 calibration pair is locked into the test suite. Implementer tunes the 80%-token-subsequence partial-match boundary against the seed corpus during U6. Span-overlap-with-threshold remains an option for v0.3 if normalized proves insufficient. |
| Multi-student seed reads inauthentic, poisoning the ablation rubric. | Hand-review pass over LLM-generated reflections (A3); reviewer checks vernacular, real-school-reference accuracy, context-type-coverage balance. Coverage matrix committed inline so AE6 is mechanically verifiable. |
| `gpt-5.5` model identifier changes or is unavailable in the `@openai/agents` SDK. | Verified during U4 implementation against the OpenAI Agents SDK accepted-model list. If the identifier shifts (e.g., a `gpt-5-mini` substitute), update `src/agents/config.ts` and re-run U5 baseline with the substitute; the env-override seam means no further code changes are needed. |
| Auto-Connector latency degrades the post-Mirror experience. | 30s soft timeout (separate budget from Mirror's 20s); Mirror entry persists regardless of Connector outcome; UI surfaces a "Review pending — Retry" affordance on timeout. Acceptable demo-mode tradeoff. |
| Pathfinder → Cartographer rename leaves dangling references (FK column names, comment-only references, ablation report filenames). | Explicit `grep -rn` verification step in U10; the v0.1 `connector_outputs.pathfinder_output_id` FK column is kept intentionally through cutover and documented in `src/db/schema.sql` inline. |
| Cartographer's post-process structural validator strips too many pathways, leaving the Trajectory page sparse. | The validator's drop reasons are surfaced as `warnings` in the response; the prompt instructs Cartographer to use real IDs (which the prompt knows from the VIPS-pages context); the seed students each carry enough timeline entries to give Cartographer real IDs to reference. If sparseness is observed in the v0.2 sensemake ablation, U11's Approach allows a follow-up prompt tightening before re-running. |
| R30 pending-queue rule confuses students who can't tell why their new Mirror entry didn't surface diffs. | The review surface shows a clear banner ("You have pending diffs from your previous reflection. Resolve those first, then your new reflection will surface here."). The wiki overview also redirects to `/reflect/review` whenever a pending row exists. |
| Schema migration drop-and-reseed loses developer in-flight state. | v0.2 still demo-mode; no production data exists. The boot-time mismatch detection logs a visible message; the v0.1 plan's A5 pattern carries forward. |
| The picker UX (R12 / A1) adds friction to the silent-ritual flow. | One tap, large buttons, default-to-last-used. Picker mounts after the transcript is back, not during the silent ritual — the recording phase is still uninterrupted. Friction is bounded to the post-Stop transition where the student is already shifting from speaking to looking-at-screen. |
| The cluster-only `ecg_region_tags` constraint (R17.c) requires the cluster crosswalks to actually be populated (U3) before Cartographer can emit valid tags. | U3 is a hard dependency for U11. U11's post-process verifier explicitly checks that every tag is a valid cluster ID; if U3 is incomplete, U11's tests fail loudly. |

---

## Documentation / Operational Notes

- **README updates** (lands in U13 with the seed rewrite, but other units touch it incrementally): replace "8-reflection" with "3–5 students × 6–10 reflections"; replace `gpt-4.1` with `gpt-5.5` (U4); replace `Pathfinder` with `Cartographer` (U10); add a note on the `AGENT_MODEL` env override; add a section on the post-Mirror review surface in the demo flow; mention the counsellor-brief export link.
- **Environment variables**: New optional `AGENT_MODEL` override; default `gpt-5.5`. Document in `.env.example`.
- **Retention surface caveats**: `vips_timeline_entries.forgotten_at` is set on forget; the row is preserved in storage indefinitely (R19's "persistent-with-disclosure"). The local `app.db` SQLite file is bounded to the developer's machine. Real retention work (TTL-then-purge or cryptographic erasure) is deferred to v0.3. Document in README's "Privacy" section if one exists; otherwise add a small note in the Demo flow section.
- **Demo prep changes**: Pre-grant camera/mic permissions still required (carries forward from v0.1). The new student-selection: the demo flow operates on `student_id='demo-a'` by default. Switching students requires editing the hardcoded `STUDENT_ID` constant in `reflect.tsx`, `wiki.index.tsx`, `wiki.$dimension.tsx`, `wiki.trajectory.tsx`, and `wiki.$entryId.tsx` — or, post-v0.2, a small student-picker dropdown in the nav (not in v0.2 scope).
- **Ablation report archive**: The v0.1 reports at `test/ablation/reports/2026-05-08-mirror-ablation.md` and `2026-05-08-cron-ablation.md` are kept; the new v0.2 reports at `2026-05-11-mirror-ablation-gpt-5.5.md` and (after U11 + U13) `2026-05-11-sensemake-ablation-{student_id}.md` are added. The reports README (or a new one) documents the v0.1 → v0.2 lineage so future reviewers can compare across the model-swap + architecture-change boundary.
- **Smoke test script**: `scripts/smoke-sensemaking.ts` (existing) is updated in U11 to invoke `runCartographer` instead of `runSenseMaking`. The output assertion shape changes from `{patterns, trajectory, pathways}` to `{trajectory, pathways, open_questions}`. Document the script's role in the README's Demo flow section.

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-11-vips-wiki-pivot-requirements.md`
- **Prior brainstorm (architecture baseline for invariants):** `docs/brainstorms/2026-05-08-quiet-mirror-pivot-requirements.md`
- **Prior plan (house-style reference + carry-forward shape):** `plans/2026-05-08-002-feat-quiet-mirror-pivot-plan.md`
- **Ideation context (consulted, then superseded by brainstorm):** `docs/ideation/2026-05-11-connector-pathfinder-vips-ideation.md`
- **v0.1 superseded plan (sensemaking-agents v0.1 baseline):** `plans/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md`
- **Architecture anchors:**
  - `src/agents/connector.ts`, `src/agents/pathfinder.ts` (to be renamed)
  - `src/agents/handoff-chain.ts`, `src/agents/handoff-chain-streamed.ts`
  - `src/agents/run-events.ts`, `src/agents/schemas.ts`
  - `src/agents/tools/schemas.ts` (typed-schema rule, commit `665e07c`)
  - `src/db/schema.sql`, `src/db/queries.ts`, `src/db/client.ts`
  - `src/data/ecg-taxonomy.ts` (existing fixture, `links?: string[]` field)
  - `src/server/tenancy.server.ts` (`withStudent` boundary)
  - `src/server/persist-mirror.{functions,handler.server}.ts`
  - `src/lib/safety.ts` (diagnostic-language regex)
  - `src/routes/wiki.index.tsx`, `src/routes/wiki.$entryId.tsx`
  - `src/components/MirrorSession.tsx`, `src/components/AgentRunVisualizer.tsx`
  - `scripts/ablate.ts`, `test/ablation/score.ts`
- **External docs:**
  - OpenAI Agents SDK TypeScript: `@openai/agents` ^0.11.0 — verified during U7/U10/U11 implementation against installed `node_modules/@openai/agents/dist/*.d.ts`.
  - LangExtract `char_interval=None` filtering pattern (cited in origin) — verified during planning, not at implementation time.
  - arXiv "Cited but Not Verified" (cited in origin) — grounds the deterministic-verifier decision.
  - gbrain compiled-truth + timeline + soft-delete pattern (cited in origin) — grounds the wiki-page shape.
  - MOE ECG / CCE materials (Temasek JC, Kranji, BPGHS, Peicai, MOE "Discovering Purpose") — sourcing for U2's VIPS canonical vocabulary; specific URLs verified during U2 implementation.
