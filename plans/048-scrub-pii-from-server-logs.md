# Plan 048: Stop writing student verbatim quotes and identity prose to server logs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/server/auto-connector.handler.server.ts src/server/confirm-diff.handler.server.ts src/lib/safety.ts test/server/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

SenseMake is a Singapore school product handling minors' voice reflections.
Two server handlers currently `console.warn` the students' own words — a
truncated `verbatim_quote` of what the student said, and matched substrings
of the student's compiled identity prose — correlated with a stable
`studentId`. On Vercel, `console` output lands in function logs: a retention
and access domain **outside** the Postgres RLS tenancy envelope, not covered
by the forget/redaction paths (`forget-timeline-entry`, share `show_quotes`),
and not deleted when a student forgets an entry. Replacing the content with
counts and IDs keeps the full ops-triage value (which entry, which dimension,
how many drops, which rule fired) while removing the PII. Zero user-facing
impact — this changes log lines only.

## Current state

Files and their roles:

- `src/server/auto-connector.handler.server.ts` — the capture→Connector
  auto-apply chain. Contains **both** offending log sites.
- `src/server/confirm-diff.handler.server.ts` — student confirms a pending
  diff; contains the third offending site (same shape as the second).
- `src/lib/safety.ts` — `checkOutputForDiagnosticLanguage` /
  `checkPersonalityRewriteForDiagnosticLanguage`; produces the
  `safety.matches` array (matched substrings of student identity prose).

Site 1 — `src/server/auto-connector.handler.server.ts:268-273` (the `summary`
value embeds up to 80 chars of each rejected entry's `verbatim_quote`, built
by `summarizeRejection` at `:512-528`):

```ts
        if (err instanceof MemoryWriteError && err.code === 'DIAGNOSTIC_LANGUAGE') {
          // Rejection summary echoing a label means the Connector's draft
          // already contained one — surface it so the verifier triage owner
          // can adjust prompts. Do not block diff staging.
          // eslint-disable-next-line no-console -- ops triage signal
          console.warn(
            '[auto-connector] rejected-diff memory append blocked by diagnostic-language gate; verifier dropped/downgraded contained a label',
            { studentId, mirrorEntryId: mirror.id, summary },
          )
```

Site 2 — `src/server/auto-connector.handler.server.ts:347-353`
(`safety.matches` are matched substrings of `compiled_truth_rewrite`, the
student's identity/values summary prose):

```ts
    const safety = checkCompiledTruthForDimension(dimension, dimDiff.compiled_truth_rewrite)
    if (!safety.ok) {
      // eslint-disable-next-line no-console -- structural log for ops
      console.warn(
        '[auto-connector] compiled_truth_rewrite tripped diagnostic-language guard; ' +
          `skipping vips_pages upsert. student=${studentId} dimension=${dimension} ` +
          `matches=${JSON.stringify(safety.matches)}`,
      )
```

Site 3 — `src/server/confirm-diff.handler.server.ts:173-179` (identical
pattern to site 2):

```ts
      const safety = checkCompiledTruthForDimension(dimension, dimDiff.compiled_truth_rewrite)
      if (!safety.ok) {
        // eslint-disable-next-line no-console -- structural log for ops
        console.warn(
          '[confirm-diff] compiled_truth_rewrite tripped diagnostic-language guard; ' +
            `skipping vips_pages upsert. student=${studentId} dimension=${dimension} ` +
            `matches=${JSON.stringify(safety.matches)}`,
        )
```

**What must NOT change**: the same `summary` string also flows to the
per-student Anthropic memory file via
`appendIfNovel(summary, { source: ... })` a few lines above site 1
(`:258-262`). That write is tenant-scoped and is the *intended* destination
for the quote-bearing text. Only the `console.*` output changes in this plan.

Note on `summarizeRejection` (`auto-connector.handler.server.ts:512-528`): it
returns lines like
`- DROP (no_quote_match) values/…: "<80 chars of the student's words>"`.
The structural facts we still want in the log are derivable from its input:
`mirrorEntryId`, `dropped.length`, `downgraded.length`, and the list of
`reason` strings.

Repo conventions: package manager is **pnpm only**; `pnpm check` = Biome +
`tsc --noEmit`; tests are Vitest in `test/` mirroring `src/`; conventional
commit messages (e.g. `fix(server): …`). Baseline at plan time: `pnpm test`
= 911 passed / 128 skipped / 0 failed; `pnpm check` = 0 errors, 18
pre-existing warnings.

## Commands you will need

| Purpose   | Command                                        | Expected on success                    |
|-----------|------------------------------------------------|----------------------------------------|
| Install   | `pnpm install`                                 | exit 0                                 |
| Check     | `pnpm check`                                   | exit 0 (18 pre-existing warnings OK)   |
| All tests | `pnpm test`                                    | ≥911 passed, 0 failed                  |
| One file  | `pnpm test -- test/server/log-redaction.test.ts` | new tests pass                       |

## Scope

**In scope** (the only files you should modify/create):

- `src/server/auto-connector.handler.server.ts` — sites 1 and 2
- `src/server/confirm-diff.handler.server.ts` — site 3
- `src/lib/log-redaction.ts` (create) — the shared structural-log helper
- `test/server/log-redaction.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- The `appendIfNovel(summary, …)` memory write in
  `auto-connector.handler.server.ts:258-262` — the quote-bearing summary is
  *supposed* to reach the tenant-scoped memory file.
- `src/lib/safety.ts` — the matcher itself is fine; only what we log about
  its result changes.
- `src/agents/run-events.ts` / `agent_traces` persistence — traces are
  DB-side and RLS-scoped; separate concern.
- Any other `console.*` site that logs only error names/messages/IDs (e.g.
  `auto-connector.handler.server.ts:276-280` logs
  `{ name: err.name, message: err.message }` — that is already safe).

## Git workflow

- Branch: `advisor/048-scrub-pii-from-server-logs`
- Conventional commits, e.g.
  `fix(server): log structural facts, not student text, in safety-gate warnings`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared structural-log helper

Create `src/lib/log-redaction.ts` with two small pure functions (DRY: both
handler files will import these instead of hand-building log payloads):

```ts
/**
 * Structural (PII-free) log payloads for ops triage. Student reflection
 * text, identity prose, and quote content must NEVER reach console output
 * — Vercel function logs sit outside the RLS/forget envelope. Log counts,
 * IDs, dimensions, and closed-enum reasons only.
 */

/** For verifier-rejection summaries: counts + reasons, no quote text. */
export function rejectionLogFacts(input: {
  mirrorEntryId: number
  dropped: { reason: string }[]
  downgraded: unknown[]
}): { mirrorEntryId: number; droppedCount: number; downgradedCount: number; reasons: string[] } {
  return {
    mirrorEntryId: input.mirrorEntryId,
    droppedCount: input.dropped.length,
    downgradedCount: input.downgraded.length,
    reasons: [...new Set(input.dropped.map((d) => d.reason))],
  }
}

/** For diagnostic-language guard trips: match count only, never the matched text. */
export function safetyLogFacts(safety: { matches: string[] }): { matchCount: number } {
  return { matchCount: safety.matches.length }
}
```

(Exact field names above are load-bearing for the tests in Step 4; keep them.)

**Verify**: `pnpm check` → exit 0.

### Step 2: Fix site 1 (rejected-diff memory append warning)

In `src/server/auto-connector.handler.server.ts`, change the site-1
`console.warn` to stop passing `summary`. Keep `studentId` and
`mirrorEntryId` (they are opaque IDs, acceptable for ops correlation), and
add the structural facts. The `dropped`/`downgraded` arrays used by
`summarizeRejection` are in scope at that point — pass the same values
through `rejectionLogFacts`:

```ts
console.warn(
  '[auto-connector] rejected-diff memory append blocked by diagnostic-language gate; verifier dropped/downgraded contained a label',
  { studentId, ...rejectionLogFacts({ mirrorEntryId: mirror.id, dropped, downgraded }) },
)
```

(Confirm the local variable names for the dropped/downgraded collections at
that call site — they come from the verifier result destructured earlier in
the function. If they are named differently, adapt, but pass the verifier's
dropped/downgraded arrays, not the summary string.)

**Verify**: `grep -n 'summary' src/server/auto-connector.handler.server.ts`
→ `summary` still appears in the `appendIfNovel` call and in
`summarizeRejection`, but NOT inside any `console.warn` object literal.

### Step 3: Fix sites 2 and 3 (diagnostic-language guard trips)

In both `src/server/auto-connector.handler.server.ts` (site 2) and
`src/server/confirm-diff.handler.server.ts` (site 3), replace
`matches=${JSON.stringify(safety.matches)}` with the count via the helper.
Target shape (both files, same shape — keep each file's `[auto-connector]` /
`[confirm-diff]` prefix):

```ts
console.warn(
  '[auto-connector] compiled_truth_rewrite tripped diagnostic-language guard; ' +
    `skipping vips_pages upsert. student=${studentId} dimension=${dimension} ` +
    `matchCount=${safetyLogFacts(safety).matchCount}`,
)
```

Note (confirm-diff only): site 3 also assigns
`compiled_truth_safety_skip = { dimension, matches: safety.matches }` on the
next line. Read where `compiled_truth_safety_skip` goes before touching it:
if it is returned to the **authenticated student's own client** as part of the
handler result, it stays within the tenant boundary and is out of scope —
leave it. Only the `console.warn` line changes.

**Verify**: `grep -rn 'safety.matches' src/server/*.ts | grep console` → no
matches.

### Step 4: Add the regression guard test

Create `test/server/log-redaction.test.ts` with two parts (use
`// @vitest-environment node` at the top, matching
`test/auth/routes.test.ts`):

1. **Unit tests for the helpers**: `rejectionLogFacts` returns correct
   counts/deduped reasons and — critically — its return value, when
   `JSON.stringify`d, does not contain a marker quote string passed in via
   `dropped[0].entry`; `safetyLogFacts({ matches: ['secret text'] })`
   stringifies without `secret text`.
2. **Source-level guard** (prevents regression at the call sites): read the
   two handler files with `node:fs` `readFileSync`, extract every
   `console.warn(...)` / `console.error(...)` argument span, and assert none
   of them references the identifiers `summary`, `safety.matches`, or
   `verbatim_quote`. A pragmatic implementation: for each file, for each
   line containing `console.`, assert the line plus the following 6 lines
   (the argument span) match none of `/\bsummary\b/`, `/safety\.matches/`,
   `/verbatim_quote/`. Add a comment explaining the guard so a future editor
   understands a failure means "you are logging student text".

**Verify**: `pnpm test -- test/server/log-redaction.test.ts` → all new tests
pass.

### Step 5: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0; tests ≥911 passed,
0 failed (the pre-existing 128 skips are expected).

## Test plan

- New file `test/server/log-redaction.test.ts`:
  - `rejectionLogFacts` happy path (2 dropped with duplicate reasons + 1
    downgraded → `droppedCount: 2`, `downgradedCount: 1`, `reasons` deduped).
  - `safetyLogFacts` returns `{ matchCount: n }` and never the match text.
  - Source guard over both handler files (described in Step 4).
- Existing tests: `test/server/confirm-diff.test.ts` and
  `test/server/auto-connector.test.ts` are `DATABASE_URL`-gated (they skip
  without it) — do not rely on them; the source-level guard is the net here.
- Verification: `pnpm test` → 0 failures, new tests included.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with ≥911 passed and the new log-redaction tests passing
- [ ] `grep -rn 'safety\.matches' src/server/ | grep console\.` → no output
- [ ] In `src/server/auto-connector.handler.server.ts`, no `console.*` call
      references `summary` (check: `grep -n 'console' -A 6 src/server/auto-connector.handler.server.ts | grep -c 'summary'` → 0)
- [ ] `git status` shows only the four in-scope files modified/created
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the live code (drift).
- You find `summary` or `safety.matches` flowing into any *other* sink than
  `console.*` and the tenant-scoped memory write (e.g. an error `message`
  that is later returned in an HTTP 500 body) — that is a bigger leak than
  this plan covers; report it rather than patching it ad hoc.
- The `compiled_truth_safety_skip` value in confirm-diff turns out to be
  persisted somewhere non-tenant-scoped.
- Step 4's source guard cannot be written without false positives after two
  attempts (e.g. the argument-span heuristic keeps matching unrelated code) —
  report with the specific lines that confound it.

## Maintenance notes

- Any **new** `console.*` in `src/server/` or `src/agents/` that logs agent
  output or student-derived text must go through `src/lib/log-redaction.ts`
  helpers (or add equivalent count/ID-only fields). The Step-4 source guard
  only covers the two files it names — when adding a new handler that logs
  verifier/safety results, extend the guard's file list.
- The tenant-scoped memory file (`/rejected-diff-patterns.md` via
  `appendIfNovel`) intentionally still carries 80-char quote excerpts —
  that is the designed triage destination. If retention policy for memory
  stores changes, revisit that too.
- A fuller alternative (structured `logSafe()` wrapper intercepting all
  console use in server code) was deliberately deferred: 3 sites did not
  justify an abstraction. Reconsider if the site count grows.
