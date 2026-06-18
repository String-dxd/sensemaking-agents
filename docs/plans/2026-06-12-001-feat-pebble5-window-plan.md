---
type: feat
status: active
created: 2026-06-12
plan_id: 2026-06-12-001
title: Pebble 5 window (June 12–22) — Myword world foundation + demo plan
---

# feat: Pebble 5 window (June 12–22) — Myword world foundation + demo plan

> **Revision note (2026-06-12):** v2. Reoriented after two inputs: (1) current birds are hackathon output, far below the production bar — target is Animal Crossing / Pokémon / Zelda-grade character quality; (2) Bruno Simon-derived code must be treated as **replace, not verify-and-hope** — MOE publishing to all students requires a risk-free asset base, and we want to generate many tree variants at or above Bruno's quality under our own provenance.

## 1. Executive summary

Ten working days, three design-leaning people, two exit criteria: a **dev foundation** that stays fast after the window closes, and a **stakeholder demo** on June 22.

The demo story changes in v2: not "two features," but **"here is the production quality bar, and the pipelines that hit it repeatably."** Concretely:

1. **Character production pipeline, proven by one hero bird.** The 7 existing species are hackathon output and won't be shipped. This window runs a 3-track pipeline bake-off (hand-modeled / AI-3D-gen-assisted / CC0-base-restyled), locks the winning pipeline, and produces **one** production-grade hero bird in-engine. The species picker returns post-window once 3+ birds exist through the locked pipeline.
2. **Clean-room world assets, starting with trees.** Decision made: Bruno Simon-derived *code and textures* get rewritten regardless of what his license says — permission-dependence is not risk-free. The *techniques* (billboard leaf clouds, two-tone sun shading, SDF alpha foliage) are not copyrightable and stay. The centerpiece is a **parametric tree generator**: recipe-driven, seeded, producing many distinct tree species/variants with freshly-written shading — the licensing fix and the "many beautiful trees" wish are one project.
3. **IslandRecipe stays the keystone.** Terrain/palette/decor parameterization (was C1) is unchanged — the tree generator consumes it, and personality-driven evolution builds on it. Evolution (profile→recipe, deterministic, no agent) moves from must-do to **should-do**: asset quality displaced it on the critical path.
4. **Legal timing relief:** the publish-to-students moment, not the June 22 demo, is the legal trigger. Current shaders keep running in dev while replacements land in priority order (trees+grass this window; water/sky next).

Agents: unchanged from v1 — **no new agents this window.** Framework doc + optional Connector cadence wiring remain.

---

## 2. Grounding: what the codebase gives us (updated)

| Area | What exists | v2 read |
|---|---|---|
| Character | 7 species (6 procedural, 1 GLB `MaskedBower.glb` 11MB), `setSpecies()` recolor, persisted choice | **All below the production bar.** Keep the species/palette *system* (selection, persistence, recolor plumbing) — replace the *art* via a new pipeline. Picker deferred. |
| Trees/foliage | Tree GLBs + `foliageSDF.png` (our own authorship via student-space), leaf shader **ported from Bruno's folio-2025**, fixed 7 placements | Trunk GLBs are ours; the leaf shading code must be rewritten. Placements/hardcoding dissolve into IslandRecipe + generator. |
| Grass / water / sky | Grass material, water shader, sky: **ports of Bruno's folio-2025**; curved-earth splice possibly derived | Rewrite in priority order: grass (most visible) this window, water/sky post-window. Audit pins the exact derivation boundary. |
| Island terrain | Deterministic heightfield + silhouette fns, hardcoded constants in `State/Island.js` | Unchanged: extract IslandRecipe (C1). |
| Profile signals | Real-time Marcia status, verified VIPS timeline, snapshots/timelapse | Unchanged: evolution-ready, now P1. |
| Agents | Mirror / Connector / Cartographer / self_critique + deterministic verifier | Unchanged from v1 (§3 Q3–Q5). |
| Perf | 3-tier auto promote/demote, instancing, no shadows | Strong. Asset budgets now get enforced *through the new pipelines* rather than retrofitted. |

---

## 3. Strategic answers (revised where v2 input applies)

### Q1 — Character: a quality pipeline, not a picker

The question is no longer "builder vs presets" — both presuppose art worth presenting. The question is **"what pipeline reliably produces AC/Pokémon/Zelda-grade characters with this team?"** Three candidate pipelines, none obviously best on paper:

| Track | Pipeline | Strengths | Risks |
|---|---|---|---|
| A — Hand-modeled | Concept art → Blender model/rig → palette → GLB | Maximum control; AC-style low-poly is hand-modeling-friendly | Depends on team Blender depth; slowest per species |
| B — AI-3D-assisted | Concept art → image-to-3D (Hunyuan3D / Hyper3D / Meshy-class) → Blender retopo + cleanup + rig → palette | Fast iteration; concept art drives it (designer-led) | Topology cleanup cost; style consistency across species |
| C — CC0 base restyled | Permissive base mesh (Quaternius/Kenney-class CC0) → resculpt/restyle to bible → rig | License-clean by construction; fastest to "good" | Ceiling may sit below the bar; "restyled stock" risk |

**Recommendation: run all three as a 2-day bake-off on the same brief (the hero bird, from the same concept art), judge against the art bible, lock one, then produce the hero bird properly.** The bake-off *is* the experiment-before-build; it also answers the team-capability unknown empirically instead of by guess. Whatever wins must satisfy: silhouette reads at gameplay zoom, fits the two-tone in-engine shading, riggable for the existing animation set (perch/walk/fly/narrate), within budget (≤2MB, target much less), repeatable for 6+ more species, and **clean provenance** (AI-gen tracks need a generated-asset licensing check — most current services grant full output ownership, verify the specific one).

Concept art precedes all tracks: the designer defines the bird on paper (AI image-gen assist is fine for exploration; final concept is a human call). The existing species/palette/persistence plumbing is kept — new birds slot into `setSpecies()` and `companionSpecies` unchanged.

### Q2 — Island: unchanged architecture, adjusted priority

IslandRecipe extraction (C1) stands exactly as v1 argued — it now has a second consumer (the tree generator reads placements/palettes from it). Personality-driven evolution (C2/C3) remains the right product direction and remains deterministic, but moves to **should-do**: if the window forces a choice, a stakeholder seeing *one island corner at production quality* beats *the whole island evolving at hackathon quality*.

### Q3–Q5 — Agents (unchanged from v1)

Not agents: island evolution, character pipeline, status classification, verifier. Agents (existing): Mirror, Connector, Cartographer, self_critique. Five-criteria framework: open-ended language in; generative synthesis out; deterministic or human gate before persistence; seconds-scale latency; graceful failure. First agent task remains **D2 Connector cadence wiring** (plan-first by construction via `vips_proposed_diffs`). Quality order: instrument (E2) → golden evals (E1) → failure hardening (E3) → routing (E4). One v2 addition to Q4: **image/3D generation models join the "frontier-leverage at dev time" list** — concept exploration, texture generation, image-to-3D — always followed by human curation and a provenance check.

### Q6 — Licensing: RESOLVED by verified audit (2026-06-12)

**The audit is complete — see `docs/audit/2026-06-12-asset-provenance-audit.md` for the full evidence.** Verdicts, all verified against the live upstream repos:

- 🔴 **Must replace (infinite-world, no license):** the grass cluster (material + shaders + class), Noises generator, sky background/sphere/stars materials, and 9 shader partials — ported byte-for-byte from `brunosimon/infinite-world`.
- 🔴 **Must replace (TinySkies, no license + Shadertoy-NC chain):** the rain overlay (streaks verbatim, lens droplets a direct port of a shader that is itself "adapted from Shadertoy" — probable CC BY-NC-SA non-commercial lineage), the water shader's foam/sparkle/contour layers, and the aurora curtains — all from `dannylimanseta/tinyskies`. ~5 engineer-days total across both tables, captured as T2.
- 🟢 **Keep with attribution (action F2):** the tree foliage system and `foliageSDF.png` came from `brunosimon/folio-2025`, which is **MIT-licensed** — fully usable for MOE; we must add the missing copyright/license notices. Gustavson Perlin partials (MIT), DRACO (Apache-2.0), Three.js (MIT) likewise.
- 🟢 **Keep, no action:** water shader and curved-earth are ports of *our own* legacy `student-space` code, not Bruno's; terrain, birds, tree GLBs, textures, and all app code are our own authorship.

What "clean-room" means in practice:
- **Techniques are free; expression is not.** Billboard foliage clouds, two-tone `dot(N, sunDir)` shading, SDF alpha masks, layered-sine water — published techniques, freely usable. His *source code*, *shader text*, and *textures* are the protected expression.
- **Spec-from-screenshots, write-from-scratch.** The rewriter works from visual targets (screenshots of our current island) and a written behavior spec — not from the ported source. Where the same person has read the old code (unavoidable in a 3-person team), mitigate: write the spec first, close the old file, implement against the spec, and document the process in the audit trail. Not formal two-team clean-room, but a defensible, documented good-faith rewrite — appropriate to the actual risk level.
- **Timing:** legal exposure attaches at publication to students. Dev/demo continues on current shaders; each replacement lands when ready. **Hard rule: no student-wide release while any infinite-world-derived code remains** — that's the gate, recorded in the audit doc.
- **Future sourcing rule for the team:** `folio-2025` and `folio-2019` are MIT — safe to learn from and adapt with attribution. `infinite-world` and `my-room-in-3d` have no license — never port from them. Three.js Journey lesson code has no explicit commercial grant — treat as off-limits for this product.

### Q7 — Performance & visual style (sharpened)

Unchanged substance, sharper enforcement: budgets are now enforced *at the pipeline mouth* (bake-off acceptance criteria, tree-generator parameters, A3 CI check) instead of retrofitted onto finished assets. The art bible (H1) is promoted from "useful doc" to **the contract every pipeline judges against** — it now needs explicit AC/Pokémon/Zelda reference boards: what those games do with silhouette, palette discipline, face/eye design (where AC characters carry their charm), and texture-free shading on era-constrained hardware. Wind Waker remains the proof that the approach scales down: strong art direction, brutal hardware budget.

---

## 4. Workstreams (v2)

### WS-A · Dev Environment & Foundation — unchanged
CI gate, demo fixtures, asset pipeline + budgets, debug panel. Fixtures (A2) now P1 (evolution slipped); asset-pipeline CI (A3) folds into the bake-off's export step.

### WS-B · Character Production Pipeline *(replaces "Avatar Creator")*
- **Goal:** a locked, repeatable pipeline producing AC/Pokémon/Zelda-grade characters; one hero bird shipped through it, in-engine, rigged, budgeted.
- **Why:** the character is the emotional core of the product; hackathon birds cap everything else.
- **Decisions:** which pipeline track wins; hero species; what happens to the 7 legacy species (recommendation: retire from any student-facing surface; keep code paths until replacements exist).
- **Dependencies:** concept art + art bible (H1) precede the bake-off judging.
- **Risks:** none of the three tracks hits the bar in 2 days → fallback is extending the bake-off with an external-artist option (procurement question — flag early, gov context); rig transfer to the existing animation set is the most likely technical snag (the bake-off explicitly tests it).

### WS-T · Clean-Room World Assets *(new — absorbs the v1 licensing-rebuild contingency)*
- **Goal:** zero Bruno-derived code/textures on the path to student release; a parametric tree generator producing many distinct, beautiful trees; grass v2 rewritten.
- **Why:** risk-free publishing for MOE + the "many trees, better than Bruno's" product wish, as one project.
- **Decisions:** derivation boundary (from F1 audit); tree-recipe parameter vocabulary; replacement order (proposed: trees+grass now; water, sky, curved-earth post-window).
- **Dependencies:** F1 audit scopes it; C1 IslandRecipe feeds the generator; H1 bible governs the look.
- **Risks:** "as good as Bruno's" is a taste bar with a deadline — mitigate by keeping the *techniques* (proven look) and only replacing the *implementation*; side-by-side screenshot comparison is the acceptance test.

### WS-C · Island Recipe + Evolution — priority adjusted
C1 recipe extraction stays **must-do** (two consumers now). C2/C3 evolution and C5 persistence move to should-do. C4 builder spike stays backlog.

### WS-D/E · Agent Strategy & Quality — unchanged from v1
D1 framework doc (P0, cheap), D2 Connector cadence (P1), E2 instrumentation (P1), E1/E3/E4 backlog.

### WS-F · Asset Licensing — audit complete
F1 is **done** (`docs/audit/2026-06-12-asset-provenance-audit.md`): grass cluster + sky materials + Noises = rebuild/delete (infinite-world, no license); trees + foliageSDF = MIT keep with attribution; water/curved-earth/textures = our own. Remaining work: F2 (notices + manifest) and T2 (the replacement set). F3/F4 are closed — the audit's verdict tables replace them.

### WS-G/H · Performance & Visual Style — unchanged structure
G1 compression now applies to *new* pipeline outputs (legacy 11MB bird becomes moot when retired — compress it only if it survives to the demo). G2 hardware baseline unchanged. H1 art bible promoted to P0-first (it gates the bake-off). H2 styled test prop can be satisfied by the tree generator's output (merge).

---

## 5. Priority plan through June 22

### Must do (dependency order)
| # | Issue | Days | Why |
|---|---|---|---|
| 1 | ~~F1 derivation audit~~ **DONE 2026-06-12** → `docs/audit/2026-06-12-asset-provenance-audit.md` | — | Verified: grass cluster = rebuild (infinite-world, no license); trees + foliageSDF = MIT keep; water/curved-earth = our own |
| 2 | H1 art bible incl. AC/Pokémon/Zelda reference boards | 1.5 | Gates bake-off judging and tree-generator look |
| 3 | B0 hero-bird concept art | 1 | Gates all three bake-off tracks; designer-led |
| 4 | C1 IslandRecipe extraction | 3 | Keystone; tree generator + evolution both consume it |
| 5 | B1 pipeline bake-off (3 tracks, same brief) | 2 | The window's defining experiment |
| 6 | B2 hero bird production via winning track | 3 | Demo centerpiece #1 |
| 7 | T1 parametric tree generator v1 (clean-room foliage shading) | 3 | Demo centerpiece #2 + licensing fix |
| 8 | T2 clean-room set: grass rebuild + Noises replace + sky-material deletion + plateau retint **+ rain overlay rebuild + water foam/sparkle/contour layers + aurora rebuild** | 5 | The complete legally-required scope (audit 🔴 tables: infinite-world + TinySkies/Shadertoy-NC) |
| 9 | F2 THIRD_PARTY_NOTICES.md + UPSTREAM.md + asset manifest + release gate | 0.5 | MIT/Apache attribution obligations are unmet today; this closes them |
| 10 | D1 agent decision framework doc | 0.5 | Unchanged; stakeholder question we know is coming |

≈17 person-days of ~24 available (3 people × 8 days), leaving demo polish (June 19–20) + slack. **If only 2 people:** cut T2 (grass ships post-window; trees alone carry the demo) and D1 drafts via Claude with light review.

### Should do if time permits
A2 status fixtures · C2/C3 evolution slice (the v1 demo moment — pull back in if the C-chain goes fast) · C5 recipe persistence · A1 CI · A3 export-pipeline CI budgets · D2 Connector cadence · E2 instrumentation · G2 hardware baseline.

### Later / backlog
Picker over 3+ production birds (was B1-v1) · remaining species through the locked pipeline · stars-material rebuild (only if a WebGL night sky is wanted; T3/T4 otherwise closed by audit) · legacy-species retirement cleanup · B3 customization-builder spike · C4 island-builder-UI spike · E1/E3/E4 · G3 draw-call audit · A4 debug panel · H3 style rollout.

### Critical path
**F1 + H1 + B0 (days 1–2) ➜ B1 bake-off (days 2–4) ➜ B2 hero bird (days 5–7) ➜ demo polish.** Parallel second spine: **C1 (days 1–3) ➜ T1 (days 4–6) ➜ T2 (days 7–8).** The two spines join at the demo: hero bird standing under generated trees on new grass, framed as before/after against the hackathon island.

### Blockers & contingencies
- **Bake-off produces no track at the bar** → decision point June 16: extend best track 1 day, or open the external-artist question (procurement lead time makes this a post-window path; the window then demos the *pipeline* + best-effort bird honestly labeled WIP).
- **C1 slips past June 17** → T1 falls back to a standalone tree-recipe object (generator still demos; recipe unification becomes a fast-follow).
- **Third teammate unconfirmed** → D2/E2/A-chain drop; two people hold both spines (tight but the must-list above was sized for it minus T2).

---

## 6. Ownership split

**You (designer):** B0 concept art · H1 art bible + reference boards · bake-off judging · F1 derivation audit judgment (cheaper model collects/summarizes; you decide) · tree look-development with T1 · demo narrative.

**Design engineer:** C1 recipe extraction · T1 tree generator · T2 grass rewrite · bake-off Track A (hand-modeled) + rig/export step for all tracks · B2 hero bird technical production.

**Full-stack designer (if confirmed):** bake-off Track B/C infrastructure (AI-gen runs, CC0 sourcing, licensing checks on generated output) · A2 fixtures · A1/A3 CI · D2 · E2 · C5.

**Who to ask for (updated):** v1 said full-stack engineer for the agent epics. The v2 plan shifts the answer: the scarcest skill is now **stylized 3D (Blender modeling/rigging at AC quality)**. If you can choose one more person for this window specifically, a stylized-3D-capable design engineer beats a back-end engineer; the agent epics keep indefinitely, the quality bar doesn't.

**Task-suitability legend:** `human` (taste/judgment/relationships) · `coding-agent` (scoped code, verifiable, plan-first) · `frontier` (open-ended synthesis, hard one-shot codegen, image/3D generation) · `cheaper` (mechanical transforms, summarization, doc drafting).

---

## 7. Epics

| Epic | Label | Issues |
|---|---|---|
| Dev Environment | `epic:dev-env` | A1–A4 |
| Character Pipeline | `epic:character` | B0–B4 |
| Island Recipe | `epic:island` | C1–C5 |
| Clean-Room Assets | `epic:clean-room` | T1–T5 (+F1–F2) |
| Agent Strategy | `epic:agent-strategy` | D1–D3 |
| Agent Quality | `epic:agent-quality` | E1–E4 |
| Performance | `epic:performance` | G1–G3 |
| Visual Style | `epic:visual-style` | H1–H3 |

Labels: the eight epic labels + `P0`/`P1`/`P2` + `decision` + `experiment` (bake-off-style issues whose output is a verdict).

---

## 8. Detailed GitHub issues

### Epic: Character Pipeline

#### B0 — Hero bird concept art
- **Problem:** Every production track needs a target. The current birds were rushed hackathon output; no character has ever been *designed* (silhouette sheets, palette, expression) before being modeled.
- **Goal:** A concept sheet for one hero bird: turnaround silhouette, palette (using existing token discipline), face/eye design, personality notes — at the AC/Pokémon/Zelda bar defined in H1.
- **Scope:** 1 species, 1 sheet, plus 2–3 rejected directions kept for the record. AI image-gen for exploration is fine; the final sheet is a human call. Out: 3D anything.
- **Acceptance:** Sheet approved against H1; all three bake-off tracks can work from it without asking questions.
- **Dependencies:** H1 (can overlap). **Owner:** you. **Suited:** human + frontier (exploration gen). **Priority:** P0 · `epic:character` · **Est:** 1d

#### B1 — Pipeline bake-off: three tracks, one brief
- **Problem:** We don't know which pipeline (hand-modeled / AI-3D-assisted / CC0-restyled) can hit the bar with this team. Guessing wrong costs the window.
- **Goal:** All three tracks produce the B0 bird to draft quality in 2 days; judged against H1; one pipeline locked and documented.
- **Scope:** Track A: Blender hand-model. Track B: image-to-3D (Hunyuan3D/Hyper3D/Meshy-class — Blender MCP tooling is already connected for this) → retopo/cleanup. Track C: CC0 base mesh (Quaternius/Kenney-class) → restyle. Every track ends at the same export step: rig onto the existing animation set (perch/walk/fly/narrate), GLB ≤2MB, in-engine screenshot. Judging rubric: silhouette at gameplay zoom, shading fit, rig quality, repeatability for 6+ species, provenance cleanliness (AI-output license verified for the specific service; CC0 confirmed), hours-per-species estimate.
- **Acceptance:** Three in-engine screenshots + scored rubric + a written pipeline-lock decision in `docs/solutions/`. If no track passes: escalation decision (extend vs external artist) recorded same day — **decision point June 16**.
- **Dependencies:** B0, H1. **Owner:** all three (one track each). **Suited:** human + frontier (Track B generation) + coding-agent (export/rig harness). **Priority:** P0 · `epic:character` · `experiment` · **Est:** 2d × parallel

#### B2 — Hero bird: production pass via the locked pipeline
- **Problem:** The bake-off proves the pipeline; the demo needs the artifact.
- **Goal:** The B0 bird at production quality, in-engine: rigged to all movement modes, palette variants wired through the existing `setSpecies()`/material-key plumbing, within budget, replacing MaskedBower as the default companion.
- **Scope:** Model/texture/rig polish; integration via existing species plumbing (keep `companionSpecies` persistence untouched); animation verification across perch/walk/settle/fly/narrate; budget check. Out: more species; picker UI.
- **Acceptance:** Side-by-side vs MaskedBower reads as a different league; all five movement modes verified; ≤2MB; runs on low tier; legacy species no longer reachable from any student-facing surface (code retained).
- **Dependencies:** B1. **Owner:** design engineer (technical) + you (art direction sign-off). **Suited:** human + coding-agent (integration). **Priority:** P0 · `epic:character` · **Est:** 3d

#### B3 — Species roadmap + picker (backlog, post-window)
- **Problem:** One hero bird isn't a choice; the picker (and any deeper customization) needs 3+ production species.
- **Goal:** Per-species production schedule using B1's hours-per-species number; picker UI lands when the third species does (the v1 picker design — sheet primitive, palette variants, onboarding + Settings — applies as written).
- **Dependencies:** B2; pipeline lock. **Owner:** team. **Priority:** P2 · `epic:character` · **Est:** B1 output decides

#### B4 — Decision: legacy species retirement (backlog)
- **Problem:** Six procedural species + their `STANDING_OVERRIDES` code paths linger after replacement.
- **Goal:** Recorded decision + cleanup plan once ≥3 production species exist.
- **Priority:** P2 · `epic:character` · `decision` · **Est:** 0.5d

### Epic: Clean-Room Assets

#### F1 — Derivation audit — ✅ DONE 2026-06-12
- **Outcome:** `docs/audit/2026-06-12-asset-provenance-audit.md` — every world asset and shader pinned to a verified source and license (upstream repos fetched and compared file-by-file). Key verdicts: grass/Noises/sky-materials/partials = `infinite-world` (no license) → replace (T2); tree foliage + `foliageSDF.png` = `folio-2025` (MIT) → keep with attribution (F2); water + curved-earth = our own legacy code → no action; Gustavson Perlin partials = MIT → keep with credit.
- **Release gate (recorded):** no student-wide release while any 🔴 audit row remains. Internal demo on current code is fine — publication is the trigger (confirm with legal/comms owner).

#### T1 — Parametric tree generator v1, clean-room foliage shading
- **Problem:** Trees are 7 hardcoded placements of 2 GLBs shaded by ported code. We want many distinct, beautiful trees — at or above the current look — under our own provenance, driven by island data.
- **Goal:** A generator: `treeRecipe (species params, palette, silhouette volumes, density, seed) → tree instance` — procedural low-poly trunk (swept spline + noise), billboard leaf-cloud foliage in canopy volumes (the *technique* retained), and a **freshly written** two-tone leaf shader + new in-house leaf alpha texture. Recipe-native: placements/palettes read from IslandRecipe.
- **Scope:** Generator + shader + texture authoring + instancing within existing wind/`growIn()` integration points. Spec-from-screenshots process per §3 Q6 (write the visual/behavior spec first, implement against it, document). Out: water/sky (T3/T4); biome logic.
- **Audit note:** the current tree system is **MIT-clean** (folio-2025) — this issue is product-driven ("many better trees"), not legally required. Keep or replace `foliageSDF.png` freely; if kept, its notice lands in F2.
- **Acceptance:** ≥3 visibly distinct species × ≥3 seed variants each, side-by-side judged ≥ current trees against H1; draw calls within budget on low tier; wind + grow-in still work; manifest rows added for any new textures.
- **Dependencies:** F1 (scope), C1 (recipe; standalone-recipe fallback if C1 slips), H1 (look). **Owner:** design engineer (code) + you (look-dev). **Suited:** frontier (shader/generator design) + coding-agent (plan-first) + human (taste). **Priority:** P0 · `epic:clean-room` · **Est:** 3d

#### T2 — Clean-room replacement set (grass + Noises + sky materials + plateau retint + rain + water layers + aurora)
- **Problem:** The audit's two 🔴 tables. From `brunosimon/infinite-world` (no license): `GrassMaterial` + grass shaders + `Grass.js`, `Noises.js`/`NoisesMaterial`, `SkyBackground/SkySphere/Stars` materials, 9 shader partials. From `dannylimanseta/tinyskies` (no license, rain droplets additionally "adapted from Shadertoy" → probable CC BY-NC-SA non-commercial chain): `Rain.js` streak pass (verbatim) + drops/lens pass (direct port), the water shader's foam-blob/sparkle/contour layers in `View/Island.js` (identical formulas, time coefficients match), and `Aurora.js` (same construction, nudged constants — inherited via legacy v0). **None of it can ship to students.**
- **Goal:** Zero unlicensed-derived code in the engine.
- **Scope:** (a) Grass rebuild — clean-room (spec from screenshots, write fresh): instanced blades, terrain sampling via the preserved `bindTerrain` interface, distance fade, wind, curved-earth displacement; the 9 Bruno partials die with it. (b) Noises replace — CPU `DataTexture` or MIT-Gustavson-Perlin-based. (c) Sky materials — **delete** (CSS sky already owns the backdrop); stars deleted too unless the night look demands a small rebuild. (d) Plateau shader — retype the 2-line sun-shade, own tint. (e) Rain rebuild — fresh streak pool + a new lens-droplet construction; **no Shadertoy adaptation** (site default is non-commercial). (f) Water layers — replace foam-blob/sparkle/contour constructions; keep our base waves, shore halo, wet-sand tint, and our own foam textures. (g) Aurora — rewrite ribbons from a fresh spec; keep the feature and our palette. Out: changing the overall look (parity first).
- **Acceptance:** Both audit 🔴 tables empty; screenshot parity within agreed tolerance across tiers for grass/water/rain/aurora; no visual regression from sky deletion at any day-cycle hour; perf within current frame budget (rain glass cadence behavior preserved per tier).
- **Dependencies:** C1 helpful, not blocking. **Owner:** design engineer (rain/water/aurora chunks are parallelizable to a second person). **Suited:** frontier (shader authoring) + human (parity judgment). **Priority:** P0 (if team is 2, split: grass+rain in-window, water-layers+aurora post-window — gate still blocks release) · `epic:clean-room` · **Est:** 5d

#### T3 / T4 — ~~Water · Sky rewrites~~ CLOSED BY AUDIT
- Water + curved-earth verified as ports of **our own** legacy `student-space` code — no action. Sky handled by deletion inside T2. Optional backlog: stars-material rebuild if a WebGL night sky is ever wanted.

#### F2 — THIRD_PARTY_NOTICES.md + UPSTREAM.md + asset manifest
- **Problem:** Our MIT/Apache obligations are currently unmet: folio-2025 (tree system + `foliageSDF.png`), Gustavson webgl-noise, Draco, and Three.js notices don't exist in the repo; `UPSTREAM.md` was planned but never created; `public/` binaries have no provenance manifest.
- **Goal:** `THIRD_PARTY_NOTICES.md` with all four notices + header notice in `Tree.js` + `src/engine/student-space/UPSTREAM.md` (fork @ cd30172, clean-cut) + asset manifest where every `public/` binary gets a provenance row (new pipeline outputs B2/T1 must add rows as part of their acceptance). Includes your one-line confirmation that the four terrain textures are self-authored.
- **Owner:** you. **Suited:** cheaper (draft from the audit doc) + human (sign-off). **Priority:** P0 · `epic:clean-room` · `documentation` · **Est:** 0.5d

### Epic: Island Recipe

#### C1 — Extract IslandRecipe *(unchanged from v1, second consumer added)*
- As v1: serializable, versioned recipe (silhouette, height-noise, zone radii, palette refs, decor placements) consumed by State + View; default recipe pixel-identical to today (screenshot diff). **Added:** decor placement schema must carry what T1 needs (species ref, seed, scale, yaw — superset of today's PLACEMENTS).
- **Owner:** design engineer. **Suited:** frontier (refactor design) + coding-agent (plan-first). **Priority:** P0 · `epic:island` · **Est:** 3d

#### C2 — Profile→recipe mapping v1 · C3 — Evolution triggers + transition · C5 — Recipe persistence
- As v1, verbatim (deterministic mapping; status-driven deltas; transition reusing `growIn()`; snapshot compatibility). **Priority change only: P1** — pull back into the window if the bake-off resolves fast.
- **Owners/estimates:** as v1 (you + design engineer; 1.5d + 1.5d + 1d).

#### C4 — Island builder UI spike — unchanged, P2.

### Epic: Dev Environment
- **A1** CI `pnpm check` + `pnpm test` on PR — as v1. P1 · 0.5d · coding-agent.
- **A2** Demo fixtures, five identity statuses — as v1, now P1 (evolution slipped with it) · 1d · coding-agent + cheaper (reflection text drafts).
- **A3** Export pipeline + CI size budgets — as v1, now explicitly the bake-off's shared export step formalized (gltfpack/meshopt script, budget check). P1 · 1d · coding-agent.
- **A4** Debug panel — as v1. P2 · 1d.

### Epic: Agent Strategy / Agent Quality
- **D1** framework doc (P0 · 0.5d · frontier draft + human edit) — adds the v2 note: image/3D gen models are dev-time frontier leverage, always human-curated, provenance-checked.
- **D2** Connector cadence wiring (P1 · 1.5d · coding-agent, plan-first) — as v1.
- **D3** Cartographer→island spike (P2) · **E1** golden evals (P2 · 3d) · **E2** verifier/cache instrumentation (P1 · 1d) · **E3** failure hardening (P2 · 1.5d) · **E4** adaptive routing (P2 · 1d) — all as v1.

### Epic: Performance
- **G1** Compress shipped assets — **rescoped:** applies to demo-surviving assets only; if B2 retires MaskedBower before June 22, skip its compression and delete it instead. Terrain-texture conversion (KTX2/WebP) stays. P1 · 0.5–1d · coding-agent + human check.
- **G2** Hardware baseline on target school devices — as v1; now also profiles T1 trees + hero bird. P1 · 1d.
- **G3** Draw-call audit — P2, as v1.

### Epic: Visual Style
- **H1** Art bible — **promoted and expanded:** Wind-Waker constraint framing as v1, **plus** AC/Pokémon/Zelda character reference boards (silhouette language, eye/face charm, palette discipline, texture-free shading on constrained hardware) and the judging rubric the bake-off scores against. P0, gates B1 · 1.5d · human + frontier (reference research/drafting).
- **H2** Styled test prop — **merged into T1** (the generated trees are the proof). Closed-as-duplicate on creation, or simply not opened.
- **H3** Style rollout — P2, as v1.

---

## 9. Assumptions and open unknowns

- **Assumed:** June 22 demo audience is GovTech/MOE stakeholders; an internal demo on current (derived) shaders is acceptable because the legal trigger is student-wide publication — **confirm this reading with whoever owns legal/comms before the demo.**
- **Assumed:** AI-3D and AI-image services used in Track B grant output ownership suitable for government publication — verified per-service inside B1, not assumed silently.
- **Unknown:** team Blender depth — answered empirically by the bake-off rather than guessed.
- **Unknown:** external-artist procurement feasibility/lead time (gov context) — only matters if the bake-off fails; flag the question to ops early anyway (free option).
- **Unknown:** third teammate — must-list is survivable at 2 people minus T2.
- **Experiments before builds:** B1 bake-off before any species production · T1 keeps proven techniques and only re-implements expression · C4/B3 remain gated as v1 · E4 gated on E1/E2 evidence.
