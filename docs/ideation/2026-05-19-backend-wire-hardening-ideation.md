# Backend Wire Hardening Ideation

Date: 2026-05-19
Mode: ce-ideate, repo-grounded from a live Computer Use end-to-end pass
Scope: Student Space app flows, backend bridge, managed-agent runs, persistence, memory, and growth APIs.

## Grounding

The live pass used the demo student at `http://127.0.0.1:3000/` with `DEV_BYPASS_AUTH=demo-a`.

What worked:

- The app shell loaded and navigated through Capture, History, Growth, Profile, and Path Finder.
- Mirror accepted a reflection, generated a response, and logged a new mirror entry.
- Profile loaded seeded Values and Skills state.
- Cartographer completed from the Path Finder flow and persisted a new trajectory.
- `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check` passed.

What looked brittle or broken:

- Growth opened to a blank panel because `/api/growth/island-state-at?year=2026` returned 500. The server error was `relation "vips_island_snapshots" does not exist`, even though migration `src/db/migrations/0002_friendly_gorgon.sql` defines the table.
- `/api/growth/summary` worked for 2025 and 2026, so the failure is localized to historical island state loading rather than the whole Growth surface.
- Mirror self-critique logged a non-JSON output failure even though the first characters showed a fenced JSON block. The agent result path appears too fragile around wrapper text, chunking, or malformed fences.
- Mirror and Cartographer memory appends failed and continued. That may be acceptable for availability, but it silently weakens the longitudinal memory promise.
- Cartographer persisted a trajectory while its self-critique warned about a diagnostic-looking label, `personality.neuroticism`, and unverifiable evidence mapping. The current post-process validator is narrower than the critique's safety and taxonomy concerns.
- Confirming a pending reflection from the day detail view did not visibly persist in the live pass. `/dev/pipeline` still showed the new mirror entry as `pending`. This needs an instrumented retest, but the UI also lacked clear failure feedback.
- The post-log island progression picker left a stale `1/2` progress marker after choosing Skill -> Analytical.
- Share was not exercised because it creates a share link as a side effect.

## Ideas

### 1. Runtime Contract Smoke Matrix

Create one script or Playwright suite that runs against a live dev server and verifies the actual route-to-database-to-agent contracts.

Minimum matrix:

- Schema preflight: required tables and columns exist for the active route set, especially `vips_island_snapshots`.
- Capture flow: submit a reflection, receive a Mirror response, log it, and verify the row exists.
- Review flow: confirm the logged reflection from the UI and verify the database status changed.
- Connector flow: verify confirmed, unconnected entries are visible to `/api/run-connector`, then verify connector output links back to the source mirror.
- Cartographer flow: run trajectory sense-making and verify a trajectory row, warnings, and source evidence metadata.
- Growth flow: verify `summary` and `island-state-at` both return typed responses for years with and without snapshots.
- Degraded dependencies: force or simulate memory/eval failure and verify structured degraded status rather than a silent success.

Why it survives critique: this is the shortest path from "quality gates pass" to "the product contracts work." Unit tests and TypeScript did not catch the missing table or UI review round-trip.

### 2. Growth Degradation Boundary

Make `island-state-at` resilient to migration drift and empty historical state.

Approach:

- At startup or route entry, detect missing snapshot table and return a typed degraded response such as `schema_missing` instead of a generic 500.
- In normal operation, fall back to reconstructing from timeline state when snapshots are missing.
- In the UI, render a deliberate empty or reconstructed state rather than a blank Growth panel.
- Add a migration drift check to CI and the runtime smoke matrix.

Why it survives critique: Growth is user-visible and currently fails hard on one missing table. A fallback also protects fresh demo databases and partial local setups.

### 3. Review Pipeline Round-Trip Hardening

Treat reflection review as a critical backend wire, not just a local UI state update.

Approach:

- Add an integration test for DayDetailCard confirm/forget actions that asserts server persistence before the UI mutates local state.
- Surface update failures with a visible inline error or toast.
- Refresh the day snapshot after mutation and reconcile with the returned row.
- Enable Run Connector only from server-confirmed state, not merely optimistic local state.

Why it survives critique: the live pass suggested Confirm did not persist. Even if the click target was the culprit, the app gave no operator-grade feedback.

### 4. Best-Effort Dependency Ledger

Keep the product available when memory or self-critique fails, but make those failures durable and visible.

Approach:

- Record memory append failures, eval parse failures, and retry exhaustion in an `agent_run_events` or similar table.
- Show degraded run badges in `/dev/pipeline` and the Agent Debug Panel.
- Add retry and dead-letter state for memory writes.
- Include dependency health in the runtime smoke matrix.

Why it survives critique: "continue on failure" is good availability, but without a ledger it becomes hidden product decay.

### 5. Agent Output Quarantine Before Persistence

Broaden persistence validation beyond schema shape.

Approach:

- Convert high-severity self-critique findings into blocking or review-required states.
- Add canonical student-facing label validation for Cartographer claims, including a denylist or mapping for diagnostic labels.
- Validate evidence references against the exact supplied source context before persistence.
- Persist rejected candidates as debug artifacts so agent behavior remains inspectable.

Why it survives critique: the current validator catches some structural issues, but the self-critique identified quality and safety problems that still reached persistence.

### 6. Memory Store Fallback Projection

Do not let remote memory store failures erase product continuity.

Approach:

- Persist a local memory projection for every reflection, connector output, and trajectory summary.
- Queue remote memory appends from the local projection with retry state.
- Let future managed-agent context read from the local projection when remote memory is unavailable.
- Add a backfill command for replaying failed appends.

Why it survives critique: local persistence already exists. The missing piece is making memory compounding robust when the external store flakes.

### 7. Latency and Timeout Contracts

Give long agent runs explicit boundaries.

Approach:

- Add route-level timeout metadata and user-visible delayed states for Mirror, Connector, and Cartographer.
- Stream or poll progress events where practical.
- Distinguish "running", "degraded", "retrying", and "failed" in the UI.
- Include elapsed time and dependency stage in dev tooling.

Why it survives critique: Mirror and Cartographer can take tens of seconds. Vague loading states make it hard to tell slow success from broken wiring.

## Rejected Or Deferred Ideas

- "Just run migrations manually before testing." This treats the symptom and will keep failing in fresh or drifted environments.
- "Make every self-critique warning a hard gate." Too blunt. Low-risk writing-quality warnings should not block persistence, but taxonomy, evidence, and safety warnings should.
- "Move agent work to background jobs only." Useful later, but it does not by itself solve missing schemas, hidden dependency failure, or weak validation.
- "Ignore memory failures because they are best effort." That undercuts the core longitudinal product promise.

## Recommended Sequence

1. Add schema preflight plus a Growth fallback for missing or empty island snapshots.
2. Add the runtime contract smoke matrix for capture -> log -> confirm -> connector -> cartographer -> growth.
3. Add visible review mutation errors and server-confirmed state reconciliation.
4. Add an agent dependency ledger for memory and self-critique failures.
5. Tighten Cartographer quarantine rules for taxonomy, student-facing labels, and evidence mapping.
6. Add local memory projection and remote append replay.
7. Improve latency and timeout states once the hard contracts are observable.

## First Implementation Slice

The best first slice is intentionally small:

- Add a startup or test-only schema contract check for `vips_island_snapshots`.
- Change `island-state-at` to return a typed degraded or reconstructed response instead of 500 when snapshots are unavailable.
- Add one browser-backed contract test for logging a reflection and confirming it from History.
- Add UI error feedback for failed review mutations.

That slice directly addresses the live breakages while creating the testing surface needed for the rest of the hardening work.
