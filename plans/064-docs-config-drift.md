# Plan 064: Fix the stale pointers agents trip over — the README's plan entry-point, `followups.md`'s dead entries, and two ghost config references

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- README.md docs/followups.md .github/workflows/lint-no-dev-bypass-leak.yml biome.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

Four stale pointers, each one a place where a new contributor — or a dispatched
coding agent — is told to read something that does not exist. The worst is
`README.md`: **twice** it names `plans/CURRENT_STATE.md` as the entry point to
read before executing any plan, and that file is not in the repo. The real index
is `plans/README.md`. An agent that follows the README's instruction gets a
404 and then improvises. `docs/followups.md` compounds it: twelve of its sixteen
entries point at engine files deleted in the React migration, so anyone trying
to pick up "non-blocking issues" spends their time confirming that the code is
gone. And two config files carry references to things that were never created or
have since been deleted — a workflow that does not exist, and a directory that
does not exist.

Every item here is a one-line change and every done-criterion is a grep
returning empty. It is cheap, and it removes four separate ways for the next
agent to waste a session.

## Current state

### (i) `README.md` points twice at a file that does not exist

`README.md:14` — the top-level pointer, in the "Current product shape" section:

```md
For the latest planning and merge status, see `plans/CURRENT_STATE.md`.
```

`README.md:212` — the last line of the file, under `## Historical Plans`:

```md
Older plans remain in `plans/` for context, but several are superseded. Use `plans/CURRENT_STATE.md` as the entry point before executing old plan units.
```

`README.md:205` — inside the `## Layout` tree, reinforcing the wrong name:

```
plans/          Planning artifacts and current state snapshot
```

`ls plans/CURRENT_STATE.md` → **No such file or directory.**
The real index is `plans/README.md`, whose own header reads:

```md
# Implementation Plans

Index of every advisor plan in this repo, newest suite last. Jump to the
suite you need:
```

`grep -rn 'CURRENT_STATE' README.md docs/` → exactly the two `README.md` hits
above. Nothing else in the repo references it.

### (ii) `docs/followups.md` — 12 of 16 entries reference deleted files

The file's own policy (lines 3-5 and 260-261) is the standard to hold it to:

```md
Non-blocking issues discovered during work that should be addressed later.
Newest at the top. Each entry should carry enough detail that a future session
(or reviewer) can pick it up without re-investigating.
```

```md
Move entries OUT of this file when fixed — link the commit/PR in the section
header for archaeology, or delete outright. This file should stay short.
```

**Every cited path, stat'd at `031d1974`:**

| Path | Exists? |
|---|---|
| `src/engine/student-space/Game/View/StatusPreviewHud.js` | **NO** |
| `src/engine/student-space/Game/View/TrajectorySheet.js` | **NO** |
| `src/engine/student-space/Game/View/ProfileSheet.js` | **NO** |
| `src/engine/student-space/profile-tab-react-bridge.tsx` | **NO** |
| `src/routes/library.trajectory.tsx` | **NO** |
| `src/routes/library.relationships.tsx` | **NO** |
| `src/routes/library.choices.tsx` | **NO** |
| `src/lib/student-space/identity-status.ts` | yes |
| `src/lib/student-space/profile-tab-state.ts` | yes |
| `src/engine/student-space/Game/State/State.js` | yes |
| `src/engine/student-space/Game/View/statusHeuristics.js` | yes |
| `src/engine/student-space/Game/State/Relationships.js` | yes |
| `src/engine/student-space/Game/State/Choices.js` | yes |
| `src/agents/tools/search-corpus.server.ts` | yes |
| `RelationshipPersonForm` / `BelongingForm` / `PerspectiveForm` | yes — now in `src/components/RelationshipsPageView.tsx` |
| `DecisionForm` / `IntentionForm` | yes — now in `src/components/ChoicesPageView.tsx` |

**Per-entry verdict** (derived from the table; re-stat each path yourself before
deleting anything):

Block 1 — `## 2026-05-19 — Path Finder CCE status code review residual items`
(line 7, items 1-8):

| # | Subject | Verdict |
|---|---|---|
| 1 | StatusPreviewHud has zero tests | **DELETE** — file gone |
| 2 | identity-status TS shim has zero tests | **REWRITE** — shim exists; its `src/routes/library.trajectory.tsx` reference is gone |
| 3 | `_runBackendTrajectory` async hazards | **DELETE** — `TrajectorySheet.js` gone |
| 4 | Override flip revokes escape-hatch | **DELETE** — same |
| 5 | Backend trajectory has no client-side timeout | **DELETE** — same |
| 6 | Coverage debt — engine-side untested paths | **REWRITE** — 4 of 6 bullets name `TrajectorySheet.js` (gone); `statusHeuristics.actionsForCluster()` and `IdentityStatusOverride.dispose()` survive |
| 7 | Reason tooltip auto-closes | **DELETE** — `TrajectorySheet.js:285-286` gone |
| 8 | Foreclosed bearings pick top-ranked | **DELETE** — same |

Block 2 — `## 2026-05-19 — Relationships + Choices tabs code review residual items`
(line 105, items 1-6):

| # | Subject | Verdict |
|---|---|---|
| 1 | Bridge module-level singletons survive disposal | **DELETE** — the entry is about `profile-tab-react-bridge.tsx`, which is gone; `profile-tab-state.ts`'s `booted` flag alone is not the described hazard |
| 2 | Engine bundle pulls in React via static bridge import | **DELETE** — `ProfileSheet.js` and the bridge are both gone |
| 3 | Missing tests across routes, bridge, omitChrome, State boot | **REWRITE** — routes and bridge gone; `State.js` composition still has no test |
| 4 | Slice mutations don't validate enum-typed fields | **KEEP** — `Relationships.js` and `Choices.js` both survive; still valid |
| 5 | Form drafts lost on tab switch | **KEEP, update paths** — the five forms now live in `src/components/RelationshipsPageView.tsx` and `src/components/ChoicesPageView.tsx` |
| 6 | `ProfileSheet.close()` doesn't unmount the React tree | **DELETE** — file gone |

Block 3 — the managed-agents smoke block. **It has no `##` header at all**: line
187 begins mid-file with a bare paragraph immediately after block 2's item 6:

```md
Discovered while smoke-testing the managed agents path during Step 11 of the
managed-agents migration plan. None of these block the cutover.

### 1. `pg@9` deprecation: client busy when `client.query()` called
```

…and its numbering is **broken** — `### 1.` at line 190 is followed by `### 3.`
at line 216, with no item 2:

| # | Subject | Verdict |
|---|---|---|
| 1 | `pg@9` deprecation: client busy when `client.query()` called | **KEEP** — `src/agents/tools/search-corpus.server.ts` exists; `pg` is still `^8.13.0` |
| 3 | Managed Agents token accounting under-counts inputs | **KEEP + cross-reference** — `src/agents/runner.ts` `translateSdkEvent` exists; **plan 063 fixes this** |

The two structural defects to repair: give block 3 a `##` date header, and
renumber `### 3.` → `### 2.`.

Everything below `## Triage policy` (line 252) — the policy itself and the
struck-through resolved "Camera flow" entry (line 263) — is fine. Leave it.

### (iii) A workflow comment describes a workflow that does not exist

`.github/workflows/lint-no-dev-bypass-leak.yml:20-22` — the last three lines of
the header comment block:

```yaml
# Note: the separate `lint-no-stale-flag.yml` workflow (plan Step 12)
# guards the `USE_MANAGED_AGENTS` flag and starts failing on day 21
# post-cutover; this one is permanent.
```

`ls .github/workflows/` → **`lint-no-dev-bypass-leak.yml` only.** There is no
`lint-no-stale-flag.yml`.

`grep -rn 'USE_MANAGED_AGENTS' src/ test/ scripts/ .github/` → **zero matches**.
The flag cleanup landed (its only surviving references are historical, in
`docs/pr1-description.md` and an archived plan). Only the comment is stale.

**The workflow's actual job is correct and permanent — do not touch it.** For
reference, everything from line 24 down stays exactly as-is:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  lint-no-dev-bypass-leak:
    ...
          OFFENDERS=$(grep -rln 'process\.env\.DEV_BYPASS_AUTH' src test scripts 2>/dev/null \
            | grep -v '^src/auth/middleware\.ts$' \
            || true)
```

### (iv) `biome.json` includes a directory that does not exist

`biome.json:3-17`:

```json
  "files": {
    "includes": [
      "src/**/*.{ts,tsx,js,jsx,json}",
      "test/**/*.{ts,tsx,json}",
      "scripts/**/*.{ts,tsx}",
      "trigger/**/*.{ts,tsx}",
      "!**/routeTree.gen.ts",
      "!test/engine/fixtures/**",
      "!**/.output/**",
      "!**/dist/**",
      "!**/node_modules/**",
      "!src/engine/student-space/**",
      "src/engine/student-space/**/*.ts"
    ]
  },
```

Line 8 is `"trigger/**/*.{ts,tsx}"`. `ls -d trigger` → **No such file or
directory.** No harm today, but it misleads anyone reading the config about
which directories the repo has.

### Repo conventions

pnpm only, one root lockfile; `island-editor` is a workspace member.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings**. `pnpm test` = `vitest run`; baseline **911
passed / 128 skipped / 0 failed**. Conventional commits.
Per `CLAUDE.md`: never add `three` to `overrides` — the 0.149-app /
0.171-editor runtime split is deliberate. (This plan touches no dependencies.)

Note that `pnpm check` invokes `biome check src test` with **explicit paths**,
so the `files.includes` list in `biome.json` is a filter over those paths, not
the driver. Removing the non-existent `trigger/` include therefore cannot change
what `pnpm check` lints — confirm this by comparing the warning count before and
after (step 4).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Check | `pnpm check` | exit 0, **exactly 18 warnings** before and after |
| All tests | `pnpm test` | 911 passed, 128 skipped, 0 failed (unchanged) |
| Stat a path | `ls -d <path>` | exists / "No such file or directory" |
| Grep gate (i) | `grep -rn 'CURRENT_STATE' README.md docs/ .github/` | no matches |
| Grep gate (iii) | `grep -rn 'lint-no-stale-flag' .github/` | no matches |
| Grep gate (iv) | `grep -n 'trigger' biome.json` | no matches |

## Scope

**In scope** (the only files you should modify):

- `README.md` — lines 14, 205, 212
- `docs/followups.md`
- `.github/workflows/lint-no-dev-bypass-leak.yml` — the comment block only
- `biome.json` — the `trigger/**` include only
- `CLAUDE.md` — **lines 51–66 only** (the "Sheet primitive" paragraph and its
  code block). See Step 5. Do not touch any other line of that file.

**Out of scope** (do NOT touch, even though they look related):

- **`plans/README.md`.** Its title says "Character Studio — Implementation
  Plans" in places while it indexes everything; retitling and reorganizing the
  index is the **advisor's** job, not this plan's. Do not edit it except for
  this plan's own status row, which the executor instructions already cover.
- **The `lint-no-dev-bypass-leak.yml` job body** (lines 24-55) — the grep guard
  is correct and permanent. Only lines 20-22's comment go.
- **`docs/pr1-description.md`** and `docs/plans/_archive/*` — they mention
  `USE_MANAGED_AGENTS` and `lint-no-stale-flag.yml` as *historical record*.
  That is what archives are for. Leave them.
- **`docs/followups.md`'s `## Triage policy` section and the struck-through
  resolved Camera entry** — both correct.
- **Every line of `CLAUDE.md` except 51–66.** The advisor added the Sheet-primitive
  correction to this plan's scope (Step 5) after verifying it. The rest of that
  file — including the "Base UI for behavior" bullet at line 31, which is still
  accurate (Base UI is genuinely used by 11 other files: the capture drawers,
  `CaptureChooser`, `CaptureFab`, `DevPalette`, `EggHatcher`, `SkipButton`,
  `CalendarPane`, and the `ui/` primitives `alert-dialog`, `button`, `dialog`,
  `drawer`, `radio-group`) — stays untouched.
- Creating a `plans/CURRENT_STATE.md` — **do not**. The fix is to point at the
  index that exists, not to resurrect a file the repo moved away from.
- Any `src/`, `test/`, or dependency change. This plan is docs + config only.

## Git workflow

- Branch: `advisor/064-docs-config-drift`
- One commit, or one per item, e.g.
  `docs(readme): point at plans/README.md, not the deleted CURRENT_STATE.md`,
  `docs(followups): drop entries for files deleted in the React migration`,
  `chore(config): remove ghost lint-no-stale-flag comment and trigger/ include`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the README's plan entry-point (item i)

First confirm the premise:

```bash
ls -d plans/CURRENT_STATE.md    # expect: No such file or directory
head -4 plans/README.md         # expect: "# Implementation Plans"
```

Then make three edits in `README.md`:

- **line 14** →
  `For the latest planning and merge status, see \`plans/README.md\`.`
- **line 212** →
  `Older plans remain in \`plans/\` for context, but several are superseded. Use \`plans/README.md\` as the entry point before executing old plan units.`
- **line 205** (the Layout tree) → change
  `plans/          Planning artifacts and current state snapshot` to
  `plans/          Implementation plans; plans/README.md is the index and status board`
  (keep the tree's column alignment — the descriptions start at the same column
  as the neighbouring `src/`, `test/`, `island-editor/` rows).

**Verify**: `grep -rn 'CURRENT_STATE' README.md docs/ .github/` → **no matches**.
**Verify**: `grep -n 'plans/README.md' README.md` → **3 matches** (lines 14, 205,
212).

### Step 2: Prune `docs/followups.md` (item ii)

Work the per-entry verdict table in "Current state". **Re-stat every cited path
yourself first** — the mechanical rule is:

- **All** `**Where:**` paths gone → **delete the entry**.
- **Some** paths gone → **rewrite the entry**, dropping the dead paths and the
  claims that depended on them; keep only what still describes live code.
- **No** paths gone → **keep**, but correct the path if the code moved.

Apply it:

1. **Delete** block-1 items 1, 3, 4, 5, 7, 8 and block-2 items 1, 2, 6.
2. **Rewrite** block-1 item 2 (drop the `src/routes/library.trajectory.tsx`
   reference; `src/lib/student-space/identity-status.ts` survives and still has
   no test), block-1 item 6 (keep only the
   `statusHeuristics.actionsForCluster()` and `IdentityStatusOverride.dispose()`
   bullets; drop the four `TrajectorySheet.js` bullets), and block-2 item 3
   (keep only the `State.js` composition-has-no-test gap).
3. **Keep** block-2 item 4 as-is (the enum-validation note against the surviving
   `Game/State/Relationships.js` and `Game/State/Choices.js`).
4. **Keep** block-2 item 5 but update its `**Where:**` to name the files the
   forms actually live in now: `src/components/RelationshipsPageView.tsx`
   (`RelationshipPersonForm`, `BelongingForm`, `PerspectiveForm`) and
   `src/components/ChoicesPageView.tsx` (`DecisionForm`, `IntentionForm`).
5. **Renumber** each block's surviving items contiguously from 1.
6. **Give block 3 a `##` header.** It currently starts with a bare paragraph at
   line 187. Add, immediately above it:
   `## 2026-05-12 — Managed-agents cutover smoke findings`
   and renumber its `### 3.` → `### 2.` so the block reads 1, 2.
7. **Cross-reference plan 063** in the surviving token-accounting entry: add one
   line — `**Status:** fix in flight — see \`plans/063-sdk-bumps.md\` (part b).`
8. **Add a one-line header note** under the file's intro paragraph recording
   what was removed and why, so the archaeology is not silently lost:

```md
> Pruned 2026-07-25 (plan 064): entries referencing engine-view files deleted in
> the React migration — `Game/View/StatusPreviewHud.js`,
> `Game/View/TrajectorySheet.js`, `Game/View/ProfileSheet.js`,
> `profile-tab-react-bridge.tsx`, and the `src/routes/library.*` routes — were
> removed per this file's own "move entries OUT when fixed" policy. Git history
> has them.
```

**Verify**: `grep -c '^### ' docs/followups.md` → the surviving item count
(expect **7**: block 1 → 2, block 2 → 3, block 3 → 2). Report the actual number.
**Verify**: for each of the seven deleted paths in the "Current state" table,
`grep -n '<path>' docs/followups.md` → **no matches**. Run all seven:

```bash
for p in StatusPreviewHud.js View/TrajectorySheet.js View/ProfileSheet.js \
         profile-tab-react-bridge.tsx library.trajectory.tsx \
         library.relationships.tsx library.choices.tsx; do
  echo -n "$p: "; grep -c "$p" docs/followups.md || true
done
```

Expect `0` for all seven (the `grep -c` prints `0` and exits 1 — that is fine).
**Verify**: `grep -n '### 3\.' docs/followups.md` → no orphan `### 3.` in a
two-item block; the numbering in every block is contiguous from 1.
**Verify**: `grep -n '063-sdk-bumps' docs/followups.md` → 1 match.
**Verify**: `grep -c '^## ' docs/followups.md` → block 3 now has a header
(count rises by 1 vs. before).

### Step 3: Delete the ghost workflow comment (item iii)

First confirm the premise:

```bash
ls .github/workflows/
grep -rn 'USE_MANAGED_AGENTS' src/ test/ scripts/ .github/
```

Expect: only `lint-no-dev-bypass-leak.yml` listed, and **zero** matches for the
flag.

Then delete **only** lines 20-22 of
`.github/workflows/lint-no-dev-bypass-leak.yml` (the `# Note: the separate
lint-no-stale-flag.yml ...` block) plus the blank comment line separating it
from the "Allowed references" list, if that leaves a dangling `#`. Leave
everything from `on:` (line 24) down **byte-identical**.

**Verify**: `grep -rn 'lint-no-stale-flag' .github/` → **no matches**.
**Verify**: `grep -rn 'USE_MANAGED_AGENTS' .github/` → **no matches**.
**Verify**: `git diff .github/workflows/lint-no-dev-bypass-leak.yml` → the diff
contains **only removed comment lines**, no changes at or below `on:`.
**Verify**: the job still works locally — run its own grep by hand:
`grep -rln 'process\.env\.DEV_BYPASS_AUTH' src test scripts | grep -v '^src/auth/middleware\.ts$'`
→ **no output** (i.e. the guard would pass).

### Step 4: Remove the `trigger/` include (item iv)

First confirm the premise: `ls -d trigger` → "No such file or directory".

Then delete line 8 of `biome.json`: `"trigger/**/*.{ts,tsx}",`.

**Verify**: `grep -n 'trigger' biome.json` → **no matches**.
**Verify**: `node -e "JSON.parse(require('node:fs').readFileSync('biome.json','utf8')); console.log('valid json')"` → `valid json`.
**Verify**: `pnpm check` → exit 0 with **exactly 18 warnings** — the same count
as before this plan. A different count means the include change altered what
Biome lints, which it should not (`pnpm check` passes explicit `src test`
paths).

### Step 5: Correct `CLAUDE.md`'s Sheet-primitive description (item v)

`CLAUDE.md` is the repo's guardrail file, and its instructions are treated as
overriding default behavior — so a wrong claim there is the most expensive
stale pointer in the repo. Lines 51–66 currently read:

```
**Sheet primitive** — every routed sheet composes the same shape on `src/components/ui/sheet.tsx` (Base UI `Dialog.Root`, `modal={false}`):

```tsx
<Sheet open modal={false} onOpenChange={…}>
  <SheetSurface>
    <SheetSidebar>      {/* left pane, ~360px sidenav */}
      …
```

**Every load-bearing detail of that is wrong**, verified at this plan's commit:

- `src/components/ui/sheet.tsx` imports **no** Base UI at all. Its own comment
  at line 20 says: `Full-viewport routed page surface. Plain framed div — not a
  Base UI Dialog.`
- It exports no `Sheet` and no `SheetSurface`. The outer component is
  **`PageSurface`**, and there is no `open`, `modal`, or `onOpenChange` prop
  anywhere in the file.
- Escape handling is a hook, **`usePageEscape(onEscape)`**, not a Dialog
  behavior; closing also has a `PageCloseButton` export.

An agent following the current text would write code that does not compile.
Replace lines 51–66 with the shape a routed sheet **actually** composes today
— confirmed against `src/components/student-space/sheets/SettingsSheet.tsx:100-192`:

````
**Sheet primitive** — every routed sheet composes the same shape from
`src/components/ui/sheet.tsx`. It is a plain framed div, **not** a Base UI
Dialog: there is no `open`/`modal`/`onOpenChange` prop, and Escape is handled
by the `usePageEscape` hook.

```tsx
usePageEscape(dismissToHome)

<PageSurface>
  <SheetSidebar data-stagger-slot="1">   {/* left pane, ~360px sidenav */}
    <SheetIdentityHeader>…</SheetIdentityHeader>
    <SheetSidenav>…</SheetSidenav>
  </SheetSidebar>
  <SheetContent>                          {/* right pane */}
    <SheetPageHeader>…</SheetPageHeader>
    <SheetBody>…</SheetBody>
  </SheetContent>
</PageSurface>
```
````

Do **not** touch line 31's "Base UI for behavior" bullet — it remains accurate
for the 11 files that genuinely use Base UI (see Scope).

**Verify**: `grep -n 'Dialog.Root' CLAUDE.md` → no matches.
**Verify**: `grep -n 'PageSurface\|usePageEscape' CLAUDE.md` → ≥2 matches.
**Verify**: `grep -c 'base-ui-components' CLAUDE.md` → `1` (only line 31's
bullet survives).
**Verify**: every component name in the new code block exists —
`for n in PageSurface SheetSidebar SheetIdentityHeader SheetSidenav SheetContent SheetPageHeader SheetBody usePageEscape; do grep -q "export function $n\|export const $n" src/components/ui/sheet.tsx || echo "MISSING $n"; done`
→ prints nothing.

### Step 6: Final gate

**Verify**: `pnpm check` → exit 0, exactly 18 warnings, 0 errors.
**Verify**: `pnpm test` → 911 passed, 128 skipped, 0 failed — **all three
numbers unchanged**. This plan touches no code, so any movement is a red flag.
**Verify**: `git status` → exactly five modified files: `README.md`,
`docs/followups.md`, `.github/workflows/lint-no-dev-bypass-leak.yml`,
`biome.json`, `CLAUDE.md`.
**Verify**: `git diff --stat -- src/ test/` → **empty**.

## Test plan

- **No tests.** This plan changes documentation and two config comments/includes
  only. There is no behavior to assert.
- The verification is entirely greps returning empty (the pointers are gone) plus
  an unchanged baseline (`pnpm check` = 18 warnings, `pnpm test` = 911/128/0).
- The one *functional* check worth running is step 3's manual re-execution of
  the `DEV_BYPASS_AUTH` guard's grep, confirming the workflow's job logic is
  untouched by the comment deletion.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn 'CURRENT_STATE' README.md docs/ .github/` → no matches
- [ ] `grep -c 'plans/README.md' README.md` → `3`
- [ ] `ls -d plans/CURRENT_STATE.md` → still "No such file or directory" (the
      file was **not** created)
- [ ] `grep -n 'StatusPreviewHud\|View/TrajectorySheet.js\|View/ProfileSheet.js\|profile-tab-react-bridge\|library.trajectory\|library.relationships\|library.choices' docs/followups.md` → no matches
- [ ] `grep -n 'Relationships.js' docs/followups.md` → ≥1 match (the still-valid
      enum entry survived)
- [ ] `grep -n 'RelationshipsPageView.tsx' docs/followups.md` → ≥1 match (item 5's
      path corrected)
- [ ] `grep -n '063-sdk-bumps' docs/followups.md` → 1 match
- [ ] `grep -rn 'lint-no-stale-flag' .github/` → no matches
- [ ] `grep -rn 'USE_MANAGED_AGENTS' src/ test/ scripts/ .github/` → no matches
- [ ] `git diff .github/workflows/lint-no-dev-bypass-leak.yml` shows only removed
      comment lines
- [ ] `grep -n 'trigger' biome.json` → no matches; `biome.json` is valid JSON
- [ ] `pnpm check` exits 0 with **exactly 18 warnings**
- [ ] `pnpm test` → 911 passed / 128 skipped / 0 failed (all unchanged)
- [ ] `grep -n 'Dialog.Root' CLAUDE.md` → no matches; `grep -n 'PageSurface' CLAUDE.md` → ≥1 match
- [ ] `git diff --stat -- src/ test/` → empty
- [ ] `git status` shows exactly five modified files
- [ ] `plans/README.md` status row updated (and nothing else in that file)

## STOP conditions

Stop and report back (do not improvise) if:

- **`plans/CURRENT_STATE.md` actually exists** when you stat it. Then the
  README is right, the audit is wrong, and item (i) should be dropped — report
  it.
- **A `docs/followups.md` entry you were told to delete cites a path that
  exists.** The verdict table was built by stat'ing at `031d1974`; if the repo
  has since restored a file, keep the entry and report the discrepancy. Deleting
  a live follow-up loses real information.
- **`grep -rn 'USE_MANAGED_AGENTS' src/ test/ scripts/` returns any match.** Then
  the flag cleanup did **not** fully land, the comment is describing a real
  outstanding risk, and deleting it would erase the only in-repo warning. STOP
  and report the matches — this becomes a code finding, not a docs fix.
- **`ls -d trigger` shows a directory.** Then the `biome.json` include is
  correct; drop item (iv) and report.
- **`pnpm check`'s warning count changes** after step 4 (from 18 to anything
  else). That means the include list was load-bearing after all; revert the
  `biome.json` edit and report.
- **You find yourself editing `plans/README.md` beyond this plan's status row.**
  The index's title/organization is the advisor's; stop and report what you
  think is wrong instead.
- **You are tempted to create `plans/CURRENT_STATE.md`** to satisfy the README.
  Do not — the whole point is that the index moved to `plans/README.md`.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**: (1) that the `docs/followups.md`
  deletions really only removed entries whose cited files are gone — spot-check
  two deletions against `git log --diff-filter=D --name-only` to confirm the
  files were deleted rather than moved; (2) that the workflow diff contains
  **only** comment removals and nothing at or below `on:` — an accidental
  change to the `DEV_BYPASS_AUTH` guard's grep would silently disable a security
  check; (3) that no `plans/CURRENT_STATE.md` was created.
- **Why this class of drift recurs**: `docs/followups.md`'s own policy says
  "Move entries OUT of this file when fixed … This file should stay short," but
  nothing enforces it, and entries were written against engine-view files
  (`Game/View/*.js`) that the React migration later deleted wholesale. Anyone
  deleting an engine view file should grep `docs/followups.md` for its name in
  the same commit. That habit is cheaper than a periodic audit.
- **`CLAUDE.md` has related drift this plan deliberately leaves alone**: it
  describes routed sheets as composing on Base UI `Dialog.Root`, but
  `src/components/ui/sheet.tsx`'s own docblock says "Plain framed div — not a
  Base UI Dialog." Plan 062 documents this and also defers it. Whoever next
  edits `CLAUDE.md` should correct that paragraph. Mention it in the PR
  description so it does not get lost a third time.
- **Deliberately out of scope and still open**: retitling `plans/README.md`
  (it carries "Character Studio — Implementation Plans" framing while indexing
  four suites). The advisor owns the index.
- If a Trigger.dev integration is ever actually added, the `biome.json` include
  removed here should come back — along with the directory.
