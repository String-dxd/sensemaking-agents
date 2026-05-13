---
date: 2026-05-11
topic: connector-pathfinder-vips
focus: improve the Connector and Pathfinder agents grounded in MOE Singapore's VIPS framework, with prior art from gbrain and the Karpathy LLM-wiki ecosystem
mode: repo-grounded
---

# Ideation: Connector + Pathfinder v0.2 — VIPS-shaped wiki, agent-maintained

## v0.2 thesis (promoted from S8)

Each student's `Values`, `Interests`, `Personality`, `Skills` becomes a wiki page with **compiled truth** on top (agent-rewritable best paragraph) and an append-only **timeline** of verifier-passed claims below. Connector + Pathfinder become page-maintainers, not pattern/pathway emitters. Hybrid retrieval powers their reads. A weekly background pass reconciles drift. The counsellor brief is a pure-function render of the wiki.

## Grounding Context

### Codebase
- TanStack Start + Vite + Node + better-sqlite3 + FTS5
- Connector + Pathfinder share tool surface (`search_past_mirrors`, `lookup_ecg_taxonomy`, `self_critique`); role split is prompt + outputType only
- All three agents (Mirror, Connector, Pathfinder) currently hardcoded to `gpt-4.1` in `src/agents/{mirror,connector,pathfinder}.ts`; moving to `gpt-5.5` is a separate but recommended ideation-orthogonal change
- ECG taxonomy fixture: 30 entries (5 H2 subjects, 7 CCAs, 11 pathways, 9 clusters); `links?: string[]` declared but unused across all entries
- No connector/pathfinder unit tests; only handoff-chain integration tests
- No STRATEGY.md / AGENTS.md / CLAUDE.md

### VIPS framework (MOE-aligned, NOT VITALS)
- **V Values** — 8 canonical: challenge, work-life balance, pay, security, independence, progression, variety, contribution
- **I Interests** — RIASEC (Realistic / Investigative / Artistic / Social / Enterprising / Conventional)
- **P Personality** — restrict to Extraversion + Neuroticism (the empirically reliable Big5 dimensions from reflection text)
- **S Skills/Strengths** — data/info, equipment/tools, interpersonal collaboration

### MOE counselling discipline (what "grounded" means)
Evidence-before-inference → link to post-secondary options → preserve agency → name uncertainty → surface family/influencer cues → end in exploration questions or SMART next steps. Labeling output sections V/I/P/S is cosmetic.

### Critical research findings
- NO published system reliably infers RIASEC from adolescent free-text. Artistic + Social hardest to separate.
- Big5 from reflections: only Extraversion (R²=0.50) + Neuroticism (R²=0.52) reliable. MBTI from text: no academic validity. **Texts <1500 words degrade Big5 inference** → corpus aggregation is essential.
- Values from text: hardest dimension; aspirational-vs-operative trap inflates Benevolence/Universalism in adolescent reflections.
- **Singapore MOE has NO deployed AI ECG free-text inference tool — genuine SG-context gap.**
- Prompt-level "leave blank if no evidence" is unreliable; only post-hoc grounding verification (LangExtract `char_interval=None` pattern) actually enforces evidence-grounded structured output.
- "Cited but Not Verified" (arXiv 2026): more citations ≠ more accuracy (GPT-5 Mini: 1,272 citations → 39% accuracy; Claude Opus 4.5: fewer citations → 77% accuracy).

### Prior art (LLM-wiki ecosystem)
- **gbrain** (Garry Tan; production at OpenClaw/Hermes scale: 17,888 pages, 4,383 people, 723 companies, 21 cron jobs) — established the **compiled-truth + timeline page shape**, brain-first lookup, regex-extracted typed graph edges, hybrid vector+FTS+RRF retrieval (49.1% P@5 / 97.9% R@5 on 240-page corpus), citation-fixer skill, soft-delete with audit trail, dream-cycle (11-phase overnight maintenance), "thin harness, fat skills"
- **Karpathy LLM-wiki ecosystem** — `lucasastorian/llmwiki` (853⭐), `Astro-Han/karpathy-llm-wiki` (788⭐), `kytmanov/obsidian-llm-wiki-local` (584⭐), `swarmclawai/swarmvault` (440⭐), `kiwifs/kiwifs` (419⭐), `nduckmink/arkon` (559⭐). Common pattern: agent extracts concepts from documents → wiki auto-grows with citations.

## Architecture

### VIPS page shape

```
---
type: vips-page
student_id: <id>
dimension: values | interests | personality | skills
last_compiled_at: <ISO 8601>
---

## Compiled truth
[1-3 paragraphs; agent-rewritable; current best read of this dimension; uses
canonical IDs from lookup_vips_taxonomy; ends with an Open question line]

---

## Timeline
- <date> [reflection #N, strength: low|medium|high, parallax: <contexts>]
  claim: <canonical-vips-id>
  quote: "<verbatim, verifier-checked>"
  superseded_by: <claim-id> | null
  reinforces: <claim-id> | null
  ⚠️ aspirational  (when single-context only)
```

### Trajectory page (Pathfinder's output)

```
---
type: trajectory-page
student_id: <id>
last_compiled_at: <ISO 8601>
---

## Trajectory
[one paragraph synthesizing across VIPS pages — surfaces tensions where they exist]

## Lead-sheet pathways  (2-5)
- **<label>**
  trait_combination: <V-claim-id> + <I-claim-id> + <S-claim-id>
  ecg_region_tags: [cluster.engineering, ...]
  vips_fit: { values: ..., interests: ..., personality: ..., skills: ... }
  open_questions_for_student: [...]
  risks_or_tradeoffs: <SG-context choice consequences>
  exploration_prompt: <person to talk to / experience to seek>

## Disclaimer
[required, non-empty]
```

## Ranked Ideas

### 1. S8 (PROMOTED). VIPS pages as compiled-truth + timeline — the v0.2 thesis
**Description**: Each student × VIPS dimension is a wiki page. Compiled truth above the separator (Connector + Pathfinder rewrite); timeline below (append-only verifier-checked claims). The page is the durable artifact; agent outputs become page diffs.
**Warrant**: `external:` gbrain production usage (17,888 pages, 21 cron jobs); Karpathy LLM-wiki community pattern across 6 high-star repos (cumulative ~3,700⭐); MOE counselling discipline of "evidence-before-inference" maps naturally onto append-only timeline.
**Rationale**: Subsumes S1 (claim ledger), S3 (taxonomy fixture), S4 (crosswalks), S5 (tensions + next question), S6 (parallax), S7 (lead-sheet), S10 (reconciliation) into one coherent architecture. Counsellor brief (S2) becomes a render. Pattern "weaken/contradict/harden over time" — finally has a schema home.
**Downsides**: Significant scope: new DB tables, new schemas, new verifier code, agent prompt rewrites, optional UI surface. The pivot is a v0.2-sized commitment, not a v0.1 patch.
**Confidence**: 85%
**Complexity**: High
**Status**: Explored — handed to ce-brainstorm 2026-05-11

### 2. S2. Counsellor-mode markdown export as stable external contract
**Description**: Pure function `(VIPS pages + trajectory page) → counsellor-brief.md` with a versioned schema: header, VIPS-dimensioned claims with verbatim quotes, top pathways with competing-hypothesis pairs, gaps, disclaimer. The brief is the contract MOE / counsellors interact with — agents can evolve underneath, brief shape is versioned.
**Warrant**: `external:` Singapore MOE has no deployed AI ECG free-text inference tool — genuine gap; IBM Watson for Oncology lesson (AI-for-expert tools surface competing hypotheses while AI-for-layperson tools collapse to recommendations); Sokanu/CareerExplorer critique (1,500+ matches creates decision paralysis; counsellor-grade tools surface evidence back).
**Rationale**: Bridges v0.2 to a v0.3 real-counsellor pilot. With S8 landed, this becomes near-trivial — just render the wiki pages.
**Downsides**: Designing for an audience without their input (no MOE counsellor consulted yet); diverts attention from student-facing UX.
**Confidence**: 80%
**Complexity**: Medium (Low once S8 lands)
**Status**: Unexplored

### 3. S9. Hybrid retrieval (vector + FTS5 + RRF) for search_past_mirrors
**Description**: Current `search_past_mirrors` uses FTS5 only. Add sqlite-vss for vector search; fuse with reciprocal rank fusion. Independent infrastructure leverage layer that strengthens evidence retrieval underneath every other survivor.
**Warrant**: `external:` gbrain v0.12 benchmark on 240-page corpus: P@5 49.1%, R@5 97.9%, beating graph-disabled by +31.4 points P@5.
**Rationale**: Strengthens Connector's evidence-finding without changing the agent contract. Downstream every other component of the thesis benefits.
**Downsides**: Adds sqlite-vss dependency; embedding cache invalidation logic needed; tuning RRF weights is a calibration exercise; minor latency.
**Confidence**: 80%
**Complexity**: Medium
**Status**: Unexplored

## Component sub-ideas (folded into S8)

- **C-Claim (was S1)**: Deterministic verifier between Connector and Pathfinder. Every timeline entry's `quote` field re-fetches the cited reflection and must match verbatim; unsupported drops or downgrades. Student-facing UI: "that's me / not quite / context missing" on timeline rows.
- **C-Taxonomy (was S3)**: `src/data/vips-taxonomy.ts` + `lookup_vips_taxonomy` tool. Closed vocabulary for compiled-truth tags. Mirror the ECG fixture pattern.
- **C-Crosswalks (was S4)**: Populate ECG taxonomy `links?: string[]`; better: typed `bridges {from, to, kind}` relation table. Regex auto-extraction from compiled-truth tags (gbrain pattern). `subject_leads_to_cluster`, `cca_strengthens_skill`, `pathway_requires_subject`.
- **C-Tensions (was S5)**: `tensions[]` section in compiled truth pairing contradicting timeline entries. Each VIPS page emits a `next_question` the student carries into their next reflection.
- **C-Parallax (was S6)**: Each reflection tagged with context type (school/family/peer/hobby/civic) at persistence. Timeline entries carry `parallax: [contexts]`. Strength `high` requires ≥2 different contexts. Single-context entries get aspirational ⚠️ flag.
- **C-LeadSheet (was S7)**: Pathfinder writes a separate `trajectory.md` page — trait combinations + region tags + open questions, deliberately under-specified. References VIPS pages by claim ID.
- **C-Dream (was S10)**: Weekly background reconciliation (`pnpm reconcile`?) — recomputes compiled truth from surviving timeline, drops superseded claims, surfaces drift to the wiki.

## Rejection Summary (from full 42-idea ideation)

| # | Idea | Reason rejected |
|---|------|-----------------|
| F1.2 | Stop re-injecting full corpus (cursor) | Premature optimization; corpus is <8 entries per student |
| F1.3 | Wrap mapSdkEventToStep against frozen SDK | Off-scope for VIPS-grounded agent improvement; tactical reliability fix |
| F1.6 | Pathfinder-only retry path | Off-scope reliability fix; bundle separately |
| F1.7 | Connector/Pathfinder unit tests + lint | Doesn't change agent behaviour; bundle with general quality work |
| F2.4 | Invert agent order — Pathfinder hypothesizes first | Too disruptive; verifier (C-Claim) captures the falsification benefit |
| F2.6 | Mandatory adversarial second pass | Subsumed by C-Claim verifier |
| F3.2 | Collapse to one "Cartographer" agent | Role split serves debuggability + counsellor-legibility |
| F3.5 | Anchor to SkillsFuture not ECG | Licensing risk; loses MOE alignment v0.1 built |
| F3.7 | Wiki-is-product reframe (agents emit diffs) | Now absorbed into S8 thesis |
| F4.3 | Pre-tagging corpus enricher pass | Adds complexity early; add post-S8 if needed |
| F4.6 | Introspection / gaps channel | Integrated into S8 (compiled-truth "Open question" line + gaps) |
| F5.1 | Geological stratigraphy (temporal layering) | Subsumed by C-Dream + supersedes pointer |
| F5.3 | ZK challenge questions | Subsumed by C-Tensions next_question |
| F5.4 | Insurance actuarial revision reserves | Numerical surface fights student tone |
| F5.5 | Restoration ecology Barnum baseline | Cost doubling without unique value once C-Claim + C-Parallax land |
| F5.7 | Archaeological relational provenance | Subsumed by timeline co-occurrence and reinforces pointers |
| F6.3 | 3-agent debate (Optimist/Skeptic/Anchorer) | Cheap version subsumed by C-Claim verifier |
| F6.4 | Zero-LLM deterministic Connector | Audit-baseline premature without v0.2 calibration |
| F6.6 | Annual reflection sweep | Replaced by C-Dream weekly reconciliation |

## Suggested sequencing (a planner's first cut)

1. **Infrastructure first** (no agent prompt changes yet)
   - C-Taxonomy: `vips-taxonomy.ts` + `lookup_vips_taxonomy` tool
   - DB schema for VIPS pages (compiled-truth field + claims timeline table)
   - C-Claim: deterministic verifier function
   - C-Parallax: context tagging on reflections (`context_type` column or per-reflection tag table)
2. **Agent rewrite**
   - Connector + Pathfinder prompts and output types pivot to "maintain VIPS pages" — page diff IS the output
   - C-Crosswalks: populate `links` on ECG taxonomy entries with the obvious bridges
   - Switch model: `gpt-4.1` → `gpt-5.5` (one central config)
3. **Lead-sheet pathways**
   - C-LeadSheet: trajectory page schema + Pathfinder rewrite to emit page diffs
4. **Optional polish (later, parallel)**
   - S9: hybrid retrieval (sqlite-vss + RRF for `search_past_mirrors`)
   - S2: counsellor brief render function
   - C-Dream: weekly reconciliation

## Open questions for ce-brainstorm

- Does the student see the wiki pages directly, or is the wiki an internal artifact rendered only via the counsellor brief? (Student-visible vs counsellor-only changes the UX surface significantly.)
- Should the four VIPS pages be four separate pages or one page with four sections? (UX vs data model trade-off.)
- How does the student interact with the timeline — explicit yes/no on each new entry, or passive (only flagged-aspirational entries surface for review)?
- What's the v0.2 evaluation rubric? (The v0.1 ablation rubric — 1-2 humans score 0-3 across provenance/specificity/novelty/anti-sycophancy — needs to be reshaped for the wiki-page output.)
- Does `gpt-5.5` swap require ablation re-baselining? (Yes, almost certainly.)
- Is there a real MOE counsellor we can talk to before scoping S2's brief shape?

---

## 2026-05-13 Resume Pass: Values + Skills Label Generation

### What has changed since this ideation

The VIPS Wiki Pivot has shipped and `plans/CURRENT_STATE.md` marks it completed by PR #1. The current product has also moved to Anthropic Managed Agents, Postgres/Drizzle, WorkOS tenancy, and a simplified review model:

- Mirror persistence saves the raw thought without waiting on Connector.
- Connector runs from the Library `Run Connector` action or the scheduled evening pass.
- Connector proposes per-dimension VIPS diffs against an inlined closed taxonomy.
- The deterministic verifier admits/downgrades/drops entries.
- Verifier-passing entries are auto-applied into `vips_timeline_entries` and touched `vips_pages`.
- The stored `vips_proposed_diffs` row is now a confirmed audit row, not a pending student-review queue.
- Students review raw Mirror thoughts in Library; they do not confirm each Connector VIPS link.

### How values and skills are generated today

Values and skills are not generated as free-text labels. The server inlines `VIPS_TAXONOMY` into Connector's prompt context, and Connector is instructed to choose `canonical_claim_id` values from that closed list. The current values are:

- `values.contribution`
- `values.achievement`
- `values.tradition`
- `values.security`
- `values.independence`
- `values.relationships`
- `values.wellbeing`
- `values.learning`

The current skills are:

- `skills.interpersonal`
- `skills.analytical`
- `skills.creative`
- `skills.practical`
- `skills.leadership`
- `skills.communication`

Connector also emits a verbatim quote, reflection id, strength, and parallax tags. The verifier then checks that the `canonical_claim_id` belongs to `VIPS_TAXONOMY` for the emitted dimension, checks that the cited quote is present in the cited reflection, applies the parallax cap, and computes `reinforces_id`. Invalid taxonomy IDs drop as `unknown_canonical_claim_id`; this is no longer prompt-only.

### External context

- The user's linked University of Toronto values PDF is best treated as a broad **values word-bank** for reflection, not as a compact canonical taxonomy. It includes overlapping concepts such as Achievement, Balance, Contribution, Growth, Independence, Security, Service, Stability, Teamwork, and Trustworthiness.
- SkillsFuture Singapore's Critical Core Skills give a stronger source model for skills provenance: 16 transferable skills grouped under Thinking Critically, Interacting with Others, and Staying Relevant.
- O*NET's content model is another useful source model: it separates basic skills from cross-functional skills such as social, complex problem-solving, technical, systems, and resource-management skills.

Recommendation: keep the compact VIPS IDs as the canonical student-facing labels, but add source/crosswalk metadata so broad terms from lists like the UofT PDF map into the compact vocabulary rather than replacing it.

## Topic Axes

- Taxonomy source and label design
- Runtime enforcement and verifier gates
- User/counsellor interpretability
- Evaluation and observability
- Plan drift and cleanup

## Ranked Ideas From Resume Pass

### 1. Canonical-ID verifier gate
**Description:** Add a verifier phase that rejects Connector entries whose `canonical_claim_id` is not present in `VIPS_TAXONOMY` for the emitted dimension. Add an `unknown_canonical_claim_id` drop reason and a locked test where the quote matches but the ID is invented.
**Axis:** Runtime enforcement and verifier gates
**Basis:** `direct:` `canonical_claim_id` is parsed as a non-empty string in Connector schemas, then verifier-enforced against `VIPS_TAXONOMY` by dimension.
**Rationale:** The architecture promises a closed vocabulary. That should be enforced in code, not only in prompt text.
**Downsides:** Requires a small schema/test update and a decision about whether invalid IDs are verifier drops or schema rejects.
**Confidence:** 94%
**Complexity:** Low
**Status:** Implemented in the 2026-05-13 agent-boundary/handoff pass

### 2. Source-aware taxonomy crosswalks
**Description:** Extend each VIPS taxonomy entry with source-family metadata, synonyms, and crosswalk terms. For example, UofT-style `Balance` can map to `values.wellbeing`; `Service` and `Making a difference` can map to `values.contribution`; SkillsFuture `Problem Solving` can map toward `skills.analytical` or `skills.practical` depending on evidence.
**Axis:** Taxonomy source and label design
**Basis:** `external:` UofT's list is a broad values word-bank; SkillsFuture CCS and O*NET provide structured skills vocabularies. `direct:` `vips-taxonomy.ts` has header-level source notes but no per-entry source or crosswalk fields.
**Rationale:** This answers "is it from this list?" honestly: not copied wholesale, but mappable. It also gives future prompts and counsellor briefs better provenance.
**Downsides:** Content curation work; needs discipline not to bloat the canonical set.
**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored

### 3. "No label fits" feedback loop
**Description:** Add a non-user-facing channel for Connector to record taxonomy misses: moments where evidence seems relevant to values/skills but no canonical ID fits well enough to emit. Store only compact summaries, not student-facing claims.
**Axis:** Evaluation and observability
**Basis:** `direct:` Connector is told to leave a claim out if no taxonomy ID fits, but those omissions are invisible.
**Rationale:** This creates the raw material for improving the taxonomy without encouraging free-label output in the main timeline.
**Downsides:** Must be carefully prompted and capped so it does not become a speculative shadow profile.
**Confidence:** 82%
**Complexity:** Medium
**Status:** Unexplored

### 4. Label-fit confidence separate from evidence strength
**Description:** Split "the quote is strong evidence" from "the canonical label is a strong fit." Keep `strength` for evidence/parallax, and add a small `label_fit: low | medium | high` or verifier annotation for taxonomy ambiguity.
**Axis:** Runtime enforcement and verifier gates
**Basis:** `reasoned:` A quote can be real and specific while still being ambiguous between `values.learning` and `skills.analytical`, or between `skills.interpersonal` and `interests.social`.
**Rationale:** This directly addresses values/skills ambiguity without abandoning auto-apply. The system can say "real evidence, tentative label."
**Downsides:** Schema/UI change; should wait until the canonical-ID gate lands.
**Confidence:** 74%
**Complexity:** Medium
**Status:** Unexplored

### 5. Values/skills regression and ablation slice
**Description:** Add a small locked fixture set for values and skills: aspirational values vs operative behavior, skill vs interest ambiguity, and weak/strong label-fit examples. Report admitted IDs by dimension, not only aggregate Connector success.
**Axis:** Evaluation and observability
**Basis:** `direct:` earlier ideation identified values-from-text as the hardest dimension; reports expose admitted canonical IDs and now include an explicit `dropped_unknown_canonical_claim_id` bucket for invalid labels.
**Rationale:** The next quality jump needs measurement around exactly the user-raised concern: where these labels come from and whether they are justified.
**Downsides:** Human-scored fixtures take time; poor fixtures would create false confidence.
**Confidence:** 86%
**Complexity:** Medium
**Status:** Unexplored

### 6. Plan-drift cleanup note
**Description:** Update planning/docs language so future agents do not treat the old staged Connector review model as current product truth. The shipped model is auto-apply plus confirmed audit row; raw Mirror thought review is the student-facing control surface.
**Axis:** Plan drift and cleanup
**Basis:** `direct:` `CURRENT_STATE.md` and README describe the auto-apply model, while the historical plan still includes staged-review requirements and legacy confirm/forget diff handlers remain.
**Rationale:** This prevents accidental reintroduction of pending-review assumptions during future work.
**Downsides:** Documentation-only unless followed by legacy code cleanup.
**Confidence:** 90%
**Complexity:** Low
**Status:** Implemented for current README/CURRENT_STATE/taxonomy docs in the 2026-05-13 agent-boundary/handoff pass; legacy code cleanup remains separate.

## Rejection Summary From Resume Pass

| # | Idea | Reason rejected |
|---|------|-----------------|
| R1 | Replace current Values with the UofT list | Scope overrun; the PDF is a broad reflection word-bank, not a compact verified-claim taxonomy. |
| R2 | Add free-text custom values | Violates the closed-vocabulary architecture and weakens Cartographer references. |
| R3 | Decompose Skills directly into all 16 SkillsFuture CCS | Better as source crosswalk first; adult workforce language may overfit student reflections. |
| R4 | Make students confirm every Connector claim again | Reverses the current product simplification; verifier-plus-explainability is the cleaner next move. |
| R5 | Remove legacy confirm-diff handlers immediately | Useful cleanup, but lower leverage than closing canonical-ID enforcement first. |
| R6 | Source families in counsellor brief only | Too downstream; source metadata should start in the taxonomy. |
| R7 | Serialize Connector/Cartographer pre-fetch queries | Real reliability follow-up from `docs/followups.md`, but adjacent to label generation. |

## Recommended Next Move

The canonical-ID verifier gate has now landed. The next taxonomy-quality move is **source-aware taxonomy crosswalks** as a small content/data PR:

1. Add lightweight crosswalk metadata for Values and Skills so future prompts/docs can explain where labels come from.
2. Map UofT-style values words into the compact runtime values without expanding the canonical ID set.
3. Map SkillsFuture CCS terms into the six compact skill clusters, preserving the CCS source-family reference.
4. Add label-fit evaluation examples for values-vs-skills and skills-vs-interests ambiguity.
