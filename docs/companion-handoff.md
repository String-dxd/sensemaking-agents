# Companion handoff — the `.companion.glb` contract

> **Archived 2026-07-23.** The Character Studio was removed from main
> (operator decision: park it for now). The complete final source lives at
> git tag `archive/character-studio-2026-07-23` (and in main's history via
> `git log -- character-studio/`). This document remains as the export-contract
> reference for the `.companion.glb` format should the studio be revived.

How a character authored in **Character Studio** survives into the product web
app and moves exactly as authored. Audience: product-app engineers wiring
companions into `src/engine/` (three@0.149). Written against plan 011; the
compiler lives in `character-studio/src/core/export/`, the runtime in
`character-studio/packages/companion-runtime/`.

---

## 1. What you get

Two artifacts per character:

- **`<name>.companion.glb`** — the self-sufficient runtime file. A standard
  glTF 2.0 GLB with a versioned vendor extension. Produced by
  `pnpm export:character -- <file>.character.json` (or in-browser via the
  studio's Export panel).
- (Studio-only) the editable `<name>.character.json` spec — you do **not** need
  it at runtime; it is the studio round-trip format.

**Two layers, by design:**

- **Standard glTF** carries everything a *generic* `GLTFLoader` needs to show a
  textured, skinned, animated character: geometry, skin + inverse binds, morph
  targets, the 11 animation clips (already proportion-rebased for the
  character's archetype), unlit drawn-face planes
  (`KHR_materials_unlit` + `KHR_texture_transform`), and a PBR body fallback
  material. Open it in **any** glTF viewer and you see the character move.
- **`SEN_companion`** (a document-level vendor extension) carries the *alive*
  layer the standard format can't express: spring-bone rig params, colliders, a
  bone→node-index map, the drawn-face cell/gaze/blink control data, procedural
  idle params, palette + toon `materialsMeta`, the clip manifest, and a
  record-only `studioLook`. The runtime library reads this; generic viewers
  ignore it.

Budget: the compiler warns if a GLB exceeds **8 MB**. The default dog is
~0.5 MB (5.3k tris, meshopt-compressed geometry, PNG face atlases).

---

## 2. Decoder setup (three@0.149)

The GLB uses **`EXT_meshopt_compression`** (required) on geometry, morph
targets, and animation, and embeds textures as **PNG** (no KTX2 — see §6). So
your host `GLTFLoader` needs a **meshopt decoder** and nothing else:

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)          // REQUIRED — or geometry won't decode
const gltf = await loader.loadAsync('/companions/dog.companion.glb')
```

- `three/examples/jsm/libs/meshopt_decoder.module.js` ships with three (all
  versions ≥ r122, so 0.149 is covered). Alternatively use the `meshoptimizer`
  npm package's `MeshoptDecoder` (call `await MeshoptDecoder.ready` first).
- **No KTX2/Basis transcoder is needed** (textures are PNG).
- `KHR_materials_unlit` and `KHR_texture_transform` are parsed natively by
  three's GLTFLoader on 0.149 — no setup.
- If you skip the meshopt decoder the load fails; that is the one hard decoder
  dependency.

The runtime library never loads the GLB itself — **the host owns loading and
decoders** (dependency injection), which is exactly why it stays
three-version-agnostic.

---

## 3. Runtime library — `@sensemaking/companion-runtime`

Peer dep `three >= 0.149`; zero react/drei/r3f deps; one runtime dep (`zod`).
You inject your own `three` namespace and the already-parsed GLTF.

```ts
import * as THREE from 'three'
import { loadCompanion } from '@sensemaking/companion-runtime'

const companion = loadCompanion(gltf, THREE)          // gltf = your GLTFLoader result
// … each animation frame:
companion.update(dt)                                   // dt in seconds
```

### API (`Companion`)

| Method | Effect |
|---|---|
| `update(dt)` | Advance all layers for `dt` seconds. **Owns the AnimationMixer** — do not run your own mixer for this scene (see §4). |
| `setState(state)` | `'idle' \| 'walk' \| 'run' \| 'sit' \| 'talk'`. Crossfades; sit is entered/exited via transition clips. |
| `getState()` | Current base state. |
| `playGesture(name)` | `'gestureWave' \| 'gestureNod' \| 'gestureShrug' \| 'gestureCheer'`. Additive one-shot over the base state. Returns `false` if a gesture is already active or the name is unknown. |
| `setExpression(name)` | `neutral \| happy \| sad \| angry \| surprised \| sleepy \| love \| dizzy \| wink` (drawn-face preset). |
| `say(source?)` | Start amplitude-driven mouth flaps. `source: (t:number)=>number` in `[0,1]`; omit for deterministic synthetic speech. |
| `stopTalking()` | Hand the mouth back to the expression. |
| `setGaze(x, y)` | Pupil gaze, each in ~`[-1,1]` (clamped to the atlas gaze range). |
| `applyToonMaterials(factory)` | **Host-optional.** Rebuild studio-grade toon materials from `companion.data.materialsMeta` + palette. Default keeps the GLB's PBR fallback (works on 0.149). See §5. |
| `dispose()` | Restore spring rest pose, stop actions, release runtime state. Does **not** dispose the GLTF scene (you own it). |
| `.data` | The parsed `SEN_companion` (provenance, palette, `clips.names`, `materialsMeta`, …). |

Blink and gaze use a **seeded RNG** (no `Math.random` in the runtime). Pass
`loadCompanion(gltf, THREE, { rng: Math.random })` or `{ seed: n }` for
per-character variety; the default is a fixed seed (deterministic).

---

## 4. Update-loop contract

- Call `companion.update(dt)` **once per frame**, with `dt` in **seconds**.
- Internally it runs the fixed frame order (never reorder): **animation
  (clips) → physics (spring bones) → procedural (idle breath, face, talk)**.
  Animation drives; physics follows the animated pose.
- The runtime **owns the `AnimationMixer`** it created for this scene. Do not
  drive a second mixer over the same objects — the spring solver treats the
  mixer-written pose as its rest target, and a competing mixer would fight it.
- Multiple companions: one `Companion` per character, each `update(dt)` per
  frame. They share no state.
- Springs substep at 60 Hz internally (max 3 substeps/frame), so large `dt`
  spikes stay stable.

---

## 5. Materials — fallback vs studio-grade toon

The GLB body/region materials are a **flat PBR fallback** (palette-primary
baseColor) so generic viewers and three@0.149 render a correctly-colored,
lit, animated character out of the box. The drawn face is already correct
(unlit atlas planes).

For the full **soft-toon "vinyl toy"** look, call `applyToonMaterials` with a
host factory that builds your toon material from the recipe in
`companion.data.materialsMeta[region]` (`rampSoftness`, `rimStrength`,
`shadowTint`) + `companion.data.palette` + the region's palette-mask texture
(embedded; index in `materialsMeta[region].maskTextureIndex`). This is
host-optional and expected only on modern-three hosts; the studio's toon
factory (`character-studio/src/core/materials/toonMaterial.ts`) is the
reference implementation.

The masked-pupil eye shader (pupil clipped to the eye-white shape, Wind Waker
style) is likewise a host-optional upgrade; the baked unlit pupil reads
correctly at rest and for modest gaze.

---

## 6. Format notes

- **Container**: glTF 2.0 GLB, assembled with `@gltf-transform`.
- **Compression**: `EXT_meshopt_compression` (lossless byte-level; no
  quantization pre-pass, so positions/rotations round-trip exactly).
- **Textures**: PNG in-GLB. KTX2/UASTC is the documented future optimization;
  it was deferred because (a) the face atlas is the most quality-sensitive
  texture and UASTC blocks show on 1-px linework (plan STOP condition allows
  PNG for faces), (b) the in-browser export path must match the CLI, and
  (c) assets are tiny so the 8 MB budget is met without transcoding. The
  runtime never assumes PNG, so a KTX2 upgrade needs no runtime change (only a
  KTX2 transcoder added to your `GLTFLoader`).
- **Bone names**: three's `GLTFLoader` strips dots from node names
  (`earL.1` → `earL1`). The GLB keeps canonical dotted names; `SEN_companion`
  addresses bones by **glTF node index** (`boneNodeIndices`), which is stable
  across that renaming. The runtime resolves indices via
  `gltf.parser.associations`. You do not need to think about this.
- **Face UVs**: each face plane samples one 4×4 atlas cell via
  `KHR_texture_transform` (`offset = (col·¼, 1 − row·¼)`, `scale = (¼, −¼)` —
  the negative V compensates for the studio's `flipY` authoring). The runtime
  switches cells by rewriting `texture.offset`.

---

## 7. Versioning — `SEN_companion.extVersion`

- Current: **`extVersion: 1`**.
- The runtime **rejects an unknown `extVersion` with a clear error** (never
  silently mis-parses). If you see it, re-export the character with a matching
  studio build or upgrade the runtime.
- Compatibility rule: **additive changes only within a version**; a breaking
  shape change bumps `extVersion` and the runtime must support version `N` and
  `N−1`. Treat a shipped roster's GLBs as immutable against their `extVersion`.

---

## 8. Server-side re-export (future)

`compileCharacter(spec, assets)` is pure TS with injected assets and **no DOM**
— it runs in node today (the CLI proves it) and can run server-side to
re-compile an edited spec (e.g. student customization) without the studio UI.
Keep it DOM-free.
