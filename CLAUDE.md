# sensemaking-agents — repo guardrails

This file is loaded as instructions for any agent (Claude Code, Codex, etc.) operating in this repo. Rules here override default behavior; follow them exactly.

For deeper context (architecture, substrate notes, history), see `docs/` and `docs/solutions/`.

---

## Commands

- `pnpm dev` — dev server at `http://localhost:3000`
- `pnpm check` — Biome + `tsc --noEmit` (run before declaring a change done)
- `pnpm test` — Vitest (one-shot); `pnpm test:watch` for the loop
- `pnpm build` — production build
- `pnpm db:migrate` / `pnpm seed` — local DB setup
- `pnpm smoke:mirror` / `pnpm smoke:managed-connector` / `pnpm smoke:managed-cartographer` — agent smoke tests
- `pnpm provision:managed-agents -- --update-existing connector,cartographer` — after editing managed-agent prompts or model defaults

Package manager is **pnpm only**. Do not introduce npm / yarn lockfiles.

---

## Repo conventions

- **Engine is a canonical fork.** `src/engine/student-space/` is the source of truth for the island scene. There is no upstream sync from `wondopamine/student-space` — edit in place.
- **`src/components/world/` was deleted** in the 2026-05-21 cleanup. Don't re-add it; the world lives in the engine.
- **Base UI for behavior, hand-rolled locals for visuals.** Use `@base-ui-components/react` for dialogs, drawers, radio groups, focus traps. Visual primitives in `src/components/ui/*` are hand-written in the shadcn style; do **not** install the `shadcn/ui` package.
- **Tenancy via `withStudent`.** Every DB read/write goes through the `withStudent` envelope (`src/db/*`, server handlers). Bypassing it is a tenancy bug.
- **Agents.** Mirror = OpenAI Realtime (browser WebRTC, server-brokered key). Connector / Cartographer / self_critique = Anthropic Managed Agents. Prompts in `src/agents/*.prompt.md`; binding in `src/agents/config.ts`; transport in `src/agents/runner.ts`. The deterministic verifier (`src/agents/verifier.ts`) is the hard gate before any Connector link is persisted.

---

## Topic guardrails

Read these before touching the relevant area:

- **[Sheet chrome contract](docs/sheet-chrome-contract.md)** — every full-viewport sheet in the engine MUST be built on the shared `SheetChrome` primitive. Required reading before adding or editing any `src/engine/student-space/Game/View/*Sheet.js`.
