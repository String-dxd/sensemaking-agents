# Plan 063: Bump `@anthropic-ai/sdk` (19 minors behind) and patch the `ws` advisory; record the trigger for the deferred `drizzle-orm` bump

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- package.json src/agents/runner.ts src/agents/config.ts src/agents/memory/ docs/followups.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (the Anthropic SDK is the transport for every Claude agent run)
- **Depends on**: none. **Part (c) — the `drizzle-orm` bump — is explicitly
  DEFERRED to after plan 059 and is NOT executed here.**
- **Category**: deps / security
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Two live problems and one recorded trigger.

**(a) A high-severity `ws` advisory is reachable from a production code path.**
`pnpm audit --prod` reports "ws: Memory exhaustion DoS from tiny fragments and
data chunks" for `>=8.0.0 <8.21.0`; the repo pins `ws: ^8.20.0` and resolves a
single `8.20.0` copy shared with the `openai` SDK's WebSocket transport, which
`src/agents/openai-realtime/mirror-runner.ts` uses for every Mirror voice run.
One version bump closes it.

**(b) `@anthropic-ai/sdk` is 19 minors behind** (`^0.95.2` installed, `0.115.0`
current). It is the transport for every Connector / Cartographer /
self-critique run via `client.beta.sessions.*` — a **beta** surface, which is
exactly the kind that moves. And there is a recorded, unexplained bug waiting on
this bump: `docs/followups.md` records that managed-agent token accounting
under-counts inputs by ~300×, traced to `translateSdkEvent` reading `model_usage`
off `span.model_request_end`, with the hypothesis that the field moved to a
nested object. Bumping and then re-reading the current typings closes a real
follow-up instead of just moving a version number.

**(c) `drizzle-orm` 0.36 sits 9 minors behind a high-severity SQL-injection
fix** (improperly escaped SQL identifiers, patched in 0.45.2). The advisor
verified **there is no reachable sink today** — every value in
`src/db/client.ts` and `src/db/queries.ts` is parameter-bound, and the only
`sql.raw` uses are static CHECK-constraint literals in `src/db/schema.ts`. But
the ORM that enforces RLS tenancy sitting behind a security fix is real exposure
for any future dynamic-identifier query. **This plan does not bump it** — it
records the trigger and the exact command, because the bump is unverifiable
until plan 059 restores DB test coverage.

## Current state

### (a) `ws`

`package.json:57` — a direct dependency:

```json
    "ws": "^8.20.0",
```

`pnpm why ws` → **one** resolved copy, shared:

```
ws@8.20.0
├─┬ openai@6.37.0
│ └── sensemaking-agents@0.1.0 (dependencies)
└── sensemaking-agents@0.1.0 (dependencies)

Found 1 version of ws
```

`pnpm audit --prod` reports two `ws` advisories against it:

| Severity | Title | Vulnerable | Patched | Path |
|---|---|---|---|---|
| **high** | ws: Memory exhaustion DoS from tiny fragments and data chunks | `>=8.0.0 <8.21.0` | `>=8.21.0` | `.>openai>ws` |
| moderate | ws: Uninitialized memory disclosure | `>=8.0.0 <8.20.1` | `>=8.20.1` | `.>openai>ws` |

Latest `ws` at planning time: **8.21.1**.

**Reachability (corrected — verify yourself):** nothing in `src/` imports `ws`
directly. It arrives through the OpenAI SDK's Node WebSocket transport:

```
src/agents/openai-realtime/mirror-runner.ts:2
  import { OpenAIRealtimeWS } from 'openai/realtime/ws'
    ← src/server/run-mirror.handler.server.ts:1  (import { runOpenAIRealtimeMirror })
    ← scripts/ablate.ts:41, scripts/managed-agents/smoke-mirror.ts:27
```

So it is a **server-side** WebSocket *client* connecting out to
`api.openai.com`, on the Mirror voice path. The other `openai` import sites
(`src/server/transcribe-mirror.handler.server.ts:1`) use the HTTP surface, and
the realtime brokering route
(`src/server/openai-realtime-mirror-session.handler.server.ts:30`) uses plain
`fetch` against `https://api.openai.com/v1/realtime/calls` — neither goes
through `ws`. Because the copy is shared, a single direct-dependency bump fixes
both paths and no `overrides` entry should be needed. Confirm with `pnpm why ws`
after the bump.

### (b) `@anthropic-ai/sdk`

`package.json:36`:

```json
    "@anthropic-ai/sdk": "^0.95.2",
```

Registry latest at planning time: **0.115.0**.

Blast radius — exactly three importers (`grep -rln '@anthropic-ai/sdk' src/ scripts/ test/`):

- `src/agents/runner.ts` — the transport. `import Anthropic from '@anthropic-ai/sdk'`
  (line 20), client construction at lines 184-201, and the three
  `client.beta.sessions.*` calls at lines 219 (`sessions.create`), 238
  (`sessions.events.send`), 255 (`sessions.events.stream`).
- `src/agents/memory/index.ts`
- `scripts/managed-agents/provision.ts`

`src/agents/config.ts` does **not** import the SDK — it is env-var binding
resolution only. (The prompt-level blast radius includes it because it names the
models and agent ids, but no code change is expected there.)

The SDK boundary is deliberately narrow — `src/agents/runner.ts:13-14`:

```
 *   - The Anthropic SDK boundary is `ManagedAgentTransport`. Tests inject a
 *     fake transport; production wraps a real `Anthropic` client.
```

…which is why the bump is a `S`-sized change if the beta session surface is
stable, and why `test/agents/managed-mirror.test.ts` (fake transport, no
network) keeps passing regardless.

### (b) The recorded follow-up this bump must close

`docs/followups.md:216-248`, item "3. Managed Agents token accounting
under-counts inputs":

```
**Symptom:** `pnpm smoke:managed-connector` reported `tokens: input=9
output=3487 cache_read=0` for a prompt that was 13,060 characters wide
(realistically ~3,000 input tokens).

**Where:** `src/agents/runner.ts` `translateSdkEvent` reads `model_usage`
fields from `span.model_request_end` events.

**Hypothesis:** The Anthropic beta SDK appears to emit
`span.model_request_end` per model call within the session, and only the
final summarization call reports `input_tokens` against a fully cached prefix
— so the prior tokens-on-the-wire are not being summed in our usage counter.
Alternatively, the SDK field name we read (`input_tokens`) may now live on a
nested object the translator doesn't unwrap.

**Impact today:** None for correctness. Token usage is observability data
only; the ablation reports use it for cost sanity checks but Verifier
verdicts are unaffected.

**Risk:** Cost-ceiling alerts and per-run cost estimates will systematically
under-report.
```

The exact read site — `src/agents/runner.ts:324-340` (inside
`translateSdkEvent`, which starts at line 292):

```ts
  if (t === 'span.model_request_end') {
    const u = raw.model_usage as
      | {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
      | undefined
    return {
      type: 'span.model_request_end',
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
      cacheReadInputTokens: u?.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: u?.cache_creation_input_tokens ?? 0,
    }
  }
```

Note the `raw` object arrives already widened to
`{ type?: string } & Record<string, unknown>` — the widening happens at
`src/agents/runner.ts:258-263` with an explanatory comment:

```ts
                // The SDK's typed event union doesn't index by string, but
                // each variant is a plain JSON object at runtime — cast at
                // the boundary so `translateSdkEvent` can read fields by name.
                const source = stream as unknown as AsyncIterable<
                  { type?: string } & Record<string, unknown>
                >
```

**That cast is why the bug is invisible to `tsc`**: the translator reads
`model_usage` off an untyped bag, so a renamed or re-nested field silently
yields `undefined` → `?? 0`. The bump is the moment to read the SDK's *actual*
typing for the `span.model_request_end` event and fix the read against it.

Where the values land — `src/agents/runner.ts:410-414`:

```ts
      } else if (value.type === 'span.model_request_end') {
        usage.inputTokens += value.inputTokens
        usage.outputTokens += value.outputTokens
        usage.cacheReadInputTokens += value.cacheReadInputTokens
        usage.cacheCreationInputTokens += value.cacheCreationInputTokens
```

### (c) `drizzle-orm` — deferred, facts recorded

`package.json:46` → `"drizzle-orm": "^0.36.0"`;
`package.json:75` → `"drizzle-kit": "^0.30.0"`.
Registry latest: `drizzle-orm` **0.45.2**, `drizzle-kit` **0.31.10**.

`pnpm audit --prod`:

| Severity | Title | Vulnerable | Patched | Path |
|---|---|---|---|---|
| **high** | Drizzle ORM has SQL injection via improperly escaped SQL identifiers | `<0.45.2` | `>=0.45.2` | `.>drizzle-orm` |
| | (advisory) | | | `GHSA-gpj5-g38j-94v9` |

Verified absence of a reachable sink: the only `sql.raw` calls in the repo are
six **static literals** in `src/db/schema.ts` (lines 34, 37, 218, 294, 336, 430),
all CHECK-constraint bodies, e.g.:

```ts
const VIPS_DIMENSION_CHECK = sql.raw("dimension IN ('values','interests','personality','skills')")
```

…and every value in `src/db/client.ts` / `src/db/queries.ts` is parameter-bound
— including the tenancy GUC itself (`src/db/client.ts:159-162`):

```ts
    // FIRST statement: bind the tenancy GUC for the duration of this tx.
    // `set_config(_, _, true)` is parameterised SET LOCAL — safe against
    // injection because the value is bound, not interpolated.
    await tx.execute(sql`select set_config('app.student_id', ${studentId}, true)`)
```

### Advisories deliberately NOT in scope

`pnpm audit --prod` reports **18 vulnerabilities (4 low / 6 moderate / 8 high)**
at HEAD. Beyond `ws` and `drizzle-orm`, the highs are all transitive through
the TanStack Start toolchain — `undici` ×3 (via
`@tanstack/react-start > … > cheerio`), `vite`, `js-yaml`, `postcss` — plus
`esbuild` and `@babel/core` at low. Those need a `@tanstack/react-start`
upgrade, which is a framework bump with its own risk profile. **Do not attempt
them here.** Note the count in your report so the residual is visible.

### Repo conventions

pnpm only, **one root lockfile**; `island-editor` is a workspace member.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings**. `pnpm test` = `vitest run`; baseline **911
passed / 128 skipped / 0 failed**. `pnpm vitest run <path>` for one file.
Tests live in `test/` mirroring `src/`. Conventional commits.
Per `CLAUDE.md`: **`@types/three` and `vite` are pinned to ONE version
repo-wide**, and you must **NEVER** add `three` to `overrides` — the
0.149-app / 0.171-editor runtime split is deliberate and an override is
workspace-global, which would collapse it. A `ws` override would be acceptable
in principle (nothing depends on a split `ws`), but see step 2 — it should not
be needed.

Managed-agent smoke scripts (from `package.json:29-32`):
`pnpm smoke:mirror`, `pnpm smoke:managed-connector`,
`pnpm smoke:managed-cartographer`. They need real
`ANTHROPIC_API_KEY` + `MANAGED_AGENT_*` bindings + `DATABASE_URL` in `.env`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Audit (before/after) | `pnpm audit --prod` | `ws` advisories gone after step 2 |
| Why | `pnpm why ws` | one resolved version |
| Bump ws | `pnpm add ws@^8.21.1` | exit 0 |
| Bump SDK | `pnpm add @anthropic-ai/sdk@^<latest>` | exit 0 |
| Check | `pnpm check` | exit 0 (18 warnings OK, 0 errors) |
| All tests | `pnpm test` | ≥911 passed, 0 failed |
| Runner tests | `pnpm vitest run test/agents` | all pass |
| Smoke (needs env) | `pnpm smoke:managed-connector` | JSON diff + a plausible `input=` token count |
| Smoke (needs env) | `pnpm smoke:managed-cartographer` | completes |
| Smoke (needs env) | `pnpm smoke:mirror` | completes |

## Scope

**In scope** (the only files you should modify):

- `package.json` — `ws` and `@anthropic-ai/sdk` versions only
- `pnpm-lock.yaml` (regenerated)
- `src/agents/runner.ts` — the `translateSdkEvent` usage read, and any
  mechanical adaptation the SDK bump requires
- `src/agents/memory/index.ts`, `scripts/managed-agents/provision.ts` — only if
  the SDK bump breaks them
- `docs/followups.md` — delete the token-accounting entry **only if step 5
  actually fixes it**
- `test/agents/managed-mirror.test.ts` — add a usage-summing test if the field
  shape changed

**Out of scope** (do NOT touch, even though they look related):

- **`drizzle-orm` and `drizzle-kit`.** Part (c) is deferred; see step 6. Do not
  bump them in this plan, not even "while I'm in there".
- `undici`, `vite`, `js-yaml`, `postcss`, `esbuild`, `@babel/core` advisories —
  all transitive through `@tanstack/react-start`. A framework bump is its own
  plan.
- `overrides` in `package.json` — see step 2; expected to be unnecessary. Never
  add `three` to it under any circumstances.
- `openai` — the SDK version is fine; only its `ws` peer needed bumping.
- Any change to the `ManagedAgentTransport` interface
  (`src/agents/runner.ts:48-76`) or the `ManagedAgentRunnerEvent` union
  (`:32-46`) beyond what the SDK forces. Plan 065 changes the runner's timeout
  and stop-reason handling in the same file — see maintenance notes for the
  ordering.
- `src/db/**` — untouched by this plan.

## Git workflow

- Branch: `advisor/063-sdk-bumps`
- One commit per part, e.g.
  `fix(deps): bump ws to 8.21.1 to close the fragment-DoS advisory`,
  `chore(deps): bump @anthropic-ai/sdk 0.95 → 0.115`,
  `fix(agents): read model_usage from the current SDK event shape`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline audit

```bash
pnpm audit --prod 2>&1 | tail -3
pnpm why ws
pnpm why drizzle-orm
```

**Verify**: the audit summary line reads `18 vulnerabilities found` /
`Severity: 4 low | 6 moderate | 8 high` (or, if drifted, record the actual
numbers — you need the before/after delta). `pnpm why ws` prints
`Found 1 version of ws`.

### Step 2: Bump `ws` and confirm the advisory clears

```bash
pnpm add ws@^8.21.1
pnpm why ws
pnpm audit --prod 2>&1 | grep -A 2 -i "ws:"
```

If `pnpm why ws` now shows **two** resolved versions (i.e. `openai` pins its own
older copy), and only then, add a targeted override:

```json
  "pnpm": {
    "overrides": {
      "ws": "^8.21.1"
    }
  }
```

**Caution to keep in mind if you do**: `overrides` is **workspace-global** — it
applies to `island-editor` too. That is acceptable for `ws` (nothing in this
repo depends on a split `ws`), but it is the exact mechanism `CLAUDE.md`
forbids for `three`, whose 0.149-app / 0.171-editor split is deliberate. Never
generalize this into a `three` override.

**Verify**: `pnpm why ws` → a single version `>=8.21.0`.
**Verify**: `pnpm audit --prod | grep -c "Package             │ ws"` → `0`
(both `ws` advisories cleared).
**Verify**: `pnpm check && pnpm test` → check exit 0; ≥911 passed, 0 failed.
**Verify**: `pnpm vitest run test/agents/openai-realtime-mirror.test.ts` → all
pass (this is the file that exercises the `openai/realtime/ws` consumer).

### Step 3: Bump `@anthropic-ai/sdk`

```bash
npm view @anthropic-ai/sdk version
pnpm add @anthropic-ai/sdk@^<that-version>
pnpm check
```

**Verify**: `pnpm check` → exit 0. If `tsc` errors appear, they will be in
`src/agents/runner.ts`, `src/agents/memory/index.ts`, or
`scripts/managed-agents/provision.ts`. Fix them mechanically (renamed method,
moved namespace, changed option name). If a *beta session* method disappeared
or changed semantics, that is a STOP condition.
**Verify**: `pnpm vitest run test/agents` → all pass. These tests inject fake
transports and never touch the network, so they should be unaffected — a
failure here means the bump changed a type the runner's own contract depends on.
**Verify**: `pnpm test` → ≥911 passed, 0 failed.
**Verify**: `git diff pnpm-lock.yaml` shows `@anthropic-ai/sdk` changing and no
unrelated version churn.

### Step 4: Read the SDK's real `span.model_request_end` typing

Now that the new version is installed, find the authoritative shape instead of
guessing. The runner's own comment points at where the types live
(`src/agents/runner.ts:17`): "see
node_modules/@anthropic-ai/sdk/.../sessions/events.mjs".

```bash
# Find the event type declarations for the beta sessions stream.
grep -rn "model_request_end" node_modules/@anthropic-ai/sdk/ --include="*.d.ts" | head -20
# Then read the matching interface(s).
grep -rn "model_usage\|input_tokens" node_modules/@anthropic-ai/sdk/ --include="*.d.ts" | head -30
```

Write down the answer to exactly these questions:

1. Is the field still called `model_usage` on the `span.model_request_end`
   event, or has it moved (e.g. under `usage`, or nested as
   `model_usage.usage`)?
2. Are the inner field names still `input_tokens`, `output_tokens`,
   `cache_read_input_tokens`, `cache_creation_input_tokens`?
3. Is there a **session-level** aggregate usage object on
   `client.beta.sessions.retrieve(sessionId)`? The follow-up's fix sketch
   proposes replacing the per-event accumulator with one trailing
   `sessions.retrieve` call — if the aggregate exists and is authoritative,
   that is the more robust fix.

**Verify**: you can name the exact `.d.ts` file and interface that declares the
event, and you have written answers to all three questions. If the typings do
not declare the event at all (i.e. the beta stream is still `unknown`-shaped),
record that and go to step 5's fallback.

### Step 5: Fix the token read

Two acceptable fixes; pick based on step 4's findings.

**Fix A (preferred if the typings declare the shape)** — replace the untyped
`raw.model_usage` read in `src/agents/runner.ts:324-340` with a read against the
SDK's own type. Keep the normalized `ManagedAgentRunnerEvent` variant
(`runner.ts:39-45`) unchanged so nothing downstream moves. Import the SDK event
type rather than re-declaring the inline structural type — that is the whole
point: make `tsc` able to catch the next rename.

**Fix B (if the per-event data is genuinely partial)** — the follow-up's other
hypothesis. Add a trailing aggregate read in `runManagedAgent` after the drain
loop (around `src/agents/runner.ts:445`, after the `finally`), preferring the
session's aggregate usage over the accumulated per-event sum when available.
This needs a new optional method on `ManagedAgentTransport`
(`runner.ts:48-76`) — e.g. `getSessionUsage?(sessionId): Promise<ManagedAgentUsage | null>` —
implemented in `createAnthropicManagedTransport` and left undefined by fake
transports so every existing test keeps working.

Either way, add a test to `test/agents/managed-mirror.test.ts` modeled on its
existing happy-path case (`managed-mirror.test.ts:59-72`, which already asserts
`span.model_request_end` usage summing): drive two
`span.model_request_end` events through the fake transport and assert the
returned `usage` is the **sum**, not the last value. If you took Fix B, also
add a case where `getSessionUsage` returns an aggregate and assert it wins.

**Verify**: `pnpm vitest run test/agents/managed-mirror.test.ts` → all pass,
including the new usage case(s).
**Verify**: `pnpm check` → exit 0.
**Verify** (needs a configured managed-agent env): `pnpm smoke:managed-connector`
→ the printed `tokens: input=…` is now **plausible** for the prompt width (the
follow-up's evidence: a 13,060-character prompt should report roughly 3,000
input tokens, not 9). If it does, delete the token-accounting entry from
`docs/followups.md:216-248` and note the fix in the commit message.
**If the managed-agent env is NOT configured**: you cannot confirm the fix
end-to-end. Leave the `docs/followups.md` entry **in place**, annotate it with
one line — "Reader updated against SDK `<version>` in plan 063; awaiting a live
smoke run to confirm" — and report the plan status as
**DONE-pending-smoke**. Do not delete an entry you could not verify.

### Step 6: Record the deferred `drizzle-orm` trigger — do NOT bump

Do not change `drizzle-orm` or `drizzle-kit` in this plan. Instead, confirm the
trigger conditions are written down where the next executor will see them:

1. In your completion report, state verbatim:

   > **Deferred: `drizzle-orm` 0.36 → 0.45.2 + `drizzle-kit` 0.30 → 0.31.x**
   > (high advisory `GHSA-gpj5-g38j-94v9`, SQL injection via improperly
   > escaped SQL identifiers). No reachable sink at `031d1974`: all values
   > parameter-bound; the six `sql.raw` calls in `src/db/schema.ts` are static
   > CHECK-constraint literals. **Trigger: once plan 059 is DONE**, bump both
   > together (`pnpm add drizzle-orm@^0.45.2 && pnpm add -D drizzle-kit@^0.31`)
   > and verify with `pnpm test:db` plus the RLS suites
   > (`test/db/rls-concurrency.test.ts`, `test/db/island-snapshots-rls.test.ts`).
   > Bumping before 059 means the ORM that enforces RLS tenancy would change
   > with **zero executing DB tests** to catch a regression.

2. Add the same note as a two-line entry to `docs/followups.md` (top of file,
   newest-first per that file's own policy at lines 3-5), so it survives
   outside this plan.

**Verify**: `grep -n 'drizzle' package.json` → still `^0.36.0` and `^0.30.0`
(unchanged).
**Verify**: `grep -n 'GHSA-gpj5-g38j-94v9\|drizzle' docs/followups.md` → the new
entry exists.

### Step 7: Final gate

**Verify**: `pnpm check` → exit 0, 0 errors, ≤18 warnings.
**Verify**: `pnpm test` → ≥911 passed, 0 failed, skip count still 128.
**Verify**: `pnpm audit --prod 2>&1 | tail -3` → high count is **2 lower** than
step 1's baseline (both `ws` advisories cleared: one high, one moderate → so
high −1, moderate −1; record the exact delta).
**Verify**: `pnpm build` → exit 0. (A dependency swap can break bundling while
tests stay green.)
**Verify**: `git status` → only in-scope files modified.

## Test plan

- New test(s) in `test/agents/managed-mirror.test.ts` (step 5): usage summing
  across **two** `span.model_request_end` events; and, under Fix B, an
  aggregate-wins case. Pattern: the existing happy-path test at
  `managed-mirror.test.ts:59-72` and the `makeFakeTransport` helper at `:26-55`.
- No new tests for the `ws` bump — it is a transitive transport with no repo
  surface. `test/agents/openai-realtime-mirror.test.ts` is the existing
  regression net for the consumer.
- Live verification (needs env): `pnpm smoke:managed-connector`,
  `pnpm smoke:managed-cartographer`, `pnpm smoke:mirror`. These are the only
  things that exercise the real SDK. If the env is unconfigured, the plan
  status is **DONE-pending-smoke** and the report must say so explicitly —
  do not claim the token fix is verified.
- Verification: `pnpm check && pnpm test && pnpm build` all green;
  `pnpm audit --prod` shows no `ws` rows.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n '"ws"' package.json` → a range `>=8.21.0`
- [ ] `pnpm why ws` → `Found 1 version of ws`, and it is `>=8.21.0`
- [ ] `pnpm audit --prod | grep -c "Package             │ ws"` → `0`
- [ ] `grep -n '@anthropic-ai/sdk' package.json` → a `0.11x` range
- [ ] `grep -n 'drizzle-orm\|drizzle-kit' package.json` → still `^0.36.0` / `^0.30.0` (unchanged)
- [ ] `grep -n 'model_usage' src/agents/runner.ts` → the read is against an
      imported SDK type, or replaced by the aggregate path (not the inline
      untyped structural cast)
- [ ] `pnpm check` exits 0 with 0 errors
- [ ] `pnpm test` exits 0, ≥911 passed, 0 failed, skip count 128
- [ ] `pnpm build` exits 0
- [ ] `pnpm vitest run test/agents/managed-mirror.test.ts` passes, including the
      new usage-summing test
- [ ] `grep -n 'overrides' package.json` → no `three` entry anywhere
- [ ] `docs/followups.md` contains the deferred-drizzle note; the
      token-accounting entry is deleted **only if** a live smoke run confirmed
      the fix
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (with `DONE-pending-smoke` if the
      managed-agent env was unavailable)

## STOP conditions

Stop and report back (do not improvise) if:

- **A `client.beta.sessions.*` method used at `src/agents/runner.ts:219, 238,
  255` no longer exists or changed semantics.** The beta surface is the whole
  transport for Connector/Cartographer/self-critique; a signature change needs a
  human decision about whether to adapt or pin. Report the old and new
  signatures.
- **`pnpm add @anthropic-ai/sdk@…` produces more than 5 `tsc` errors**, or any
  error outside the three known importers. That means the SDK reorganized more
  than this plan budgeted for.
- **Step 4 cannot determine the `span.model_request_end` shape** because the
  typings still leave the beta stream untyped. Do **not** guess a nested path.
  Report the finding, leave the read as-is, keep the `docs/followups.md` entry,
  and mark the token fix as still-open. The bump itself still lands.
- **`pnpm why ws` shows two resolved versions after step 2 AND an override does
  not collapse them.** Report the tree; do not start pinning `openai`.
- **You are tempted to bump `drizzle-orm`.** Do not. It is deferred on purpose
  and bumping the ORM that enforces RLS tenancy with zero executing DB tests is
  the exact risk plan 059 exists to remove.
- **You are tempted to add `three` to `overrides`** for any reason. Forbidden by
  `CLAUDE.md`; it would collapse the deliberate 0.149/0.171 runtime split.
- A smoke script fails **after** the bump in a way it did not fail before
  (compare against a pre-bump run if the env is configured) — report the error
  rather than adapting the runner to it.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**: (1) the `pnpm-lock.yaml` diff, for
  version churn beyond `ws` and `@anthropic-ai/sdk`; (2) whether the token read
  in `translateSdkEvent` now goes through an **imported SDK type** rather than
  the `Record<string, unknown>` bag — if it still reads an untyped bag, the next
  field rename will be just as invisible, and the fix has not really landed;
  (3) that `docs/followups.md`'s token entry was deleted only with live smoke
  evidence.
- **The structural cause of finding (b)** is `src/agents/runner.ts:258-263`,
  which casts the SDK's typed event union to `Record<string, unknown>` so the
  translator can read fields by name. That cast buys convenience and costs
  every future field rename. A worthwhile follow-up (not this plan): switch
  `translateSdkEvent` to a discriminated `switch` over the SDK's own exported
  event union, keeping the `{ type: 'other' }` fallback for forward
  compatibility. Plan 065 touches the same function's stop-reason branch for a
  related reason — coordinate.
- **Ordering with plan 065**: both plans edit `src/agents/runner.ts`. 065
  changes the timeout/abort handling (lines ~361-445) and the stop-reason
  normalization (lines ~304-313); 063 changes the usage read (lines ~324-340)
  and possibly adds a transport method (lines ~48-76). The hunks do not
  overlap, but land them sequentially rather than in parallel worktrees. If both
  are queued, **063 first** — a fresh SDK is the right base for 065's
  AbortController work.
- **The residual audit surface after this plan**: 6 highs remain, all
  transitive through `@tanstack/react-start` (`undici` ×3, `vite`, `js-yaml`,
  `postcss`) plus `drizzle-orm` until part (c) runs. A `@tanstack/react-start`
  upgrade plan is the natural next step and should be scoped separately —
  `@tanstack/react-router` and `@tanstack/react-start` are both exact-pinned
  (`1.169.2`, `1.167.65`), so that bump is a framework decision, not a
  dependency hygiene chore.
