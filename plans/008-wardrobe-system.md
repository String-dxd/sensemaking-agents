# Plan 008: Wardrobe & accessory system — clothing as a core identity system

> **Executor instructions**: Read `plans/000-architecture-and-strategy.md`
> first (§2.4, §5 sockets, §6 wardrobe field). Follow steps in order, verify
> each, honor STOP conditions, update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 69df998..HEAD -- character-studio/src/core/wardrobe character-studio/src/assets/wardrobe`
> Confirm plans 004–007 landed: spec `wardrobe: WornItem[]` (with `earMode`),
> assembled characters with sockets, spring solver API, clip playback. On
> mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/006, 007 (spec from 004)
- **Category**: direction
- **Recommended executor**: Sonnet 5 (system + UI) with Opus 4.8 preferred if the same executor also authors garment meshes
- **Planned at**: commit `69df998`, 2026-07-02

## Why this matters

The brief: "this is where each character gets a unique identity, so treat
wardrobe as a core system, not an afterthought." Wardrobe items must deform
with the body (skinned garments), coexist with anatomy (the researched AC
hat-with-ears pattern), recolor through the palette system, and *move*
(spring chains on dangling elements) — otherwise dressed characters read as
mannequins.

## Current state

- Sockets on the canonical skeleton: `socket.hat`, `socket.face`,
  `socket.torso` (chest), `socket.back`, `socket.handL/R` (plan 000 §5).
- Spec `wardrobe: WornItem[] = { slot, itemId, paletteOverrides?, earMode? }`,
  `WearSlot = headwear|eyewear|top|bottom|outfit|neck|back|handheldL|handheldR`.
- Assembly (`assemble.ts`, plan 006) mounts anatomy parts; wardrobe extends
  the same pass. Spring API accepts arbitrary `SpringChainDef[]` (plan 003).
- Toon material factory + palette masks (plan 005).
- **Researched patterns to implement** (plan 000 §2.1, §2.2):
  - **Hat-ears (AC:NH)**: headwear items ship with `earMode` support — the
    *item* decides how ears behave: `through` (item has ear holes; body ears
    stay), `under` (ears flattened: scale earL/R.1 to ~0.15), `replace` (item
    includes its own ear geometry; body ears hidden). Never deform base ears
    to fit hats.
  - **Body-hide masks**: skinned tops/bottoms hide the body surface under
    them (prevents poke-through during animation — the standard technique) —
    per-item list of body-mesh material groups or a vertex mask to hide;
    v1: garments are authored slightly inflated + a per-item `hideBodyRegions:
    ('torso'|'hips'|'upperLegs')[]` toggling body submesh visibility (plan 006
    bodies must be exported with material groups for torso/hips/upperLegs —
    if plan 006 didn't, adding groups is an allowed cross-plan fix; note it).
  - **Dangling elements spring**: scarf ends, cap tassels, backpack straps
    carry small bone chains + `springProfile` exactly like anatomy parts.

## Suggested executor toolkit

- **Blender MCP** for garment authoring (author on the plan-006 body,
  transfer skin weights from body → garment, inflate 2–4 mm).

## Commands you will need

| Purpose | Command (from `character-studio/`) | Expected |
|---|---|---|
| Typecheck / tests | `pnpm typecheck` / `pnpm test` | exit 0 / pass |
| Dev | `pnpm dev` | `localhost:5190` |

## Scope

**In scope**:
- `character-studio/src/core/wardrobe/{itemRegistry.ts, dress.ts}` (new)
- `character-studio/src/assets/wardrobe/**` (authored GLBs) + `ASSET-CONTRACT.md` Wardrobe section
- `character-studio/src/studio/panels/WardrobePanel.tsx` (new)
- `character-studio/test/core/wardrobe/**`
- Allowed cross-plan fix: body material groups in plan-006 assets (documented)

**Out of scope**:
- Per-vertex cloth sim (rejected, plan 000 §3 — bone-chain cloth only),
  student shop/inventory concepts, texture-painting UI, export (011).

## Git workflow

- Branch: `advisor/008-wardrobe`. Conventional commits. GLBs ≤ 2 MB each.

## Steps

### Step 1: Item registry + contract (`itemRegistry.ts`)

Typed registry: `{ itemId → { slot, url, attach: 'socket'|'skinned',
socket?: SocketName, earModes?: EarMode[], hideBodyRegions?: Region[],
springChains?: SpringChainDef[], paletteSlots: string[] } }`. Zod-validate at
registry build. Document in `ASSET-CONTRACT.md`: garment authoring rules
(inflation, weight transfer, tri budgets ≤ 3k, palette-mask channels, socket
alignment convention: item origin at socket, +Z forward).

### Step 2: Author the starter wardrobe (Blender)

Minimum viable identity set, all on biped-round (fit biped-slim/bird via
skinning where shared bones allow; per-archetype variants only if broken):
- `headwear`: `cap-baseball` (earModes: under/replace w/ generic ears through
  side holes → author `through` variant holes), `beanie` (under), `strawhat`
  (through)
- `eyewear`: `sunglasses-round`, `glasses-square` (socket.face, rigid)
- `top`: `tee-basic`, `hoodie` (skinned; hoodie gets 2-bone drawstring spring chains)
- `neck`: `scarf` (skinned collar + two 3-bone dangling-end spring chains)
- `back`: `backpack-mini` (socket.back, rigid + 2-bone strap chains)
- `handheldL/R`: `mug` (socket.handL, rigid — proves the slot)

**Verify**: structural asset test (pattern from plan 006 `assets.test.ts`):
registry ↔ files 1:1, budgets, skinned items reference only canonical bones.

### Step 3: Dressing pass (`dress.ts`)

`applyWardrobe(assembled, wornItems, registry, assets)`: mounts rigid items
on sockets; binds skinned garments to the character's skeleton (re-bind
`SkinnedMesh.bind(skeleton, bindMatrix)` — garments authored on the canonical
skeleton bind directly; **boneScales from spec apply automatically** since
bones are shared — verify with a scaled-head + cap case); applies `earMode`;
toggles `hideBodyRegions`; merges item `springChains` into the character's
spring rig (re-create rig after dressing); applies palette with
`paletteOverrides`.

Conflict rules (enforce in `dress.ts`, surface in UI): one item per slot;
`outfit` occupies top+bottom; `headwear` earMode limited to the item's
supported list.

Tests: slot conflicts resolved (last-wins with warning), earMode `under`
scales ear bones and `replace` hides body ear parts, hideBodyRegions toggles
the right submeshes, spring rig contains item chains after dressing, undress
restores everything (ears back, regions visible, chains removed).

### Step 4: Wardrobe panel + the dressed-motion gate

`WardrobePanel.tsx`: slot tabs, item thumbnails, palette-override pickers,
earMode selector when applicable, "undress all". Then the gate (do not skip):
in Play Mode (plan 007), a character wearing cap + hoodie + scarf + backpack
runs, sits, and gestures —
- no body poke-through at any state (fix by inflation/weights, not by hiding more),
- scarf ends and straps trail, overshoot, settle exactly like ears do,
- cap `under` mode: no ear tips clipping through the cap during head shake,
- recolored hoodie keeps crisp palette separation.

**Verify**: all four visually confirmed (or pending-visual reported);
`pnpm typecheck && pnpm test` pass.

## Test plan

`test/core/wardrobe/`: `itemRegistry.test.ts`, `dress.test.ts` (the six step-3
cases), plus asset structural test. ≥ 8 cases. `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck && pnpm test` exit 0
- [ ] ≥ 10 wardrobe items across ≥ 6 slots committed and dressable from the panel
- [ ] Dress → undress round-trip fully restorative (test-enforced)
- [ ] Dangling wardrobe elements are spring-animated in Play Mode
- [ ] Step-4 gate passed or pending-visual reported
- [ ] `plans/README.md` updated

## STOP conditions

- Plan-006 bodies lack material groups AND regenerating them via Blender MCP
  is unavailable — implement `hideBodyRegions` as a no-op with a loud TODO,
  test the rest, mark row `BLOCKED (body regions pending)`.
- Skinned-garment binding produces exploded meshes on non-authored archetypes
  after one debugging pass — restrict those items to their authored archetype
  in the registry (add `archetypes: [...]` field) and report.

## Maintenance notes

- Student customization later = this registry behind a picker; keep
  registry data serializable (no functions in item defs).
- Plan 011 must export worn items merged into the character GLB (skinned to
  the same skeleton — dressing at export time, not runtime, for v1 rosters).
- Reviewer: re-binding math (bindMatrix vs world transforms), spring-rig
  rebuild lifecycle on dress/undress (leaked chains = growing frame cost).
