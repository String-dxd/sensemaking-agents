# Plan 052: Close the verifier's full-match substring holes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- src/agents/verifier.ts src/agents/tools/schemas.ts test/agents/verifier.test.ts test/ablation/score.ts scripts/ablate.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW–MED (tightening a gate can start rejecting legitimate quotes;
  the AE7 calibration tests are the tripwire and must not be re-pinned)
- **Depends on**: none
- **Category**: security / bug
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`src/agents/verifier.ts` is the **hard gate**: a pure function, plain code and
not an LLM, that must stop a fabricated quote before any Connector-proposed
link is persisted to a student's identity timeline. Everything downstream —
the wiki timeline, the counsellor brief, the public share page — treats an
admitted `verbatim_quote` as *something the student actually said*.

The gate has three defects, all in the quote-matching phase, and all verified
against the live code:

1. The R10 **full-match** test is a raw substring check with none of the
   token-boundary logic the partial path already applies. A normalized quote
   of `ate` is admitted **at full strength** from a transcript containing
   `date`. Substring ≠ quotation.
2. `verbatim_quote` is only `z.string().min(1)` and `normalize` strips
   `.,!?;:'"-—`, so a **punctuation-only** quote normalizes to the empty
   string — and `includes('')` is always `true`. A quote carrying zero
   evidence is admitted at the strength the agent asked for.
3. `longestContiguousTokenRatio` boundary-checks only the **first** occurrence
   of a candidate window. A window whose first occurrence lands mid-token
   scores 0 even when a later, properly boundary-aligned occurrence exists —
   so **legitimate** quotes get dropped. This one is a false-negative, not a
   security hole, and fixing it is part of the same change.

The DRY win, which is also the correctness win: extract **one** boundary-check
helper and call it from both the full-match and the partial paths, so the two
can never diverge again.

## Current state

`src/agents/verifier.ts` is 211 lines and pure — no DB, no network. Read the
whole file before editing; the header comment (`:1-24`) is the contract.

**Defect 1 — the raw full-match test, `:143-158`:**

```ts
    // ── phase 1: quote match (R10) ──
    const normQuote = normalize(entry.verbatim_quote)

    let partialMatch = false
    let effectiveStrength = entry.strength

    if (!normTranscript.includes(normQuote)) {
      const quoteTokens = tokenize(normQuote)
      const ratio = longestContiguousTokenRatio(quoteTokens, transcriptTokens)
      if (ratio >= PARTIAL_MATCH_THRESHOLD) {
        partialMatch = true
        effectiveStrength = 'low'
      } else {
        dropped.push({ entry, reason: 'no_quote_match' })
        continue
      }
    }
```

`normTranscript.includes(normQuote)` at `:148` is the hole. The partial path
below it already knows better.

**Defect 2 — normalization can empty a quote, `:56-62`:**

```ts
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:'"\-—]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
```

…and the only schema constraint, `src/agents/tools/schemas.ts:196`:

```ts
  verbatim_quote: z.string().min(1),
```

Confirmed by direct evaluation: `normalize('...')` → `''`, and
`'i had a date with the dentist'.includes('')` → `true`.

**Defect 3 — first-occurrence-only boundary check, `:78-102`:**

```ts
function longestContiguousTokenRatio(quoteTokens: string[], transcriptTokens: string[]): number {
  if (quoteTokens.length === 0) return 0
  const transcriptStr = transcriptTokens.join(' ')
  for (let windowSize = quoteTokens.length; windowSize > 0; windowSize -= 1) {
    for (let start = 0; start + windowSize <= quoteTokens.length; start += 1) {
      const window = quoteTokens.slice(start, start + windowSize).join(' ')
      // Match on token boundaries — `\bword\b` would mishandle the
      // contractions we already stripped via punctuation removal; joining
      // with single spaces and checking includes is safe because both
      // sides have been normalized to single-space-separated tokens.
      if (transcriptStr.includes(window)) {
        // Require the window to start at a token boundary in the
        // transcript: either at index 0 or preceded by a space. Same
        // for the end. This prevents a 3-letter prefix matching a
        // longer transcript token (e.g. 'ate' inside 'date').
        const idx = transcriptStr.indexOf(window)
        const beforeOk = idx === 0 || transcriptStr[idx - 1] === ' '
        const afterIdx = idx + window.length
        const afterOk = afterIdx === transcriptStr.length || transcriptStr[afterIdx] === ' '
        if (beforeOk && afterOk) return windowSize / quoteTokens.length
      }
    }
  }
  return 0
}
```

Note the irony: the comment at `:91-92` names the exact `'ate'`/`'date'` case
that defect 1 lets straight through the full-match path.

**The drop-reason union — `src/agents/tools/schemas.ts:236-241`** (closed enum
so the U8 review surface can render per-reason copy without magic strings):

```ts
export const VerifierDropReasonSchema = z.enum([
  'no_quote_match',
  'unknown_reflection',
  'unknown_canonical_claim_id',
])
export type VerifierDropReason = z.infer<typeof VerifierDropReasonSchema>
```

Consumers of these reason strings, so you know the blast radius of adding a
member (`grep -rn 'no_quote_match' src/ test/`):

- `src/agents/verifier.ts:138,155` — the producer.
- `src/server/auto-connector.handler.server.ts:242` — a comment only.
- `test/agents/verifier.test.ts:68,135,187,391,404` — assertions.
- `test/ablation/score.ts:160-180,273-280` — `VerifierVerdictCounters`, a
  **hardcoded** key list (`dropped_no_quote_match`,
  `dropped_unknown_reflection`, `dropped_unknown_canonical_claim_id`) plus
  `zeroVerdictCounters()` and the totals accumulator.
- `scripts/ablate.ts:341-346` — the reason→counter mapping, an `if/else if`
  chain with no `else`:
  ```ts
  for (const dropped of result.dropped) {
    if (dropped.reason === 'no_quote_match') counters.dropped_no_quote_match += 1
    else if (dropped.reason === 'unknown_reflection') counters.dropped_unknown_reflection += 1
    else if (dropped.reason === 'unknown_canonical_claim_id')
      counters.dropped_unknown_canonical_claim_id += 1
  }
  ```
  A new reason therefore compiles fine but is **silently uncounted** in the
  ablation report. Note that `scripts/` is outside `pnpm check`'s scope
  (`biome check src test && tsc --noEmit`, and tsconfig covers `src` + `test`),
  so nothing will fail — you must add the branch deliberately.
- `test/ablation/sensemake-tools-off.test.ts:69-97` — asserts on those counter
  fields.

**The calibration corpus — `test/agents/verifier.test.ts`, 463 lines.** The
locked pair is at `:36-70`:

```ts
// ── AE7 calibration pair (LOCKED) ─────────────────────────────────────────
describe('AE7 calibration pair (LOCKED) — honest-paraphrase admit, fabricated-quote drop', () => {
  it('AE7: full normalized match → admitted at proposed strength', () => { … })
  it('AE7: fabricated paraphrase ("I really hated being told what to do in class") → dropped with no_quote_match', () => { … })
})
```

Shared fixtures at `:18-34`:

```ts
const baseMirror: VerifierMirrorEntry = {
  id: 101,
  transcript: 'i hated when teacher told us exactly what to do',
  context_type: 'school',
}

function draft(overrides: Partial<ProposedTimelineEntryDraft> = {}): ProposedTimelineEntryDraft {
  return {
    dimension: 'values',
    canonical_claim_id: 'values.independence',
    verbatim_quote: 'i hated when teacher told us exactly what to do',
    reflection_id: 101,
    strength: 'medium',
    parallax_tag: ['school'],
    ...overrides,
  }
}
```

There is also an AE7-adjacent threshold suite (`:139-226`) pinning the 0.8
partial-match boundary at 75% / 80% / 90% overlap. **All of these must still
pass unchanged.**

Repo conventions: pnpm only; `pnpm check` = Biome + `tsc --noEmit`; Vitest in
`test/` mirroring `src/`; conventional commits. Baseline: `pnpm check` exits 0
with 18 pre-existing lint warnings; `pnpm test` = 911 passed / 128 skipped / 0
failed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 pre-existing warnings OK) |
| Verifier tests | `pnpm vitest run test/agents/verifier.test.ts` | all pass, incl. the AE7 pair |
| Ablation scorer | `pnpm vitest run test/ablation/sensemake-tools-off.test.ts` | all pass |
| All tests | `pnpm test` | ≥911 passed, 0 failed |

## Scope

**In scope** (the only files you should modify):

- `src/agents/verifier.ts` — the boundary helper, the three fixes
- `src/agents/tools/schemas.ts` — one new member on `VerifierDropReasonSchema`
- `test/agents/verifier.test.ts` — four new cases (append; do not rewrite)
- `test/ablation/score.ts` — one counter field + one accumulator line
- `scripts/ablate.ts` — one `else if` branch for the new reason

**Out of scope** (do NOT touch, even though they look related):

- The `PARTIAL_MATCH_THRESHOLD = 0.8` constant (`verifier.ts:43`). The
  threshold is a separately calibrated bet; this plan changes *matching
  mechanics*, not the threshold.
- `normalize`'s punctuation class (`:59`). Widening or narrowing it changes
  what counts as a quote across the whole gate.
- Tightening `verbatim_quote` in the Zod schema beyond adding the drop reason
  (e.g. a regex requiring word characters). The verifier — not the schema — is
  the designated gate, and a schema rejection is a hard parse failure that
  loses the per-entry signal the drop reasons exist to carry.
- The parallax cap (phase 2) and structural `reinforces` (phase 3) —
  untouched.
- `src/server/auto-connector.handler.server.ts` — it consumes the verifier
  result and needs no change.
- `src/agents/connector.prompt.md` — prompt-side hardening is **plan 053's**
  scope.

## Git workflow

- Branch: `advisor/052-verifier-full-match-holes`
- Conventional commits, e.g.
  `fix(verifier): require token boundaries on full-match quotes and drop empty-normalized quotes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract one boundary-aware containment helper

In `src/agents/verifier.ts`, add a single module-level helper above
`longestContiguousTokenRatio`. This is the DRY primitive both paths will use —
and it fixes defect 3 by scanning **all** occurrences, not just the first:

```ts
/**
 * Does `needle` appear in `haystack` on token boundaries? Both sides are
 * already `normalize`d to single-space-separated tokens, so a boundary is
 * "start of string, end of string, or a space".
 *
 * Scans EVERY occurrence. Checking only `indexOf`'s first hit (the previous
 * behaviour) scored 0 for a window whose first occurrence sits mid-token even
 * when a later, properly aligned occurrence existed — dropping legitimate
 * quotes. It also let the full-match path admit a bare substring: `ate` from a
 * transcript containing `date`. One helper, both callers, no divergence.
 */
function containsOnTokenBoundary(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    const beforeOk = idx === 0 || haystack[idx - 1] === ' '
    const afterIdx = idx + needle.length
    const afterOk = afterIdx === haystack.length || haystack[afterIdx] === ' '
    if (beforeOk && afterOk) return true
    idx = haystack.indexOf(needle, idx + 1)
  }
  return false
}
```

Then rewrite `longestContiguousTokenRatio`'s inner body to use it, deleting the
inlined `includes` + `indexOf` + boundary block at `:88-98`:

```ts
      const window = quoteTokens.slice(start, start + windowSize).join(' ')
      if (containsOnTokenBoundary(transcriptStr, window)) return windowSize / quoteTokens.length
```

Keep the surrounding loops, the `if (quoteTokens.length === 0) return 0` guard,
and the function's doc comment as-is.

**Verify**: `pnpm check` → exit 0, and
`grep -c 'indexOf' src/agents/verifier.ts` → 1 (only inside
`containsOnTokenBoundary`; note the `while` loop uses it twice, so accept 2 if
your implementation reads `indexOf` in both the initial assignment and the
advance — the point is that no `indexOf` remains in
`longestContiguousTokenRatio`).

### Step 2: Add the empty-normalized-quote drop reason

In `src/agents/tools/schemas.ts`, add one member to
`VerifierDropReasonSchema` (`:236-241`):

```ts
export const VerifierDropReasonSchema = z.enum([
  'no_quote_match',
  'unknown_reflection',
  'unknown_canonical_claim_id',
  'empty_quote',
])
```

Then keep the ablation report honest — the reason buckets are hardcoded in two
places (see "Current state"):

1. `test/ablation/score.ts` — add `dropped_empty_quote: number` to
   `VerifierVerdictCounters` (`:160-168`), initialise it to `0` in
   `zeroVerdictCounters()` (`:170-180`), and add the matching
   `totals.dropped_empty_quote += v.dropped_empty_quote` line to the totals
   accumulator (near `:277-279`).
2. `scripts/ablate.ts` — add one branch to the chain at `:341-346`:
   `else if (dropped.reason === 'empty_quote') counters.dropped_empty_quote += 1`.

Neither would fail a gate if skipped (`scripts/` is outside `pnpm check`, and
the chain has no `else`), which is exactly why they are called out explicitly:
an uncounted drop reason makes the ablation report quietly wrong.

**Verify**: `pnpm check` → exit 0, then
`pnpm vitest run test/ablation/sensemake-tools-off.test.ts` → all pass. Then
`grep -c 'dropped_empty_quote' test/ablation/score.ts scripts/ablate.ts` → ≥3
in `score.ts` and ≥1 in `ablate.ts`.

### Step 3: Fix the quote-match phase

Replace the phase-1 block in `verifyProposedDiff` (`:142-158`) with:

```ts
    // ── phase 1: quote match (R10) ──
    const normQuote = normalize(entry.verbatim_quote)

    // A punctuation-only quote (e.g. "...") survives z.string().min(1) but
    // normalizes to '' — and `includes('')` is always true, which used to
    // admit a zero-evidence entry at the agent's proposed strength. Drop it.
    if (normQuote.length === 0) {
      dropped.push({ entry, reason: 'empty_quote' })
      continue
    }

    let partialMatch = false
    let effectiveStrength = entry.strength

    // Full match must land on token boundaries. A raw `includes` admitted a
    // bare substring at full strength ('ate' from a transcript containing
    // 'date'); the partial path below has always required boundaries, so both
    // now share `containsOnTokenBoundary`.
    if (!containsOnTokenBoundary(normTranscript, normQuote)) {
      const quoteTokens = tokenize(normQuote)
      const ratio = longestContiguousTokenRatio(quoteTokens, transcriptTokens)
      if (ratio >= PARTIAL_MATCH_THRESHOLD) {
        partialMatch = true
        effectiveStrength = 'low'
      } else {
        dropped.push({ entry, reason: 'no_quote_match' })
        continue
      }
    }
```

Everything after this block (phase 2 parallax cap, phase 3 reinforces, the
`annotated` construction, the `admitted`/`downgraded` split) stays exactly as
it is.

Also extend the file's header comment (`:8-9`) so the R10 line records the
boundary requirement — one clause, e.g. "…actually present in the cited
reflection's transcript (normalized, **on token boundaries**)".

**Verify**: `pnpm vitest run test/agents/verifier.test.ts` → **all existing
tests still pass**, including the AE7 pair and the 0.8 threshold suite. If any
of them fail, go to STOP conditions — do not edit an existing assertion.

### Step 4: Add the four new test cases

Append to `test/agents/verifier.test.ts`. Reuse the existing `baseMirror` /
`draft()` fixtures where possible; where a different transcript is needed,
build a local `VerifierMirrorEntry` in that test. Add a new
`describe('quote-match boundary holes (plan 052)', …)` block containing:

1. **Punctuation-only quote is dropped.**
   `draft({ verbatim_quote: '...' })` against `baseMirror` →
   `result.dropped` has length 1, `reason === 'empty_quote'`,
   `result.admitted` and `result.downgraded` are empty. Comment: *"normalize()
   strips punctuation, so this quote carries zero evidence; `includes('')`
   used to admit it at proposed strength."*

2. **Substring inside a token is rejected** (the `'ate'`/`'date'` shape).
   Local mirror: `{ id: 101, transcript: 'i had a date with the dentist', context_type: 'school' }`.
   `draft({ verbatim_quote: 'ate' })` → dropped, `reason === 'no_quote_match'`,
   nothing admitted. Comment: *"substring is not quotation — `ate` is not
   something the student said."*
   (Confirmed pre-fix behaviour: `'i had a date with the dentist'.includes('ate')`
   is `true`, so this entry was admitted at `strength: 'medium'`.)

3. **Later boundary-aligned occurrence is found** (defect 3, a
   false-negative). Local mirror transcript:
   `'i inflate the cake at home then i ate the cake at school'`;
   `draft({ verbatim_quote: 'ate the cake at midnight' })` →
   `result.downgraded` has length 1 with `partial_match === true` and
   `strength === 'low'`; `result.dropped` is empty. Comment: *"the 4/5-token
   window `ate the cake at` first occurs mid-token inside `inflate`; a later
   occurrence is boundary-aligned. First-occurrence-only checking scored 0.6
   and dropped a legitimate quote; scanning all occurrences scores 0.8."*
   These numbers were computed against the real functions — 0.6 pre-fix, 0.8
   post-fix, threshold 0.8 — so this test **fails before Step 1/3 and passes
   after**, which is the signal you want.

4. **Plain happy-path full match is unchanged.**
   `draft({ verbatim_quote: 'when teacher told us exactly what to do' })`
   against `baseMirror` → `admitted` length 1, `partial_match === false`,
   `strength === 'medium'`, `dropped` empty. Comment: *"tightening must not
   start rejecting real quotations — this is a boundary-aligned internal
   substring of the transcript and must stay admitted."*

**Verify**: `pnpm vitest run test/agents/verifier.test.ts` → all pass,
including the four new cases and every pre-existing one.

### Step 5: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0; tests ≥911 passed
plus the four new cases, 0 failed (128 pre-existing skips expected).

## Test plan

- New cases in `test/agents/verifier.test.ts` (Step 4): punctuation-only quote
  dropped as `empty_quote`; substring-inside-token rejected; later-occurrence
  boundary match admitted as a downgrade; plain full match unchanged.
- **Regression corpus that must pass untouched**: the AE7 calibration pair
  (`:36-70`), the R10 quote-match suite (`:73-137`), the 0.8 threshold suite
  (`:139-226`), the parallax-cap suite (`:227-284`), the reinforces suite
  (`:285-378`), the error-path suite (`:379-433`), and the schema-shape suite
  (`:434-462`).
- `test/ablation/sensemake-tools-off.test.ts` exercises the drop-reason
  counters; run it explicitly after Step 2.
- Structural pattern to follow: the existing `describe`/`it` style in
  `test/agents/verifier.test.ts` — build a `diff.timeline_entries` array from
  `draft(overrides)`, call `verifyProposedDiff`, assert on
  `result.admitted` / `result.downgraded` / `result.dropped`.
- Verification: `pnpm test` → 0 failures, four new tests included.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'normTranscript.includes(normQuote)' src/agents/verifier.ts` → no match
- [ ] `grep -c 'containsOnTokenBoundary' src/agents/verifier.ts` → ≥3 (definition + full-match caller + partial-path caller)
- [ ] `grep -n 'empty_quote' src/agents/tools/schemas.ts src/agents/verifier.ts` → hits in both files
- [ ] `grep -c 'dropped_empty_quote' test/ablation/score.ts` → ≥3; `grep -c 'empty_quote' scripts/ablate.ts` → ≥1
- [ ] `pnpm vitest run test/agents/verifier.test.ts` → all pass, and the output still lists both `AE7 calibration pair (LOCKED)` tests as passing
- [ ] `pnpm vitest run test/ablation/sensemake-tools-off.test.ts` → all pass
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with ≥911 passed
- [ ] `git diff --stat` shows no change to `PARTIAL_MATCH_THRESHOLD` or to the body of `normalize`
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Either AE7 calibration test fails after your change.** They are labelled
  LOCKED for a reason: they are the pass/fail boundary the gate was calibrated
  against. A failure means the change is wrong. **This is a STOP condition,
  not a licence to re-pin the assertion, relax the threshold, or edit the
  fixture.** Report the failing assertion and the actual values.
- Any test in the 0.8-threshold suite (`:139-226`) fails. The boundary fix can
  only ever *raise* a ratio (more occurrences considered), so a pre-existing
  downgrade should not become a drop — if one does, the helper is wrong.
- The excerpts in "Current state" no longer match the live code (drift).
- Adding `'empty_quote'` to the enum produces a `tsc` error at a call site
  this plan did not list (i.e. some consumer exhaustively switches on
  `VerifierDropReason`). Report the site rather than widening its type.
- Adding `dropped_empty_quote` to `VerifierVerdictCounters` breaks a committed
  ablation **report** fixture under `test/ablation/reports/` (a stored JSON
  shape rather than the live counters). Report it; do not rewrite historical
  report fixtures to match a new schema.
- New test case 3 still drops after Step 1 (expected: downgraded with
  `partial_match: true`). That means the all-occurrences scan is not being
  reached from `longestContiguousTokenRatio` — re-read Step 1 before
  improvising a different fixture.
- You conclude the fix requires changing `normalize`, the threshold, or the
  Zod `verbatim_quote` constraint. All three are out of scope; report the
  reasoning instead.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinise**: (1) that `containsOnTokenBoundary` is
  the **only** containment check in the file — a future edit that reintroduces
  a bare `normTranscript.includes(...)` reopens defect 1; (2) that the
  `empty_quote` drop happens *before* the full-match test, not after; (3) that
  the AE7 tests are byte-identical to before this PR (`git diff
  test/agents/verifier.test.ts` should show only appended lines).
- **The gate is deliberately narrow.** Per `verifier.ts:45-55`, stemming,
  accent-stripping and stopword removal are intentionally absent so
  paraphrases drop rather than smuggle through. Anyone "improving" match recall
  is loosening a security gate; that needs its own calibration pass, not a
  drive-by.
- Plan 053 also touches this file's neighbourhood (the prose fields that
  travel alongside verified entries) and re-runs the same calibration tests.
  Land 052 first; 053 depends on it.
- **Deliberately deferred**: a stricter `verbatim_quote` Zod shape (e.g.
  requiring at least one word character). The verifier is the designated gate
  and its drop reasons carry per-entry triage signal that a schema rejection
  would collapse into a parse failure. Revisit only if `empty_quote` drops
  turn out to be frequent in the ablation counters — which would indicate a
  prompt problem, not a schema one.
