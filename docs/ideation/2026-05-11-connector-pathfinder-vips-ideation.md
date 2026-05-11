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
