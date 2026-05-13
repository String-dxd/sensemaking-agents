# Current State

**Last updated:** 2026-05-13

## Repository Status

- `main` is the integration branch for the shipped product.
- The active product line has moved past the historical v0.1 / quiet-mirror / staged-review plans.
- The current app uses Anthropic Managed Agents for Mirror, Connector, Cartographer, and self-critique; OpenAI remains for transcription.
- Persistence is Postgres/Drizzle with WorkOS-backed counselor/student tenancy and a local demo bypass path.

## Recent PR Status

- PR #1 `feat: VIPS Wiki Pivot` — merged.
- PR #2 `docs: Add Managed Agents migration plan` — merged.
- PR #3 `feat(world-studio): Phase A` — closed as superseded.
- PR #4 `feat(managed-agents): cutover to Anthropic Managed Agents + Postgres + WorkOS` — merged.
- PR #5 `chore(agents): cleanup — remove @openai/agents runtime + flag` — merged.
- PR #6 `feat(world-studio): ship voice-first home surface` — merged.

## Plan Status

- `plans/2026-05-08-001-feat-sensemaking-agents-v0.1-plan.md` — completed historical v0.1 baseline.
- `plans/2026-05-08-002-feat-quiet-mirror-pivot-plan.md` — superseded by VIPS Wiki Pivot, Managed Agents, and World Studio.
- `plans/2026-05-11-001-feat-vips-wiki-pivot-plan.md` — completed by PR #1.
- `plans/2026-05-12-001-feat-managed-agents-migration-plan.md` — superseded by the full migration plan.
- `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md` — completed across PR #4 and PR #5.
- `plans/2026-05-12-002-feat-world-studio-flow-reorder-plan.md` — completed by PR #6.
- `plans/2026-05-12-003-chore-managed-agents-cleanup-plan.md` — completed by PR #5.
- `plans/sensemaking-agents.md` — superseded historical product plan.
- `plans/_archive/voice-wiki.md` — archived historical plan.

## Current Product Shape

- `/reflect` is the current recording surface: audio-only capture, transcribe, Mirror reflection, raw-thought persistence, and automatic Connector run.
- Mirror infers context from the transcript and saves every recorded thought into Library.
- Connector runs automatically after Mirror persistence, verifies proposed VIPS links, and auto-applies verifier-passing links into VIPS pages and timelines.
- Users review raw recorded thoughts only: `/library` defaults to all recorded thoughts, and `/library?filter=need-review` shows thoughts that still need confirm/forget.
- `/reflect/review` is a compatibility redirect to `/library?filter=need-review`.
- `/library` shows VIPS pages first, then the `Run sense-making` Cartographer action, then recorded thoughts.
- Cartographer runs manually from Library and writes `/library/trajectory`.
- The profile dropdown owns sign-in, demo account, and sign-out actions.
- The agent debug drawer is developer-only (`import.meta.env.DEV`) and shows current-tab Mirror, Connector, and Cartographer run state.
