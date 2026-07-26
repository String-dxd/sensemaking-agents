# Plan 070: Fix the load-sensitive `islandSpecCore` timeout flake

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat 3f797d5e..HEAD -- test/engine/islandSpecCore.test.ts vitest.config.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1 (CI credibility)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `3f797d5e`, 2026-07-26

## Why this matters

`test/engine/islandSpecCore.test.ts > snapToLand > never lands on a
pre-occupied cell` intermittently exceeds vitest's default 5000 ms timeout.
**Four independent executors hit it** during the 2026-07-25 suite, and the
best characterisation (from plan 043's executor) is unambiguous: it correlates
with machine load, not with content. Every failing run took 18.7–23.0 s of
total suite wall-clock; every passing run took ~10–12 s. Run alone it passes in
1.3–3.1 s. The file references no date or timezone API, so it is not
timezone-related.

This now matters more than it did yesterday. Plan 043 added a CI workflow that
runs `pnpm test` on every push and PR, and a shared GitHub runner is materially
slower than the maintainer's laptop — so this is the single likeliest source of
a red CI run. A brand-new gate that fails intermittently on a test unrelated to
the change under review is how teams learn to ignore gates.

## Current state

The test, `test/engine/islandSpecCore.test.ts:721-742` (verbatim, abridged in
the middle only where noted):

```ts
  it('never lands on a pre-occupied cell (spec decorative objects / character)', () => {
    const occupied = occupiedCellsFromSpec(committedSpec)
    const preSeeded = new Set(occupied)
    // committed spec has 17 objects — all their cells are pre-claimed
    expect(preSeeded.size).toBeGreaterThan(0)
    const snapped = snapPositionToLand(
      {
        worldSize: committedSpec.worldSize,
        cols: committedSpec.grid.cols,
        rows: committedSpec.grid.rows,
        // land = above sea level (coarse validity for the test)
        isValid: (x, z) => evaluateHeight(committedSpec, x, z) > committedSpec.seaLevel + 0.02,
      },
      occupied,
      -20,
      0.5, // far off-world, west of the island
    )
    expect(snapped).not.toBeNull()
    if (!snapped) return
    const { c, r } = worldToCell(committedSpec.worldSize, committedSpec.grid, snapped.x, snapped.z)
    expect(preSeeded.has(cellIndex(committedSpec.grid, c, r))).toBe(false)
  })
```

> **CORRECTION (2026-07-26, after execution round 1).** The original version of
> this plan claimed the cost was *redundant* — that the search "revisits the
> same grid cells repeatedly" and could be memoized. **That was wrong, and the
> memoization step has been removed.** `snapToLand.ts:78-93` ring-searches
> Chebyshev rings with a `Math.max(Math.abs(dc), Math.abs(dr)) !== radius`
> guard, so rings are disjoint and each cell is visited **at most once**. The
> executor measured it: **896 predicate calls, 896 distinct cells, 0 cache
> hits** — a memo is provably a no-op, and so is the exact-coordinate fallback,
> since cell-keying is strictly coarser. The cost is **inherent**, not
> redundant. What survives is the per-test timeout, and the measurement below
> justifies it.
>
> Measured under 10 busy spinners on a 10-core machine, across three full-suite
> runs: **4364 / 4614 / 5472 ms**. The worst of those **exceeds vitest's 5000 ms
> default outright** — that run would have gone red without this fix. This is
> the flake caught in the act, not inferred. 20 s leaves ~3.7× headroom over the
> observed worst case.

Why it is slow, and why the cost is **not** avoidable by caching:

- It starts at `x = -20`, deliberately far off-world, and `snapPositionToLand`
  searches outward from there until it finds a valid unoccupied cell. That is a
  large number of candidate positions by design — the test exists to prove a
  distant snap still avoids occupied cells.
- For **each** candidate it calls `evaluateHeight(committedSpec, x, z)`.
  `committedSpec` is the real committed island: a **128×128** grid, and
  `evaluateHeight` runs the tier-field sampler whose kernel is a 4-pass blur
  with bicubic B-spline interpolation (`BLUR_PASSES = 4`, `BLUR_MIX = 0.85`,
  set by plan 032). That is an expensive call, invoked many times.
- `evaluateHeight` is pure, but that does not help here: the
  search visits each cell **at most once** — `snapToLand.ts` walks disjoint
  Chebyshev rings. The cost is therefore **inherent, not redundant**, and
  caching the predicate was measured to be a no-op (896 calls, 0 hits).

Neither `vitest.config.ts` nor the test file sets a custom timeout today, so
the default 5000 ms applies. `vitest.config.ts` does pin
`env: { TZ: 'America/New_York' }` (plan 043) — leave that alone.

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`;
conventional commits. Baseline on `3f797d5e`: `pnpm check` exit 0 with **18
warnings**; `pnpm test` **1097 passed / 40 skipped / 0 failed**.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Route tree | `pnpm build` | exit 0, ~5 s (see Environment) |
| Check | `pnpm check` | exit 0, 18 warnings |
| This file | `pnpm exec vitest run test/engine/islandSpecCore.test.ts` | all pass; note the reported duration |
| All tests | `pnpm test` | 1097 passed / 40 skipped / 0 failed |

## Environment

Run `pnpm install` first. `src/routeTree.gen.ts` is gitignored and generated
only by the `tanstackStart()` vite plugin, so run `pnpm build` once or `tsc`
fails with `TS2307: Cannot find module '~/routeTree.gen'`. Neither is a
deviation. **Do not use `git stash`** — these worktrees share one `.git` and
the stash stack is repo-global.

## Scope

**In scope** (the only file you should modify):
- `test/engine/islandSpecCore.test.ts`

**Out of scope** (do NOT touch):
- `vitest.config.ts` — in particular do **not** raise the global
  `testTimeout`. Hiding a slow test behind a suite-wide timeout bump degrades
  every other test's failure signal. Also leave the `TZ` pin alone.
- `src/engine/student-space/Game/State/islandSpecCore/**` — the production
  sampler, `snapPositionToLand`, `evaluateHeight`, `BLUR_PASSES`, `BLUR_MIX`.
  This is a test-performance fix, not a product change. If you believe the
  production code must change, that is a STOP condition.
- Any assertion in the test. The four `expect(...)` calls must survive
  **byte-identical**, including `preSeeded.size` being `> 0` and the final
  `.toBe(false)`.
- The `-20` / `0.5` start coordinates. Moving the start closer to the island
  would make the test faster by making it test less — that is the one
  "optimisation" this plan forbids outright.
- Every other test in the file.

## Git workflow

- Branch: `advisor/070-fix-islandspeccore-timeout-flake`
- Commit: `test(engine): give the island snap test headroom over its measured ~5.5 s worst case`
- Do NOT push or open a PR.

## Steps

### Step 1: Measure the current cost

Run the file alone three times and record each reported duration for this
single test, plus how many times the predicate is invoked. To count
invocations, temporarily wrap the `isValid` closure in a counter and
`console.log` it — then remove the instrumentation before Step 2.

**Verify**: you can state a before-number for both duration and invocation
count in your report. If the test does **not** take a meaningful fraction of a
second alone, STOP and report — the flake may have a different cause than this
plan assumes.

### Step 2: Add a headroom timeout for this one test

This test does real work, and CI runners are slower. Give this single test an
explicit timeout of 20000 ms as a second line of defence:

```ts
  it('never lands on a pre-occupied cell (spec decorative objects / character)', () => {
    // …
  }, 20_000)
```

Add a short comment saying why: the outward snap from `x=-20` is inherently
many predicate calls, and this test has historically timed out under full-suite
CPU contention. Only this test gets the override.

**Verify**: `grep -c '20_000\|20000' test/engine/islandSpecCore.test.ts` → `1`.
**Verify**: `grep -n 'testTimeout' vitest.config.ts` → no matches (the global
default is untouched).

### Step 3: Prove it under contention

The bug only appears under load, so a quiet green run proves little. Reproduce
contention and show the test survives it: run the **full** suite with parallel
CPU pressure, e.g. start several busy background processes (`node -e 'while(1){}'`
× the number of cores, or `yes > /dev/null` × N), run `pnpm test`, then kill
them. Do this **three** times.

**Verify**: all three loaded runs report `0 failed`, and record each run's total
duration so the reviewer can see the load actually bit (durations should be
well above the ~10 s quiet baseline). If any run still fails on this test, STOP
and report the observed duration — the timeout may need to be higher, and that
is a decision for the reviewer.

### Step 4: Full gate

**Verify**: `pnpm check` → exit 0, 18 warnings.
**Verify**: `pnpm test` → 1097 passed / 40 skipped / 0 failed.
**Verify**: `git status` → only `test/engine/islandSpecCore.test.ts` modified.

## Done criteria

ALL must hold:

- [ ] `pnpm check` exits 0 with 18 warnings
- [ ] `pnpm test` → 1097 passed / 40 skipped / 0 failed
- [ ] Three full-suite runs **under deliberate CPU load** all report 0 failed,
      with durations recorded
- [ ] `grep -n 'testTimeout' vitest.config.ts` → no matches
- [ ] `git diff --stat` shows exactly one file changed
- [ ] The four `expect(...)` assertions in the test are unchanged, and the
      `-20` / `0.5` start coordinates are unchanged
- [ ] Before/after duration and predicate-invocation numbers are in the report

## STOP conditions

Stop and report if:

- The test excerpt does not match "Current state" (drift).
- Run alone, the test is already fast and cheap — the flake then has another
  cause and this plan is aimed at the wrong thing.
- You find yourself wanting to edit `vitest.config.ts`, the production sampler,
  an assertion, or the start coordinates.
- A loaded run still times out at 20 s.

## Maintenance notes

- The timeout is deliberately **test-local**. If `evaluateHeight` ever becomes
  hot in production, the fix belongs in the sampler rather than a global test
  timeout increase.
- Reviewer should scrutinise: assertions byte-identical, start coordinates
  unchanged, global `testTimeout` untouched, and the loaded-run evidence — a
  quiet green run does not demonstrate this flake is fixed.
- If this test times out again on CI despite the 20 s ceiling, the next step is
  not another bump: profile whether `snapPositionToLand`'s search is scanning
  far more cells than it needs to from a distant start, which would be a real
  product finding.
