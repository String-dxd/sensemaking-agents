# Current State

**Last updated:** 2026-05-18

## Repository Status

- `main` is the integration branch for the shipped product.
- The active product line has moved past the historical v0.1 / quiet-mirror / staged-review plans.
- The current app uses Anthropic Managed Agents for Mirror, Connector, Cartographer, and the self-critique eval/safety reviewer; OpenAI remains for transcription.
- Persistence is Postgres/Drizzle with WorkOS-backed counselor/student tenancy and a local demo bypass path.
- The Student Space engine is now the home shell at `/`; durable sense-making data flows through an explicit backend bridge rather than through the engine `StorageAdapter`.

## Recent PR Status

- PR #1 `feat: VIPS Wiki Pivot` — merged.
- PR #2 `docs: Add Managed Agents migration plan` — merged.
- PR #3 `feat(world-studio): Phase A` — closed as superseded.
- PR #4 `feat(managed-agents): cutover to Anthropic Managed Agents + Postgres + WorkOS` — merged.
- PR #5 `chore(agents): cleanup — remove @openai/agents runtime + flag` — merged.
- PR #6 `feat(world-studio): ship voice-first home surface` — merged.
- PR #7 `feat(library): surface mirror sections and eval metadata` — merged.
- PR #8 `feat(world): port Student Space visual assets` — merged.
- PR #10 `feat: Student Space shell + pipeline review fixes` — merged.

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
- `docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md` — completed; backend wiring deferral superseded by the bridge plan below.
- `docs/plans/2026-05-18-002-feat-student-space-backend-bridge-plan.md` — completed in the current branch.

## Current Product Shape

- `/` is the current student-facing surface: `StudentSpaceHost` mounts the Student Space engine and hydrates backend-backed profile, reflection, mood, and trajectory snapshots.
- Student Space Ask captures create local optimistic captures immediately, then submit typed transcripts through the backend bridge to Mirror and `persistMirror`; persisted entries start as pending raw reflections.
- The engine `StorageAdapter` remains local UI/cache persistence. Durable Mirror/VIPS/Cartographer operations use named bridge methods and server functions.
- Connector runs from the shell calendar `Run Connector` action, the existing React review surface, or the scheduled evening pass; it processes confirmed reflections only and auto-applies verifier-passing links into VIPS pages and timelines.
- Users review raw recorded thoughts only: shell calendar day detail and legacy `/library?filter=need-review` expose confirm/forget for pending reflections.
- `/reflect` and `/reflect/review` are compatibility redirects into the Student Space shell or library review flow.
- `/library` redirects to `/?sheet=reflections`; `StudentSpaceHost` opens matching shell surfaces for `?sheet=reflections`, `?sheet=trajectory`, and VIPS dimension sheets.
- Mirror entry detail pages remain available and show verified VIPS timeline links connected to the source reflection.
- Cartographer can run from the shell trajectory sheet or the legacy trajectory surface and writes `/library/trajectory` data.
- The profile dropdown owns sign-in, demo account, and sign-out actions.
- The Cmd-K developer palette is developer-only (`import.meta.env.DEV`) and links UI mode, `/dev/pipeline`, legacy routes, and sign-out.
- `/dev/pipeline` is the backend table view for inspecting mirror entries, proposed diff/audit rows, VIPS timeline entries, and Cartographer output.
