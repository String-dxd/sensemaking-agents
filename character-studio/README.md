# Character Studio

An internal tool for authoring animated 3D animal companions: a drawn-face
toon aesthetic with spring-bone secondary motion (ears, tails, and other
appendages that lag, overshoot, and settle). See the plan suite —
`plans/000-architecture-and-strategy.md` and `plans/001-workspace-scaffold.md`
onward — for the full design.

## Isolation

`character-studio/` is a **fully isolated pnpm workspace root**, following
the same pattern as `bird-builder/`: its own `pnpm-workspace.yaml`, its own
`pnpm-lock.yaml`, and its own modern `three` (`^0.185`) + r3f 9 / drei 10
stack — deliberately separate from the product app's pinned `three@0.149`
and from `island-editor`'s `three@0.171`.

It is **not** listed in the root `pnpm-workspace.yaml#packages`, so root
tooling (`biome.json`, `vitest.config.ts`, root `tsconfig.json`) never sees
it, and `pnpm check` / `pnpm test` / `pnpm build` at the repo root are
unaffected. **Never** add `character-studio` to the root workspace, and
never add `three` to any root `overrides` — that would collapse the
deliberate per-package version split.

## Commands

Run from `character-studio/`:

| Command | Purpose |
|---|---|
| `pnpm install` | install (own lockfile) |
| `pnpm dev` | dev server at `http://localhost:5190` |
| `pnpm build` | production build (`dist/`) |
| `pnpm preview` | preview the production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (one-shot) |
| `pnpm test:watch` | Vitest watch mode |

From the repo root, convenience aliases exist:

- `pnpm dev:character-studio`
- `pnpm check:character-studio` (typecheck + test — the studio is **not**
  covered by root `pnpm check` or `pnpm check:all`)

## Port

`5190` (app is `3000`, `island-editor` is `5180`, `bird-builder` has no fixed
port pin in its own script).

## Phase-1 milestone

A placeholder-bodied character in the viewport with a drawn face that blinks,
glances around, and breathes, with ears and tail that lag, overshoot, and
settle when the body moves — a non-technical observer says "it's alive," not
"it's a 3D model."
