# bird-builder

A standalone, **procedural-parametric bird character creator** (React Three Fiber + drei).
Sibling to `island-editor/`; an isolated pnpm workspace with its own `three@0.171` — it never
touches the product app or its pinned `three@0.149`.

It **generates** a charming toon bird from code — pick a **species**, reshape it with
**parts** (crest · tail · beak) and **morphology sliders**, recolor **6 plumage zones**, give it
an **eye archetype + cheeks + a painted face**, ink a **plumage pattern**, dress it in
**accessories**, and name it — then **randomize**, undo/redo, **save to the URL**, and **export**
a JSON genome or a PNG, previewed on a turntable with AC-style toon shading + outlines.

Variety comes from **our own primitives** (publication-safe, no art team needed): 6 species ×
5 crests × 5 tails × 4 beaks × a 6-zone palette × 8 eye archetypes × bounded morph deltas ×
patterns ≈ a very large, always-coherent space — the literal answer to "more than just colour."
See `docs/plans/2026-06-17-002-feat-bird-builder-procedural-variety-refactor-plan.md`.

## Run

```bash
cd bird-builder
pnpm install
pnpm dev          # http://localhost:5181
pnpm test         # vitest (pure model + editor primitives)
pnpm typecheck
pnpm build
```

Assets are reused from the repo-root `public/` via Vite `publicDir` (the canonical
`/birds/MaskedBower.glb` + `/draco/`), so there's no duplicated GLB.

## Two lanes: procedural floor, authored ceiling

- **Procedural lane (default).** The bird is assembled from our own primitives + a canvas-painted
  face + a toon ramp — ported and grown from the product engine's proven parametric bird
  (`src/engine/student-space/Game/View/Kira.js`). This is where variety lives, it ships **now**,
  and it's **publication-safe** (app-authored — see `docs/audit/2026-06-12-asset-provenance-audit.md`).
- **GLB lane (upgrade).** A hero bird authored to **`ASSET-CONTRACT.md`** still drops in: the
  legacy `MaskedBower.glb` loads via the `kind: 'glb'` base with full 6-zone recolor. When a real
  hero species lands it becomes one more picker card — art makes the studio *better* over time, it
  is never a prerequisite for variety.

## What's here (V2)

- **Pure model** (`src/bird/*`): `BirdGenome` (the export artifact — a tagged-union procedural|glb
  base + identity + slots), `morphology.ts` (species catalog + `resolveCharacter`), eye archetypes,
  v1→v2 `migrate`, curated per-zone palettes, constrained randomize. Unit-tested (no three/DOM).
- **Rig** (`src/rig/*`): `buildProceduralBird` (assembles the bird + paints the face + builds
  beak/crest/tail/wings/legs, returns `{root, attach, dispose}`), `plumagePattern` (CanvasTexture
  patterns), shared `toonMat` factory + 3-step gradient, GLB load/clone/recolor, placeholder
  accessory builders.
- **Editor** (`src/editor/*`): command stack (undo/redo), localStorage autosave (migrate-on-load),
  JSON export/import, URL-hash share (with an encode-side size guard). Unit-tested.
- **Scene** (`src/scene/*`): neutral toon-lit turntable; the bird (branches procedural/glb);
  accessories portaled to attach nodes.
- **UI** (`src/ui/*`): layered hover-reveal panel — species cards · identity (name + personality) ·
  crest/tail/beak chips · 6-zone colours · eye archetypes + cheeks · plumage pattern · advanced
  morphology sliders · accessories · randomize/undo/redo/reset/export/import/screenshot/copy-link.

## Deferred (clearly noted)

- **Authored hero-species GLBs + the SpeciesManifest "rig card"** + load-time GLB validator —
  the zero-code drop-in lane is spec'd in the plan; built when conforming hero art exists (the
  pebble5 picker remains deferred to 3+ hero GLBs).
- **Skinned garments** (skeleton-rebind) + **body masking** — for authored outfits; V1 placeholder
  accessories are rigid.
- **WebGPU/TSL shader patterns** — deliberately off the critical path (patterns ride CanvasTexture);
  an optional far-future enhancement, never a dependency.
