---
date: 2026-06-12
topic: asset-provenance-audit
status: verified
---

# Asset & code provenance audit — definitive rebuild / no-rebuild verdicts

**Why this exists:** `String-sg/sensemaking-agents` is a **public, MIT-licensed** repo intended for MOE-wide student publication. Parts of the world engine were ported from Bruno Simon's work during the hackathon. This audit pins the provenance of every world asset and shader to a verified source and license, so we know exactly what must be replaced and what can stay.

**How it was verified (2026-06-12):** every upstream claim below was checked against the live GitHub repos/files — license files fetched raw, directory listings via the GitHub API, shader uniforms compared line-by-line. Sources are linked at the bottom. Nothing below is guessed.

---

## TL;DR

| Verdict | What | Why |
|---|---|---|
| 🔴 **MUST REPLACE** | Grass (material + shaders + class), Noises generator, Sky sphere/background/stars materials, 9 of 12 shader partials | Ported **byte-for-byte from `brunosimon/infinite-world`, which has NO license** → all rights reserved. Cannot ship to students. |
| 🔴 **MUST REPLACE** | Rain overlay (streaks **verbatim** + lens-droplet pass), water-shader foam/sparkle/contour layers, Aurora curtains | Ported from **`dannylimanseta/tinyskies`, which has NO license** — and its droplet shader is itself "adapted from Shadertoy" (probable Heartfelt lineage, **CC BY-NC-SA = non-commercial**). Two bad layers deep. |
| 🟢 **KEEP — attribution required** | Tree foliage system (`Tree.js` port), `foliageSDF.png`, 3 Perlin partials, Three.js, DRACO decoders, stats.js, lil-gui | MIT / Apache-2.0 — fully usable in a government product. We must add the license notices (currently missing). |
| 🟢 **KEEP — no action** | Water base waves + shore halo, curved-earth, island terrain, all birds, tree GLBs, terrain textures, day-cycle palettes, all ambient props (butterflies/fireflies/particles/rainbow/mailbox/telescope), procedural audio, all React/agent/server code | Our own authorship (this repo or Wondo's upstream `student-space`), or inspiration-only (ideas aren't copyrightable). |

Net: **trees do NOT need rebuilding** (MIT), **water's base is ours** but three of its shader layers must be replaced, and the **rain system + aurora must be rebuilt**. Total mandatory replacement: **~5 engineer-days** (grass cluster ~3d + rain/water-layers/aurora ~2d).

---

## 🔴 MUST REPLACE — derived from `brunosimon/infinite-world` (NO license)

`infinite-world` has no LICENSE file (GitHub API reports `"license": null`; a 2021 community request to add one — [Issue #8 on his my-room-in-3d](https://github.com/brunosimon/my-room-in-3d/issues/8), same situation — was never answered). Under the Berne Convention, no license = all rights reserved. Our own code comments confirm direct porting ("Geometry and shader are byte-for-byte his" — `Grass.js:17`).

Every path below is under `src/engine/student-space/Game/View/`. Upstream paths verified to exist at `brunosimon/infinite-world` `sources/Game/View/`.

| Our file | Upstream match (verified) | Disposition | Est. |
|---|---|---|---|
| `Materials/GrassMaterial.js` + `Materials/shaders/grass/{vertex,fragment}.glsl` | `Materials/GrassMaterial.js`, `shaders/grass/` — all uniforms (`uGrassDistance`, `uTerrainATexture`…`D`, `uFresnel*`, `uSunPosition`) match verbatim | **Rebuild** (clean-room: spec from screenshots, write fresh). Already planned as the grass-v2 issue; technique — instanced blades, terrain sampling, wind, distance fade — is freely reusable; his code text is not. | 2d |
| `Grass.js` (the class: geometry grid, blade buffers) | `Grass.js` — modified but derived | **Rebuild together with the material** (same issue; interfaces `bindTerrain()` etc. stay so callers don't change) | (incl.) |
| `Noises.js` + `Materials/NoisesMaterial.js` + `shaders/noises/` | `Noises.js`, `Materials/NoisesMaterial.js` | **Replace** — trivial: generate the noise `DataTexture` on CPU or via the MIT Gustavson Perlin we already carry | 0.5d |
| `Materials/SkyBackgroundMaterial.js` + `shaders/skyBackground/` | `Materials/SkyBackgroundMaterial.js` | **Delete** — already detached from the scene (`Sky.js:40` removes the mesh; CSS sky is the real backdrop) | 0.5d total for the sky cluster |
| `Materials/SkySphereMaterial.js` + `shaders/skySphere/` | `Materials/SkySphereMaterial.js` | **Delete or rebuild.** Recommended: **delete** — the CSS gradient sky already owns the backdrop; verify nothing visible regresses, then remove. Rebuild only if a WebGL sky is still wanted later. | (incl.) |
| `Materials/StarsMaterial.js` + `shaders/stars/` | `Materials/StarsMaterial.js` | **Delete or rebuild.** If night stars matter to the look, rebuild is small (point sprites + twinkle); otherwise delete with the sky sphere. | (incl., +0.5d if rebuilt) |
| `Materials/shaders/partials/` — `getGrassAttenuation`, `getSunShade`, `getSunShadeColor`, `getSunReflection`, `getSunReflectionColor`, `getFogColor`, `getRotatePivot2d`, `inverseLerp`, `remap` | `shaders/partials/` (same filenames) | **Replace during the grass rebuild.** Note: `inverseLerp`, `remap`, `getRotatePivot2d` are unprotectable one-line math, but they're 30 seconds to retype — do it anyway so the partials dir is 100% clean. | (incl.) |
| `View/Island.js` plateau fragment shader, lines ~517–521 | Two lines re-typed from his `getSunShade`/`getSunShadeColor` (flagged by our own comment) | **Rework in place** — half-Lambert wrap (`dot(N,-S)*0.5+0.5`) is a standard technique; retype it and choose our own shade tint instead of his `vec3(0.0, 0.5, 0.7)`. De-minimis risk, near-zero cost. | 0.1d |

---

## 🔴 MUST REPLACE — derived from `dannylimanseta/tinyskies` (NO license)

Tiny Skies is the "GlobeFly" miniature-planet flying game by Danny Limanseta ([repo](https://github.com/dannylimanseta/tinyskies), live at tinyskies.vercel.app). The repo is **public but carries no LICENSE file** (GitHub API: `license: null`) → all rights reserved, same legal position as infinite-world. Derivation was confirmed by fetching its actual sources and comparing line-by-line (details per row). Some of this entered our codebase via Wondo's legacy `student_space_island_v0.html`, which had already ported it — the provenance follows the code regardless of the hop.

| Our file | Evidence of derivation (verified against fetched TinySkies source) | Disposition | Est. |
|---|---|---|---|
| `View/Rain.js` — streak pass | **Character-for-character identical** to `client/src/game/RainOverlay.ts`: same `streakFrag` (taper/across/shape lines), same constants `STREAK_COUNT=200`, `WIND_ANGLE=0.35`, `ANGLE_JITTER=0.09`, `NOISE_SIZE=256`. Our own comment: "verbatim port of Tiny Skies' streak pool." | **Rebuild fresh.** Falling-streak quads are a generic technique — write a new pool + shader from a one-paragraph spec without the old file open. | 0.5d |
| `View/Rain.js` — drops/lens pass | Direct port of TS `glassFrag`: identical r-loop (`4.0 → 0`), identical cell math, identical lifecycle line `fract(time * (d.b + 0.1) * 0.45 + d.g) * 1.4`, identical live-cell gate. Our comment: "Direct port of TS's glassFrag." **Worse:** TS's own header says "adapted from Shadertoy" with no ID — the dominant lens-rain lineage is "Heartfelt" by Martijn Steinrucken, **CC BY-NC-SA 3.0 (non-commercial)**. Probable (not proven) NC chain on top of the unlicensed port. | **Rebuild from scratch with a visibly different construction** (e.g., texture-stamped droplet sprites or own hash-grid droplets). Do NOT "adapt" any Shadertoy rain shader — Shadertoy's default license is CC BY-NC-SA. The *idea* of droplets refracting the framebuffer is free; every implementation line must be ours. | 1d |
| `View/Island.js` — water **foam blob layer** (`w1`–`w7`) | Identical structure to TS `Globe.ts` ocean: `w1*w2*w4*w6 + w3*w5*w7*0.3`, `1.0 - smoothstep(0.002, …)`, and **all seven time coefficients identical** (3.6, 2.7, 2.1, 1.5, 1.2, 1.8, 0.9); spatial frequencies ÷10 exactly as our comment admits ("ported from TinySkies… we scale freqs down by ~10×"). | **Replace the layer.** Our own foam-cell *textures* (which are ours) already do similar work — lean on those + a freshly derived sine set with new structure and coefficients. | 0.5d |
| `View/Island.js` — water **sparkle layer** (`sp1`–`sp5`) | Identical combination formula `sp1*sp2*sp3*sp4 + sp2*sp3*sp5*0.5`, identical time coefficients (3.5, 2.8, 4.1, 1.9, 2.3), same threshold/`0.97` smoothstep shape. | **Replace the layer** (fresh sparkle construction — e.g., hash-based glints). | (incl.) |
| `View/Island.js` — shore **contour ripple layer** | Our comment: "TinySkies-style scrolling concentric contour ripples"; TS source has the matching `fract(depth * 6.0 - time * 0.8)` contour. | **Replace the layer.** The crisp waterline halo + wet-sand tint above it are our own and stay. | (incl.) |
| `View/Aurora.js` | Same construction as TS `client/src/game/Aurora.ts` with nudged constants: three x-only sine waves + ripple, displacement `(w1+w2+w3) * (0.25 + uv.y*0.75)` vs TS `(0.3 + uv.y*0.7)`, sway `sin(p.x * …) * 0.3 * uv.y` identical, same uniforms/blending. Entered via our legacy v0 file. | **Rebuild fresh** (it's a beloved twilight cue — keep the feature, rewrite the ribbons from a spec: different wave construction, own palette already differs). | 0.5d |

**Verified NOT derived from TinySkies (inspiration only — keep):** `DayCycle.js` palette (ours is a 13-key hourly interpolation with our own twilight keys; TS uses 3 discrete presets with different values and structure), `CssSky.js` (CSS gradient approach, ours), water *base* waves + crisp shore halo (our legacy `buildWater`), `Weather.js` rain state machine, `Sound.js` (fully procedural Web Audio, no assets), Butterflies/Fireflies/Particles/Rainbow/Mailbox/Telescope/Flowers/Fruits/Sprouts (own recipes per headers and construction).

**Total mandatory replacement (both 🔴 tables): ~5 engineer-days** — grass cluster ~3d (already planned as T2) + rain/water-layers/aurora ~2d (added to T2).

**Release gate (hard rule):** no student-wide release while any row in either 🔴 table remains unreplaced. Internal dev and the June 22 stakeholder demo may run on current code — publication is the legal trigger, not the demo. *(Assumption to confirm with whoever owns legal/comms.)*

**Team rule going forward:** before porting *anything*, check the source repo for a LICENSE file. Public ≠ licensed. And never adapt Shadertoy code — the site default is CC BY-NC-SA (non-commercial).

---

## 🟢 KEEP — properly licensed, **attribution must be added** (action: F2)

| Item | Source (verified) | License | Obligation |
|---|---|---|---|
| Tree foliage system — `Tree.js` port (80 billboard planes per icosphere, SDF alpha, two-tone sun shading; his TSL re-expressed in GLSL) | `brunosimon/folio-2025` → `sources/Game/World/{Trees,Foliage,Leaves}.js` | **MIT** ([license.md verified](https://github.com/brunosimon/folio-2025/blob/main/license.md), © 2025 Bruno Simon; no asset carve-outs in the readme) | Retain his copyright + MIT notice (header comment in `Tree.js` + `THIRD_PARTY_NOTICES.md` entry) |
| `public/trees/foliageSDF.png` | `brunosimon/folio-2025` → `static/foliage/foliageSDF.png` (byte-size match, 11KB) | **MIT** (covered by repo license; no exclusions documented) | Manifest row + notice entry |
| `Fruits.js` bush leaf-blobs ("Bruno-style billboard leaf-blobs") | Our code using the folio-2025 technique + same atlas | MIT-derived | Covered by the Tree.js notice |
| `shaders/partials/perlin2d.glsl`, `perlin3dPeriodic.glsl`, `perlin4d.glsl` | Stefan Gustavson, classic Perlin noise (webgl-noise lineage; credit headers already present in the files) | **MIT** (stegu/webgl-noise) | Keep the credit headers; add notice entry |
| `public/draco/*` (decoder .js/.wasm) | Google Draco via Three.js examples | **Apache-2.0** (verified) | Notice entry; redistribution explicitly permitted |
| `three` (npm) | mrdoob/three.js | **MIT** (verified) | Notice entry |

**Important nuance for collaborators:** MIT does *not* mean "no obligations." It means we may use, modify, and sell — *provided the copyright and license text is retained*. None of these notices exist in our repo today. Creating `THIRD_PARTY_NOTICES.md` + header comments is issue F2 (0.5d) and makes all of this row fully compliant.

**Do NOT port from these Bruno repos in future:** `my-room-in-3d` and `infinite-world` — both verified to have **no license**. Only `folio-2025` and `folio-2019` (both MIT) are safe sources. Three.js Journey *lesson* code sits in an ambiguous carve-out in his course terms ("sole exception of the examples of lines of code provided in the training exercises") with no explicit commercial grant — treat it as off-limits for this product; use the MIT folio repos instead.

---

## 🟢 KEEP — our own authorship, no action

| Item | Authorship trail |
|---|---|
| Water shader **base** (layered sine waves, crisp shore halo, wet-sand tint, depth gradient) in `View/Island.js` | Port of *our own* legacy `buildWater` from Wondo's pre-engine `student-space` code ("port of the legacy buildWater shader" — `Island.js:15`). **Exception:** the foam-blob, sparkle, and contour-ripple *layers* inside this shader are TinySkies-derived — see the 🔴 TinySkies table. |
| Curved-earth displacement (`onBeforeCompile` splice, `CURVE_K`) | Our own legacy `P.post.curvedEarth` (`Island.js:20`). Technique (parabolic drop-off) is generic. |
| Island heightfield, silhouette functions, sand/cliff geometry | Authored in `State/Island.js` / `View/Island.js` (this lineage) |
| `public/birds/MaskedBower.glb` + all 6 procedural bird species (`Kira.js`) | App-authored (Blender + code), commits traced in this repo |
| `public/trees/{oak,cherry}TreesVisual.glb` | Authored in Wondo's upstream `wondopamine/student-space` (committed here 2026-05-18). Even if modeled following folio-2025's blend files, those are MIT — covered either way. |
| `public/student-space/textures/{sand-soft-ripples, cliff-soft-strata, water-foam-cells, water-short-bubbles}.png` | Authored in Wondo's upstream (committed 2026-05-25). ☑️ **One-line confirmation requested from Wondo:** these were created by you (hand-made or generated with a service whose terms grant output ownership), not downloaded from a texture site. If any came from a third-party library, flag it and we add it to the manifest. |
| Engine fork itself (`src/engine/student-space/`) | Clean-cut vendoring of Wondo's own `wondopamine/student-space` @ `cd30172` — same team, no external licensing issue. `UPSTREAM.md` still to be written (F2). |
| Camera, Renderer, Game glue, DayCycle, all State slices, statusHeuristics, all React/agents/server/DB code | Authored in this repo / upstream; comments like "replaces Bruno's Player/Camera chain" mean *our replacement code*, not his. |
| `public/logo/SVG@2x.svg` | String/MOE branding |

---

## Action checklist (maps to plan issues)

- [ ] **T2 (P0, 2d, design engineer):** Clean-room grass rebuild — material + shaders + `Grass.js` class + the 9 Bruno partials. Spec-from-screenshots process; keep `bindTerrain()` interface.
- [ ] **T2b (P0, 0.5d):** Replace Noises generator (CPU DataTexture or Gustavson-Perlin-based).
- [ ] **T2c (P0, 0.5d):** Delete sky background/sphere materials (already CSS-backed); decide stars (delete now, rebuild later if night look needs them); verify no visual regression.
- [ ] **T2d (P0, 0.1d):** Retype + retint the 2-line plateau sun-shade in `View/Island.js`.
- [ ] **T2e (P0, 1.5d):** Rebuild rain overlay — fresh streak pool (trivial) + new lens-droplet construction (no Shadertoy adaptation; own implementation of the refraction idea, or a different droplet look entirely).
- [ ] **T2f (P0, 0.5d):** Replace the three TinySkies-derived water layers (foam blobs, sparkles, contour ripples) with own constructions; keep our base waves/halo/foam-textures.
- [ ] **T2g (P0, 0.5d):** Rebuild aurora ribbons from a fresh spec (keep the feature and our palette; new wave construction).
- [ ] **F2 (P0, 0.5d, Wondo):** `THIRD_PARTY_NOTICES.md` (Bruno Simon folio-2025 MIT, Gustavson webgl-noise MIT, Draco Apache-2.0, Three.js MIT) + header notice in `Tree.js` + `UPSTREAM.md` + asset manifest. Include Wondo's texture-authorship confirmation.
- [ ] **Release gate:** recorded above; CI/manual check before any student-wide release that the 🔴 table is empty.
- [ ] **(unchanged, product-driven, not legally required):** T1 parametric tree generator — trees are MIT-clean as-is; the generator is about *many better trees*, on our own timeline.

## Sweep coverage note

Every file under `src/engine/student-space/Game/` was checked (headers + a full-text scan for "port of / verbatim / lifted / adapted / Shadertoy / URLs / author names"). Items confirmed clean beyond the tables above: `Debug/Stats.js` and `Debug/UI.js` (thin wrappers over the `stats.js` and `lil-gui` npm packages, both MIT), `util/easing.js` (own one-line math), `Kira.js`, `ThumbnailRenderer.js`, all heuristics files, all State slices, all Data seeds.

## Sources (all fetched 2026-06-12)

- [folio-2025 license.md — MIT](https://github.com/brunosimon/folio-2025/blob/main/license.md) · [folio-2025 `static/foliage/` listing](https://api.github.com/repos/brunosimon/folio-2025/contents/static/foliage) · [folio-2025 `Foliage.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/World/Foliage.js)
- [folio-2019 license.md — MIT](https://github.com/brunosimon/folio-2019/blob/master/license.md)
- [infinite-world repo — no LICENSE file; API `license: null`](https://github.com/brunosimon/infinite-world) · [infinite-world `Materials/` listing](https://api.github.com/repos/brunosimon/infinite-world/contents/sources/Game/View/Materials) · [infinite-world grass vertex.glsl (uniform-level match)](https://raw.githubusercontent.com/brunosimon/infinite-world/master/sources/Game/View/Materials/shaders/grass/vertex.glsl)
- [my-room-in-3d — no license; unanswered request, Issue #8](https://github.com/brunosimon/my-room-in-3d/issues/8)
- [Three.js Journey general conditions (lesson-code carve-out, no commercial grant)](https://threejs-journey.com/general-conditions)
- [Google Draco LICENSE — Apache-2.0](https://github.com/google/draco/blob/main/LICENSE) · [Three.js LICENSE — MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE)
- [dannylimanseta/tinyskies — no LICENSE file; API `license: null`](https://github.com/dannylimanseta/tinyskies) · [RainOverlay.ts (streak constants + "adapted from Shadertoy" glassFrag)](https://raw.githubusercontent.com/dannylimanseta/tinyskies/cursor/globefly-multiplayer-globe-flight-game/client/src/game/RainOverlay.ts) · [Aurora.ts](https://api.github.com/repos/dannylimanseta/tinyskies/contents/client/src/game/Aurora.ts?ref=cursor/globefly-multiplayer-globe-flight-game) · [Globe.ts (ocean foam/sparkle)](https://raw.githubusercontent.com/dannylimanseta/tinyskies/cursor/globefly-multiplayer-globe-flight-game/client/src/game/Globe.ts)
- ["Heartfelt" by Martijn Steinrucken — Shadertoy, CC BY-NC-SA 3.0](https://www.shadertoy.com/view/ltffzl) · [Shadertoy default license terms](https://www.shadertoy.com/terms)
