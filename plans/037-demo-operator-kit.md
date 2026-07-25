# Plan 037: Demo operator kit — accurate runbook, `.env.example`, one-command reset, port override

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- README.md package.json vite.config.ts src/components/student-space/sheets/SettingsSheet.tsx test/components/student-space/sheets/settings-sheet.test.tsx`
> (`src/db/seed.ts` is read-only context for the demo:reset scripts — if it
> changed, re-verify the `SEED_REPLACE_EXISTING` flag still exists before
> wiring the scripts, but it is NOT in scope to edit.)
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx | docs
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

This app is demoed live, repeatedly, by an operator who preps under time
pressure. Today the only demo documentation (README "Demo Flow") points at
routes that were deleted months ago (`/library`, `/reflect`), there is no
`.env.example` (the env vars exist only as prose in the README), re-running
`pnpm seed` after a demo silently does nothing (per-student idempotency skips
populated students), and the dev server pins port 3000 — a port another local
app is known to squat, which makes Vite silently drift to a different port and
break the WorkOS redirect pinned to 3000. This plan makes demo prep boring:
accurate runbook, copyable env template, one-command reset to the pristine
seeded state, and an explicit port override.

## Current state

Relevant files:

- `README.md` — the only operator doc; "Current product shape" (lines 5–13)
  and "Demo Flow" (lines 155–164) are stale.
- `package.json` — scripts block (lines 6–34); has `db:migrate` and `seed`
  but no combined bootstrap/reset script.
- `vite.config.ts` — 17 lines; hardcodes `server: { port: 3000 }` (line 9).
- `src/db/seed.ts` — seeding entrypoint; per-student idempotent
  (lines ~165–176), reset gated by `SEED_REPLACE_EXISTING` (line 151).
- `src/components/student-space/sheets/SettingsSheet.tsx` — "Restart
  onboarding" handler swallows errors (lines 42–57).
- `.env.example` — does not exist (to be created). `.env` is gitignored and
  must stay that way.

Stale README excerpts (what you are replacing) — `README.md:10-12`:

```
- `/library` is the main review surface. By default it shows all recorded thoughts and VIPS pages; the `Need review` filter shows raw mirror thoughts that still need confirm/forget.
- Cartographer runs manually from `/library` and generates the Trajectory page.
- `/reflect` redirects to `/`; `/reflect/review` redirects into `/library?filter=need-review`.
```

and `README.md:161-163` (Demo Flow steps 6–7):

```
6. Review raw thoughts at `/library?filter=need-review`.
7. Open `/library` to run Connector, inspect VIPS pages, and run Cartographer for Trajectory.
```

**Ground truth about the current app** (verified 2026-07-23; re-verify against
`src/routes/` while writing):

- Real routes (`src/routes/`): `/` (world), `/history` + `/history/$tab`,
  `/profile` + `/profile/$tab`, `/trajectory`, `/letters`, `/settings`,
  `/onboarding`, `/mirror/$id`, `/share/$token`, and the dev-only
  `/dev/pipeline` + `/dev/design`. There is **no** `/library` and **no**
  `/reflect`.
- **Cartographer** is triggered by the "Run sense-making" button in the
  Trajectory sheet — `src/components/student-space/sheets/TrajectorySheet.tsx:164-167`
  calls `state.backend.runTrajectory()`; the button renders only when
  `needsBearings(renderStatus)` (line 197).
- **Connector** has *no* product-surface button. The only UI trigger is the
  dev pipeline page `/dev/pipeline`
  (`src/routes/_dev.dev.pipeline.tsx:349-352` and `:622` — button calling
  `runConnector({ data: { limit: 5 } })`). In production that page requires
  `ENABLE_DEV_PIPELINE=1` (`src/server/load-pipeline-trace.handler.server.ts:39`).
  There is also a scheduled evening pass (18:00 Singapore, `CRON_SECRET`-gated;
  see `vercel.json` / `api/`). The runbook must describe reality: reflections
  land in History immediately; VIPS/profile updates happen when Connector runs
  from `/dev/pipeline` or on the schedule.
- Review actions (confirm/forget a reflection) live in the History sheet's
  right-hand mirror detail pane (`src/components/student-space/sheets/MirrorDetailSheet.tsx`),
  reached by clicking a reflection card in `/history`.
- Demo sign-in: the login screen's "Use a demo account" posts to
  `/api/auth/sign-in?demo=1` (`src/routes/api/auth/sign-in.tsx:46-68`), which
  sets the `sensemaking-demo-student` cookie for `demo-a` (Alice).

Seed idempotency — `src/db/seed.ts:151` and `:169-176`:

```ts
const replaceExisting = isTruthy(process.env.SEED_REPLACE_EXISTING)
...
if ((existing.rows[0]?.c ?? 0) > 0) {
  if (!replaceExisting) {
    return { skipped: true, replaced: false, inserted: 0, ... }
  }
  await resetSeedStudent(ctx.db, student.student_id)
}
```

Port pin — `vite.config.ts:8-9`:

```ts
export default defineConfig({
  server: { port: 3000 },
```

Restart-onboarding error swallowing — `SettingsSheet.tsx:42-57`:

```tsx
const handleRestart = () => {
  try {
    ...
    state?.onboarding?.reset?.()
    state?.persistence?.flush?.()
  } catch {
    // best-effort wipe; reload still picks up the hash
  }
  if (typeof window !== 'undefined') {
    window.location.assign('/onboarding')
  }
}
```

(Context so you don't over-engineer: the engine's `Persistence` registers its
own `beforeunload` flush — `src/engine/student-space/Game/State/Persistence.js:114-117`,
synchronous `flush()` at ~line 336 — so the navigation itself drains pending
writes. The fix here is only to stop *silently* swallowing errors.)

Environment variables actually read by the codebase (from
`grep -rhoE "process\.env\.[A-Z_]+" src/ scripts/ api/ | sort -u`):
`ANTHROPIC_API_KEY`, `CRON_SECRET`, `DATABASE_POOL_MAX`, `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `DEV_BYPASS_AUTH`, `ENABLE_DEV_PIPELINE`,
`MANAGED_AGENT_ENV_ID`, `MANAGED_AGENT_SELF_CRITIQUE_ID`, `NODE_ENV`,
`OPENAI_API_KEY`, `OPENAI_REALTIME_MIRROR_MODEL`, `SEED_REPLACE_EXISTING`,
`SEED_STUDENT_IDS`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`.
The README block (lines 105–124) additionally names `MANAGED_AGENT_CONNECTOR_ID`,
`MANAGED_AGENT_CARTOGRAPHER_ID`, `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` — these
are read by the WorkOS SDK / managed-agent provisioning indirectly; keep them
in the example. Grep again yourself before finalizing the list.

Repo conventions: package manager is **pnpm only**; conventional-commit
messages (see `git log --oneline -10`, e.g.
`chore(copy): rename Ms Tan to Mr. Tan across letters seed...`).

## Commands you will need

| Purpose   | Command            | Expected on success        |
|-----------|--------------------|----------------------------|
| Install   | `pnpm install`     | exit 0                     |
| Gates     | `pnpm check`       | exit 0 (18 lint warnings OK, 0 errors) |
| Tests     | `pnpm test`        | see note                   |
| Dev server| `pnpm dev`         | Vite on port 3000 (or `PORT`) |

Note: at planning time `pnpm test` has 10 known failures in 5 files
(pre-existing, addressed by plan 034). This plan must not change the
pass/fail count — record it before you start and compare after.

## Scope

**In scope** (the only files you should modify):

- `README.md`
- `.env.example` (create)
- `package.json` (scripts block only)
- `vite.config.ts`
- `src/components/student-space/sheets/SettingsSheet.tsx` (step 5 only)
- `test/components/student-space/sheets/settings-sheet.test.tsx` (only if
  step 5 breaks an existing assertion)

**Out of scope** (do NOT touch, even though they look related):

- `src/db/seed.ts` — the reset mechanism already exists; do not change seed
  logic (plan 035 owns seed-data changes).
- Any auth code (`src/auth/`, `src/routes/api/auth/`) — plan 038 owns the
  persona switcher.
- `.env` itself, and never commit real secret values anywhere.
- `docs/` — the README is the operator surface; deeper docs are not this plan.

## Git workflow

- Branch: `advisor/037-demo-operator-kit`
- Conventional commits, one per step (e.g. `docs(readme): rewrite demo runbook
  against current routes`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite the stale README sections

Rewrite `README.md` "Current product shape" (lines 5–13) and "Demo Flow"
(lines 155–164) against the ground truth above. Requirements:

- No reference to `/library`, `/reflect`, `/reflect/review`, or a
  "Need review" filter anywhere in the file
  (`grep -n "library\|/reflect" README.md` afterwards — the only acceptable
  hits are the word "library" in an unrelated sense; aim for zero).
- Demo Flow must cover: start (`pnpm demo:bootstrap` from step 3, `pnpm dev`),
  sign-in via "Use a demo account" (lands as `demo-a`/Alice), voice capture on
  `/`, reviewing the reflection in `/history` (click the card → detail pane
  confirm/forget), running Cartographer via the Trajectory sheet's
  "Run sense-making" button, and the truthful Connector story (dev pipeline
  page or scheduled pass — including `ENABLE_DEV_PIPELINE=1` for production
  builds).
- Add a "Resetting between demos" subsection: `pnpm demo:reset` (step 3) and
  Settings → "Restart onboarding".
- Document the port override from step 4 (`PORT=3100 pnpm dev`) and the note
  that `WORKOS_REDIRECT_URI` must match the chosen origin (demo-bypass flow
  does not need WorkOS).
- Also fix `README.md:53` (step 14 of the handoff flow references
  `/library/trajectory`) and `README.md:189` (layout table says "library").

**Verify**: `grep -c "/library\|/reflect" README.md` → `0`, AND
`grep -ic "library" README.md` → `1` or `0` — the ONLY mention allowed to
survive is line 3's product description "reviewable VIPS library" (a concept,
not a page). Every other current mention (lines 7, 9, 10, 11, 12, 46, 53,
162, 163 at `a9e1364e`) describes a Library page/button that no longer exists
and MUST be rewritten against the real surfaces.

### Step 2: Create `.env.example`

Create `.env.example` at the repo root containing every variable from the
authoritative grep list above plus the four SDK-consumed ones, each with a
placeholder value (`...` or a documented default) and a one-line comment.
Group and annotate:

- `# --- Demo minimum (local demo with auth bypass) ---`:
  `DATABASE_URL`, `OPENAI_API_KEY` (+ `OPENAI_REALTIME_MIRROR_MODEL`, default
  `gpt-realtime-2`), `DEV_BYPASS_AUTH` (commented-out, `demo-a`, marked
  dev-only — production never sets it, per `src/auth/middleware.ts:1-15`).
- `# --- Managed agents (Connector/Cartographer/self-critique) ---`:
  `ANTHROPIC_API_KEY`, `MANAGED_AGENT_ENV_ID`, `MANAGED_AGENT_CONNECTOR_ID`,
  `MANAGED_AGENT_CARTOGRAPHER_ID`, `MANAGED_AGENT_SELF_CRITIQUE_ID`.
- `# --- WorkOS (real sign-in; not needed for demo bypass) ---`:
  `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI`
  (`http://localhost:3000/api/auth/callback`), `WORKOS_COOKIE_PASSWORD`.
- `# --- Optional / ops ---`: `CRON_SECRET`, `ENABLE_DEV_PIPELINE`,
  `DATABASE_POOL_MAX`, `DATABASE_URL_UNPOOLED`, `SEED_REPLACE_EXISTING`,
  `SEED_STUDENT_IDS`, `PORT`.

NO real values — placeholders only. Reference it from the README Setup
section ("copy `.env.example` to `.env`").

**Verify**: `git check-ignore .env` → prints `.env` (still ignored), and
`grep -c "=" .env.example` → ≥ 18. Manually confirm no value in the file
looks like a real credential (all `...` or documented defaults).

### Step 3: Add `demo:bootstrap` and `demo:reset` scripts

In `package.json` scripts, after the `seed` entry, add:

```json
"demo:bootstrap": "pnpm db:migrate && pnpm seed",
"demo:reset": "pnpm db:migrate && SEED_REPLACE_EXISTING=1 pnpm seed",
```

(Plain `VAR=1 cmd` matches this darwin/zsh-first repo; do not add
`cross-env`.)

**Verify**: with a valid `DATABASE_URL` in `.env`, `pnpm demo:reset` → exit 0
and the seed summary logs students as **replaced** (not skipped); run
`pnpm demo:reset` a second time → still exit 0, still replaced. If no local
database is available, verify instead that `pnpm demo:reset` fails with a
database-connection error *after* attempting migration (proves wiring), and
say so in your report.

### Step 4: Make the dev port overridable

Change `vite.config.ts:9` to:

```ts
server: { port: Number(process.env.PORT) || 3000 },
```

**Verify**: `PORT=3100 pnpm dev` → startup banner shows `localhost:3100`
(Ctrl-C after confirming); `pnpm dev` → still `localhost:3000`.

### Step 5: Stop silently swallowing restart-onboarding errors

In `SettingsSheet.tsx` `handleRestart`, change the empty `catch {}` to
`catch (err)` and log
`console.warn('[SettingsSheet] onboarding reset failed; reload will still re-run bootstrap', err)`.
Do NOT restructure the flush/navigation flow (see the Persistence note in
Current state).

**Verify**: `pnpm vitest run test/components/student-space/sheets/settings-sheet.test.tsx`
→ all pass (the existing suite covers the restart flow; update an assertion
only if it explicitly asserted the silent catch).

### Step 6: Full gates

**Verify**: `pnpm check` → exit 0, 0 errors. `pnpm test` → same pass/fail
count as your step-0 baseline (10 pre-existing failures until plan 034 lands).

## Test plan

No new test files. Step 5's behavior stays covered by
`test/components/student-space/sheets/settings-sheet.test.tsx` (restart flow
already asserted there). Steps 1–4 are docs/config verified by the grep/run
checks above.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "/library\|/reflect" README.md` → 0
- [ ] `grep -ic "library" README.md` → ≤1 (only line 3's "reviewable VIPS
      library" concept phrase may remain; all page/button mentions rewritten)
- [ ] `.env.example` exists, ≥18 assignments, placeholders only
- [ ] `package.json` has `demo:bootstrap` and `demo:reset` scripts
- [ ] `PORT=3100 pnpm dev` binds 3100; `pnpm dev` binds 3000
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` pass/fail count unchanged from pre-plan baseline
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The README sections at lines 5–13 / 155–164 no longer match the excerpts
  (someone already rewrote them).
- You cannot determine a route/button's real behavior by reading
  `src/routes/` and the named sheet components — do not guess runbook steps.
- `pnpm demo:reset` errors in a way not clearly attributable to a missing
  local database.
- Step 5 requires changing anything beyond the catch block (e.g. the flush
  call itself fails typecheck) — that's plan-worthy drift, not yours to fix.

## Maintenance notes

- The runbook now describes real routes; any route rename must update README
  (consider a future test asserting README route mentions against
  `SHEET_HREFS` in `src/components/student-space/navigation/nav-items.ts`).
- `.env.example` must be updated whenever a new `process.env.*` read is added;
  the grep in Current state is the audit command.
- Plan 038 (persona switcher) will extend the Settings sheet — coordinate if
  executed concurrently (both touch `SettingsSheet.tsx`).
- Deferred: an in-app "reset demo data" button (server-side reseed) — kept
  out because it needs an authenticated admin-ish surface; the CLI script is
  the 90% solution.
