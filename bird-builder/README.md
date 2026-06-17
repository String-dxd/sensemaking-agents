# bird-builder

A standalone, **asset-driven bird dress-up & customization studio** (React Three Fiber + drei).
Sibling to `island-editor/`; an isolated pnpm workspace with its own `three@0.171` — it never
touches the product app or its pinned `three@0.149`.

It loads a **rigged base bird**, lets you **dress it in swappable costumes**, **recolor** every
layer + the feathers, **randomize**, undo/redo, **save to the URL**, and **export** a JSON config
or a PNG — previewed on a turntable with AC-style toon shading.

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

## The honest split (read this)

The builder is the **runtime** — slot management, swap, recolor, preview, serialization. It
contributes **no visual quality on its own**. Animal-Crossing-grade fidelity comes from
**authored art** (a softly-proportioned base bird + a clothing catalog), produced by the
character pipeline and authored to **`ASSET-CONTRACT.md`**. Swap conforming assets in and the
quality bar is reached with no code change.

**V1 status:** the runtime is real and tested, but it ships against the *existing* (below-bar)
`MaskedBower` bird + **crude procedural placeholder garments** (a cap, beanie, scarf, leaf) to
prove the system. Accessory fit (`src/rig/buildItem.ts` `fit`) is a first-guess and needs visual
tuning. So V1 *works as a dress-up system* but does not *look* AC-grade yet — that's the art.

## What's here (V1)

- **Pure model** (`src/bird/*`): `BirdConfig` (the export artifact), the slot registry + item
  catalog, curated palettes, constrained randomize. Unit-tested.
- **Editor primitives** (`src/editor/*`): command stack (undo/redo), localStorage autosave,
  JSON export/import, URL-hash share. Unit-tested.
- **Rig** (`src/rig/*`): base load + clone + bone/attach-node indexing; toon materials + 3-step
  gradient + feather recolor; placeholder garment builders.
- **Scene** (`src/scene/*`): neutral toon-lit turntable; the bird; clothing portaled to bones.
- **UI** (`src/ui/*`): hover-reveal panel — slot tabs, item chips, recolor swatches, feather
  presets, randomize/undo/redo/reset/export/import/screenshot/copy-link.

## Deferred (clearly noted)

- **Skinned garments** (skeleton-rebind) — the runtime path is contracted; V1 placeholders are
  rigid. Lands with authored skinned outfits.
- **Body masking** under clothing (morph/hidden-UV) — needed once real outfits land.
- **Spline-like fit/morph handles** (drag accessories / pull base morphs, à la the island
  editor) — secondary to slot-swap + recolor; the next interaction to add.
- **Outline pass** (back-face inflation) — toon banding is in; the AC outline line is polish.
- The **AC-grade base + clothing catalog** — the art pipeline's job (the long pole).
